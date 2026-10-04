import { NextRequest, NextResponse } from "next/server";
import { isSameBrowserOrigin } from "../../../lib/same-origin";

export async function POST(request: NextRequest) {
  if (!isSameBrowserOrigin(request)) {
    return NextResponse.json({ detail: "Same-origin finance import required" }, { status: 403 });
  }
  try {
    const body = await request.json();
    if (Object.keys(body).length !== 1 || typeof body.bundle_hash !== "string" || !/^[a-f0-9]{64}$/.test(body.bundle_hash)) {
      return NextResponse.json({ detail: "A staged SHA-256 bundle hash is required" }, { status: 422 });
    }
    const apiUrl = process.env.COURTLOAD_API_INTERNAL_URL || process.env.NEXT_PUBLIC_COURTLOAD_API_URL || "http://localhost:8000";
    const token = process.env.COURTLOAD_OPERATOR_TOKEN || "local-operator-secret-change-before-deploy";
    const response = await fetch(`${apiUrl}/api/workbench/jobs`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", "X-Operator-Token": token },
      body: JSON.stringify({ jobType: "finance_import", arguments: { bundle_hash: body.bundle_hash } }),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Finance import service unavailable" }, { status: 502 });
  }
}
