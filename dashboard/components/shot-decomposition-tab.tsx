"use client";

import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { Button, Segmented, Select } from "./ui/kit";
import { Section } from "./ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { seasonEra } from "@/lib/portrait-source";
import {
  decompositionCsv, getDecomposition, getDecompositionBoard, MIN_SHOTS, TARGETS,
  type DecompositionBoard, type DecompositionRow, type DecompositionSort, type DecompositionSummary, type Side, type Target
} from "@/lib/shot-decomposition";
import { formatFixed, formatInterval, formatShare, formatSigned, formatWhole, signTone } from "@/lib/shot-quality";

/**
 * Research → Shot Quality → Decomposition (R06). A plain build-phase tab after the saved Databallr
 * ShotQuality RAPM page: side tabs, filters, table, CSV, how to read, glossary and method. Every number is
 * the frozen courtlens-shot-decomposition-v1 results'; exact values sit on `data-value`.
 */
const LATEST = "2025-26";
const SIDES: { value: Side; label: string }[] = [
  { value: "offense", label: "Offence" }, { value: "defense", label: "Defence" }, { value: "combined", label: "Combined" },
];

function ValueCell({ row, target }: { row: DecompositionRow; target: Target }) {
  const v = row.values[target];
  const band = row.intervals[target];
  return <TableCell numeric tone={signTone(v)} data-field={target} data-value={v} data-low={band[0]} data-high={band[1]}>
    {formatSigned(v)}<br /><small>{formatInterval(band, x => formatSigned(x))}</small>
  </TableCell>;
}

