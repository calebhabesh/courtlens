import type { Metadata } from "next";
import { DataBadge } from "@/components/data-badge";
import { Metric } from "@/components/metric";
import { getDataStatus } from "@/lib/api";

export const metadata: Metadata = { title: "Data status" };
export const dynamic = "force-dynamic";

function formatTimestamp(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto" }) : "Not available";
}

export default async function DataStatusPage() {
  const status = await getDataStatus();
  return (
    <section className="page shell">
      <div className="page-heading">
        <div>
          <p className="kicker">Freshness · coverage · lineage</p>
          <h1>Data status</h1>
          <p>A source failure remains visible. CourtLoad never fills a gap with unlabeled generated NBA records.</p>
        </div>
        <DataBadge status={status} />
      </div>

      {status.classification === "fixture" ? (
        <div className="fixture-warning">
          <strong>Fixture environment</strong>
          <p>Every loaded team, player, schedule, and stat here is a fictional deterministic test record. It proves behavior—not current NBA coverage.</p>
        </div>
      ) : null}

      {status.latest_attempt?.status === "failed" ? (
        <div className="fixture-warning refresh-failure" role="alert">
          <strong>Latest refresh failed</strong>
          <p>{status.latest_attempt.error ?? "Unclassified failure"}. The last successful snapshot remains visible; inspect private job logs for details.</p>
        </div>
      ) : null}

      <div className="metrics-grid status-metrics">
        <Metric value={status.coverage.teams ?? 0} label="teams" />
        <Metric value={status.coverage.players ?? 0} label="players" />
        <Metric value={status.coverage.games ?? 0} label="games" />
        <Metric value={status.coverage.player_games ?? 0} label="player games" />
        <Metric value={status.coverage.raw_versions ?? 0} label="raw versions" />
      </div>

      <div className="status-grid">
        <article className="status-card">
          <span className="eyebrow">Latest successful run</span>
          <h2>{status.latest_success?.status ?? "No successful run"}</h2>
          <dl>
            <div><dt>Source</dt><dd>{status.latest_success?.source ?? "—"}</dd></div>
            <div><dt>Finished</dt><dd>{formatTimestamp(status.latest_success?.finished_at)}</dd></div>
            <div><dt>Source observed</dt><dd>{formatTimestamp(status.latest_source_observation)}</dd></div>
            <div><dt>Freshness</dt><dd>{status.freshness.status}{status.freshness.age_hours === null ? "" : ` · ${status.freshness.age_hours}h`}</dd></div>
            <div><dt>Received</dt><dd>{status.latest_success?.received ?? "—"}</dd></div>
            <div><dt>Inserted</dt><dd>{status.latest_success?.inserted ?? "—"}</dd></div>
            <div><dt>Updated</dt><dd>{status.latest_success?.updated ?? "—"}</dd></div>
            <div><dt>Unchanged</dt><dd>{status.latest_success?.unchanged ?? "—"}</dd></div>
          </dl>
        </article>
        <article className="status-card">
          <span className="eyebrow">Operational quality</span>
          <h2>{status.quality?.status ?? "Not run"}</h2>
          <div className="check-list">
            {status.quality?.checks.map((check) => (
              <div key={check.name}>
                <span className={check.passed ? "check-pass" : "check-fail"}>{check.passed ? "✓" : "!"}</span>
                <span><strong>{check.name.replaceAll("_", " ")}</strong><small>Observed {check.observed}; expected {check.expectation}</small></span>
              </div>
            )) ?? <p>No quality run has been persisted.</p>}
          </div>
        </article>
      </div>

      <div className="source-contract">
        <div>
          <p className="kicker">Recorded contract</p>
          <h2>BALLDONTLIE NBA API</h2>
          <p>Checked {status.source_contract_checked_on}. Provider data is best effort and unofficial. Teams, players, and games are free-tier endpoints; game-player stats require NBA ALL-STAR or higher.</p>
        </div>
        <div className="contract-links">
          <a href={status.source_contract_url} rel="noreferrer" target="_blank">OpenAPI contract ↗</a>
          <a href={status.terms_url} rel="noreferrer" target="_blank">Provider terms ↗</a>
        </div>
      </div>

      <div className="limitations">
        <h2>Limitations kept visible</h2>
        <ul>{status.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </div>
    </section>
  );
}
