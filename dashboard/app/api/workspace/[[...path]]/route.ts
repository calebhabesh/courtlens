import { NextRequest, NextResponse } from "next/server";

// A fixed workspace-only target keeps server credentials out of arbitrary upstream requests.
const allowedPaths = /^(?:|reset|export|import|preferences|presets|views(?:\/(?:reorder|[\w-]+))?|favorites(?:\/[\w-]+)?|compare-tray(?:\/[\w-]+)?|ranking-boards(?:\/(?:aggregate|[\w-]+))?|tier-lists(?:\/[\w-]+)?)$/;

type Context = { params: Promise<{ path?: string[] }> };

async function proxy(request: NextRequest, context: Context) {
  const { path = [] } = await context.params;
  const suffix = path.join("/");
  if (!allowedPaths.test(suffix)) {
    return NextResponse.json({ detail: "Unknown workspace route" }, { status: 404 });
  }
  const mutates = request.method !== "GET";
  if (mutates && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ detail: "Same-origin workspace mutation required" }, { status: 403 });
  }
  const apiUrl = process.env.COURTLOAD_API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_COURTLOAD_API_URL || "http://localhost:8000";
  const token = process.env.COURTLOAD_OPERATOR_TOKEN || "local-operator-secret-change-before-deploy";
  const target = new URL(`/api/workbench/workspace${suffix ? `/${suffix}` : ""}`, apiUrl);
  for (const key of ["workspaceId", "expectedVersion"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: { "Content-Type": "application/json", ...(mutates ? { "X-Operator-Token": token } : {}) },
      body: mutates ? (await request.text()) || undefined : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Workspace service unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
