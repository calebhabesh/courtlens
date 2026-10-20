"use client";

import { useEffect } from "react";
import { seasonEra } from "@/lib/portrait-source";
import { usePathname, useSearchParams } from "next/navigation";
import { exampleBoardScope, exampleTierGroups } from "@/lib/example-boards";
import type { WorkbenchQueryResponse } from "@/lib/types";
import { PlayerIdentity } from "./ui/identity";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PercentileCell } from "./charts/percentile-cell";
import { TablePercentileLegend } from "./table-percentile-legend";
import { Button, ButtonLink } from "./ui/kit";

export function ExampleBoardsView({ data, kind, onCopy, copying, copyError, copyDisabled }: {
  data: WorkbenchQueryResponse | null;
  kind: "rankings" | "tiers";
  onCopy: () => void;
  copying: boolean;
  copyError: string | null;
  copyDisabled: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  useEffect(() => {
    if (!data) return;
    const next = new URLSearchParams(search);
    const scope = { releaseId: data.query.release_id!, season: data.query.season, phase: data.query.phase, beforeDate: data.query.before_date! };
    for (const [key, value] of Object.entries(scope)) next.set(key, value);
    if (next.toString() !== search) window.history.replaceState(null, "", `${pathname}?${next}`);
  }, [data, pathname, search]);

  const scope = data ? exampleBoardScope(data) : "Published season minutes";
  const groups = data ? exampleTierGroups(data) : [];
  return <>
    <FilterBar collapsible={false} label="Example board context" scope={<span>{scope}</span>}
      count={<CountChip>{data ? `${data.items.length} players` : "Unavailable"}</CountChip>}
      details={<DataDetailsButton scope={data ? { releaseId: data.query.release_id, season: data.query.season, phase: data.query.phase, beforeDate: data.query.before_date, window: "season" } : undefined} rows={[
        { label: "Source", value: "CourtLens published box scores" },
        { label: "Example rule", value: "Top 15 by observed season minutes, descending; canonical player ID breaks equal-minute ties. Tier groups partition the returned order into five players each. This is workload, not player quality." },
        { label: "Coverage", value: data ? `${data.total_eligible_players} observed players eligible; ${data.items.length} displayed` : "Unavailable" },
        { label: "Warnings", value: data?.warnings.join("; ") || "None reported" }
      ]} />} />
    <GatedNote why="Ranking boards represent personal subjective evaluations. CourtLens never fabricates a global community consensus or automated public authority from subjective inputs. This example shows measured workload. Copies become personal boards; tier allocations reflect personal subjective categorizations after editing.">
      Example: season minutes leaders · Read-only
    </GatedNote>
    {!data || !data.items.length ? <GatedNote action={data ? <ButtonLink size="lg" href="/stats">Open Stats</ButtonLink> : <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Retry example</Button>}>
      {data ? "No observed players in this scope." : "Example board unavailable."}
    </GatedNote> : <section className="pc12-example-board" aria-label="Season minutes example board">
      <div className="pc12-example-header">
        <div><h2>{kind === "rankings" ? "Season Minutes Leaders" : "Season Minutes Groups"}</h2><p>Source: published box scores · {data.items.length} of {data.total_eligible_players} observed players</p></div>
        <Button size="sm" icon="copy" variant="secondary" disabled={copying || copyDisabled} onClick={onCopy}>{copying ? "Copying…" : "Copy to My Boards"}</Button>
      </div>
      {copyError && <p role="alert">{copyError}</p>}
      {kind === "rankings" ? <>
        <TablePercentileLegend cohort={data.table_cohort} />
        <div className="table-wrapper research-table-scroll pc12-example-table" role="region" aria-label="Example rankings scroll area" tabIndex={0}>
          <table className="data-table percentile-table" aria-label="Season minutes leaders">
            <caption>Ordered by observed season minutes. Reference shading is league percentile, not a personal rating.</caption>
            <thead><tr className="table-column-groups"><th colSpan={2} scope="colgroup">Minutes order</th><th colSpan={3} scope="colgroup">Participation</th><th scope="colgroup">Scoring reference</th></tr>
              <tr><th scope="col">#</th><th scope="col">Player</th><th scope="col" className="num">MIN</th><th scope="col" className="num">GP</th><th scope="col" className="num">MPG</th><th scope="col" className="num">PPG</th></tr></thead>
            <tbody>{data.items.map((player, index) => <tr key={player.player_id}>
              <td className="num">{index + 1}</td><th scope="row"><PlayerIdentity playerId={player.player_id} name={player.player_name} era={seasonEra(data.query.season, player.teams)} team={player.teams.length === 1 ? player.teams[0] : undefined} size="sm" href={`/players/${player.player_id}?releaseId=${data.query.release_id}&season=${data.query.season}&phase=${data.query.phase}&beforeDate=${data.query.before_date}`} subtitle={player.teams.length > 1 ? "Multiple observed teams" : undefined} />{player.table_qualified === false && <span className="table-small-sample">Small sample</span>}</th>
              {["min", "gp", "min_per_game", "pts_per_game"].map(key => <td key={key} className="num"><PercentileCell compact value={player.metrics[key] == null ? null : player.metrics[key]!.toLocaleString("en-US", { maximumFractionDigits: key === "gp" ? 0 : 1 })} percentile={player.table_percentiles?.[key] ?? null} qualified={player.table_qualified === true} label={key} cohort={`${player.table_cohort_sample_sizes?.[key] ?? "Unknown"} valid league players; 500+ season minutes`} /></td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </> : <>
        <p className="pc12-example-rule">Groups of five in minutes order · Color identifies each group · No player-quality rating</p>
        <div className="pc12-example-tiers">{groups.map((group, index) => <section key={group.tier_id} className={`pc12-example-tier pc12-example-category-${index + 1}`} aria-label={group.label}>
          <h3>{group.label}<span>{group.player_ids.length} players</span></h3>
          <div>{data.items.slice(index * 5, index * 5 + 5).map(player => <div className="pc12-example-player" key={player.player_id}>
            <PlayerIdentity playerId={player.player_id} name={player.player_name} era={seasonEra(data.query.season, player.teams)} team={player.teams.length === 1 ? player.teams[0] : undefined} subtitle={player.teams.length > 1 ? "Multiple observed teams" : undefined} size="sm" href={`/players/${player.player_id}?releaseId=${data.query.release_id}&season=${data.query.season}&phase=${data.query.phase}&beforeDate=${data.query.before_date}`} />
            <span>{player.total_minutes.toLocaleString("en-US", { maximumFractionDigits: 1 })} min · {player.games_played} GP</span>
          </div>)}{!group.player_ids.length && <p>No selected players in this group.</p>}</div>
        </section>)}</div>
      </>}
    </section>}
  </>;
}
