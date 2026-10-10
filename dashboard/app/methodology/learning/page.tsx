import type { Metadata } from "next";
import Link from "next/link";
import { LearningWorkshop } from "@/components/learning-workshop";
import { ArticleLayout, ArticleSection } from "@/components/ui/article-layout";
import { GatedNote } from "@/components/ui/gated-note";
import { getWorkbenchCatalog } from "@/lib/workbench-api";

export const metadata: Metadata = { title: "Learning · Methodology" };
export const dynamic = "force-dynamic";

const TOC = [
  { id: "true-shooting", label: "True shooting" },
  { id: "workshop", label: "Scoring variation" },
  { id: "intervals", label: "Intervals and evidence" },
  { id: "reproduce", label: "Retain and reproduce" },
];

export default async function LearningPage() {
  const catalog = await getWorkbenchCatalog().catch(() => null);
  return (
    <ArticleLayout toc={TOC}>
      <ArticleSection id="true-shooting" title="True shooting and paired denominators">
        <p>Original CourtLens lessons. The worked arithmetic uses illustrative inputs; the investigation below uses a pinned local release.</p>
        <p>For an illustrative player with 24 points, 18 field-goal attempts and 6 free-throw attempts:</p>
        <pre><code>{`TS% = PTS / (2 × (FGA + 0.44 × FTA))
    = 24 / (2 × (18 + 0.44 × 6))
    ≈ 0.5814 (58.14%)`}</code></pre>
        <p>The 0.44 term estimates free-throw possession usage. Aggregate valid paired rows before forming the ratio; do not average individual game percentages or turn missing attempts into zero. Check the catalog for the active version, units and validity rules.</p>
        <p><Link href="/methodology#catalog">Inspect canonical definitions</Link></p>
      </ArticleSection>
      {catalog
        ? <LearningWorkshop release={catalog.release_id} season={catalog.default_season} before={catalog.default_before_date} />
        : <ArticleSection id="workshop" title="Investigate historical scoring variation">
            <GatedNote action={<Link href="/research/ask">Open manual research</Link>} why={<p>A dataset-bound lesson needs a retained release from the local catalog.</p>}>The local catalog is unavailable.</GatedNote>
          </ArticleSection>}
      <ArticleSection id="intervals" title="Historical intervals and prospective evidence">
        <p>Historical quantiles describe admitted observations in a selected window. A calibrated forecast interval comes from a registered out-of-time evaluation and is conditional on the declared forecast task. It does not give injury or appearance probability. A prospective issuance must precede its target event; missing outcomes cannot establish accuracy.</p>
        <ul>
          <li><Link href="/forecasts">Forecast ledger and limitations</Link></li>
          <li><Link href="/evaluation">Out-of-time evaluation</Link></li>
          <li><Link href="/research/case-studies">Real-data case studies</Link></li>
        </ul>
      </ArticleSection>
      <ArticleSection id="reproduce" title="Retain, inspect, reproduce">
        <p>Run a manual operation, choose a title, and decide separately whether to retain your question. Inspect its immutable plan and exact evidence in the library, reopen the pinned view, then reproduce without AI. A mismatch stays visible and exports remain available.</p>
        <ul>
          <li><Link href="/research/ask">Start manual research</Link></li>
          <li><Link href="/investigations">Saved library</Link></li>
          <li><Link href="/whats-new/blog">Evidence before narrative</Link></li>
          <li><Link href="/data-status">Lineage and operations</Link></li>
        </ul>
      </ArticleSection>
    </ArticleLayout>
  );
}
