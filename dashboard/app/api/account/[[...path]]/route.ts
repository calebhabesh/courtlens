import { NextRequest, NextResponse } from "next/server";
import { isSameBrowserOrigin } from "../../../../lib/same-origin";
import { SESSION_COOKIE, apiBase, proxyHeaders, validSession } from "../../../../lib/account-server";

/**
 * Accounts (finish plan F04, accounts plan). The browser never holds the session token: sign-in,
 * an email link or Google stores it in an
 * HttpOnly, Secure, SameSite=Lax cookie, and every later call forwards it to the API as a bearer
 * token. Only these routes exist; writes must come from this site.
 */
const routes: Record<string, { methods: string[]; upstream?: (suffix: string) => string }> = {
  session: { methods: ["POST"], upstream: () => "/api/auth/session" },
  demo: { methods: ["POST"], upstream: () => "/api/auth/demo-session" },
  "sign-out": { methods: ["POST"] },
  me: { methods: ["GET", "DELETE"], upstream: () => "/api/me" },
  favorites: { methods: ["GET"], upstream: () => "/api/me/favorites" },
  "favorites/:id": { methods: ["POST", "DELETE"], upstream: suffix => `/api/me/${suffix}` },
  // Accounts plan: sign-up, email links and Google.
  options: { methods: ["GET"], upstream: () => "/api/auth/options" },
  "sign-up": { methods: ["POST"], upstream: () => "/api/auth/sign-up" },
  confirm: { methods: ["POST"], upstream: () => "/api/auth/confirm" },
  "forgot-password": { methods: ["POST"], upstream: () => "/api/auth/forgot-password" },
  "reset-password": { methods: ["POST"], upstream: () => "/api/auth/reset-password" },
  "google/start": { methods: ["GET"] },
  "google/callback": { methods: ["GET"] },
};
/** Writes that carry a JSON body to the API. */
const WITH_BODY = new Set(["session", "sign-up", "confirm", "forgot-password", "reset-password"]);
/** Answers that start a session: the proxy keeps the token and returns only the user. */
const STARTS_SESSION = new Set(["session", "demo", "confirm", "reset-password"]);
/** Google's flow state (state, nonce, PKCE verifier, return path), for ten minutes. */
const GOOGLE_FLOW = "courtlens-google-flow";
const GOOGLE_FLOW_PATH = "/api/account/google";
const MAX_BODY = 4 * 1024;
/** After a sign-out in dev, auto sign-in waits until the next real sign-in (or a day). */
const DEV_OPT_OUT = "courtlens-dev-signed-out";

/**
 * Local development only: sign a visitor with no session into the API's dev account, so the
 * workbench is always signed in. Needs `next dev` (NODE_ENV=development), a non-hosted build,
 * COURTLENS_DEV_ACCOUNT_AUTO_LOGIN=true here and COURTLENS_DEV_ACCOUNT=true in the API.
 */
function devAutoLogin(): boolean {
  return process.env.NODE_ENV === "development"
    && process.env.NEXT_PUBLIC_COURTLENS_HOSTED !== "true"
    && process.env.COURTLENS_DEV_ACCOUNT_AUTO_LOGIN === "true";
}

type Context = { params: Promise<{ path?: string[] }> };

function routeKey(suffix: string): string | null {
  if (Object.hasOwn(routes, suffix) && suffix !== "favorites/:id") return suffix;
  return /^favorites\/\d{1,12}$/.test(suffix) ? "favorites/:id" : null;
}

function clientAddress(request: NextRequest): string {
  // Cloudflare's CF-Connecting-IP names the client (the tunnel is the only way in); else the
  // last forwarded hop, which our own Caddy appended.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map(part => part.trim()).filter(Boolean).at(-1);
  return request.headers.get("cf-connecting-ip") || forwarded || "unknown";
}

function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function json(body: unknown, status = 200, cookie?: string): NextResponse {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}

