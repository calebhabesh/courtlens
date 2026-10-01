import type { Metadata } from "next";
import Link from "next/link";
import { getMetricCatalog } from "@/lib/workbench-api";
import type { MetricCatalog } from "@/lib/types";

export const metadata: Metadata = { title: "Methodology & Catalog · CourtLoad" };
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
            Formal mathematical formulas, zero-inferred principles, and temporal discipline guardrails governing CourtLoad.
          </p>
        </div>
      </div>

      {/* Core Principles Grid */}
      <div className="grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="panel">
          <span className="text-accent font-mono text-xs font-bold uppercase">Principle 1</span>
          <h2 className="panel-title" style={{ margin: "0.4rem 0" }}>Temporal Discipline</h2>
          <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
            Every feature, metric window, and profile strictly excludes the target date and all subsequent outcomes (<code>game_date &lt; before_date</code>). Changing future games never alters historical profiles.
          </p>
        </div>

        <div className="panel">
          <span className="text-accent font-mono text-xs font-bold uppercase">Principle 2</span>
          <h2 className="panel-title" style={{ margin: "0.4rem 0" }}>Zero Inferred Claims</h2>
          <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
            An absent box-score row is unknown, not a zero outcome or injury confirmation. Defensive output reflects named box-score metrics, never a fabricated composite impact rating.
          </p>
        </div>

        <div className="panel">
          <span className="text-accent font-mono text-xs font-bold uppercase">Principle 3</span>
          <h2 className="panel-title" style={{ margin: "0.4rem 0" }}>Calibrated Uncertainty</h2>
          <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
            Prediction intervals represent empirical calibrated dispersion from out-of-time chronological validation blocks, not subjective confidence scores or betting odds.
          </p>
        </div>
      </div>

      {/* Versioned Metric Catalog v1 */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Canonical Metric Catalog (v1)</h2>
            <p className="text-muted text-xs" style={{ margin: "0.2rem 0 0" }}>
              Single source of mathematical truth across backend services, warehouse marts, and dashboard presentation.
            </p>
          </div>
          <span className="badge badge-accent font-mono">{metrics.length || 35} Metrics</span>
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
                  <td colSpan={7} style={{ textAlign: "center", padding: "2rem" }} className="text-muted">
                    Loading metric catalog specifications...
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
                    <td className="font-mono text-xs text-muted">{m.denominator || "None"}</td>
                    <td className="text-xs text-muted" style={{ maxWidth: "260px", whiteSpace: "normal" }}>
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
        <div className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
          <p>
            Historical analysis utilizes verified completed game logs acquired from open archives.
            Target opponent matchups are reconstructed from schedule outcomes; they are not real-time roster announcements.
          </p>
          <p>
            Genuine prospective forecasts are issued prior to game tipoffs and recorded in append-only storage.
            Before in-season outcomes are played, live prospective accuracy is reported as <strong>not yet observed</strong>.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/forecasts" className="button button-small button-primary">
              Inspect Forecast Protocol →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
