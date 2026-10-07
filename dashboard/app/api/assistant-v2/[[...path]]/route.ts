import { NextRequest, NextResponse } from "next/server";
import { isSameBrowserOrigin } from "../../../../lib/same-origin";

const uuid = "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const allowedPaths = new RegExp(`^(?:turn(?:/stream)?|threads(?:/${uuid}(?:/turns(?:/${uuid}/cancel)?)?)?)$`);
type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: NextRequest, context: Context) {
  const { path = [] } = await context.params;
  const suffix = path.join("/");
  if (!allowedPaths.test(suffix)) return NextResponse.json({ detail: "Unknown assistant route" }, { status: 404 });
  const mutates = request.method !== "GET";
  if (mutates && !isSameBrowserOrigin(request)) return NextResponse.json({ detail: "Same-origin history mutation required" }, { status: 403 });
  const apiUrl = process.env.COURTLENS_API_INTERNAL_URL || process.env.NEXT_PUBLIC_COURTLENS_API_URL || "http://localhost:8000";
  const target = new URL(`/api/workbench/assistant/v2/${suffix}`, apiUrl);
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
      headers: { "Content-Type": "application/json", ...(mutates ? { "X-Operator-Token": process.env.COURTLENS_OPERATOR_TOKEN || "local-operator-secret-change-before-deploy" } : {}) },
      body: bytes ? Buffer.concat(chunks) : undefined,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(55000),
    });
    // AR05: pass a successful event stream through unbuffered; errors stay JSON statuses.
    if (suffix === "turn/stream" && response.ok && response.body && response.headers.get("content-type")?.startsWith("text/event-stream")) {
      return new Response(response.body, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
    }
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ detail: "Assistant service unavailable. Reuse the request ID to check or replay the retained turn." }, { status: 502 });
  }
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