async function readBody(request: NextRequest): Promise<string | null | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function proxy(request: NextRequest, context: Context) {
  const { path = [] } = await context.params;
  const suffix = path.join("/");
  const key = routeKey(suffix);
  if (!key) return json({ detail: "Unknown account route" }, 404);
  const route = routes[key];
  if (!route.methods.includes(request.method)) return json({ detail: "Method not allowed" }, 405);
  const mutates = request.method !== "GET";
  if (mutates && !isSameBrowserOrigin(request)) return json({ detail: "Same-origin account request required" }, 403);

  if (key === "google/start") return googleStart(request);
  if (key === "google/callback") return googleCallback(request);

  const session = validSession(request.cookies.get(SESSION_COOKIE)?.value);
  const cleared = sessionCookie("", 0);
  if (key === "sign-out") {
    const response = json({ user: null }, 200, cleared);
    if (devAutoLogin()) response.headers.append("Set-Cookie", `${DEV_OPT_OUT}=1; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`);
    return response;
  }
  if (!session && key === "me" && devAutoLogin() && !request.cookies.get(DEV_OPT_OUT)) {
    const signedIn = await devSession(clientAddress(request));
    if (signedIn) return json({ user: signedIn.user }, 200, sessionCookie(signedIn.token, signedIn.maxAge));
  }
  // Signed out: reads answer "nobody" without calling the API; writes need a session.
  if (!session && key === "me" && request.method === "GET") return json({ user: null });
  if (!session && (key === "me" || key === "favorites" || key === "favorites/:id")) return json({ detail: key === "me" ? "Sign in first." : "Sign in to use favourites." }, 401);

  const body = mutates ? await readBody(request) : undefined;
  if (body === null) return json({ detail: "Request too large" }, 413);
  const headers: Record<string, string> = { "Content-Type": "application/json", ...proxyHeaders(clientAddress(request)) };
  if (session && !STARTS_SESSION.has(key) && !WITH_BODY.has(key)) headers.Authorization = `Bearer ${session}`;
  let response: Response;
  try {
    response = await fetch(new URL(route.upstream!(suffix), apiBase()), {
      method: request.method, headers, body: WITH_BODY.has(key) ? body || undefined : undefined,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    });
  } catch {
    return json({ detail: "Account service unavailable. Try again." }, 502);
  }
  const payload = await response.json().catch(() => ({ detail: "Account service error" })) as Record<string, unknown>;
  const retry = response.headers.get("retry-after");
  if (STARTS_SESSION.has(key)) {
    if (!response.ok) {
      const failed = json({ detail: payload.detail ?? "Sign-in failed" }, response.status);
      if (retry) failed.headers.set("Retry-After", retry);
      return failed;
    }
    return signedInResponse(request, json({ user: payload.user }), payload);
  }
  if (key === "me" && request.method === "DELETE") {
    return response.ok ? json({ deleted: true }, 200, cleared) : json(payload, response.status, response.status === 401 ? cleared : undefined);
  }
  // An ended session (revoked, disabled, expired) clears the cookie and reads as signed out.
  if (response.status === 401) return key === "me" ? json({ user: null }, 200, cleared) : json(payload, 401, cleared);
  if (key === "me") return json(response.ok ? { user: payload } : payload, response.status);
  const result = json(payload, response.status);
  if (retry) result.headers.set("Retry-After", retry);
  return result;
}

