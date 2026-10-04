import type { Metadata } from "next";
import { OriginalArticle } from "@/components/original-article";
import { readPublication } from "@/lib/original-content";
export const metadata: Metadata = { title: "Patch notes" };
export default async function Page() {return <div className="workbench-content"><OriginalArticle source={await readPublication("patch-notes")} /></div>;}
