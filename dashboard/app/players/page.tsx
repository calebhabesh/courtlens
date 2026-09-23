import type { Metadata } from "next";
import { PlayerSearch } from "@/components/player-search";
import { AnalyticsApiError, getAnalyticsCatalog } from "@/lib/api";

export const metadata: Metadata = { title: "Player intelligence" };
export const dynamic = "force-dynamic";

export default async function PlayersPage({
  searchParams
}: {
  searchParams: Promise<{ snapshotId?: string }>;
}) {
  const { snapshotId } = await searchParams;
  let catalog;
  try {
    catalog = await getAnalyticsCatalog(snapshotId);
  } catch (error) {
    const unavailable = error instanceof AnalyticsApiError && error.status === 503;
    return (
      <section className="page shell">
        <div className="page-heading">
          <div><p className="kicker">Historical replay</p><h1>Players</h1></div>
        </div>
        <div className="empty-state tall" role="status">
          <span className="empty-code">{unavailable ? "NO DATA" : "UNAVAILABLE"}</span>
          <h2>{unavailable ? "No published analytics yet" : "This snapshot cannot be opened"}</h2>
          <p>Publish a validated archive snapshot, then return here to search historical players.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="page shell">
      <div className="page-heading">
        <div>
          <p className="kicker">Historical replay · {catalog.default_replay_date}</p>
          <h1>Players</h1>
          <p>
            Inspect recent production with its sample size, scoring cutoff, and game-level trace
            kept visible.
          </p>
        </div>
        <div className="archive-badge">
          <span />Historical archive<br />{catalog.coverage_start}—{catalog.coverage_end}
        </div>
      </div>
      <PlayerSearch catalog={catalog} />
      <p className="snapshot-footnote">Pinned snapshot {catalog.snapshot_id} · source {catalog.source}</p>
    </section>
  );
}