/** Stores a session the API issued; a malformed answer is a failed sign-in. */
function signedInResponse(request: NextRequest, response: NextResponse, payload: Record<string, unknown>): NextResponse {
  const token = validSession(typeof payload.token === "string" ? payload.token : null);
  const maxAge = typeof payload.expires_in === "number" ? Math.max(60, Math.floor(payload.expires_in)) : 43200;
  if (!token) return json({ detail: "Sign-in failed" }, 502);
  response.headers.append("Set-Cookie", sessionCookie(token, maxAge));
  if (request.cookies.get(DEV_OPT_OUT)) response.headers.append("Set-Cookie", `${DEV_OPT_OUT}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return response;
}

/** A same-site path to return to after Google; anything else goes home. */
function returnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.length > 512) return "/";
  return value.startsWith("/api/") ? "/" : value;
}

function siteUrl(request: NextRequest, path: string): URL {
  // Behind Cloudflare and Caddy the request URL is the internal one; the Host header is the site's.
  // Build the origin from scratch: assigning a port-less Host to a URL keeps its internal port
  // (:3000 in the container), which sent hosted Google redirects to the wrong address.
  const host = request.headers.get("host") || request.nextUrl.host;
  const https = request.headers.get("x-forwarded-proto") === "https" || process.env.NEXT_PUBLIC_COURTLENS_HOSTED === "true";
  return new URL(path, `${https ? "https:" : request.nextUrl.protocol}//${host}`);
}

/** Back to the page with the sign-in dialog open and a short reason code (never free text). */
function googleFailed(request: NextRequest, next: string, code: string): NextResponse {
  const target = siteUrl(request, next);
  target.searchParams.set("signin", code);
  const response = NextResponse.redirect(target, 303);
  response.headers.append("Set-Cookie", `${GOOGLE_FLOW}=; Path=${GOOGLE_FLOW_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function googleStart(request: NextRequest): Promise<NextResponse> {
  const next = returnPath(request.nextUrl.searchParams.get("next"));
  try {
    const response = await fetch(new URL("/api/auth/google/start", apiBase()), {
      headers: proxyHeaders(clientAddress(request)), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return googleFailed(request, next, response.status === 429 ? "google-busy" : "google-off");
    const flow = await response.json() as { url?: unknown; state?: unknown; nonce?: unknown; verifier?: unknown };
    if (typeof flow.url !== "string" || !flow.url.startsWith("https://accounts.google.com/")) return googleFailed(request, next, "google-failed");
    const cookie = Buffer.from(JSON.stringify({ state: flow.state, nonce: flow.nonce, verifier: flow.verifier, next })).toString("base64url");
    const redirect = NextResponse.redirect(flow.url, 303);
    redirect.headers.append("Set-Cookie", `${GOOGLE_FLOW}=${cookie}; Path=${GOOGLE_FLOW_PATH}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  } catch {
    return googleFailed(request, next, "google-failed");
  }
}

async function googleCallback(request: NextRequest): Promise<NextResponse> {
  let flow: { state?: unknown; nonce?: unknown; verifier?: unknown; next?: unknown } = {};
  try {
    const raw = request.cookies.get(GOOGLE_FLOW)?.value;
    if (raw && raw.length < 2048) flow = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as typeof flow;
  } catch {
    flow = {};
  }
  const next = returnPath(typeof flow.next === "string" ? flow.next : null);
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (params.get("error")) return googleFailed(request, next, "google-cancelled");
  if (typeof flow.state !== "string" || !state || state !== flow.state || !code || typeof flow.nonce !== "string" || typeof flow.verifier !== "string") {
    return googleFailed(request, next, "google-expired");
  }
  try {
    const response = await fetch(new URL("/api/auth/google", apiBase()), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proxyHeaders(clientAddress(request)) },
      body: JSON.stringify({ code, verifier: flow.verifier, nonce: flow.nonce }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : "";
      return googleFailed(request, next, /turned off/i.test(detail) ? "google-off-account" : /verified/i.test(detail) ? "google-unverified" : "google-failed");
    }
    const redirect = NextResponse.redirect(siteUrl(request, next), 303);
    redirect.headers.set("Cache-Control", "no-store");
    redirect.headers.append("Set-Cookie", `${GOOGLE_FLOW}=; Path=${GOOGLE_FLOW_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return signedInResponse(request, redirect, payload);
  } catch {
    return googleFailed(request, next, "google-failed");
  }
}

async function devSession(address: string): Promise<{ user: unknown; token: string; maxAge: number } | null> {
  try {
    const response = await fetch(new URL("/api/auth/dev-session", apiBase()), {
      method: "POST", headers: { "Content-Type": "application/json", ...proxyHeaders(address) },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { user?: unknown; token?: unknown; expires_in?: unknown };
    const token = validSession(typeof body.token === "string" ? body.token : null);
    if (!token) return null;
    return { user: body.user, token, maxAge: typeof body.expires_in === "number" ? Math.max(60, Math.floor(body.expires_in)) : 43200 };
  } catch {
    return null;
  }
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
