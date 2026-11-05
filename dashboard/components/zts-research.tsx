"use client";

import { useMemo, useState } from "react";
import { ChartData, ChartFrame } from "./charts/chart-frame";
import { PairedBars } from "./charts/paired-bars";
import { RankedBars } from "./charts/ranked-bars";
import { EntityField } from "./entity-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { Input } from "./ui/input";
import { Button, Segmented, Select } from "./ui/kit";
import { PageHeader, Section } from "./ui/panel";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { seasonEra } from "@/lib/portrait-source";
import {
  DEFAULT_PAIR_RULE, defaultPair, difficultyBands, difficultyHistogram, EXTREMES_RULE, formatNumber, formatPoints,
  formatShare, formatSigned, formatTs, formatWhole, getLeaderboard, getPlayerZts, getZts, STATUS_LABELS, VERDICT_LABELS,
  type Leaderboard, type PlayerZts, type ValidationBlock, type ZtsRow, type ZtsStatus, type ZtsSummary
} from "@/lib/zts";

/**
 * Research → zTS (R04). A deliberately plain build-phase page (D13) after Databallr's zTS page
 * (About, Top 200 and Player tabs): shared tables, tiles and chart frames only. zTS numbers are the
 * frozen courtlens-zts-validation-v1 results; exact values sit on `data-value` for the browser check.
 */
type Tab = "about" | "top" | "player";
const TABS = [
  { value: "about", label: "About", icon: "info" },
  { value: "top", label: "Top 200", icon: "trophy" },
  { value: "player", label: "Player", icon: "search" },
] as const;
const LATEST = "2025-26";
const MINUTES = ["200", "300", "500", "750", "1000"] as const;
const UNKNOWN_ORDER: ZtsStatus[] = ["no_rts", "small_sample", "no_play_types", "source_rows_missing", "low_coverage"];

const value = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : "");
const year = (season: string) => `'${season.slice(5)}`;

function PlayerCell({ row, season }: { row: Pick<ZtsRow, "player_id" | "player_name" | "teams">; season: string }) {
  const [main, ...others] = row.teams;
  const team = main?.tricode ?? null;
  return <TableCell data-player={row.player_id}>
    <PlayerIdentity playerId={row.player_id} name={row.player_name} team={team} size="sm" era={seasonEra(season, team)}
      href={`/players/${row.player_id}?season=${season}`}
      subtitle={others.length ? <>{others.map(t => <span key={t.team_id}>{t.tricode && <TeamLogo team={t.tricode} season={season} size={14} />} {t.tricode ?? t.team_id}</span>)}</> : undefined} />
  </TableCell>;
}

function Signed({ v, digits = 1, points = true, label }: { v: number | null | undefined; digits?: number; points?: boolean; label?: string }) {
  return <TableCell numeric data-value={value(v)} data-field={label}>{points ? formatPoints(v, digits) : formatSigned(v, digits)}</TableCell>;
}

// ---- About -------------------------------------------------------------------------------------

function LeagueByType({ summary, season }: { summary: ZtsSummary; season: string }) {
  const ref = summary.references[season];
  if (!ref) return <GatedNote>No league references for {season}.</GatedNote>;
  const types = [...ref.types].sort((a, b) => a.ts - b.ts);
  return <>
    <RankedBars title={`${season} league true shooting by play type, relative to league average`}
      source="NBA Stats (Synergy) play types via hoopR" sample={`Every listed offensive row, ${formatWhole(ref.scoring_possessions)} scoring possessions`}
      note={`League average ${formatTs(ref.ts)} (CourtLens play-type TS). Bars extend left below average and right above it.`}
      measure="TS points relative to league average" tone="identity-a"
      items={types.map(t => ({ key: t.play_type, name: t.label, label: t.label, value: (t.ts - ref.ts) * 100,
        formatted: `${formatTs(t.ts)} (${formatPoints(t.ts - ref.ts)})`, detail: `${formatShare(t.share)} of scoring possessions` }))} />
    <Table aria-label={`${season} league play-type TS`} density="compact">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Play type</TableHead><TableHead align="right">League TS</TableHead><TableHead align="right">vs league</TableHead>
        <TableHead align="right">Share of scoring possessions</TableHead><TableHead align="right">Points</TableHead><TableHead align="right">Scoring possessions</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {types.map(t => <TableRow key={t.play_type} data-type={t.play_type}>
          <TableCell><strong>{t.label}</strong></TableCell>
          <TableCell numeric data-value={t.ts}>{formatTs(t.ts)}</TableCell>
          <TableCell numeric>{formatPoints(t.ts - ref.ts)}</TableCell>
          <TableCell numeric data-value={t.share}>{formatShare(t.share)}</TableCell>
          <TableCell numeric>{formatWhole(t.points)}</TableCell>
          <TableCell numeric>{formatWhole(t.scoring_possessions)}</TableCell>
        </TableRow>)}
        <TableRow data-type="league"><TableCell><strong>League</strong></TableCell><TableCell numeric data-value={ref.ts}>{formatTs(ref.ts)}</TableCell>
          <TableCell numeric>—</TableCell><TableCell numeric>100.0%</TableCell><TableCell numeric>—</TableCell><TableCell numeric>{formatWhole(ref.scoring_possessions)}</TableCell></TableRow>
      </TableBody>
    </Table>
  </>;
}

