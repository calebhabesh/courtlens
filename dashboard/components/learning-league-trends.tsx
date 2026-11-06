"use client";

import { FeedFailure, FeedSkeleton, useFeed } from "./stats-feed-ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { fixed, percent } from "@/lib/draft-classes";
import { INPUT_LABELS, getFourFactors } from "@/lib/research-r10";

/**
 * Learning → The League's Statistical Evolution: league inputs per regular season, served by
 * `/api/four-factors` (courtlens-four-factors-inputs-v2, counted from play-by-play).
 */
export function LearningLeagueTrends() {
  const { data, error, loading, retry } = useFeed([], signal => getFourFactors(signal));
  if (loading) return <FeedSkeleton label="League averages by season" />;
  if (error || !data) return <FeedFailure error={error} retry={retry} what="League averages" />;
  return <Table aria-label="League averages by season" density="compact" data-table="league-trends">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Season</TableHead>
      <TableHead align="right">TS%</TableHead>
      <TableHead align="right">eFG%</TableHead>
      <TableHead align="right" title={INPUT_LABELS.tov_pct}>TOV%</TableHead>
      <TableHead align="right" title={INPUT_LABELS.orb_pct}>ORB%</TableHead>
      <TableHead align="right">3PA rate</TableHead>
      <TableHead align="right" title="Points per 100 possessions, Poropudas and Halme's Eq. (11)">ORTG</TableHead>
    </TableRow></TableHeader>
    <TableBody>{data.seasons.map(season => {
      const league = season.league;
      const cells: [string, number | null, string][] = [
        ["ts", league.ts, percent(league.ts, 1)],
        ["efg", league.inputs.efg, percent(league.inputs.efg, 1)],
        ["tov_pct", league.inputs.tov_pct, percent(league.inputs.tov_pct, 1)],
        ["orb_pct", league.inputs.orb_pct, percent(league.inputs.orb_pct, 1)],
        ["fg3a_rate", league.fg3a_rate, percent(league.fg3a_rate, 1)],
        ["ortg", league.ortg_factors, fixed(league.ortg_factors, 1)],
      ];
      return <TableRow key={season.season} data-row={season.season}>
        <TableCell>{season.season}</TableCell>
        {cells.map(([field, value, text]) => <TableCell key={field} numeric data-field={field} data-value={value ?? ""}>{text}</TableCell>)}
      </TableRow>;
    })}</TableBody>
  </Table>;
}
