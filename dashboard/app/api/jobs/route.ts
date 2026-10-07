import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const apiUrl =
      process.env.COURTLENS_API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_COURTLENS_API_URL ||
      "http://localhost:8000";
    const operatorToken =
      process.env.COURTLENS_OPERATOR_TOKEN || "local-operator-secret-change-before-deploy";

    const body = await request.json();

    const response = await fetch(`${apiUrl}/api/workbench/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Operator-Token": operatorToken,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to trigger job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const apiUrl =
      process.env.COURTLENS_API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_COURTLENS_API_URL ||
      "http://localhost:8000";

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const targetUrl = queryString
      ? `${apiUrl}/api/workbench/jobs?${queryString}`
      : `${apiUrl}/api/workbench/jobs`;

    const response = await fetch(targetUrl);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
