"use client";

import Link from "next/link";
import { PercentileCell, RankedBars } from "./charts";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { ImpactDisclosure } from "./impact-disclosure";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { ResearchLayout } from "./ui/page-shell";
import { SegmentedControl } from "./ui/segmented-control";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { formatDate } from "@/lib/format-date";
import { getSixFactor, signed } from "@/lib/stats-feeds";
import type { ImpactResponse } from "@/lib/types";

/** The six favorable-sign factors: positive always helps the player's team. Not additive. */
export const SIX_FACTORS = [
  { key: "o_ts", label: "Offensive shooting", short: "oTS", side: "offense", help: "Team true shooting with the player on offense" },
  { key: "o_tov", label: "Offensive ball security", short: "oTOV", side: "offense", help: "Fewer team turnovers with the player on offense" },
  { key: "o_reb", label: "Offensive rebounding", short: "oREB", side: "offense", help: "Team offensive rebound share with the player on" },
  { key: "d_ts", label: "Shooting defense", short: "dTS", side: "defense", help: "Lower opponent true shooting with the player on defense" },
  { key: "d_tov", label: "Forcing turnovers", short: "dTOV", side: "defense", help: "More opponent turnovers with the player on defense" },
  { key: "d_reb", label: "Defensive rebounding", short: "dREB", side: "defense", help: "Lower opponent offensive rebound share with the player on" },
] as const;
type FactorKey = (typeof SIX_FACTORS)[number]["key"];
type Player = ImpactResponse["players"][number];
const SCOPES = [{ season: "2025-26", label: "2025-26" }, { season: "2024-25", label: "2024-25" }, { season: "2023-24", label: "2023-24" }];
const COHORT = "qualified players (20 games and 1,000 opportunities on each side)";

function factorPercentile(player: Player, key: FactorKey): number | null {
  const support = player.support[key];
  return (key.startsWith("o_") ? support?.offense_percentile : support?.defense_percentile) ?? null;
}

