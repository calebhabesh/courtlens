import { Suspense } from "react";
import { LiveWorkspace } from "@/components/live-workspace";
export default function LivePage() { return <Suspense fallback={null}><LiveWorkspace /></Suspense>; }
