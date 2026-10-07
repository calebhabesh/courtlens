import { Suspense } from "react";
import { LiveWorkspace } from "@/components/live-workspace";
export default async function LiveDatePage({ params }: { params: Promise<{ date: string }> }) { const { date } = await params; return <Suspense fallback={null}><LiveWorkspace key={date} date={date} /></Suspense>; }
