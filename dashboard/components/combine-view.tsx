"use client";

import Link from "next/link";
import { useState } from "react";
import { scaleLinear } from "d3-scale";
import { ChartData, ChartFrame, PercentileCell, chartVars, toneColor } from "./charts";
import { FeedFailure, FeedSkeleton, PlayerLookup, sourceRows, useFeed, useUrlState } from "./stats-feed-ui";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { fmt, getCombine, inches, signed, type CombineRow, type CombineView as CombineData } from "@/lib/stats-feeds";
import { Button } from "./ui/kit";

const COHORT = "every measured combine participant since 2000";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Barefoot height against wingspan; the dashed line is wingspan = height. Missing pairs are not plotted. */
function SpanScatter({ rows, label, selected, source }: { rows: CombineRow[]; label: string; selected: string | null; source: string }) {
  const points = rows.filter(r => r.height_no_shoes_inches != null && r.wingspan_inches != null);
  // Unknown identities have player_id null; null never selects a row.
  const isSelected = (r: CombineRow) => selected !== null && r.player_id === selected;
  const heights = points.map(r => r.height_no_shoes_inches!), spans = points.map(r => r.wingspan_inches!);
  const lo = Math.floor(Math.min(...heights, ...spans) - 1), hi = Math.ceil(Math.max(...heights, ...spans) + 1);
  const x = scaleLinear().domain([lo, hi]).range([48, 584]), y = scaleLinear().domain([lo, hi]).range([272, 16]);
  const ticks = x.ticks(6);
  return <ChartFrame title="Wingspan versus barefoot height" source={source} sample={`${points.length} of ${rows.length} players measured · ${label}`}
    note="Points above the dashed line have a wingspan longer than their height." state={points.length ? "ready" : "empty"}>
    <ChartData fingerprint={JSON.stringify([label, points.length, selected])}>
      <svg className="chart-graphic feed-scatter" viewBox="0 0 600 312" role="img" aria-label={`Wingspan versus barefoot height for ${points.length} players, ${label}`}>
        {ticks.map(t => <g key={t}>
          <line x1={x(t)} x2={x(t)} y1="16" y2="272" stroke="var(--color-hairline)" />
          <line x1="48" x2="584" y1={y(t)} y2={y(t)} stroke="var(--color-hairline)" />
          <text x={x(t)} y="290" textAnchor="middle" className="chart-svg-label">{inches(t)}</text>
          <text x="42" y={y(t) + 4} textAnchor="end" className="chart-svg-label">{inches(t)}</text>
        </g>)}
        <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="var(--color-text-secondary)" strokeDasharray="6 4" />
        {points.map(r => <circle key={r.row_key} cx={x(r.height_no_shoes_inches!)} cy={y(r.wingspan_inches!)} r={isSelected(r) ? 7 : 4.5}
          fill={isSelected(r) ? toneColor("identity-b") : toneColor("identity-a")} fillOpacity={isSelected(r) ? 1 : 0.7}>
          <title>{r.player_name} · height {inches(r.height_no_shoes_inches)} · wingspan {inches(r.wingspan_inches)} ({signed(r.span_minus_height, 2)} in)</title>
        </circle>)}
        <text x="316" y="308" textAnchor="middle" className="chart-svg-label">Barefoot height</text>
      </svg>
      <ul className="chart-legend chart-legend-inline">
        <li><span className="chart-key" style={chartVars({ "--chart-tone": toneColor("identity-a") })} aria-hidden="true" />Measured player</li>
        {selected && <li><span className="chart-key" style={chartVars({ "--chart-tone": toneColor("identity-b") })} aria-hidden="true" />Selected player</li>}
        <li><span className="feed-key-line" aria-hidden="true" />Wingspan = height</li>
      </ul>
    </ChartData>
  </ChartFrame>;
}

