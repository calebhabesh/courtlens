import type { Metadata } from "next";
import Link from "next/link";
import { LearningView } from "@/components/learning-view";
import { LearningWorkshop } from "@/components/learning-workshop";
import { ArticleSection } from "@/components/ui/article-layout";
import { GatedNote } from "@/components/ui/gated-note";
import { getWorkbenchCatalog } from "@/lib/workbench-api";

export const metadata: Metadata = { title: "Learning · Methodology" };
export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const catalog = await getWorkbenchCatalog().catch(() => null);
  const workshop = catalog
    ? <LearningWorkshop release={catalog.release_id} season={catalog.default_season} before={catalog.default_before_date} />
    : <ArticleSection id="workshop" title="Investigate historical scoring variation">
        <GatedNote action={<Link href="/research/ask">Open manual research</Link>} why={<p>A dataset-bound lesson needs a retained release from the local catalog.</p>}>The local catalog is unavailable.</GatedNote>
      </ArticleSection>;
  return <LearningView workshop={workshop} />;
}
