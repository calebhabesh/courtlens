import Link from "next/link";
import { ArticleLayout, ArticleSection } from "@/components/ui/article-layout";
import { CountChip } from "@/components/ui/filter-bar";
import { getMetricCatalog } from "@/lib/workbench-api";
import type { MetricCatalog } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOC = [
  { id: "principles", label: "Principles" },
  { id: "impact", label: "Impact metrics" },
  { id: "catalog", label: "Metric catalog" },
  { id: "prospective", label: "Historical and prospective" },
  { id: "related", label: "Related pages" },
];

function categoryLabel(category: string) {
  const text = category.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function MethodologyPage() {
  let catalog: MetricCatalog | null = null;
  try {
    catalog = await getMetricCatalog();
  } catch {
    // The catalog section states that the catalog is unavailable.
  }

  const metrics = catalog?.metrics ?? [];
  const categories = [...new Set(metrics.map(metric => metric.category))];

  return (
    <ArticleLayout toc={TOC}>
      <ArticleSection id="principles" title="Principles">
        <h3>Temporal discipline</h3>
        <p>Feature and profile windows include only games strictly before the replay date, never the target date or anything after it. Changing a future game never alters a historical profile.</p>
        <h3>Zero inferred claims</h3>
        <p>An absent box-score row is unknown, not a zero outcome or an injury confirmation. Defensive output reflects named box-score metrics, never a fabricated composite impact rating.</p>
        <h3>Calibrated uncertainty</h3>
        <p>Prediction intervals represent empirical calibrated dispersion from out-of-time chronological validation blocks, not subjective confidence scores or betting odds.</p>
      </ArticleSection>

      <ArticleSection id="impact" title="Impact metrics" label="Impact methodology">
        <p>RAPM is a descriptive ridge estimate under lineup confounding. Separate offensive and defensive player indicators use actual counted controls as weights, with fixed game-grouped alpha selection. ORAPM plus favorable-sign DRAPM equals RAPM, in points per 100 counted controls. 1Y, 2Y and 3Y labels identify complete, consecutive same-phase fit windows.</p>
        <p>Box-Prior RAPM (BPR) shrinks toward box regressions trained only on prior seasons. Unsupported prior windows remain unknown. BPR is a CourtLens analogue, with no imported third-party coefficients. Six factors are separate favorable-sign percentage-point estimates for shooting, turnovers and rebounds; they are not additive and have no defined residual or PVAL.</p>
        <p>Ratings require 20 games and 1,000 relevant opportunities on each side. On/off uses actual points and separate on/off offensive and defensive controls for each observed team, including team-season games without a player appearance in its off reference. Traded-team records remain separate. Zero denominators stay unknown.</p>
        <p>Extras retain source-specific numerators, denominators, covered games and references. Percentiles require 500 reconstructed minutes and 200 denominator units for rates. Conditional block recovery is limited to known individual rebounds; matchup FGA faced is an aggregate assignment, not tracking contests. Charges and credited forced turnovers include only explicitly attributed actions.</p>
        <p>Create / Space / Trans / Finish / Unknown are reproducible PBP analogues, not vendor play types. Trans uses a six-second live transition boundary; Unknown includes all free throws and unresolved joins. All buckets remain in the denominator. Deflections, potential assists, OnBall%, tracking DFGA, individual rim points saved, STOP%, D-SQI and complete forced-turnover attribution remain unavailable.</p>
        <p>Coverage and patch rates accompany every fit. Reconstruction retains source disagreement, minute and plus-minus limitations. The unchanged box-estimate ±2 distribution is a diagnostic under the event acceptance contract. RAPM omits zero-control observations; on/off retains their scoring. No impact output enters forecasting features, and descriptive serving leaves B26 experiment status unchanged.</p>
        <p>Inputs: NBA public play-by-play, shots and matchups via the admitted Apache-licensed shufinskiy archive, with SportsDataverse independent boxes and schedule. Exclusive cutoffs and SHA-256 artifact identities retain reproducibility.</p>
        <p><Link href="/research/rapm">Served ratings and registered experiment status</Link></p>
      </ArticleSection>

      <ArticleSection
        id="catalog"
        wide
        title={`Canonical Metric Catalog (${catalog?.version ?? "unavailable"})`}
        label="Metric catalog"
        actions={<CountChip>{catalog ? `${metrics.length} Metrics` : "Catalog unavailable"}</CountChip>}
      >
        <p>One definition for each metric, shared by the API, the warehouse marts and every page. Validity says which rows count; limitations say what a value cannot show.</p>
        <div className="table-wrapper research-table methodology-catalog" role="region" aria-label="Metric definitions" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr><th scope="col">Metric</th><th scope="col">Unit</th><th scope="col">Formula</th><th scope="col">Valid when</th><th scope="col">Limitations</th></tr>
            </thead>
            {metrics.length === 0 ? (
              <tbody><tr><td colSpan={5} className="text-muted table-empty-cell">Metric catalog unavailable. Restore the local API connection to inspect definitions.</td></tr></tbody>
            ) : categories.map(category => (
              <tbody key={category}>
                <tr className="methodology-group-row"><th scope="colgroup" colSpan={5}>{categoryLabel(category)}</th></tr>
                {metrics.filter(metric => metric.category === category).map(metric => (
                  <tr key={metric.key}>
                    <th scope="row"><span className="methodology-metric-name">{metric.display_name}</span><span className="methodology-metric-key">{metric.key}</span></th>
                    <td>{metric.unit}</td>
                    <td className="methodology-code">{metric.formula}</td>
                    <td className="methodology-code">{metric.validity_definition || "—"}{metric.denominator ? <span className="methodology-denominator">Denominator: {metric.denominator}</span> : null}</td>
                    <td className="methodology-limitations">{metric.limitations.length ? metric.limitations.join(" ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </ArticleSection>

      <ArticleSection id="prospective" title="Historical and prospective">
        <p>Historical analysis uses verified completed game logs from open archives. Opponent matchups are reconstructed from schedule outcomes; they are not real-time roster announcements.</p>
        <p>Prospective forecasts are issued before tipoff and recorded in append-only storage. Until in-season outcomes are played, prospective accuracy is reported as <strong>not yet observed</strong>.</p>
      </ArticleSection>

      <ArticleSection id="related" title="Related pages">
        <ul>
          <li><Link href="/forecasts">Points Forecasts</Link>: the forecast protocol and ledger.</li>
          <li><Link href="/evaluation">Evaluation Archive</Link>: out-of-time model evaluation.</li>
          <li><Link href="/investigations">Saved Investigations</Link>: retained, reproducible results.</li>
          <li><Link href="/data-status">Data Status</Link>: source coverage and lineage.</li>
        </ul>
      </ArticleSection>
    </ArticleLayout>
  );
}
