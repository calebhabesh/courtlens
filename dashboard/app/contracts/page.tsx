import { Suspense } from "react";
import { FinanceWorkspace } from "@/components/finance-workspace";
export default function Page() { return <Suspense fallback={<p role="status">Loading financial context…</p>}><FinanceWorkspace mode="contracts" /></Suspense>; }