function Pair({ board, summary }: { board: Leaderboard; summary: ZtsSummary }) {
  const [picks, setPicks] = useState<[string | null, string | null]>([null, null]);
  const fallback = defaultPair(board.rows);
  const byId = useMemo(() => new Map(board.rows.map(r => [r.player_id, r])), [board]);
  const a = (picks[0] && byId.get(picks[0])) || fallback?.[0];
  const b = (picks[1] && byId.get(picks[1])) || fallback?.[1];
  const players = useMemo(() => [...board.rows].sort((x, y) => x.player_name.localeCompare(y.player_name)), [board]);
  const { data: detailA } = useFeed([a?.player_id ?? null, board.season], signal => getPlayerZts(a?.player_id ?? null, board.season, signal));
  const { data: detailB } = useFeed([b?.player_id ?? null, board.season], signal => getPlayerZts(b?.player_id ?? null, board.season, signal));
  if (!a || !b) return <GatedNote>Too few players meet the default pair rule in {board.season}.</GatedNote>;
  const ref = summary.references[board.season];
  const order = [...(ref?.types ?? [])].sort((x, y) => x.ts - y.ts);
  // An absent type had under 10 possessions (the source floor) or was dropped: not listed, never 0%.
  const share = (detail: typeof detailA, key: string) => detail?.status === "available" ? detail.play_types.find(t => t.play_type === key)?.share ?? null : null;
  const pick = (index: 0 | 1) => (event: { target: { value: string } }) =>
    setPicks(current => index === 0 ? [event.target.value, current[1]] : [current[0], event.target.value]);
  return <>
    <div>
      {([a, b] as const).map((row, index) => <Field key={index} label={index === 0 ? "Player A" : "Player B"} layout="inline">
        <Select aria-label={index === 0 ? "Player A" : "Player B"} value={row.player_id} onChange={pick(index as 0 | 1)}>
          {players.map(p => <option key={p.player_id} value={p.player_id}>{p.player_name}</option>)}
        </Select></Field>)}
    </div>
    {!picks[0] && !picks[1] && <p>{DEFAULT_PAIR_RULE}</p>}
    <Table aria-label="Side by side" density="compact" data-pair="true">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Player</TableHead><TableHead align="right">Scoring usage</TableHead><TableHead align="right">rTS</TableHead>
        <TableHead align="right">Expected TS</TableHead><TableHead align="right">Role (difficulty)</TableHead><TableHead align="right">zTS</TableHead>
      </TableRow></TableHeader>
      <TableBody>{[a, b].map(row => <TableRow key={row.player_id} data-row={row.player_id}>
        <PlayerCell row={row} season={board.season} />
        <TableCell numeric data-value={value(row.scoring_usage)}>{formatNumber(row.scoring_usage)}</TableCell>
        <Signed v={row.rts} label="rts" />
        <TableCell numeric data-value={value(row.expected_ts)}>{formatTs(row.expected_ts)}</TableCell>
        <Signed v={row.difficulty} label="difficulty" />
        <Signed v={row.zts} label="zts" />
      </TableRow>)}</TableBody>
    </Table>
    <PairedBars title={`Play-type mix, ${board.season}`} source="NBA Stats (Synergy) play types via hoopR"
      sample="Share of each player's scoring possessions; hardest play types (lowest league TS) at the top; — means not listed (under 10 possessions)"
      names={[a.player_name, b.player_name]} domain={[0, 60]}
      rows={order.map(t => {
        const sa = share(detailA, t.play_type), sb = share(detailB, t.play_type);
        return { key: t.play_type, label: t.label, detail: `League TS ${formatTs(t.ts)}`,
          a: sa === null ? null : sa * 100, b: sb === null ? null : sb * 100, formattedA: formatShare(sa), formattedB: formatShare(sb) };
      })} />
    <p>Expected TS: {a.player_name} {formatTs(a.expected_ts)}, {b.player_name} {formatTs(b.expected_ts)}, against a league {formatTs(ref?.ts)}.
      The difference in Playtype Difficulty is {formatNumber(((a.difficulty ?? 0) - (b.difficulty ?? 0)) * 100)} points, which rTS does not see.</p>
  </>;
}

