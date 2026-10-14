import type { ImpactResponse } from "@/lib/types";
import { IMPACT_COLUMNS, formatStatValue } from "@/lib/stats-presets";
import { ImpactDisclosure } from "./impact-disclosure";
import { GatedNote } from "./ui/gated-note";

/** `compact` (player page): values only, without the sample table and model note. */
export function ImpactPlayerCard({ data, compact = false }: { data: ImpactResponse | null; compact?: boolean }) {
  const player = data?.players[0];
  return <section className="panel impact-player-card" aria-label="Player impact">
    <h2>Player impact</h2>
    {!data ? <p role="status">Impact serving is unavailable. Restore the local API connection.</p> : <>
      {/* Values lead; fit windows, coverage and limits sit behind Why? (D4, glance item 6). */}
      {!player ? <p>No accepted impact sample for this player and cutoff.</p> : <>
        <dl className="impact-values">{["rapm", "orapm", "drapm", "bpr", "rapm_2y", "rapm_3y"].map(key => <div key={key}>
          <dt>{IMPACT_COLUMNS[key].label}</dt><dd>{formatStatValue(player.metrics[key], 2)}</dd>
        </div>)}</dl>
        {!compact && <details><summary>Impact samples and artifact identity</summary>
          <div className="table-wrapper" role="region" aria-label="Impact sample table" tabIndex={0}>
            <table className="data-table"><thead><tr><th>Metric</th><th>Games</th><th>Minutes</th><th>Off / def opportunities</th><th>Sample</th></tr></thead>
              <tbody>{["rapm", "rapm_2y", "rapm_3y", "bpr"].map(key => { const sample = player.support[key]; return <tr key={key}>
                <th>{IMPACT_COLUMNS[key].label}</th><td>{sample?.games ?? "—"}</td><td>{sample?.seconds == null ? "—" : (sample.seconds / 60).toFixed(1)}</td>
                <td>{sample?.off_opportunities ?? "—"} / {sample?.def_opportunities ?? "—"}</td><td>{sample?.qualified ? "Qualified" : sample?.reason || "Insufficient sample"}</td>
              </tr>; })}</tbody></table>
          </div>
          <p>RAPM units: points per 100 counted controls. {player.support.rapm?.artifact_sha256}</p>
        </details>}
      </>}
      {!compact && <GatedNote why={<ImpactDisclosure data={data} />}>CourtLens model: descriptive estimates under lineup confounding.</GatedNote>}
    </>}
  </section>;
}
