"use client";

import { useState, type ReactNode } from "react";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { GatedNote } from "./ui/gated-note";
import { CountChip } from "./ui/filter-bar";
import { Input, SearchField } from "./ui/input";
import { Button, Segmented, Select } from "./ui/kit";
import { FormulaLine, Glossary, MethodBlock, MethodSteps, ReadingGuide, ResearchDisclosure, ResearchSection, ToneLegend } from "./research/research-page";
import { sortRows } from "./research/research-table";
import { GridPlayer, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { TeamPicker } from "./research/team-picker";
import { IntervalPlot, LinkCard, SqPanel } from "./shot-quality-figures";
import { seasonEra } from "@/lib/portrait-source";
import {
  getDecomposition, getDecompositionBoard, TARGETS,
  type DecompositionBoard, type DecompositionSummary, type Side, type Target, type UnknownSeason
} from "@/lib/shot-decomposition";
import { formatFixed, formatInterval, formatShare, formatSigned, formatWhole } from "@/lib/shot-quality";
import type { Pair } from "@/lib/shot-quality";
import { downloadCsv, intervalTone, toCsv } from "@/lib/research-values";

/*
 * Research → Shot Quality → Decomposition (R06 analysis; RD04 design after Databallr's ShotQuality RAPM page). Databallr's
 * order: the toolbar panel and table (the site's `StatsGrid` look, owner round 4), the colour key, the
 * Six-Factor card, How to Read, the Column Glossary, then a results section of CourtLens's own and the collapsed Caveats &
 * Methodology. Every number is the frozen courtlens-shot-decomposition-v1 results'; exact values sit on `data-*`.
 * CourtLens fits one season at a time; Databallr pools three. The prose is CourtLens's own.
 */

export const DECOMPOSITION_LATEST = "2025-26";
const SIDES: readonly Side[] = ["offense", "defense", "combined"];
const SIDE_LABELS: Record<Side, string> = { offense: "Offense", defense: "Defense", combined: "Combined" };
const SIDE_ICONS = { offense: "trend", defense: "shield", combined: "layers" } as const;
const MIN_SHOTS = 1000;

interface SideValue { values: Record<Target, number>; intervals: Record<Target, Pair>; shots: number }
export interface MergedRow { player_id: string; player_name: string; tricode: string | null; games: number; sides: Partial<Record<Side, SideValue>> }
interface Merged { status: "available"; season: string; rows: MergedRow[]; boards: Record<Side, DecompositionBoard> }

/** The three side boards of a season as one row per player, so the views switch without a request. */
async function getMerged(season: string, signal: AbortSignal): Promise<Merged | UnknownSeason> {
  const boards = await Promise.all(SIDES.map(side => getDecompositionBoard(season, side, "ts", null, MIN_SHOTS, signal)));
  const unknown = boards.find((b): b is UnknownSeason => b.status !== "available");
  if (unknown) return unknown;
  const available = boards as DecompositionBoard[];
  const rows = new Map<string, MergedRow>();
  available.forEach((board, i) => board.rows.forEach(r => {
    const row = rows.get(r.player_id) ?? { player_id: r.player_id, player_name: r.player_name, tricode: r.tricode, games: r.games, sides: {} };
    row.sides[SIDES[i]] = { values: r.values, intervals: r.intervals, shots: r.shots };
    rows.set(r.player_id, row);
  }));
  return { status: "available", season, rows: [...rows.values()], boards: { offense: available[0], defense: available[1], combined: available[2] } };
}

/** Opens the collapsed Caveats & Methodology and scrolls to it (Databallr's Methodology button). */
export function openMethodology(id = "methodology") {
  const section = document.getElementById(id);
  const details = section?.querySelector("details");
  if (details) details.open = true;
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const signed1 = (v: number) => formatSigned(v, 1);
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function ShotDecompositionTab() {
  const { get, set } = useUrlState();
  const season = get("dSeason") ?? DECOMPOSITION_LATEST;
  const side = (SIDES.find(s => s === get("side")) ?? "offense") as Side;
  const summary = useFeed([], signal => getDecomposition(signal));
  const { data, error, loading, retry } = useFeed([season], signal => getMerged(season, signal));
  const seasons = summary.data ? Object.keys(summary.data.seasons).sort() : [DECOMPOSITION_LATEST];
  const seasonSelect = <Select size="md" aria-label="Decomposition season" value={season}
    onChange={event => set({ dSeason: event.target.value === DECOMPOSITION_LATEST ? null : event.target.value })}>
    {(seasons.includes(season) ? seasons : [...seasons, season]).slice().reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select>;
  return <>
    <section className="sq-board-section" aria-label="ShotQuality decomposition">
      {error && <FeedFailure error={error} retry={retry} what="The decomposition" />}
      {loading && <FeedSkeleton label="Loading the decomposition" />}
      {data?.status === "unknown" && <SqPanel className="sq-unknown" label="Season">
        <div className="sq-control-row">{seasonSelect}</div>
        <GatedNote>{data.reason}</GatedNote>
      </SqPanel>}
      {data?.status === "available" && summary.data && <Board data={data} summary={summary.data} side={side} seasonSelect={seasonSelect}
        onSide={next => set({ side: next === "offense" ? null : next })} />}
    </section>
    <LinkCard icon="book" title="Six-Factor RAPM" href="/research/rapm/six-factor" link="Open Six-Factor RAPM">
      Six-Factor RAPM splits each player&apos;s impact into shooting, turnovers and rebounding on both ends. This page takes the
      shooting side further, into the quality of the looks, the making and the free throws, in fits of its own.
    </LinkCard>
    {summary.error && <FeedFailure error={summary.error} retry={summary.retry} what="The decomposition's method" />}
    {summary.data && <>
      <Reading summary={summary.data} data={data?.status === "available" ? data : null} />
      <ResearchSection icon="help" title="Column Glossary"><ColumnGlossary summary={summary.data} /></ResearchSection>
      <Persistence summary={summary.data} />
      <Methodology summary={summary.data} season={data?.status === "available" ? data.season : DECOMPOSITION_LATEST} />
    </>}
  </>;
}

function Board({ data, summary, side, seasonSelect, onSide }: { data: Merged; summary: DecompositionSummary; side: Side; seasonSelect: ReactNode; onSide: (side: Side) => void }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [floor, setFloor] = useState(String(MIN_SHOTS));
  const [sort, setSort] = useState<{ key: Target | "shots"; direction: "asc" | "desc" }>({ key: "ts", direction: "desc" });
  const labels = summary.labels[side];
  const value = (r: MergedRow, key: Target | "shots") => key === "shots" ? r.sides[side]?.shots ?? null : r.sides[side]?.values[key] ?? null;
  const needle = query.trim().toLocaleLowerCase("en-US");
  const least = Number(floor);
  const shown = sortRows(data.rows.filter(r => (!needle || r.player_name.toLocaleLowerCase("en-US").includes(needle)) && (!team || r.tricode === team)
    && (!Number.isFinite(least) || least <= 0 || (r.sides[side]?.shots ?? -Infinity) >= least)), r => value(r, sort.key), sort.direction, r => r.player_id);
  const onSort = (key: string) => setSort(s => s.key === key ? { key: s.key, direction: s.direction === "desc" ? "asc" : "desc" } : { key: key as Target | "shots", direction: "desc" });
  const group = `${SIDE_LABELS[side]} · points per 100 shots`;
  const columns: GridColumn<MergedRow>[] = [
    ...TARGETS.map((t): GridColumn<MergedRow> => ({
      key: t, label: labels[t], title: summary.definitions[t] ?? labels[t], group, width: "md", sort: r => value(r, t),
      data: r => { const band = r.sides[side]?.intervals[t]; return { value: value(r, t) ?? undefined, low: band?.[0], high: band?.[1] }; },
      cell: r => { const v = value(r, t), band = r.sides[side]?.intervals[t];
        return v == null ? <GridValue text={null} /> : <GridValue text={formatSigned(v)} sub={band ? formatInterval(band, x => formatSigned(x)) : null}
          tone={band ? intervalTone(band[0], band[1]) : undefined} title={band ? `80% interval ${formatInterval(band, x => formatSigned(x))}` : undefined} />; },
    })),
    { key: "shots", label: "Shots", title: "Field-goal attempts and 2-shot or 3-shot free-throw trips on this side, with the player on the floor", group: "Sample", width: "sm",
      sort: r => value(r, "shots"), data: r => ({ value: value(r, "shots") ?? undefined }), cell: r => <GridValue text={formatWhole(value(r, "shots"))} /> },
  ];
  const exportCsv = () => downloadCsv(`courtlens-decomposition-${data.season}.csv`, toCsv(
    ["player_id", "player", "team", "games", ...SIDES.flatMap(s => [`${s}_shots`, ...TARGETS.flatMap(t => [summary.labels[s][t], `${summary.labels[s][t]}_p10`, `${summary.labels[s][t]}_p90`])])],
    shown.map(r => [r.player_id, r.player_name, r.tricode, r.games, ...SIDES.flatMap(s => [r.sides[s]?.shots ?? null, ...TARGETS.flatMap(t => [r.sides[s]?.values[t] ?? null, r.sides[s]?.intervals[t][0] ?? null, r.sides[s]?.intervals[t][1] ?? null])])])));
  const board = data.boards[side];
  return <div className="sq-table-block">
    <div className="sq-panel sq-toolbar" role="group" aria-label="Table filters">
      <div className="sq-control-row">
        <label className="sq-minimum"><span>Min shots</span><Input type="number" inputMode="numeric" min={0} step={500} value={floor} onChange={e => setFloor(e.target.value)} aria-label="Min shots" inputSize="md" wrapperClassName="sq-minimum-input" /></label>
        <TeamPicker value={team} onChange={setTeam} season={data.season} />
        {seasonSelect}
        <Button size="md" icon="book" onClick={() => openMethodology()}>Methodology</Button>
        <Button size="md" icon="download" onClick={exportCsv}>Download CSV</Button>
        <CountChip>{shown.length.toLocaleString("en-US")} players</CountChip>
      </div>
      <Segmented size="md" label="View" value={side} onChange={next => onSide(next)} options={SIDES.map(s => ({ value: s, label: SIDE_LABELS[s], icon: SIDE_ICONS[s] }))} />
    </div>
    <StatsGrid<MergedRow> label={`Decomposition ${data.season} ${side}`} name="decomposition" className="sq-board" rows={shown} rowKey={r => r.player_id} columns={columns} leadWidth="lg" minWidth="wide"
      sort={{ key: sort.key, direction: sort.direction, onSort }} empty="No players match these filters."
      lead={{ group: "Player",
        label: <span className="stats-header-search"><SearchField aria-label="Search players" placeholder="Search players…" value={query} onChange={e => setQuery(e.target.value)} onClear={() => setQuery("")} inputSize="sm" wrapperClassName="sq-search" /></span>,
        cell: r => <GridPlayer playerId={r.player_id} name={r.player_name} team={r.tricode} season={data.season} era={seasonEra(data.season, r.tricode)} href={`/players/${r.player_id}?season=${data.season}`}
          subtitle={`${r.tricode ?? "—"} · ${r.games} games`} /> }} />
    <div className="sq-foot">
      <ToneLegend />
      <p className="rs-note" data-count={data.rows.length} data-unknown={board.unknown.length}>Points per 100 shots against the average player; positive is good on
        both ends, and the small line is the 80% interval. {data.season} is its own fit: one season, no box prior, no time decay, so values are shrunk hard.
        {" "}{formatWhole(board.unknown.length)} players with fewer than 20 games or 1,000 shots on either side have no value.</p>
    </div>
  </div>;
}

function Reading({ summary, data }: { summary: DecompositionSummary; data: Merged | null }) {
  const off = data ? [...data.rows].filter(r => r.sides.offense).sort((a, b) => b.sides.offense!.values.ts - a.sides.offense!.values.ts)[0] : undefined;
  const def = data ? [...data.rows].filter(r => r.sides.defense).sort((a, b) => a.sides.defense!.values.ts - b.sides.defense!.values.ts)[0] : undefined;
  const o = off?.sides.offense?.values.ts, d = def?.sides.defense?.values.ts;
  return <ResearchSection icon="book" title="How to Read the Numbers">
    <ReadingGuide
      units={<>Every value is in <strong>points per 100 shots against the average player</strong>, adjusted for the other nine players on the floor. Zero is
        average. A shot is a field-goal attempt or a 2-shot or 3-shot free-throw trip; possessions without one carry no weight.</>}
      offense={off && o != null
        ? <><span className="sq-code" data-example="offense" data-value={o}>{signed1(o)} oTS</span> for {off.player_name} in {data!.season}: the team scored about {Math.abs(o).toFixed(1)} points {o >= 0 ? "more" : "fewer"} per 100 shots with {off.player_name} on the floor.</>
        : <><span className="sq-code">+2.0 oTS</span>: the team scores about 2 more points per 100 shots with the player on the floor.</>}
      defense={def && d != null
        ? <><span className="sq-code" data-example="defense" data-value={d}>{signed1(d)} dTS</span> for {def.player_name} in {data!.season}: opponents scored about {Math.abs(d).toFixed(1)} points {d < 0 ? "more" : "fewer"} per 100 shots with {def.player_name} on the floor. Defense signs are flipped, so positive always helps.</>
        : <><span className="sq-code">−1.5 dTS</span>: opponents score about 1.5 more points per 100 shots. Defense signs are flipped, so positive always helps.</>}
      note={<>A lineup estimate with <strong>no box-score prior</strong>: it is pure on-court signal, so it is noisier than stabilised metrics. {summary.definitions.interval}</>} />
  </ResearchSection>;
}

const DEFENSE_TEXT: Record<Target, string> = {
  ts: "Opponents' shooting value with the player on defense, sign flipped so positive is good. dSQ + dContest + dFT = dTS.",
  sq: "The quality of the looks opponents get: positive means they settle for worse shots.",
  make: "Opponents' points minus the expected value of their shots: positive means they make fewer than the model expects. It holds contests and everything else the model cannot see.",
  ft: "Opponents' free-throw value above the foul-type baseline: positive means fewer or cheaper trips to the line.",
};

function ColumnGlossary({ summary }: { summary: DecompositionSummary }) {
  return <Glossary groups={[
    { label: "Offense", icon: "trend", tone: "a", items: TARGETS.map(t => ({ term: summary.labels.offense[t], text: sentence(summary.definitions[t].replace(/^[A-Za-z]+( \([^)]*\))?: /, "")) })) },
    { label: "Defense", icon: "shield", tone: "b", items: TARGETS.map(t => ({ term: summary.labels.defense[t], text: DEFENSE_TEXT[t] })) },
  ]} />;
}

const PERSISTENCE_ROWS: readonly { key: string; label: string; series: "a" | "b" }[] = [
  { key: "offense:ts", label: "oTS", series: "a" }, { key: "offense:sq", label: "oSQ", series: "a" }, { key: "offense:make", label: "oMake", series: "a" }, { key: "offense:ft", label: "oFT", series: "a" },
  { key: "defense:ts", label: "dTS", series: "b" }, { key: "defense:sq", label: "dSQ", series: "b" }, { key: "defense:make", label: "dContest", series: "b" }, { key: "defense:ft", label: "dFT", series: "b" },
];

function Persistence({ summary }: { summary: DecompositionSummary }) {
  const p = summary.persistence;
  const reg = p.correlations["offense:sq_minus_make"], rep = p.correlations["defense:sq_minus_make"];
  return <ResearchSection icon="activity" title="Does Shot Making Carry Over?">
    <p className="sq-text sq-lead">If making is mostly luck and shot quality mostly skill, a player&apos;s oSQ should repeat from one season to the next more
      than the same player&apos;s oMake. CourtLens registered that test before looking: <strong data-verdict={p.verdict}>{p.verdict}</strong>.</p>
    <SqPanel title="Season-to-season correlation" aside={<ul className="sq-legend" aria-label="Series"><li data-series="a">Offense</li><li data-series="b">Defense</li></ul>}
      label="Season-to-season correlation by component">
      <IntervalPlot label="Correlation from one season to the next, with 95% intervals" format={v => v.toFixed(2)}
        rows={PERSISTENCE_ROWS.map(r => ({ ...r, value: p.correlations[r.key].r, low: p.correlations[r.key].interval[0], high: p.correlations[r.key].interval[1] }))} />
      <div className="sq-wells" data-count="2">
        <div className="sq-well" data-row="offense:sq_minus_make" data-value={reg.r} data-low={reg.interval[0]} data-high={reg.interval[1]}>
          <span className="sq-kicker">r(oSQ) − r(oMake), registered</span>
          <span className="sq-well-value">{formatSigned(reg.r, 3)}</span>
          <span className="sq-tile-foot">95% interval {formatInterval(reg.interval, x => formatSigned(x, 3))}</span>
        </div>
        <div className="sq-well" data-row="defense:sq_minus_make" data-value={rep.r} data-low={rep.interval[0]} data-high={rep.interval[1]}>
          <span className="sq-kicker">r(dSQ) − r(dContest), reported</span>
          <span className="sq-well-value">{formatSigned(rep.r, 3)}</span>
          <span className="sq-tile-foot">95% interval {formatInterval(rep.interval, x => formatSigned(x, 3))}</span>
        </div>
      </div>
      <p className="sq-note">{formatWhole(p.pairs)} player pairs ({formatWhole(p.players)} players) in consecutive seasons, weighted by shots, with 95% player-bootstrap intervals.</p>
    </SqPanel>
  </ResearchSection>;
}

function Methodology({ summary, season }: { summary: DecompositionSummary; season: string }) {
  const seasons = Object.keys(summary.seasons).sort();
  const blockSeason = summary.seasons[season] ? season : seasons.at(-1)!;
  const block = summary.seasons[blockSeason];
  const avg = block.avg_points;
  const ftExample = 0.9 * 3;
  const baselines = [
    { metric: "TS", role: "Target", fga: "Actual points", two: "Expected FT value", three: "Expected FT value", other: "Expected FT value" },
    { metric: "SQ", role: "Component 1 of 3", fga: "Expected points (R05 model)", two: "avg_pts / 2", three: "avg_pts / 3", other: "0" },
    { metric: "FT", role: "Component 2 of 3", fga: "0", two: "ExpFT − avg_pts / 2", three: "ExpFT − avg_pts / 3", other: "ExpFT" },
    { metric: "Make", role: "Component 3 of 3", fga: "Actual − expected", two: "0", three: "0", other: "0" },
    { metric: "Sum", role: "SQ + FT + Make = TS", fga: "= Actual points", two: "= Expected FT value", three: "= Expected FT value", other: "= Expected FT value" },
  ];
  type Base = (typeof baselines)[number];
  const textColumn = (key: keyof Base, label: string) => ({ key, label, width: "lg" as const, align: "left" as const, cell: (r: Base) => <span className="sq-cell-text">{r[key]}</span> });
  return <ResearchDisclosure id="methodology" icon="layers" title="Caveats & Methodology">
    <MethodBlock title="Overview">
      <p className="sq-text">Plain RAPM says how much a lineup scores with a player on the floor. This split says why: whether his lineups get better looks,
        make more of the looks they get, or earn more at the free-throw line, and the same three things against them on defense.</p>
      <p className="sq-text">The expected value of each look comes from CourtLens&apos;s own expected-points model (Shot Quality v2, on the Model tab), which reads
        free NBA shot and play-by-play data. It has no tracking data, so it does not know where the defenders were; that sits in Make.</p>
    </MethodBlock>
    <MethodBlock title="The four parallel regressions">
      <p className="sq-text">Four ridge regressions run on the same possessions, the same lineups and the same penalty. Only the score given to each shot changes:</p>
      <MethodSteps steps={[
        { title: "1 · True shooting (TS)", text: "What happened: field goals at their actual points, free-throw trips at the shooter's expected free-throw value." },
        { title: "2 · Shot quality (SQ)", text: "How good the look was: field goals at the model's expected points, free throws at the foul-type baseline below." },
        { title: "3 · Free-throw value (FT)", text: "What the line added: field goals at zero, free throws at expected value minus the baseline." },
        { title: "4 · Shot making (Make)", text: "Whether the look beat its expectation: field goals at actual minus expected points, free throws at zero." },
      ]} />
      <FormulaLine>TS = SQ + Make + FT on every shot</FormulaLine>
      <p className="sq-note">{summary.method[1]}</p>
    </MethodBlock>
    <MethodBlock title="Foul-type baselines">
      <p className="sq-text">A 2-shot or 3-shot foul replaced an ordinary possession, so part of its free throws is credited to SQ as the value of that lost look.
        An and-one or a technical replaced nothing, so all of it is free-throw value. avg_pts is the season&apos;s actual field-goal points per attempt
        ({formatFixed(avg)} in {blockSeason}).</p>
      <StatsGrid label="Foul-type baselines" name="sq-baselines" density="compact" height="auto" leadWidth="sm" minWidth="narrow" rows={baselines} rowKey={r => r.metric}
        lead={{ label: "Metric", cell: r => <span className="sq-cell-strong">{r.metric}</span> }}
        columns={[textColumn("role", "Role"), textColumn("fga", "Field goal"), textColumn("two", "2-shot foul, per FT"), textColumn("three", "3-shot foul, per FT"), textColumn("other", "And-one, technical")]} />
      <p className="sq-text" data-example="foul" data-value={avg}>Worked example, {blockSeason}: a 90% shooter fouled on a three expects {ftExample.toFixed(2)} points
        (0.90 × 3). The look the foul replaced was worth {formatFixed(avg)}, so SQ gets {formatFixed(avg)} ({formatFixed(avg / 3)} per free throw) and FT
        gets {formatSigned(ftExample - avg, 3)} ({formatSigned((ftExample - avg) / 3, 3)} per free throw).</p>
    </MethodBlock>
    <MethodBlock title="Calibration">
      <p className="sq-text">{summary.method[2]}</p>
      <StatsGrid label="Shift per season" name="sq-shift" density="compact" height="auto" leadWidth="sm" minWidth="narrow" rows={seasons} rowKey={s => s} rowData={s => ({ season: s })}
        lead={{ label: "Season", cell: s => <span className="sq-cell-strong">{s}</span> }}
        columns={[
          { key: "avg", label: "avg_pts", width: "sm", cell: s => <GridValue text={formatFixed(summary.seasons[s].avg_points)} />, data: s => ({ value: summary.seasons[s].avg_points }) },
          { key: "shift", label: "Shift /100", width: "sm", cell: s => <GridValue text={formatSigned(summary.seasons[s].expected_shift * 100, 2)} />, data: s => ({ value: summary.seasons[s].expected_shift }) },
          { key: "shots", label: "Shots", width: "sm", cell: s => <GridValue text={formatWhole(summary.seasons[s].shots)} />, data: s => ({ value: summary.seasons[s].shots }) },
          { key: "games", label: "Games", width: "xs", cell: s => <GridValue text={formatWhole(summary.seasons[s].games)} />, data: s => ({ value: summary.seasons[s].games }) },
        ]} />
    </MethodBlock>
    <MethodBlock title="Ridge regression and the second stage">
      <ul className="sq-list">{[summary.method[0], summary.definitions.scale, summary.definitions.shot].map(m => <li key={m}>{m}</li>)}</ul>
      <FormulaLine>oTS ≈ β₁ oSQ + β₂ oFT + β₃ oMake · dTS ≈ β₄ dSQ + β₅ dFT + β₆ dContest</FormulaLine>
      <StatsGrid label="Additivity by season" name="sq-additivity" density="compact" height="auto" leadWidth="sm" rows={seasons} rowKey={s => s} rowData={s => ({ season: s })}
        lead={{ label: "Season", cell: s => <span className="sq-cell-strong">{s}</span> }}
        columns={[
          { key: "gap", label: "Largest gap", width: "sm", cell: s => <GridValue text={summary.seasons[s].coefficient_additivity_residual.offense === 0 ? "under 1e-9" : formatFixed(summary.seasons[s].coefficient_additivity_residual.offense, 9)} />, data: s => ({ value: summary.seasons[s].coefficient_additivity_residual.offense }) },
          { key: "coef", label: "Coefficients", width: "md", cell: s => <GridValue text={summary.seasons[s].second_stage.offense.coefficients.map(c => formatFixed(c)).join(", ")} />, data: s => ({ value: summary.seasons[s].second_stage.offense.coefficients[0] }) },
          { key: "r2", label: "R²", width: "xs", cell: s => <GridValue text={formatFixed(summary.seasons[s].second_stage.offense.r2, 4)} />, data: s => ({ value: summary.seasons[s].second_stage.offense.r2 }) },
          { key: "players", label: "Players", width: "xs", cell: s => <GridValue text={formatWhole(summary.seasons[s].second_stage.offense.players)} />, data: s => ({ value: summary.seasons[s].second_stage.offense.players }) },
          ...TARGETS.map(t => ({ key: `w-${t}`, label: `80% width ${summary.labels.offense[t]}`, width: "sm" as const,
            cell: (s: string) => <GridValue text={formatFixed(summary.seasons[s].median_interval_width.offense[t], 2)} />, data: (s: string) => ({ value: summary.seasons[s].median_interval_width.offense[t] }) })),
        ]} />
      <p className="sq-note">Offense shown; one penalty on one design makes the coefficients exact, so the check confirms the arithmetic, not the split.
        Widths are the median 80% interval width per 100 shots among rated players.</p>
    </MethodBlock>
    <MethodBlock title="Data">
      <p className="sq-text">{summary.method[3]} {summary.method[5]}</p>
      <StatsGrid label="Data joins by season" name="sq-joins" density="compact" height="auto" leadWidth="sm" rows={seasons} rowKey={s => s} rowData={s => ({ season: s })}
        lead={{ label: "Season", cell: s => <span className="sq-cell-strong">{s}</span> }}
        columns={[
          { key: "joined", label: "Shots joined", width: "sm", cell: s => <GridValue text={formatWhole(summary.data[s].r05_shots.joined)} />, data: s => ({ value: summary.data[s].r05_shots.joined }) },
          { key: "rate", label: "Rate", width: "xs", cell: s => <GridValue text={formatShare(summary.data[s].r05_shots.join_rate, 2)} />, data: s => ({ value: summary.data[s].r05_shots.join_rate }) },
          { key: "excluded", label: "Excluded-game shots", width: "md", cell: s => <GridValue text={formatWhole(summary.data[s].r05_shots.unjoined.game_not_admitted ?? 0)} />, data: s => ({ value: summary.data[s].r05_shots.unjoined.game_not_admitted ?? 0 }) },
          { key: "ft", label: "Free throws joined", width: "sm", cell: s => <GridValue text={formatWhole(summary.data[s].free_throws.joined)} />, data: s => ({ value: summary.data[s].free_throws.joined }) },
          { key: "trips", label: "Unknown trip types", width: "sm", cell: s => <GridValue text={String(Object.keys(summary.data[s].free_throws.unknown_sub_types).length)} />, data: s => ({ value: Object.keys(summary.data[s].free_throws.unknown_sub_types).length }) },
          { key: "noattempt", label: "Possessions without an attempt", width: "md", cell: s => <GridValue text={formatWhole(summary.data[s].possessions.counted_possessions_without_attempt)} />, data: s => ({ value: summary.data[s].possessions.counted_possessions_without_attempt }) },
        ]} />
    </MethodBlock>
    <MethodBlock title="Data & credits">
      <p className="sq-text">{summary.credit}</p>
      <p className="sq-text">{summary.reference_note} Design reference: Databallr&apos;s ShotQuality RAPM page.</p>
      <p className="sq-note">Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</p>
    </MethodBlock>
  </ResearchDisclosure>;
}
