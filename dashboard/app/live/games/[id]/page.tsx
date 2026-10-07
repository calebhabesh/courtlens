import { Suspense } from "react";
import { LiveWorkspace } from "@/components/live-workspace";
export default async function LiveGamePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Suspense fallback={null}><LiveWorkspace key={id} gameId={id} /></Suspense>; }
