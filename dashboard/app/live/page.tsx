import { Suspense } from "react";
import { LiveWorkspace } from "@/components/live-workspace";
export default function LivePage() { return <Suspense fallback={<p>Loading Live workspace…</p>}><LiveWorkspace /></Suspense>; }
