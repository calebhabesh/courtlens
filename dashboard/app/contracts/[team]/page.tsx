import { Suspense } from "react";
import { FinanceWorkspace } from "@/components/finance-workspace";
export default async function Page({ params }: { params: Promise<{ team: string }> }) { const {team} = await params; return <Suspense fallback={<p role="status">Loading financial context…</p>}><FinanceWorkspace mode="contracts" team={team} /></Suspense>; }