function Body({ data }: { data: CombineData }) {
  const selected = data.selected_player_id;
  const [sortKey, setSortKey] = useState<"span_minus_height" | "pick_overall">("span_minus_height");
  const rows = [...data.rows].sort((a, b) => sortKey === "pick_overall"
    ? (a.pick_overall ?? 999) - (b.pick_overall ?? 999)
    : (b.span_minus_height ?? -99) - (a.span_minus_height ?? -99));
  const measured = data.rows.filter(r => r.span_minus_height != null);
  const longest = measured.reduce<CombineRow | null>((best, r) => !best || r.span_minus_height! > best.span_minus_height! ? r : best, null);
  const tallest = data.rows.reduce<CombineRow | null>((best, r) => r.height_no_shoes_inches != null && (!best || r.height_no_shoes_inches > best.height_no_shoes_inches!) ? r : best, null);
  const label = `${data.draft_year} combine`;
  const cell = (r: CombineRow, key: string, value: string, name: string) =>
    <td className="num"><PercentileCell value={value} percentile={r.percentiles[key] ?? null} qualified={r.percentiles[key] != null} label={`${r.player_name} ${name}`} cohort={COHORT} /></td>;
  return <ResearchLayout findings={<>
    <StatTile label="Measured Players" value={`${measured.length} / ${data.rows.length}`} footnote={`${data.draft_year} combine`} />
    <StatTile label="Median Span Over Height" value={signed(median(measured.map(r => r.span_minus_height!)), 2)} unit="in" footnote="Wingspan minus barefoot height" />
    <StatTile label="Longest Span Over Height" value={longest ? signed(longest.span_minus_height, 2) : null} unit="in" footnote={longest?.player_name} />
    <StatTile label="Tallest Barefoot" value={tallest ? inches(tallest.height_no_shoes_inches) : null} footnote={tallest?.player_name} />
  </>}>
    {data.default_rule && <p className="feed-example"><span>Example: <strong>{data.draft_year} combine</strong></span><span className="feed-example-rule">{data.default_rule}</span></p>}
    <SpanScatter rows={data.rows} label={label} selected={selected} source="NBA Draft Combine (hoopR mirror)" />
    <section className="research-section" aria-label="Combine measurements">
      <div className="feed-section-head"><h2>Measurements</h2>
        <Field label="Sort" layout="inline"><Select aria-label="Sort measurements" value={sortKey} onChange={e => setSortKey(e.target.value === "pick_overall" ? "pick_overall" : "span_minus_height")}>
          <option value="span_minus_height">Span Over Height</option><option value="pick_overall">Draft Pick</option></Select></Field>
      </div>
      <div className="table-wrapper research-table" role="region" aria-label="Combine measurement table" tabIndex={0}>
        <table className="data-table feed-percentile-table">
          <caption>Shaded cells are percentiles among {COHORT}. Unknown drills stay blank, never zero.</caption>
          <thead><tr><th>Player</th><th>Pos</th><th className="num">Pick</th><th className="num">Height</th><th className="num">Wingspan</th><th className="num">Span − height</th><th className="num">Reach</th><th className="num">Weight</th><th className="num">Max vert</th><th className="num">Lane agility</th><th className="num">¾ sprint</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.row_key} data-selected={selected !== null && r.player_id === selected ? "true" : undefined}>
            <th scope="row">{r.player_id ? <Link href={`/players/${r.player_id}`}>{r.player_name}</Link> : r.player_name}{!r.player_id && <small className="feed-cell-note">Identity unknown</small>}</th>
            <td>{r.position ?? "—"}</td>
            <td className="num">{r.pick_overall ? `#${r.pick_overall}${r.drafted_by ? ` ${r.drafted_by}` : ""}` : "—"}</td>
            <td className="num">{inches(r.height_no_shoes_inches)}</td>
            {cell(r, "wingspan_inches", inches(r.wingspan_inches), "wingspan")}
            {cell(r, "span_minus_height", r.span_minus_height == null ? "—" : `${signed(r.span_minus_height, 2)} in`, "span over height")}
            {cell(r, "standing_reach_inches", inches(r.standing_reach_inches), "standing reach")}
            <td className="num">{r.weight_lbs == null ? "—" : `${fmt(r.weight_lbs, 0)} lb`}</td>
            {cell(r, "max_vertical_inches", r.max_vertical_inches == null ? "—" : `${fmt(r.max_vertical_inches)} in`, "max vertical")}
            {cell(r, "lane_agility_seconds", r.lane_agility_seconds == null ? "—" : `${fmt(r.lane_agility_seconds, 2)} s`, "lane agility")}
            {cell(r, "three_quarter_sprint_seconds", r.three_quarter_sprint_seconds == null ? "—" : `${fmt(r.three_quarter_sprint_seconds, 2)} s`, "three-quarter sprint")}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </ResearchLayout>;
}

/** PC11 Combine & Wingspan: official NBA Draft Combine measurements, 2000 to the latest class. */
export function CombineView() {
  const { get, set } = useUrlState();
  const draftYear = get("draftYear"), playerId = get("playerId");
  const { data, error, loading, retry } = useFeed([draftYear, playerId], signal => getCombine({ draftYear, playerId }, signal));
  return <PageShell template="research" className="feed-page">
    <PageHeader title="Combine & Wingspan" subtitle="Official NBA Draft Combine measurements. Missing drills stay unknown, never zero."
      actions={data && <DataDetailsButton rows={[{ label: "Source", value: data.source }, { label: "Cohort", value: `${data.cohort.players.toLocaleString("en-US")} combine participants, ${data.cohort.first_year}–${data.cohort.last_year}; ${data.cohort.measured.toLocaleString("en-US")} with height and wingspan` }, ...sourceRows(data.sources)]}>
        <ul className="feed-limitations">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></DataDetailsButton>} />
    {data && <FilterBar label="Combine filters" summary={`${data.draft_year} Combine`}
      scope={<Field label="Draft class" layout="inline"><Select aria-label="Draft class" value={String(data.draft_year ?? "")} onChange={e => set({ draftYear: e.target.value, playerId: null })}>
        {data.draft_years.map(y => <option key={y.year} value={y.year}>{y.year} · {y.players} Players</option>)}</Select></Field>}
      filters={<PlayerLookup label="Find a player's combine" onPick={id => set({ playerId: id, draftYear: null })} />}
      count={<CountChip>{data.rows.length} players</CountChip>} />}
    {error && <FeedFailure error={error} retry={retry} what="Combine measurements" />}
    {loading && <FeedSkeleton label="Loading combine measurements" />}
    {data && playerId && !data.selected_player_id && <GatedNote action={<Button size="lg" onClick={() => set({ playerId: null })}>Show the latest class</Button>}>No combine record for this player: they may have skipped the combine, which is unknown, not zero.</GatedNote>}
    {data && data.rows.length > 0 && <Body data={data} />}
  </PageShell>;
}