function Distribution({ board }: { board: Leaderboard }) {
  const { get, set } = useUrlState();
  const minutes = (get("minutes") ?? "500") as (typeof MINUTES)[number];
  const rows = board.rows.filter(r => (r.minutes ?? 0) >= Number(minutes));
  const bands = difficultyBands(rows);
  const bins = difficultyHistogram(rows);
  const max = Math.max(1, ...bins.map(bin => bin.count));
  const width = 384 / Math.max(1, bins.length);
  return <>
    <Segmented label="Minimum minutes" size="sm" value={minutes} onChange={next => set({ minutes: next === "500" ? null : next })}
      options={MINUTES.map(m => ({ value: m, label: `${m}+ min` }))} />
    <div className="ui-findings" data-bands="true">
      <StatTile label="Players" value={String(bands.players)} />
      <StatTile label="Hard role, +2 or more" value={String(bands.hard)} />
      <StatTile label="Easy role, −2 or less" value={String(bands.easy)} />
      <StatTile label="Middle band, within ±1" value={String(bands.middle)} />
      <StatTile label="Mean difficulty" value={formatSigned(bands.mean)} />
      <StatTile label="Median difficulty" value={formatSigned(bands.median)} />
    </div>
    <ChartFrame title={`Playtype Difficulty, ${board.season}`} source="Frozen courtlens-zts-validation-v1 results; minutes from the served impact bundle"
      sample={`${bands.players} players with a served zTS and ${minutes}+ minutes`} note="One-point bins. Positive = a harder than average role."
      state={bins.length ? "ready" : "empty"}>
      <ChartData fingerprint={`${board.season}-${minutes}`}>
        <svg className="chart-graphic chart-reliability" viewBox="0 0 480 280" role="img"
          aria-label={`Playtype Difficulty histogram: ${bins.map(bin => `${bin.from} to ${bin.to}: ${bin.count}`).join(", ")}`}>
          <line x1="64" x2="448" y1="232" y2="232" stroke="var(--color-hairline-strong)" />
          {bins.map((bin, i) => {
            const h = (bin.count / max) * 200;
            return <g key={bin.from} data-bin={bin.from} data-count={bin.count}>
              <title>{`${bin.from} to ${bin.to}: ${bin.count} players`}</title>
              <rect x={64 + i * width + 1} y={232 - h} width={Math.max(1, width - 2)} height={h}
                fill={bin.from >= 0 ? "var(--color-identity-a)" : "var(--color-identity-b)"} />
              <text x={64 + i * width + width / 2} y="250" textAnchor="middle">{bin.from}</text>
              {bin.count > 0 && <text x={64 + i * width + width / 2} y={226 - h} textAnchor="middle">{bin.count}</text>}
            </g>;
          })}
          <text x="256" y="274" textAnchor="middle">Playtype Difficulty (TS points): easier role, left; harder role, right</text>
        </svg>
      </ChartData>
    </ChartFrame>
  </>;
}

function RowsTable({ rows, season, label }: { rows: ZtsRow[]; season: string; label: string }) {
  return <Table aria-label={label} density="compact">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Player</TableHead><TableHead align="right">USG</TableHead><TableHead align="right">rTS</TableHead>
      <TableHead align="right">Role</TableHead><TableHead align="right">zTS</TableHead>
    </TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.player_id} data-row={row.player_id}>
      <PlayerCell row={row} season={season} />
      <TableCell numeric data-value={value(row.scoring_usage)}>{formatNumber(row.scoring_usage)}</TableCell>
      <Signed v={row.rts} label="rts" /><Signed v={row.difficulty} label="difficulty" /><Signed v={row.zts} label="zts" />
    </TableRow>)}</TableBody>
  </Table>;
}

