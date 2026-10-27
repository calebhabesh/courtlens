import { NextRequest, NextResponse } from "next/server";

type Context = { params: Promise<{ path?: string[] }> };

/** Live is read-only: GETs that the API answers from its ESPN cache, fetching when stale. */
export async function GET(request: NextRequest, context: Context) {
  const suffix = (await context.params).path?.join("/") ?? "";
  if (!/^(?:|games\/[0-9]{1,20}|historical)$/.test(suffix)) return NextResponse.json({ detail: "Unknown Live route" }, { status: 404 });
  const target = new URL(`/api/live${suffix ? `/${suffix}` : ""}`, process.env.COURTLENS_API_INTERNAL_URL || process.env.NEXT_PUBLIC_COURTLENS_API_URL || "http://localhost:8000");
  const keys = suffix === "historical" ? ["slate_date", "game_id", "releaseId", "season", "phase", "beforeDate"] : ["slate_date"];
  for (const key of keys) { const value = request.nextUrl.searchParams.get(key); if (value !== null) target.searchParams.set(key, value); }
  const headers = { "Cache-Control": "no-store" };
  try {
    // A first read of a game can wait on one ESPN fetch (bounded at 10 s by the API).
    const response = await fetch(target, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
    // Backend errors never echo upstream bodies into the browser.
    if (!response.ok) return NextResponse.json({ detail: "Live request rejected" }, { status: response.status, headers });
    return NextResponse.json(await response.json(), { status: response.status, headers });
  } catch { return NextResponse.json({ detail: "Live service unavailable" }, { status: 502, headers }); }
}
