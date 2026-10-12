import { Suspense } from "react";
import { ContractsTeam } from "@/components/contracts-view";
export default async function Page({ params }: { params: Promise<{ team: string }> }) { const { team } = await params; return <Suspense fallback={null}><ContractsTeam team={team} /></Suspense>; }
