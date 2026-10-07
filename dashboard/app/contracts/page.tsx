import { Suspense } from "react";
import { FinanceWorkspace } from "@/components/finance-workspace";
export default function Page() { return <Suspense fallback={null}><FinanceWorkspace mode="contracts" /></Suspense>; }