function Extremes({ board }: { board: Leaderboard }) {
  const pool = board.rows.filter(r => (r.minutes ?? 0) >= 1000 && r.difficulty !== null)
    .sort((x, y) => (x.difficulty as number) - (y.difficulty as number) || x.player_id.localeCompare(y.player_id));
  return <>
    <p>{EXTREMES_RULE}</p>
    <h3>Easiest roles</h3>
    <RowsTable rows={pool.slice(0, 5)} season={board.season} label="Easiest roles" />
    <h3>Hardest roles</h3>
    <RowsTable rows={pool.slice(-5).reverse()} season={board.season} label="Hardest roles" />
  </>;
}

function interval(i: { value: number; low: number; high: number } | undefined, digits = 3) {
  return i ? `${formatSigned(i.value, digits)} (${formatSigned(i.low, digits)} to ${formatSigned(i.high, digits)})` : "—";
}

function ValidationRows({ name, block, target }: { name: string; block: ValidationBlock; target: "predictive" | "tracking" }) {
  const m = block.metrics;
  return <TableRow data-validation={`${target}-${name}`}>
    <TableCell>{name}</TableCell>
    <TableCell numeric>{block.rows.toLocaleString("en-US")} / {block.players.toLocaleString("en-US")}</TableCell>
    <TableCell numeric data-value={m.r_rts.value}>{m.r_rts.value.toFixed(3)}</TableCell>
    <TableCell numeric data-value={m.r_zts.value}>{m.r_zts.value.toFixed(3)}</TableCell>
    <TableCell numeric data-value={m.delta_r.value} data-low={m.delta_r.low} data-high={m.delta_r.high}>{interval(m.delta_r)}</TableCell>
    <TableCell numeric data-value={value(m.delta_mse?.value)}>{target === "predictive" ? interval(m.delta_mse, 2) : "Units differ"}</TableCell>
    <TableCell><strong>{VERDICT_LABELS[block.verdict_r]}</strong></TableCell>
  </TableRow>;
}

function Validation({ summary }: { summary: ZtsSummary }) {
  const v = summary.validation;
  const head = <TableHeader><TableRow hoverable={false}>
    <TableHead>Seasons</TableHead><TableHead align="right">Rows / players</TableHead><TableHead align="right">r, rTS</TableHead>
    <TableHead align="right">r, zTS</TableHead><TableHead align="right">zTS − rTS in r, 95%</TableHead>
    <TableHead align="right">MSE gain ×10⁴, 95%</TableHead><TableHead>Verdict</TableHead>
  </TableRow></TableHeader>;
  return <>
    {(["predictive", "tracking"] as const).map(target => <div key={target} data-target={target}>
      <h3>{target === "predictive" ? "Predicting next season's rTS" : "Tracking same-season oTS RAPM"}</h3>
      <Table aria-label={target === "predictive" ? "Predicting next season's rTS" : "Tracking oTS RAPM"} density="compact">
        {head}
        <TableBody>
          <ValidationRows name={`Test, pooled (${v[target].test.seasons[0]} to ${v[target].test.seasons.at(-1)})`} block={v[target].test.pooled} target={target} />
          {Object.entries(v[target].test.by_season).map(([season, block]) => <ValidationRows key={season} name={`Test ${season}`} block={block} target={target} />)}
          <ValidationRows name={`Choice, pooled (${v[target].choice.seasons[0]} to ${v[target].choice.seasons.at(-1)})`} block={v[target].choice.pooled} target={target} />
        </TableBody>
      </Table>
    </div>)}
  </>;
}

function FullLeaderboard({ board }: { board: Leaderboard }) {
  const [shown, setShown] = useState(50);
  const rows = board.rows.slice(0, shown);
  return <>
    <Table aria-label={`Full leaderboard ${board.season}`} density="compact" data-board="about">
      <TableHeader><TableRow hoverable={false}>
        <TableHead align="right">#</TableHead><TableHead>Player</TableHead><TableHead align="right">USG</TableHead>
        <TableHead align="right">rTS</TableHead><TableHead align="right">Role</TableHead><TableHead align="right">zTS</TableHead>
        <TableHead align="right">zTS add/100</TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={row.player_id} data-row={row.player_id}>
        <TableCell numeric>{row.rank}</TableCell>
        <PlayerCell row={row} season={board.season} />
        <TableCell numeric data-value={value(row.scoring_usage)}>{formatNumber(row.scoring_usage)}</TableCell>
        <Signed v={row.rts} label="rts" /><Signed v={row.difficulty} label="difficulty" /><Signed v={row.zts} label="zts" />
        <Signed v={row.zts_add} points={false} label="zts_add" />
      </TableRow>)}</TableBody>
    </Table>
    {shown < board.rows.length && <Button variant="secondary" size="sm" onClick={() => setShown(board.rows.length)}>
      Show more ({board.rows.length - shown} remaining)</Button>}
  </>;
}

