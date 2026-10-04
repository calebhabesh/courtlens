import type { Metadata } from "next";
import { SavedOperationDetail } from "@/components/saved-operation-detail";
export const metadata: Metadata = { title: "Retained investigation" };
export const dynamic = "force-dynamic";
export default async function SavedPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <div className="workbench-content"><SavedOperationDetail key={id} id={id} /></div>;
}
