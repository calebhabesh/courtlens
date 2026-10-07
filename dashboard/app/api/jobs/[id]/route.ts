import { NextResponse } from "next/server";
export async function GET(_request: Request, {params}: {params: Promise<{id:string}>}) {
  const {id} = await params;
  const apiUrl = process.env.COURTLENS_API_INTERNAL_URL || process.env.NEXT_PUBLIC_COURTLENS_API_URL || "http://localhost:8000";
  try { const response=await fetch(`${apiUrl}/api/workbench/jobs/${encodeURIComponent(id)}`,{cache:"no-store",signal:AbortSignal.timeout(8000)});return NextResponse.json(await response.json(),{status:response.status}); }
  catch {return NextResponse.json({detail:"Job service unavailable"},{status:502});}
}
