import type { Metadata } from "next";
import { OriginalArticle } from "@/components/original-article";
import { readPublication } from "@/lib/original-content";
export const metadata: Metadata = { title: "Blog · What's New" };
export default async function Page() { return <OriginalArticle source={await readPublication("blog")} />; }
