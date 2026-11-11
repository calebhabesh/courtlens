import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSameBrowserOrigin } from "../../../../lib/same-origin";

const uuid = "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const allowedPaths = new RegExp(`^(?:limits|turn(?:/stream)?|threads(?:/${uuid}(?:/turns(?:/${uuid}/cancel)?)?)?)$`);
const visitorCookie = "courtlens-ask-visitor";

/**
 * Public Ask (hosted demo): who is asking, as two salted hashes the API can't reverse. The browser
 * cookie owns conversations; the network address carries the daily question limit. Cloudflare's
 * CF-Connecting-IP names the client (the tunnel is the only way in); else the last forwarded hop,
 * which our own Caddy appended.
 */
function identity(request: NextRequest): { headers: Record<string, string>; cookie: string | null } {
  if (process.env.COURTLENS_PUBLIC_ASK !== "true") return { headers: {}, cookie: null };
  // The Ask token doubles as the hashing salt: without it the API refuses public writes anyway.
  const salt = process.env.COURTLENS_PUBLIC_ASK_TOKEN || "";
  const existing = request.cookies.get(visitorCookie)?.value;
  const browser = existing && /^[0-9a-f-]{36}$/.test(existing) ? existing : randomUUID();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map(part => part.trim()).filter(Boolean).at(-1);
  const address = request.headers.get("cf-connecting-ip") || forwarded || "unknown";
  const hash = (kind: string, value: string) => createHash("sha256").update(`${salt}:${kind}:${value}`).digest("hex");
  return {
    headers: { "X-CourtLens-Visitor": hash("visitor", browser), "X-CourtLens-Client": hash("client", address) },
    cookie: existing === browser ? null : browser,
  };
}

function withCookie<T extends Response>(response: T, cookie: string | null): T {
  if (cookie) response.headers.append("Set-Cookie", `${visitorCookie}=${cookie}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: NextRequest, context: Context) {
  const { path = [] } = await context.params;
  const suffix = path.join("/");
  if (!allowedPaths.test(suffix)) return NextResponse.json({ detail: "Unknown assistant route" }, { status: 404 });
  const mutates = request.method !== "GET";
  if (mutates && !isSameBrowserOrigin(request)) return NextResponse.json({ detail: "Same-origin history mutation required" }, { status: 403 });
  const publicAsk = process.env.COURTLENS_PUBLIC_ASK === "true";
  // The hosted build never forwards an Ask write unless public Ask (with its limits) is on.
  if (mutates && process.env.NEXT_PUBLIC_COURTLENS_HOSTED === "true" && !(publicAsk && process.env.COURTLENS_PUBLIC_ASK_TOKEN)) return NextResponse.json({ detail: "Ask is turned off on the hosted demo." }, { status: 403 });
  // Public Ask holds only the Ask token; local use keeps the operator token.
  const credential: Record<string, string> = !mutates ? {} : publicAsk ? { "X-CourtLens-Ask-Token": process.env.COURTLENS_PUBLIC_ASK_TOKEN || "" } : { "X-Operator-Token": process.env.COURTLENS_OPERATOR_TOKEN || "local-operator-secret-change-before-deploy" };
  const apiUrl = process.env.COURTLENS_API_INTERNAL_URL || process.env.NEXT_PUBLIC_COURTLENS_API_URL || "http://localhost:8000";
  const target = new URL(`/api/workbench/assistant/v2/${suffix}`, apiUrl);
  const who = identity(request);
  for (const key of ["limit", "cursor"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  // Bound before buffering or forwarding. The backend independently applies the same bound.
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (mutates && request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 160 * 1024) {
        await reader.cancel();
        return NextResponse.json({ detail: "Assistant request byte limit exceeded" }, { status: 413 });
      }
      chunks.push(value);
    }
  }
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: { "Content-Type": "application/json", ...who.headers, ...credential },
      body: bytes ? Buffer.concat(chunks) : undefined,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(55000),
    });
    // AR05: pass a successful event stream through unbuffered; errors stay JSON statuses.
    if (suffix === "turn/stream" && response.ok && response.body && response.headers.get("content-type")?.startsWith("text/event-stream")) {
      return withCookie(new Response(response.body, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } }), who.cookie);
    }
    return withCookie(NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } }), who.cookie);
  } catch {
    return NextResponse.json({ detail: "Assistant service unavailable. Reuse the request ID to check or replay the retained turn." }, { status: 502 });
  }
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