function Board({ board }: { board: DecompositionBoard }) {
  return <Table aria-label={`Decomposition ${board.season} ${board.side}`} density="compact" data-board="decomposition">
    <TableHeader><TableRow hoverable={false}>
      <TableHead align="right">#</TableHead><TableHead>Player</TableHead>
      {TARGETS.map(t => <TableHead key={t} align="right">{board.labels[t]}</TableHead>)}
      <TableHead align="right">Shots</TableHead>
    </TableRow></TableHeader>
    <TableBody>{board.rows.map((row, i) => <TableRow key={row.player_id} data-row={row.player_id}>
      <TableCell numeric>{i + 1}</TableCell>
      <TableCell><PlayerIdentity playerId={row.player_id} name={row.player_name} team={row.tricode} size="sm" era={seasonEra(board.season, row.tricode)} href={`/players/${row.player_id}?season=${board.season}`} /></TableCell>
      {TARGETS.map(t => <ValueCell key={t} row={row} target={t} />)}
      <TableCell numeric data-field="shots" data-value={row.shots}>{formatWhole(row.shots)}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}

function downloadCsv(board: DecompositionBoard) {
  const url = URL.createObjectURL(new Blob([decompositionCsv(board)], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `courtlens-decomposition-${board.season}-${board.side}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function Checks({ summary }: { summary: DecompositionSummary }) {
  const seasons = Object.keys(summary.seasons).sort();
  return <>
    <Section title="Does the decomposition add up?" description="Largest gap between TS and SQ + Make + FT across all rated players, and the second-stage regression of oTS on oSQ + oMake + oFT among qualified players. One penalty on one design makes these exact, so they confirm the arithmetic, not the split.">
      <Table aria-label="Additivity by season" density="compact" data-table="additivity">
        <TableHeader><TableRow hoverable={false}><TableHead>Season</TableHead><TableHead align="right">Largest gap</TableHead><TableHead align="right">Coefficients</TableHead><TableHead align="right">R²</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">Median 80% width: oTS</TableHead><TableHead align="right">oSQ</TableHead><TableHead align="right">oMake</TableHead><TableHead align="right">oFT</TableHead></TableRow></TableHeader>
        <TableBody>{seasons.map(s => {
          const b = summary.seasons[s]; const stage = b.second_stage.offense; const w = b.median_interval_width.offense;
          return <TableRow key={s} data-season={s}>
            <TableCell>{s}</TableCell>
            <TableCell numeric data-value={b.coefficient_additivity_residual.offense}>{b.coefficient_additivity_residual.offense === 0 ? "under 1e-9" : formatFixed(b.coefficient_additivity_residual.offense, 9)}</TableCell>
            <TableCell numeric data-value={stage.coefficients[0]}>{stage.coefficients.map(c => formatFixed(c)).join(", ")}</TableCell>
            <TableCell numeric data-value={stage.r2}>{formatFixed(stage.r2, 4)}</TableCell>
            <TableCell numeric data-value={stage.players}>{stage.players}</TableCell>
            {TARGETS.map(t => <TableCell key={t} numeric data-value={w[t]}>{formatFixed(w[t], 2)}</TableCell>)}
          </TableRow>;
        })}</TableBody>
      </Table>
    </Section>

    <Section title="Does shot making carry over less than shot quality?" description={`Registered check. Correlation from one season to the next, ${summary.persistence.pairs} player pairs, ${summary.persistence.players} players, with 95% player-bootstrap intervals. Weighted by shots.`}>
      <p data-verdict={summary.persistence.verdict}>Registered result on offence: <strong>{summary.persistence.verdict}</strong>. r(oSQ) − r(oMake) = {formatSigned(summary.persistence.correlations["offense:sq_minus_make"].r, 3)}, interval {formatInterval(summary.persistence.correlations["offense:sq_minus_make"].interval, x => formatSigned(x, 3))}.</p>
      <Table aria-label="Persistence" density="compact" data-table="persistence">
        <TableHeader><TableRow hoverable={false}><TableHead>Value</TableHead><TableHead align="right">r</TableHead><TableHead align="right">95% interval</TableHead></TableRow></TableHeader>
        <TableBody>{([["offense:ts", "oTS"], ["offense:sq", "oSQ"], ["offense:make", "oMake"], ["offense:ft", "oFT"], ["offense:sq_minus_make", "oSQ minus oMake (registered)"], ["defense:ts", "dTS"], ["defense:sq", "dSQ"], ["defense:make", "dContest"], ["defense:ft", "dFT"], ["defense:sq_minus_make", "dSQ minus dContest (reported)"]] as const).map(([key, label]) => {
          const c = summary.persistence.correlations[key];
          return <TableRow key={key} data-row={key}><TableCell>{label}</TableCell><TableCell numeric data-value={c.r}>{formatFixed(c.r)}</TableCell><TableCell numeric data-value={c.interval[0]} data-high={c.interval[1]}>{formatInterval(c.interval, x => formatFixed(x))}</TableCell></TableRow>;
        })}</TableBody>
      </Table>
    </Section>

    <Section title="How to read the numbers"><ul>
      <li>{summary.definitions.reading}</li><li>{summary.definitions.shot}</li><li>{summary.definitions.interval}</li><li>{summary.definitions.scale}</li>
      <li>Green is above average, red below, on both offence and defence.</li>
    </ul></Section>
    <Section title="Column glossary"><ul>
      {TARGETS.map(t => <li key={t}><strong>{summary.labels.offense[t]} / {summary.labels.defense[t]}.</strong> {summary.definitions[t]}</li>)}
    </ul></Section>
    <Section title="Method and data">
      <ul>{summary.method.map(m => <li key={m}>{m}</li>)}<li>{summary.credit}</li><li>{summary.reference_note}</li></ul>
      <Table aria-label="Data joins by season" density="compact" data-table="data">
        <TableHeader><TableRow hoverable={false}><TableHead>Season</TableHead><TableHead align="right">Shots joined</TableHead><TableHead align="right">Rate</TableHead><TableHead align="right">Excluded-game shots</TableHead><TableHead align="right">Free throws joined</TableHead><TableHead align="right">Unknown trip types</TableHead><TableHead align="right">Possessions without an attempt</TableHead></TableRow></TableHeader>
        <TableBody>{seasons.map(s => {
          const d = summary.data[s];
          return <TableRow key={s} data-season={s}><TableCell>{s}</TableCell>
            <TableCell numeric data-value={d.r05_shots.joined}>{formatWhole(d.r05_shots.joined)}</TableCell>
            <TableCell numeric data-value={d.r05_shots.join_rate}>{formatShare(d.r05_shots.join_rate, 2)}</TableCell>
            <TableCell numeric data-value={d.r05_shots.unjoined.game_not_admitted ?? 0}>{formatWhole(d.r05_shots.unjoined.game_not_admitted ?? 0)}</TableCell>
            <TableCell numeric data-value={d.free_throws.joined}>{formatWhole(d.free_throws.joined)}</TableCell>
            <TableCell numeric data-value={Object.keys(d.free_throws.unknown_sub_types).length}>{Object.keys(d.free_throws.unknown_sub_types).length}</TableCell>
            <TableCell numeric data-value={d.possessions.counted_possessions_without_attempt}>{formatWhole(d.possessions.counted_possessions_without_attempt)}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
      <p>Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</p>
    </Section>
  </>;
}

export function ShotDecompositionTab() {
  const { get, set } = useUrlState();
  const season = get("dSeason") ?? LATEST;
  const side = (get("side") ?? "offense") as Side;
  const sort = (get("dSort") ?? "ts") as DecompositionSort;
  const team = get("dTeam");
  const minShots = Number(get("minShots") ?? "1000");
  const summary = useFeed([], signal => getDecomposition(signal));
  const { data, error, loading, retry } = useFeed([season, side, sort, team, String(minShots)], signal => getDecompositionBoard(season, side, sort, team, minShots, signal));
  const labels = summary.data?.labels[side];
  const sorts = labels ? [...TARGETS.map(t => ({ value: t as DecompositionSort, label: labels[t] })), { value: "shots" as DecompositionSort, label: "Shots" }] : [];
  return <>
    <Section title="ShotQuality decomposition" description="Each player's lineup-adjusted shooting impact split into shot quality, shot making and free-throw value. Points per 100 shots against the average player; positive is good on both ends. Each cell shows the value and its 80% interval. Expected values come from the accepted R05 model (LightGBM, 31 leaves), not the baseline and not the ShotQuality feed."
      actions={<>
        <Segmented label="Side" size="sm" value={side} onChange={next => set({ side: next === "offense" ? null : next, dSort: null })} options={SIDES} />
        <Field label="Season" layout="inline"><Select aria-label="Decomposition season" value={season} onChange={event => set({ dSeason: event.target.value === LATEST ? null : event.target.value, dTeam: null })}>
          {(data?.seasons ?? [LATEST]).slice().reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Team" layout="inline"><Select aria-label="Decomposition team" value={team ?? ""} onChange={event => set({ dTeam: event.target.value || null })}>
          <option value="">All teams</option>
          {data?.status === "available" && data.teams.map(t => <option key={t.team_id} value={t.tricode ?? t.team_id}>{t.tricode ?? t.team_id}</option>)}</Select></Field>
        <Field label="Min shots" layout="inline"><Select aria-label="Minimum shots" value={String(minShots)} onChange={event => set({ minShots: event.target.value === "1000" ? null : event.target.value })}>
          {MIN_SHOTS.map(m => <option key={m} value={m}>{Number(m).toLocaleString("en-US")}+</option>)}</Select></Field>
        {sorts.length > 0 && <Field label="Rank by" layout="inline"><Select aria-label="Rank decomposition by" value={sort} onChange={event => set({ dSort: event.target.value === "ts" ? null : event.target.value })}>
          {sorts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>}
        {data?.status === "available" && <Button size="sm" icon="download" onClick={() => downloadCsv(data)}>Download CSV</Button>}
      </>}>
      {error && <FeedFailure error={error} retry={retry} what="The decomposition" />}
      {loading && <FeedSkeleton label="Loading the decomposition" />}
      {data?.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
      {data?.status === "available" && <>
        <p data-count={data.rows.length}>{data.rows.length} players shown; {data.unknown.length} with fewer than 20 games or 1,000 shots on either side have no value. League: {formatFixed(data.avg_points)} field-goal points per attempt; expected values shifted by {formatSigned(data.expected_shift * 100, 2)} per 100 shots so Make averages zero.</p>
        <Board board={data} />
      </>}
    </Section>
    {summary.error && <FeedFailure error={summary.error} retry={summary.retry} what="The decomposition's checks" />}
    {summary.data && <Checks summary={summary.data} />}
  </>;
}
