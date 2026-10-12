import { Suspense } from "react";
import { ContractsLeague } from "@/components/contracts-view";
export default function Page() { return <Suspense fallback={null}><ContractsLeague /></Suspense>; }
