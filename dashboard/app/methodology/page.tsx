import type { Metadata } from "next";
import Link from "next/link";
import { getMetricCatalog } from "@/lib/workbench-api";
import type { MetricCatalog } from "@/lib/types";

export const metadata: Metadata = { title: "Methodology & Catalog · CourtLens" };
export const dynamic = "force-dynamic";

export default async function MethodologyPage() {
  let catalog: MetricCatalog | null = null;
  try {
    catalog = await getMetricCatalog();
  } catch {
    // Fallback if backend offline
  }

  const metrics = catalog?.metrics ?? [];

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <span className="text-xs text-muted font-mono uppercase">System Principles & Metrics</span>
          <h1 className="page-title">Methodology & Metric Catalog</h1>
          <p className="page-subtitle">
            Formal mathematical formulas, zero-inferred principles, and temporal discipline guardrails governing CourtLens.
          </p>
        </div>
      </div>

      <div className="page-actions"><Link href="/learning">Worked lessons</Link><Link href="/data-status">Source coverage and lineage</Link><Link href="/evaluation">Model evaluation</Link><Link href="/investigations">Retained investigations</Link></div>
      {/* Core Principles Grid */}
      <div className="grid-3 methodology-principles-grid">
        <div className="panel">
          <span className="text-accent font-mono text-xs font-bold uppercase">Principle 1</span>
          <h2 className="panel-title methodology-principle-title">Temporal Discipline</h2>
          <p className="text-xs text-muted methodology-principle-desc">
            Historical feature and profile windows strictly exclude the replay target date and subsequent outcomes (<code>game_date &lt; before_date</code>). Changing future games never alters historical profiles.
          </p>
        </div>

        <div className="panel">
          <span className="text-accent font-mono text-xs font-bold uppercase">Principle 2</span>
          <h2 className="panel-title methodology-principle-title">Zero Inferred Claims</h2>
          <p className="text-xs text-muted methodology-principle-desc">
            An absent box-score row is unknown, not a zero outcome or injury confirmation. Defensive output reflects named box-score metrics, never a fabricated composite impact rating.
          </p>
        </div>

        <div className="panel">
          <span className="text-accent font-mono text-xs font-bold uppercase">Principle 3</span>
          <h2 className="panel-title methodology-principle-title">Calibrated Uncertainty</h2>
          <p className="text-xs text-muted methodology-principle-desc">
            Prediction intervals represent empirical calibrated dispersion from out-of-time chronological validation blocks, not subjective confidence scores or betting odds.
          </p>
        </div>
      </div>

      <section className="panel" id="impact" aria-label="Impact methodology">
        <h2>CourtLens impact methodology</h2>
        <p>RAPM is a descriptive ridge estimate under lineup confounding. Separate offensive and defensive player indicators use actual counted controls as weights, with fixed game-grouped alpha selection. ORAPM plus favorable-sign DRAPM equals RAPM, in points per 100 counted controls. 1Y, 2Y and 3Y labels identify complete, consecutive same-phase fit windows.</p>
        <p>Box-Prior RAPM (BPR) shrinks toward box regressions trained only on prior seasons. Unsupported prior windows remain unknown. BPR is a CourtLens analogue, with no imported third-party coefficients. Six factors are separate favorable-sign percentage-point estimates for shooting, turnovers and rebounds; they are not additive and have no defined residual or PVAL.</p>
        <p>Ratings require 20 games and 1,000 relevant opportunities on each side. On/off uses actual points and separate on/off offensive and defensive controls for each observed team, including team-season games without a player appearance in its off reference. Traded-team records remain separate. Zero denominators stay unknown.</p>
        <p>Extras retain source-specific numerators, denominators, covered games and references. Percentiles require 500 reconstructed minutes and 200 denominator units for rates. Conditional block recovery is limited to known individual rebounds; matchup FGA faced is an aggregate assignment, not tracking contests. Charges and credited forced turnovers include only explicitly attributed actions.</p>
        <p>Create / Space / Trans / Finish / Unknown are reproducible PBP analogues, not vendor play types. Trans uses a six-second live transition boundary; Unknown includes all free throws and unresolved joins. All buckets remain in the denominator. Deflections, potential assists, OnBall%, tracking DFGA, individual rim points saved, STOP%, D-SQI and complete forced-turnover attribution remain unavailable.</p>
        <p>Coverage and patch rates accompany every fit. Reconstruction retains source disagreement, minute and plus-minus limitations. The unchanged box-estimate ±2 distribution is a diagnostic under the event acceptance contract. RAPM omits zero-control observations; on/off retains their scoring. No impact output enters forecasting features, and descriptive serving leaves B26 experiment status unchanged.</p>
        <p>Inputs: NBA public play-by-play, shots and matchups via the admitted Apache-licensed shufinskiy archive, with SportsDataverse independent boxes and schedule. Exclusive cutoffs and SHA-256 artifact identities retain reproducibility.</p>
        <Link href="/research/rapm">Served ratings and registered experiment status</Link>
      </section>

      {/* Versioned Metric Catalog */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Canonical Metric Catalog ({catalog?.version ?? "unavailable"})</h2>
            <p className="text-muted text-xs methodology-catalog-desc">
              Single source of mathematical truth across backend services, warehouse marts, and dashboard presentation.
            </p>
          </div>
          <span className="badge badge-accent font-mono">{catalog ? `${metrics.length} Metrics` : "Catalog unavailable"}</span>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Key</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Mathematical Formula</th>
                <th>Denominator</th>
                <th>Limitations</th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted table-empty-cell">
                    Metric catalog unavailable. Restore the local API connection to inspect definitions.
                  </td>
                </tr>
              ) : (
                metrics.map((m) => (
                  <tr key={m.key}>
                    <td><strong>{m.display_name}</strong></td>
                    <td className="font-mono text-xs text-accent">{m.key}</td>
                    <td>
                      <span className="badge">{m.category}</span>
                    </td>
                    <td className="text-xs text-muted font-mono">{m.unit}</td>
                    <td className="font-mono text-xs">{m.formula}</td>
                    <td className="font-mono text-xs text-muted">{m.denominator || "None"}<p>{m.validity_definition}</p></td>
                    <td className="text-xs text-muted methodology-limitations-cell">
                      {m.limitations.join("; ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical vs Prospective Seams */}
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Historical Reconstruction vs Prospective Forecasts</h2>
        </div>
        <div className="text-sm text-muted prose-line-relaxed">
          <p>
            Historical analysis utilizes verified completed game logs acquired from open archives.
            Target opponent matchups are reconstructed from schedule outcomes; they are not real-time roster announcements.
          </p>
          <p>
            Genuine prospective forecasts are issued prior to game tipoffs and recorded in append-only storage.
            Before in-season outcomes are played, live prospective accuracy is reported as <strong>not yet observed</strong>.
          </p>
          <div className="methodology-actions">
            <Link href="/forecasts" className="button button-small button-primary">
              Inspect Forecast Protocol →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
