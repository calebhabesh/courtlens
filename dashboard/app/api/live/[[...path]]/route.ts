import { NextRequest, NextResponse } from "next/server";
import { validSlate } from "../../../../lib/live";
import { isSameBrowserOrigin } from "../../../../lib/same-origin";

type Context = { params: Promise<{ path?: string[] }> };
const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
async function proxy(request: NextRequest, context: Context) {
  const suffix = (await context.params).path?.join("/") ?? "";
  const method = request.method;
  const allowed = method === "GET" ? /^(?:|games\/[0-9]{1,20}|historical)$/.test(suffix) : method === "POST" ? new RegExp(`^(?:subscriptions|subscriptions/${uuid}/heartbeat)$`).test(suffix) : method === "DELETE" && new RegExp(`^subscriptions/${uuid}$`).test(suffix);
  if (!allowed) return NextResponse.json({ detail: "Unknown Live route" }, { status: 404 });
  if (method !== "GET" && !isSameBrowserOrigin(request)) return NextResponse.json({ detail: "Same-origin Live mutation required" }, { status: 403 });
  let body: string | undefined;
  if (method === "POST") {
    if (Number(request.headers.get("content-length")) > 1024) return NextResponse.json({ detail: "Live body too large" }, { status: 413 });
    try {
      const raw = await request.text();
      if (raw.length > 1024) return NextResponse.json({ detail: "Live body too large" }, { status: 413 });
      const value = JSON.parse(raw);
      if (!value || Array.isArray(value) || Object.keys(value).some(k => !["slate_date", "game_id"].includes(k)) || typeof value.slate_date !== "string" || !validSlate(value.slate_date) || (value.game_id != null && (typeof value.game_id !== "string" || !/^[0-9]{1,20}$/.test(value.game_id)))) throw new Error();
      body = JSON.stringify(value);
    } catch { return NextResponse.json({ detail: "Invalid Live selection" }, { status: 422 }); }
  }
  const target = new URL(`/api/live${suffix ? `/${suffix}` : ""}`, process.env.COURTLENS_API_INTERNAL_URL || process.env.NEXT_PUBLIC_COURTLENS_API_URL || "http://localhost:8000");
  const keys = suffix === "historical" ? ["slate_date", "game_id", "releaseId", "season", "phase", "beforeDate"] : ["slate_date"];
  for (const key of keys) { const value = request.nextUrl.searchParams.get(key); if (value !== null) target.searchParams.set(key, value); }
  try {
    const response = await fetch(target, { method, body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", ...(method !== "GET" ? { "X-Operator-Token": process.env.COURTLENS_OPERATOR_TOKEN || "local-operator-secret-change-before-deploy" } : {}) } });
    const headers = { "Cache-Control": "no-store" };
    if (response.status === 204) return new NextResponse(null, { status: 204, headers });
    // Backend errors never echo credentials or upstream bodies into the browser.
    if (!response.ok) return NextResponse.json({ detail: "Live request rejected" }, { status: response.status, headers });
    return NextResponse.json(await response.json(), { status: response.status, headers });
  } catch { return NextResponse.json({ detail: "Live service unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
