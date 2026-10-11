import { OriginalArticle } from "@/components/original-article";
import { readPublication } from "@/lib/original-content";
export default async function Page() { return <OriginalArticle source={await readPublication("patch-notes")} />; }
