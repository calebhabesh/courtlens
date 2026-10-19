"use client";

import Link from "next/link";
import { useState } from "react";
import { PercentileCell, RankedBars } from "./charts";
import { FeedDetails, FeedFailure, FeedScopeFields, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { Button } from "./ui/kit";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { RouteTabs } from "./ui/route-tabs";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { STATS_TABS } from "@/lib/route-consolidation";
import { getTracking, sourceLabel, trackingValue, type FeedPhase, type TrackingPlayer, type TrackingView } from "@/lib/stats-feeds";

const TABLE_LIMIT = 100;

function Body({ data, sort, setSort }: { data: TrackingView; sort: string; setSort: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const column = data.columns.find(c => c.key === sort) ?? data.columns[0];
  const value = (p: TrackingPlayer) => p.values[column.key];
  const sorted = [...data.players].sort((a, b) => Number(b.qualified) - Number(a.qualified)
    || (value(b) ?? -Infinity) - (value(a) ?? -Infinity) || a.player_name.localeCompare(b.player_name));
  const qualified = sorted.filter(p => p.qualified && value(p) != null);
  const shown = all ? sorted : sorted.slice(0, TABLE_LIMIT);
  const scope = new URLSearchParams({ season: data.season, phase: data.phase }).toString();
  const cohort = `${qualified.length} players with ${data.qualification.minutes}+ minutes`;
  const groupLabel = data.groups.find(g => g.value === data.group)?.label ?? data.group;
  return <ResearchLayout findings={<>
    {data.columns.slice(0, 3).map(c => { const lead = [...data.players].filter(p => p.qualified && p.values[c.key] != null).sort((a, b) => (b.values[c.key] ?? 0) - (a.values[c.key] ?? 0))[0];
      return <StatTile key={c.key} label={`Most ${c.label}${c.kind === "total" ? " / Game" : ""}`} value={lead ? trackingValue(c, lead.values[c.key]) : null} footnote={lead?.player_name} />; })}
    <StatTile label="Qualified Players" value={qualified.length.toLocaleString("en-US")} footnote={`${data.qualification.minutes}+ minutes`} />
  </>}>
    <RankedBars title={`${column.label}${column.kind === "total" ? " per game" : ""}, top 12`} measure={column.label} source={sourceLabel(data.sources)} sample={cohort}
      note={column.higher_is_better === null ? "Style or volume column: ranked by size, not shaded as better or worse." : "NBA optical tracking aggregates, as published."}
      items={qualified.slice(0, 12).map(p => ({ key: p.player_id, name: p.player_name, label: <Link href={`/players/${p.player_id}?${scope}&tab=tracking`}>{p.player_name}</Link>,
        detail: `${p.team_tricode ?? "—"} · ${p.games ?? "—"} games`, value: value(p), formatted: trackingValue(column, value(p)) }))} />
    <div className="table-wrapper research-table" role="region" aria-label={`${groupLabel} tracking table`} tabIndex={0}>
      <table className="data-table feed-percentile-table">
        <caption>Per game unless a rate or percentage. Shaded cells are percentiles among {cohort}; unshaded columns describe style or volume. Select a header to sort.</caption>
        <thead><tr><th>Player</th><th className="num">Games</th>
          {data.columns.map(c => <th key={c.key} className="num" aria-sort={c.key === column.key ? "descending" : undefined}>
            <button className="feed-link-button" onClick={() => setSort(c.key)}>{c.label}</button></th>)}</tr></thead>
        <tbody>{shown.map(p => <tr key={p.player_id}>
          <th scope="row"><Link href={`/players/${p.player_id}?${scope}&tab=tracking`}>{p.player_name}</Link><small className="feed-cell-note">{p.team_tricode ?? "—"}{p.qualified ? "" : " · small sample"}</small></th>
          <td className="num">{p.games ?? "—"}</td>
          {data.columns.map(c => <td key={c.key} className="num">{c.higher_is_better === null ? trackingValue(c, p.values[c.key])
            : <PercentileCell value={trackingValue(c, p.values[c.key])} percentile={p.percentiles[c.key] ?? null} qualified={p.qualified} label={`${p.player_name} ${c.label}`} cohort={cohort} />}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {sorted.length > TABLE_LIMIT && <Button size="lg" onClick={() => setAll(v => !v)}>{all ? `Show First ${TABLE_LIMIT}` : `Show All ${sorted.length} Players`}</Button>}
  </ResearchLayout>;
}

/** PC11 Stats · Tracking: NBA optical tracking season totals, kept apart from date-windowed Stats. */
export function TrackingStatsView() {
  const { get, set } = useUrlState();
  const season = get("season"), phase = get("phase"), group = get("group") ?? "drives", sort = get("sort") ?? "";
  // Stats may carry phases the tracking feeds never observed (play-in, cup final).
  const feedPhase = phase === "playoffs" || phase === "regular_season" ? phase : null;
  const { data, error, loading, retry } = useFeed([season, feedPhase, group], signal => getTracking({ season, phase: feedPhase, group }, signal));
  return <PageShell template="research" className="feed-page">
    <PageHeader icon="chart-column" title="Stats" subtitle="NBA optical tracking: drives, catch-and-shoot, pull-ups, touches, passing, rebounding, speed and rim defense." actions={data && <FeedDetails envelope={data} />} />
    <RouteTabs tabs={STATS_TABS} aria-label="Stats sections" />
    {data && <FilterBar label="Tracking filters" summary={data.label}
      scope={<FeedScopeFields scopes={data.scopes} season={data.season} phase={data.phase} onChange={next => set({ season: next.season, phase: next.phase as FeedPhase })} />}
      filters={<Field label="Category" layout="inline"><Select aria-label="Tracking category" value={data.group} onChange={e => set({ group: e.target.value === "drives" ? null : e.target.value, sort: null })}>
        {data.groups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</Select></Field>}
      count={<CountChip>{data.players.length} players</CountChip>} />}
    {error && (season || phase
      ? <GatedNote why={error} action={<Button size="lg" onClick={() => set({ season: null, phase: null })}>Show the latest observed season</Button>}>No tracking feed was observed for this season or phase.</GatedNote>
      : <FeedFailure error={error} retry={retry} what="Tracking" />)}
    {loading && <FeedSkeleton label="Loading tracking" />}
    {data && <Body data={data} sort={sort} setSort={key => set({ sort: key })} />}
  </PageShell>;
}