function Coverage({ summary }: { summary: ZtsSummary }) {
  return <Table aria-label="Coverage by season" density="compact">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Season</TableHead><TableHead align="right">Player-seasons</TableHead><TableHead align="right">Served zTS</TableHead>
      {UNKNOWN_ORDER.map(s => <TableHead key={s} align="right">{STATUS_LABELS[s]}</TableHead>)}
    </TableRow></TableHeader>
    <TableBody>{Object.entries(summary.coverage).map(([season, c]) => <TableRow key={season} data-season={season}>
      <TableCell>{season}</TableCell>
      <TableCell numeric>{c.player_seasons}</TableCell>
      <TableCell numeric data-value={c.status.known ?? 0}>{c.status.known ?? 0}</TableCell>
      {UNKNOWN_ORDER.map(s => <TableCell key={s} numeric data-value={c.status[s] ?? 0}>{c.status[s] ?? 0}</TableCell>)}
    </TableRow>)}</TableBody>
  </Table>;
}

function About({ summary }: { summary: ZtsSummary }) {
  const { get, set } = useUrlState();
  const season = get("season") ?? LATEST;
  const { data: board, error, loading, retry } = useFeed([season], signal => getLeaderboard(season, "zts_add", 1000, signal));
  const fta = summary.fta_check;
  return <>
    <Section title="Why play types matter"
      description="Raw efficiency mixes how well a player scored with the kind of possessions he scored on. Cuts, putbacks and transition are easy; isolation and pick-and-roll handling are hard. zTS asks what a league-average scorer would shoot on the player's exact play-type mix, calls the gap to the league the role's difficulty, and adds it to rTS.">
      <p>{summary.credit}</p>
    </Section>

    <Section title="League true shooting by play type" actions={<Field label="Season" layout="inline">
      <Select aria-label="League season" value={season} onChange={event => set({ season: event.target.value === LATEST ? null : event.target.value })}>
        {[...summary.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>}>
      <LeagueByType summary={summary} season={season} />
    </Section>

    <Section title="The calculation">
      <ul data-definitions="true">
        {(["play_type_ts", "expected_ts", "difficulty", "zts", "rts", "league"] as const).map(key => <li key={key}>{summary.definitions[key]}</li>)}
      </ul>
      <p>{summary.no_interval}</p>
    </Section>

    {error && <FeedFailure error={error} retry={retry} what="The season's zTS" />}
    {loading && <FeedSkeleton label="Loading the season's zTS" />}
    {board?.status === "unknown" && <GatedNote>{board.reason}</GatedNote>}
    {board?.status === "available" && <>
      <Section title="The calculation in practice"><Pair key={board.season} board={board} summary={summary} /></Section>
      <Section title="How big the adjustments are" description="Positive values mean a harder than average role, negative an easier one. Bands: hard +2 or more, easy −2 or less, middle within ±1 TS point.">
        <Distribution board={board} />
      </Section>
      <Section title="Easiest and hardest roles"><Extremes board={board} /></Section>
    </>}

    <Section title="Does zTS tell us more than rTS?"
      description={`Registered test ${summary.registration.identity}, committed before any zTS existed. Weighted correlations; 95% intervals from a paired player-cluster bootstrap (2,000 replicates, seed 4004). Only the test seasons decide the verdict; choice seasons were read first to check the pipeline and changed nothing.`}>
      <Validation summary={summary} />
      <p>Reading: zTS tracks a player&apos;s same-season shooting impact (oTS RAPM, from the sealed six-factor fits) better than rTS in every test season. It predicts next season&apos;s raw rTS worse in every test season: a hard role persists, and next season&apos;s rTS still carries its penalty, which zTS has removed. Databallr&apos;s own test (zTS add against oTS RAPM, R²) is not reproduced here; this is CourtLens&apos;s registered comparison of the efficiency terms alone.</p>
    </Section>

    {board?.status === "available" && <Section title={`Full leaderboard, ${board.season}`}
      description={`Ranked by zTS add/100. ${board.volume_note}`}>
      <FullLeaderboard key={board.season} board={board} />
    </Section>}

    <Section title="Coverage, unknowns and method">
      <ul>
        <li>Seasons {summary.seasons[0]} to {summary.seasons.at(-1)}, regular season only: Synergy play types start in 2015-16, 2026-27 has no play-type rows or sealed rTS yet, and playoffs are outside the registration.</li>
        <li>FTA cannot be derived from the play-type rows: they count free-throw trips and and-ones, not attempts. On {fta.player_seasons.toLocaleString("en-US")} single-team player-seasons the best estimate is {(fta.ratio_proxy_to_box_fta.p50 * 100).toFixed(1)}% of box FTA at the median ({(fta.ratio_proxy_to_box_fta.p05 * 100).toFixed(1)}% to {(fta.ratio_proxy_to_box_fta.p95 * 100).toFixed(1)}%, 5th to 95th percentile), so play-type TS is CourtLens&apos;s own definition.</li>
        <li>The source omits a play type a player used fewer than {summary.parameters.source_min_possessions} times, and some seasons also miss whole rows. Databallr estimates the missing frequencies; CourtLens does not: a player-season with a missing row, or under {summary.parameters.min_coverage * 100}% coverage, or under {summary.parameters.min_tsa} TSA, has no zTS and says why.</li>
        <li>Not reproduced from Databallr&apos;s page: SV/100 (formula not published), the add-stat R² and baseline study, the team playtype table, the X/Y explorer, the position and scoring-usage filters, and the shot-quality and PPP studies.</li>
        <li>Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code> · impact bundle <code>{summary.inputs.impact_bundle_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</li>
      </ul>
      <Coverage summary={summary} />
    </Section>
  </>;
}

// ---- Top 200 -----------------------------------------------------------------------------------

function TopSeasons({ summary }: { summary: ZtsSummary }) {
  const { get, set } = useUrlState();
  const season = get("topSeason") ?? "all";
  const sort = (get("rank") ?? "zts_add") as "zts" | "zts_add";
  const [query, setQuery] = useState("");
  const { data, error, loading, retry } = useFeed([season, sort], signal => getLeaderboard(season, sort, 200, signal));
  const rows = data?.status === "available" ? data.rows.filter(r => r.player_name.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <Section title="Top 200 seasons" description={data?.status === "available" ? data.volume_note : undefined}
    actions={<>
      <Field label="Season" layout="inline"><Select aria-label="Top season" value={season} onChange={event => set({ topSeason: event.target.value === "all" ? null : event.target.value })}>
        <option value="all">All seasons</option>{[...summary.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
      <Segmented label="Season type" size="sm" value="reg" onChange={() => undefined}
        options={[{ value: "reg", label: "Reg" }, { value: "post", label: "Post", disabled: true, title: "No playoff zTS: playoffs are outside the registration" }]} />
      <Segmented label="Rank by" size="sm" value={sort} onChange={next => set({ rank: next === "zts_add" ? null : next })}
        options={[{ value: "zts_add", label: "zTS add" }, { value: "zts", label: "zTS" }]} />
      <Input aria-label="Search players" placeholder="Search..." value={query} onChange={event => setQuery(event.target.value)} />
    </>}>
    {error && <FeedFailure error={error} retry={retry} what="Top 200" />}
    {loading && <FeedSkeleton label="Loading Top 200" />}
    {data?.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
    {data?.status === "available" && <Table aria-label="Top 200 seasons" density="compact" data-board="top">
      <TableHeader><TableRow hoverable={false}>
        <TableHead align="right">#</TableHead><TableHead>Yr</TableHead><TableHead>Player</TableHead><TableHead align="right">MIN</TableHead>
        <TableHead align="right">USG</TableHead><TableHead align="right">rTS</TableHead><TableHead align="right">Role</TableHead>
        <TableHead align="right">zTS</TableHead><TableHead align="right">zTS add/100</TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={`${row.season}-${row.player_id}`} data-row={`${row.season}:${row.player_id}`}>
        <TableCell numeric>{row.rank}</TableCell>
        <TableCell>{year(row.season)}</TableCell>
        <PlayerCell row={row} season={row.season} />
        <TableCell numeric data-value={value(row.minutes)}>{formatWhole(row.minutes)}</TableCell>
        <TableCell numeric data-value={value(row.scoring_usage)}>{formatNumber(row.scoring_usage)}</TableCell>
        <Signed v={row.rts} label="rts" /><Signed v={row.difficulty} label="difficulty" /><Signed v={row.zts} label="zts" />
        <Signed v={row.zts_add} points={false} label="zts_add" />
      </TableRow>)}</TableBody>
    </Table>}
  </Section>;
}

// ---- Player ------------------------------------------------------------------------------------

function PlayerTypes({ data }: { data: PlayerZts }) {
  return <Table aria-label="Play-type mix" density="compact" data-types="true">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Play type</TableHead><TableHead align="right">Possessions</TableHead><TableHead align="right">Share</TableHead>
      <TableHead align="right">League share</TableHead><TableHead align="right">Player TS</TableHead><TableHead align="right">League TS</TableHead>
      <TableHead align="right">vs league</TableHead><TableHead align="right">Share × league TS</TableHead>
    </TableRow></TableHeader>
    <TableBody>
      {data.play_types.map(t => <TableRow key={t.play_type} data-type={t.play_type}>
        <TableCell><strong>{t.label}</strong></TableCell>
        <TableCell numeric>{formatWhole(t.possessions)}</TableCell>
        <TableCell numeric data-value={t.share}>{formatShare(t.share)}</TableCell>
        <TableCell numeric>{formatShare(t.league_share)}</TableCell>
        <TableCell numeric data-value={value(t.ts)}>{formatTs(t.ts)}</TableCell>
        <TableCell numeric data-value={t.league_ts}>{formatTs(t.league_ts)}</TableCell>
        <TableCell numeric>{formatPoints(t.relative_ts)}</TableCell>
        <TableCell numeric data-value={t.contribution}>{formatTs(t.contribution, 2)}</TableCell>
      </TableRow>)}
      <TableRow data-type="total"><TableCell><strong>Expected TS</strong></TableCell><TableCell numeric>{formatWhole(data.listed_possessions)}</TableCell>
        <TableCell numeric>100.0%</TableCell><TableCell numeric>—</TableCell><TableCell numeric data-value={value(data.synergy_ts)}>{formatTs(data.synergy_ts)}</TableCell>
        <TableCell numeric data-value={data.league_ts}>{formatTs(data.league_ts)}</TableCell><TableCell numeric>—</TableCell>
        <TableCell numeric data-value={value(data.expected_ts)}>{formatTs(data.expected_ts, 2)}</TableCell></TableRow>
    </TableBody>
  </Table>;
}

function History({ rows }: { rows: ZtsRow[] }) {
  return <Table aria-label="Season history" density="compact" data-history="true">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Season</TableHead><TableHead>Team</TableHead><TableHead align="right">MIN</TableHead><TableHead align="right">USG</TableHead>
      <TableHead align="right">rTS</TableHead><TableHead align="right">Role</TableHead><TableHead align="right">zTS</TableHead><TableHead>Status</TableHead>
    </TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.season} data-season={row.season}>
      <TableCell>{row.season}</TableCell>
      <TableCell>{row.teams.map(t => <span key={t.team_id}>{t.tricode && <TeamLogo team={t.tricode} season={row.season} size={16} />} {t.tricode ?? t.team_id} </span>)}</TableCell>
      <TableCell numeric>{formatWhole(row.minutes)}</TableCell>
      <TableCell numeric>{formatNumber(row.scoring_usage)}</TableCell>
      <Signed v={row.rts} label="rts" /><Signed v={row.difficulty} label="difficulty" /><Signed v={row.zts} label="zts" />
      <TableCell>{row.zts_status === "known" ? "Served" : `Unknown: ${row.reason}`}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}

function PlayerTab({ summary }: { summary: ZtsSummary }) {
  const { get, set } = useUrlState();
  const playerId = get("player");
  const season = get("playerSeason") ?? LATEST;
  const { data, error, loading, retry } = useFeed([playerId, season], signal => getPlayerZts(playerId, season, signal));
  const team = data?.status === "available" ? data.teams[0]?.tricode ?? null : null;
  return <Section title="Player" description="Built without a Databallr reference for this tab (it was not in the supplied page); it reuses the About tab's play-type mix and season history.">
    <div>
      <Field label="Season" layout="inline"><Select aria-label="Player season" value={data?.season ?? season}
        onChange={event => set({ playerSeason: event.target.value, player: data?.player_id ?? playerId })}>
        {[...summary.seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
      <EntityField label="Player" value={data?.player_id ?? playerId ?? ""} season={data?.season ?? season} phase="regular_season"
        initialName={data?.player_name} onChange={next => set({ player: next || null, playerSeason: data?.season ?? season })} />
    </div>
    {error && <FeedFailure error={error} retry={retry} what="The player's zTS" />}
    {loading && <FeedSkeleton label="Loading the player's zTS" />}
    {data && <>
      <PlayerIdentity playerId={data.player_id} name={data.player_name} team={team} era={seasonEra(data.season, team)} size="md"
        href={`/players/${data.player_id}?season=${data.season}`} subtitle={`${data.season} regular season`} />
      {data.selection_rule && <p>{data.selection_rule}</p>}
      {data.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
      {data.status === "available" && <>
        {data.zts_status !== "known" && <GatedNote>No zTS for {data.season}: {data.reason}</GatedNote>}
        <div className="ui-findings" data-player-tiles="true">
          <StatTile label="Scoring usage" value={formatNumber(data.scoring_usage)} footnote={`${formatWhole(data.minutes)} minutes`} />
          <StatTile label="rTS" value={formatPoints(data.rts)} footnote={`${formatWhole(data.tsa)} TSA`} />
          <StatTile label="Role (difficulty)" value={formatPoints(data.difficulty)} footnote={`Expected TS ${formatTs(data.expected_ts)} vs league ${formatTs(data.league_ts)}`} />
          <StatTile label="zTS" value={formatPoints(data.zts)} footnote={`zTS add ${formatSigned(data.zts_add)} per 100`} />
          <StatTile label="Play types covered" value={formatShare(data.coverage)} footnote={`${formatWhole(data.listed_possessions)} of ${formatWhole(data.implied_possessions)} possessions`} />
        </div>
        {data.play_types.length > 0 && <PlayerTypes data={data} />}
      </>}
      <h3>Playtype difficulty by season</h3>
      <History rows={data.history} />
    </>}
  </Section>;
}

// ---- Page --------------------------------------------------------------------------------------

export function ZtsResearch() {
  const { get, set } = useUrlState();
  const tab = (get("tab") ?? "about") as Tab;
  const { data, error, loading, retry } = useFeed([], signal => getZts(signal));
  const test = data?.validation;
  return <PageShell template="research">
    <PageHeader icon="scale" title="zTS" subtitle="Relative true shooting adjusted for the difficulty of a player's play-type mix." />
    <Segmented label="zTS view" value={tab} onChange={next => set({ tab: next === "about" ? null : next })} options={TABS} />
    {error && <FeedFailure error={error} retry={retry} what="zTS" />}
    {loading && <FeedSkeleton label="Loading zTS" />}
    {data && test && <ResearchLayout findings={<>
      <StatTile label="Tracks oTS RAPM: zTS − rTS in r" value={formatSigned(test.tracking.test.pooled.metrics.delta_r.value, 3)}
        footnote={`95% ${formatSigned(test.tracking.test.pooled.metrics.delta_r.low, 3)} to ${formatSigned(test.tracking.test.pooled.metrics.delta_r.high, 3)}; ${VERDICT_LABELS[test.tracking.test.pooled.verdict_r]}`} />
      <StatTile label="Predicts next rTS: zTS − rTS in r" value={formatSigned(test.predictive.test.pooled.metrics.delta_r.value, 3)}
        footnote={`95% ${formatSigned(test.predictive.test.pooled.metrics.delta_r.low, 3)} to ${formatSigned(test.predictive.test.pooled.metrics.delta_r.high, 3)}; ${VERDICT_LABELS[test.predictive.test.pooled.verdict_r]}`} />
      <StatTile label="Served player-seasons" value={Object.values(data.coverage).reduce((sum, c) => sum + (c.status.known ?? 0), 0).toLocaleString("en-US")}
        footnote={`${data.seasons[0]} to ${data.seasons.at(-1)}, regular season`} />
    </>}>
      {tab === "about" && <About summary={data} />}
      {tab === "top" && <TopSeasons summary={data} />}
      {tab === "player" && <PlayerTab summary={data} />}
    </ResearchLayout>}
  </PageShell>;
}