/** PC11 Six-Factor RAPM: sealed IM04 factor coefficients, ranked one factor at a time. */
export function SixFactorView() {
  const { get, set } = useUrlState();
  const factor = (SIX_FACTORS.find(f => f.key === get("factor"))?.key ?? "o_ts") as FactorKey;
  const season = get("season") ?? "2025-26", phase = get("phase") === "playoffs" ? "playoffs" : "regular_season";
  const beforeDate = `${Number(season.slice(0, 4)) + 1}-07-01`;
  const { data, error, loading, retry } = useFeed([season, phase, factor], signal => getSixFactor({ season, phase, beforeDate, sortMetric: factor }, signal));
  const meta = SIX_FACTORS.find(f => f.key === factor)!;
  // oTS is the default, so it stays out of the URL.
  const setFactor = (key: string) => set({ factor: key === "o_ts" ? null : key });
  const scope = new URLSearchParams({ season, phase, beforeDate }).toString();
  const players = data?.players ?? [];
  const leader = players[0];
  const coverage = data?.coverage.find(row => row.season === season && row.phase === phase);
  const fit = data?.artifacts.find(a => a.years === 1 && a.season === season && a.phase === phase);
  return <>
    <FilterBar label="Six-Factor filters" summary={`${season} · ${phase === "playoffs" ? "Playoffs" : "Regular season"}`}
      scope={<>
        <Field label="Season" layout="inline"><Select aria-label="Season" value={season} onChange={e => set({ season: e.target.value })}>{SCOPES.map(s => <option key={s.season} value={s.season}>{s.label}</option>)}</Select></Field>
        <Field label="Phase" layout="inline"><Select aria-label="Phase" value={phase} onChange={e => set({ phase: e.target.value === "playoffs" ? "playoffs" : null })}><option value="regular_season">Regular season</option><option value="playoffs">Playoffs</option></Select></Field>
      </>}
      filters={<Field label="Factor" layout="inline"><Select aria-label="Factor" value={factor} onChange={e => setFactor(e.target.value)}>
        {SIX_FACTORS.map(f => <option key={f.key} value={f.key}>{f.short} · {f.label}</option>)}</Select></Field>}
      modes={<SegmentedControl name="Side" value={meta.side} onChange={side => setFactor(SIX_FACTORS.find(f => f.side === side)!.key)}
        options={[{ value: "offense", label: "Offense" }, { value: "defense", label: "Defense" }]} />}
      count={data && <CountChip>{data.total_players.toLocaleString("en-US")} rated</CountChip>}
      details={data && <DataDetailsButton rows={[
        { label: "Serving version", value: data.version, mono: true },
        { label: "Manifest SHA-256", value: data.manifest_sha256 ?? "—", mono: true },
        ...data.artifacts.map(a => ({ label: `${a.years}Y fit (${a.seasons.join(" / ")})`, value: `${a.sha256 ?? "—"} · games through ${a.last_included_date}`, mono: true })),
      ]}><ImpactDisclosure data={data} /></DataDetailsButton>} />
    {error && <FeedFailure error={error} retry={retry} what="Six-Factor RAPM" />}
    {loading && <FeedSkeleton label="Loading six-factor ratings" />}
    {data && (data.status !== "available" ? <GatedNote why={<ImpactDisclosure data={data} />}>{data.reason || "No sealed six-factor fit for this scope."}</GatedNote> :
      <ResearchLayout findings={<>
        <StatTile label={`Top ${meta.short}`} value={leader ? signed(leader.metrics[factor], 2) : null} unit="pts" footnote={leader?.player_name} />
        <StatTile label="Rated Players" value={data.total_players.toLocaleString("en-US")} footnote="In the served impact cohort" />
        <StatTile label="Admitted Games" value={coverage ? `${coverage.admitted_games.toLocaleString("en-US")} / ${coverage.scheduled_games.toLocaleString("en-US")}` : null} footnote="Scheduled games in this scope" />
        <StatTile label="1Y Fit Through" value={fit ? formatDate(fit.last_included_date) : null} footnote={fit ? fit.seasons.join(" / ") : undefined} />
      </>}>
        <RankedBars title={`${meta.label} (${meta.short}), top 15`} measure="percentage points" source="CourtLens model · public play-by-play stints"
          sample={`${data.total_players.toLocaleString("en-US")} rated players · 1Y fit`}
          note={`${meta.help}. Factor estimates are separate and not additive; positive always helps the team.`}
          items={players.slice(0, 15).map(p => ({ key: p.player_id, name: p.player_name, label: <Link href={`/players/${p.player_id}?${scope}`}>{p.player_name}</Link>,
            value: p.metrics[factor], formatted: signed(p.metrics[factor], 2), muted: !p.support[factor]?.qualified }))} />
        <div className="table-wrapper research-table" role="region" aria-label="Six-factor ratings" tabIndex={0}>
          <table className="data-table feed-percentile-table">
            <caption>Top {players.length} by {meta.short}, in percentage points (favorable sign). Shaded cells are percentiles among {COHORT}.</caption>
            <thead><tr><th>Player</th>{SIX_FACTORS.map(f => <th key={f.key} className="num" title={f.help} aria-sort={f.key === factor ? "descending" : undefined}>{f.short}</th>)}<th className="num">1Y RAPM</th></tr></thead>
            <tbody>{players.map(p => <tr key={p.player_id}>
              <th scope="row"><Link href={`/players/${p.player_id}?${scope}`}>{p.player_name}</Link></th>
              {SIX_FACTORS.map(f => <td key={f.key} className="num"><PercentileCell value={signed(p.metrics[f.key], 2)} percentile={factorPercentile(p, f.key)} qualified={Boolean(p.support[f.key]?.qualified)} label={`${p.player_name} ${f.short}`} cohort={COHORT} /></td>)}
              <td className="num">{signed(p.metrics.rapm, 2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="research-caption">CourtLens model: descriptive ridge estimates under lineup confounding, not causal. <Link href={`/stats?${new URLSearchParams({ season, phase, beforeDate, viewId: "sixfactor", sortMetric: factor })}`}>All players in Stats</Link></p>
      </ResearchLayout>)}
  </>;
}
