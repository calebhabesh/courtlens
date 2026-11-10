"use client";

import { useState } from "react";
import { FeedFailure, FeedSkeleton, useFeed } from "./stats-feed-ui";
import { Segmented } from "./ui/kit";
import { SeasonLineChart } from "./research/season-line-chart";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { fixed, percent } from "@/lib/draft-classes";
import { INPUT_LABELS, getFourFactors, type FourFactorsSummary } from "@/lib/research-r10";

/**
 * Learning → The League's Statistical Evolution (RD06): league inputs per regular season, served by `/api/four-factors`
 * (courtlens-four-factors-inputs-v2, counted from play-by-play, 2014-15 on). One measure at a time on one axis (Databallr
 * draws three on two axes), then every measure on `StatsGrid`.
 */

type Season = FourFactorsSummary["seasons"][number];
type Measure = "ts" | "efg" | "tov_pct" | "orb_pct" | "fg3a_rate" | "ortg";

const MEASURES: readonly { key: Measure; label: string; title: string; value: (s: Season) => number | null; text: (v: number | null) => string; axis: (v: number) => string }[] = [
  { key: "ts", label: "TS%", title: "True shooting: points per two shooting chances", value: s => s.league.ts, text: v => percent(v, 1), axis: v => percent(v, 1) },
  { key: "efg", label: "eFG%", title: INPUT_LABELS.efg, value: s => s.league.inputs.efg, text: v => percent(v, 1), axis: v => percent(v, 1) },
  { key: "tov_pct", label: "TOV%", title: INPUT_LABELS.tov_pct, value: s => s.league.inputs.tov_pct, text: v => percent(v, 1), axis: v => percent(v, 1) },
  { key: "orb_pct", label: "ORB%", title: INPUT_LABELS.orb_pct, value: s => s.league.inputs.orb_pct, text: v => percent(v, 1), axis: v => percent(v, 1) },
  { key: "fg3a_rate", label: "3PA rate", title: "Three-point attempts per field-goal attempt", value: s => s.league.fg3a_rate, text: v => percent(v, 1), axis: v => percent(v, 0) },
  { key: "ortg", label: "ORTG", title: "Points per 100 possessions, Poropudas and Halme's Eq. (11)", value: s => s.league.ortg_factors, text: v => fixed(v, 1), axis: v => fixed(v, 0) },
];

const COLUMNS: readonly GridColumn<Season>[] = MEASURES.map(m => ({
  key: m.key, label: m.label, title: m.title, width: "sm", keepCase: m.key === "fg3a_rate" ? undefined : true,
  cell: row => <GridValue text={m.text(m.value(row))} />,
  data: row => ({ field: m.key, value: m.value(row) ?? "" }),
}));

export function LearningLeagueTrends() {
  const { data, error, loading, retry } = useFeed([], signal => getFourFactors(signal));
  const [measure, setMeasure] = useState<Measure>("ts");
  if (loading) return <FeedSkeleton label="League averages by season" />;
  if (error || !data) return <FeedFailure error={error} retry={retry} what="League averages" />;
  const chosen = MEASURES.find(m => m.key === measure) ?? MEASURES[0];
  const first = data.seasons[0]?.season, last = data.seasons.at(-1)?.season;
  return <div className="ln-trends">
    <div className="ln-well ln-trends-chart">
      <div className="ln-trends-head">
        <p className="ln-well-label">League {chosen.label} by season ({first} to {last})</p>
        <div className="ln-trends-switch"><Segmented size="sm" label="League measure" options={MEASURES.map(m => ({ value: m.key, label: m.label }))} value={measure} onChange={setMeasure} /></div>
      </div>
      <SeasonLineChart label={`League ${chosen.label} by season`} points={data.seasons.map(s => ({ season: s.season, value: chosen.value(s) }))}
        format={v => chosen.text(v)} axisFormat={chosen.axis} />
    </div>
    <StatsGrid label="League averages by season" name="league-trends" density="compact" height="auto" leadWidth="sm" minWidth="narrow"
      rows={data.seasons} rowKey={s => s.season} lead={{ label: "Season", cell: s => <span className="ln-season">{s.season}</span> }} columns={COLUMNS} />
    <p className="ln-note">Counted from every regular-season play-by-play game CourtLens keeps, which start in 2014-15. Older league averages from box scores use different turnover and rebound definitions, so they are not joined to this series.</p>
  </div>;
}
