import type { Metadata } from "next";
import Link from "next/link";
import { LearningWorkshop } from "@/components/learning-workshop";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
export const metadata: Metadata = { title: "Learning" };
export const dynamic = "force-dynamic";
export default async function LearningPage() {
  const catalog=await getWorkbenchCatalog().catch(()=>null);
  return <div className="workbench-content original-article"><h1>Learn with CourtLens evidence</h1><p>Original CourtLens lessons · 2026-10-04. Worked arithmetic below uses illustrative inputs; the investigation uses an explicitly pinned local release.</p>
    <section className="panel"><h2>True shooting and paired denominators</h2><p>For an illustrative player with 24 points, 18 field-goal attempts and 6 free-throw attempts:</p><pre><code>TS% = PTS / (2 × (FGA + 0.44 × FTA))
    = 24 / (2 × (18 + 0.44 × 6))
    ≈ 0.5814 (58.14%)</code></pre><p>The 0.44 term estimates free-throw possession usage. Aggregate valid paired rows before forming the ratio; do not average individual game percentages or turn missing attempts into zero. Check the catalog for the active version, units and validity rules.</p><Link href="/methodology">Inspect canonical definitions</Link></section>
    {catalog ? <LearningWorkshop release={catalog.release_id} season={catalog.default_season} before={catalog.default_before_date} /> : <p role="status">The local catalog is unavailable. A dataset-bound lesson needs a retained release; <Link href="/research/ask">open manual research</Link> when the API is available.</p>}
    <section className="panel"><h2>Historical intervals and prospective evidence</h2><p>Historical quantiles describe admitted observations in a selected window. A calibrated forecast interval comes from a registered out-of-time evaluation and is conditional on the declared forecast task. It does not give injury or appearance probability. A prospective issuance must precede its target event; missing outcomes cannot establish accuracy.</p><div className="page-actions"><Link href="/forecasts">Forecast ledger and limitations</Link><Link href="/evaluation">Out-of-time evaluation</Link><Link href="/research/case-studies">Real-data case studies</Link></div></section>
    <section className="panel"><h2>Retain, inspect, reproduce</h2><p>Run a manual operation, choose a title, and decide separately whether to retain your question. Inspect its immutable plan and exact evidence in the library, reopen the pinned view, then reproduce without AI. A mismatch stays visible and exports remain available.</p><div className="page-actions"><Link href="/research/ask">Start manual research</Link><Link href="/investigations">Saved library</Link><Link href="/blog">Evidence before narrative</Link><Link href="/data-status">Lineage and operations</Link></div></section>
  </div>;
}
