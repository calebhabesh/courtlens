import { NextRequest, NextResponse } from "next/server";
import { isSameBrowserOrigin } from "../../../../lib/same-origin";
import { SESSION_COOKIE, apiBase, proxyHeaders, validSession } from "../../../../lib/account-server";

/**
 * Accounts (finish plan F04). The browser never holds the session token: sign-in stores it in an
 * HttpOnly, Secure, SameSite=Lax cookie, and every later call forwards it to the API as a bearer
 * token. Only these routes exist; writes must come from this site.
 */
const routes: Record<string, { methods: string[]; upstream?: (suffix: string) => string }> = {
  session: { methods: ["POST"], upstream: () => "/api/auth/session" },
  demo: { methods: ["POST"], upstream: () => "/api/auth/demo-session" },
  "sign-out": { methods: ["POST"] },
  me: { methods: ["GET"], upstream: () => "/api/me" },
  favorites: { methods: ["GET"], upstream: () => "/api/me/favorites" },
  "favorites/:id": { methods: ["POST", "DELETE"], upstream: suffix => `/api/me/${suffix}` },
};
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
  if (suffix in routes && suffix !== "favorites/:id") return suffix;
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
  if (!session && (key === "me" || key === "favorites")) return json(key === "me" ? { user: null } : { detail: "Sign in to use favourites." }, key === "me" ? 200 : 401);
  if (!session && key === "favorites/:id") return json({ detail: "Sign in to use favourites." }, 401);

  const body = mutates ? await readBody(request) : undefined;
  if (body === null) return json({ detail: "Request too large" }, 413);
  const headers: Record<string, string> = { "Content-Type": "application/json", ...proxyHeaders(clientAddress(request)) };
  if (session && key !== "session" && key !== "demo") headers.Authorization = `Bearer ${session}`;
  let response: Response;
  try {
    response = await fetch(new URL(route.upstream!(suffix), apiBase()), {
      method: request.method, headers, body: key === "session" ? body || undefined : undefined,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    });
  } catch {
    return json({ detail: "Account service unavailable. Try again." }, 502);
  }
  const payload = await response.json().catch(() => ({ detail: "Account service error" })) as Record<string, unknown>;
  const retry = response.headers.get("retry-after");
  if (key === "session" || key === "demo") {
    if (!response.ok) {
      const failed = json({ detail: payload.detail ?? "Sign-in failed" }, response.status);
      if (retry) failed.headers.set("Retry-After", retry);
      return failed;
    }
    const token = validSession(typeof payload.token === "string" ? payload.token : null);
    const maxAge = typeof payload.expires_in === "number" ? Math.max(60, Math.floor(payload.expires_in)) : 43200;
    if (!token) return json({ detail: "Sign-in failed" }, 502);
    const signedIn = json({ user: payload.user }, 200, sessionCookie(token, maxAge));
    if (request.cookies.get(DEV_OPT_OUT)) signedIn.headers.append("Set-Cookie", `${DEV_OPT_OUT}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return signedIn;
  }
  // An ended session (revoked, disabled, expired) clears the cookie and reads as signed out.
  if (response.status === 401) return key === "me" ? json({ user: null }, 200, cleared) : json(payload, 401, cleared);
  if (key === "me") return json(response.ok ? { user: payload } : payload, response.status);
  const result = json(payload, response.status);
  if (retry) result.headers.set("Retry-After", retry);
  return result;
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
