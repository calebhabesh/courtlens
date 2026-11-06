"use client";

import { ChartData, ChartFrame } from "./charts/chart-frame";
import { toneColor } from "./charts/semantics";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { Segmented, Select } from "./ui/kit";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader, Section } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  BAND_LABELS, CAREER_ERA_LABELS, COMBINE_LABELS, COMBINE_UNITS, ERA_LABELS, MEASURE_LABELS, ROOKIE_STATS, STAT_LABELS,
  fixed, getDraftClass, getDraftCombine, getDraftSummary, getRookie, getRookies, intervalTone, percent, rangeText, rookieTone,
  seasonLabel, signed, statText, whole,
  type DraftClass, type DraftSummary, type Era, type Measure, type PickRow, type Rookie, type SlotSummary
} from "@/lib/draft-classes";
import { seasonEra } from "@/lib/portrait-source";
import { teamArtwork } from "@/lib/team-era";

/**
 * Research → Tools → Draft Classes (R09). A plain build-phase page: the 2026-27 rookie tracker,
 * value by pick, class retrospectives with redrafts, steals and misses, and combine measurements
 * beside value. Every number is the frozen courtlens-draft-value-v1 results' or the rookie
 * tracker's; exact values sit on `data-value`.
 */

const TABS = [
  { value: "rookies", label: "Rookies 2026-27", icon: "users" },
  { value: "value", label: "Value by pick", icon: "chart-column" },
  { value: "classes", label: "Classes", icon: "list-ordered" },
  { value: "steals", label: "Steals & misses", icon: "trophy" },
  { value: "combine", label: "Combine", icon: "ruler" },
] as const;
type Tab = (typeof TABS)[number]["value"];
type Span = "window" | "career" | "rapm";
const SPANS = [
  { value: "window", label: "First 4 seasons" },
  { value: "career", label: "Career" },
  { value: "rapm", label: "RAPM" },
] as const;
const ERAS = [
  { value: "all", label: "All" },
  { value: "multi_round", label: "1966–88" },
  { value: "two_round", label: "1989 on" },
] as const;
const MEASURES = [{ value: "ws", label: "Win shares" }, { value: "min", label: "Minutes" }] as const;
const LATEST_CLASS = 2022;
const ACCENT = toneColor("identity-a");

function TeamCell({ team, season }: { team: string | null; season: string }) {
  if (!team) return <TableCell>—</TableCell>;
  const code = teamArtwork(team, season)?.tricode ?? team;
  return <TableCell data-field="team" data-value={team}><TeamLogo team={team} season={season} size={16} /> {code}</TableCell>;
}

function PlayerCell({ row, season, team }: { row: { player_id: string | null; name: string }; season: string; team: string | null }) {
  return <TableCell data-field="player" data-value={row.player_id ?? row.name}>
    <PlayerIdentity playerId={row.player_id ?? undefined} name={row.name} team={team} size="sm" era={seasonEra(season, team)}
      href={row.player_id ? `/players/${row.player_id}?season=${season}` : undefined} />
  </TableCell>;
}

function NumCell({ field, value, text, tone, title }: { field: string; value: number | null | undefined; text: string; tone?: "positive" | "negative"; title?: string }) {
  return <TableCell numeric tone={tone} data-field={field} data-value={value ?? ""} title={title}>{text}</TableCell>;
}

// ---- Rookies ----------------------------------------------------------------------------------

function RookieDetailSection({ rookie }: { rookie: Rookie }) {
  const { data, error, loading, retry } = useFeed([rookie.player_id], signal => getRookie(rookie.player_id!, signal));
  const games = rookie.comparison?.line.games ?? 0;
  return <Section title={`${rookie.name} against past number ${rookie.pick} picks`}
    description={`Every player taken at pick ${rookie.pick} from 1983 to 2025, over his first ${games} appearances of his first NBA season (or all of them if he played fewer). Sorted by points per 36 minutes.`}>
    {error && <FeedFailure error={error} retry={retry} what="The comparison" />}
    {loading && <FeedSkeleton label="Loading the comparison" />}
    {data && (data.comparisons.length === 0 ? <GatedNote>No past rookie at this pick has logged games.</GatedNote> :
      <Table aria-label={`Past number ${rookie.pick} picks at ${games} games`} density="compact" data-table="rookie-comparisons">
        <TableHeader><TableRow hoverable={false}>
          <TableHead>Player</TableHead><TableHead align="right">Class</TableHead><TableHead align="right">G</TableHead>
          {ROOKIE_STATS.map(s => <TableHead key={s} align="right">{STAT_LABELS[s]}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          <TableRow data-row={rookie.player_id ?? ""} data-current="true">
            <PlayerCell row={rookie} season={rookie.photo_season} team={rookie.team} />
            <NumCell field="year" value={2026} text="2026" />
            <NumCell field="games" value={rookie.comparison?.line.games} text={String(rookie.comparison?.line.games ?? "—")} />
            {ROOKIE_STATS.map(s => <NumCell key={s} field={s} value={rookie.comparison?.line[s]} text={statText(s, rookie.comparison?.line[s])} />)}
          </TableRow>
          {data.comparisons.map(c => <TableRow key={c.player_id} data-row={c.player_id}>
            <PlayerCell row={c} season={c.photo_season} team={c.photo_team} />
            <NumCell field="year" value={c.year} text={String(c.year)} title={`First season ${c.first_season}, ${c.first_season_games} games logged`} />
            <NumCell field="games" value={c.games} text={String(c.games)} />
            {ROOKIE_STATS.map(s => <NumCell key={s} field={s} value={c[s]} text={statText(s, c[s])} />)}
          </TableRow>)}
        </TableBody>
      </Table>)}
  </Section>;
}

function RookiesTab() {
  const { get, set } = useUrlState();
  const { data, error, loading, retry } = useFeed([], signal => getRookies(signal));
  if (error) return <FeedFailure error={error} retry={retry} what="The rookie tracker" />;
  if (loading || !data) return <FeedSkeleton label="Loading the rookie tracker" />;
  if (data.state !== "ok") return <GatedNote>{data.state === "no_games" ? "No 2026-27 regular-season game is in the published data yet." : "The past-rookie comparison table is not on this server."}</GatedNote>;
  const chosen = data.rookies.find(r => r.player_id === get("rookie")) ?? data.rookies.find(r => r.state === "compared") ?? null;
  const compared = data.rookies.filter(r => r.state === "compared").length;
  return <>
    <Section title={`The ${data.class} draft class in ${data.season}`}
      description={`Games through ${data.comparison_date}. Each rookie is compared with every past pick at his slot (1983 to 2025) over the same number of first-season games. Below each figure: his percentile among them. Green or red: outside their 10th to 90th percentile (turnovers reversed). * under 100 minutes.`}>
      <p data-field="rookie-dates">
        <span data-field="compared" data-value={compared}>{compared} of {data.rookies.length}</span> picks have played.
        DARKO {data.darko ? <>through games of {data.darko.data_date}</> : "unavailable"};
        RAPM {data.rapm ? <>time-decay, games through {data.rapm.latest_game_date}</> : "unavailable"}.
        Ratings are shown, not compared: past rookies have none at the same point.
      </p>
      <Table aria-label="2026-27 rookies" density="compact" data-table="rookies">
        <TableHeader><TableRow hoverable={false}>
          <TableHead align="right">Pick</TableHead><TableHead>Player</TableHead><TableHead>Drafted by</TableHead>
          <TableHead align="right">G</TableHead>
          {ROOKIE_STATS.map(s => <TableHead key={s} align="right">{STAT_LABELS[s]}</TableHead>)}
          <TableHead align="right">DARKO DPM</TableHead><TableHead align="right">RAPM</TableHead><TableHead align="right">Past rookies</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.rookies.map(r => <TableRow key={r.pick} data-row={r.player_id ?? String(r.pick)} data-pick={r.pick}
          onClick={r.state === "compared" ? () => set({ rookie: r.player_id }) : undefined} aria-selected={chosen?.pick === r.pick}>
          <NumCell field="pick" value={r.pick} text={String(r.pick)} />
          <PlayerCell row={r} season={r.photo_season} team={r.team ?? r.draft_team} />
          <TeamCell team={r.draft_team} season={seasonLabel(data.class)} />
          {r.comparison ? <>
            <NumCell field="games" value={r.comparison.line.games} text={`${r.comparison.line.games}${r.comparison.small_sample ? "*" : ""}`}
              title={r.comparison.small_sample ? `Under 100 minutes (${fixed(r.comparison.line.minutes, 0)})` : undefined} />
            {ROOKIE_STATS.map(s => {
              const c = r.comparison!.stats[s];
              return <TableCell key={s} numeric tone={rookieTone(s, c)} data-field={s} data-value={c.value ?? ""} data-percentile={c.percentile ?? ""}
                title={`Past rookies (${c.n}): median ${statText(s, c.median)}, 10th to 90th ${statText(s, c.p10)} to ${statText(s, c.p90)}`}>
                {statText(s, c.value)}<br /><small>{c.percentile === null ? "—" : `p${Math.round(c.percentile)}`}</small>
              </TableCell>;
            })}
          </> : <TableCell colSpan={ROOKIE_STATS.length + 1} data-field="state" data-value="no_games">No games yet</TableCell>}
          <NumCell field="darko" value={r.darko?.dpm} text={signed(r.darko?.dpm)} title={r.darko ? `O ${signed(r.darko.o_dpm)}, D ${signed(r.darko.d_dpm)}` : "Not on DARKO's board"} />
          <NumCell field="rapm" value={r.rapm?.rapm} text={signed(r.rapm?.rapm)} title={r.rapm ? `${whole((r.rapm.decayed_seconds ?? 0) / 60)} decayed minutes` : "No minutes before the snapshot"} />
          <NumCell field="pool" value={r.pool} text={String(r.pool)} />
        </TableRow>)}</TableBody>
      </Table>
      <Field label="Compare" layout="inline">
        <Select aria-label="Rookie to compare" value={chosen?.player_id ?? ""} onChange={event => set({ rookie: event.target.value || null })}>
          {data.rookies.filter(r => r.state === "compared").map(r => <option key={r.pick} value={r.player_id!}>{r.pick}. {r.name}</option>)}
        </Select>
      </Field>
    </Section>
    {chosen && <RookieDetailSection key={chosen.player_id} rookie={chosen} />}
  </>;
}

// ---- Value by pick ----------------------------------------------------------------------------

function SlotChart({ rows, label }: { rows: SlotSummary[]; label: string }) {
  const known = rows.filter(r => r.mean !== null && r.lo !== null && r.hi !== null);
  const low = Math.min(0, ...known.map(r => r.lo!)), high = Math.max(...known.map(r => r.hi!));
  const left = 52, right = 628, top = 16, bottom = 260;
  const x = (slot: number) => left + ((slot - 0.5) / 60) * (right - left);
  const y = (v: number) => bottom - ((v - low) / (high - low || 1)) * (bottom - top);
  const step = niceStep((high - low) / 5);
  const ticks = Array.from({ length: Math.floor((high - Math.ceil(low / step) * step) / step) + 1 }, (_, i) => Math.ceil(low / step) * step + i * step);
  return <svg className="chart-graphic chart-reliability" viewBox="0 0 640 290" role="img" aria-label={`${label} by draft slot, with 95% intervals`}>
    {ticks.map(t => <g key={t}>
      <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="var(--color-hairline-strong)" />
      <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end">{step >= 100 ? whole(t) : fixed(t, step < 1 ? 1 : 0)}</text>
    </g>)}
    {[1, 10, 20, 30, 40, 50, 60].map(s => <text key={s} x={x(s)} y={bottom + 20} textAnchor="middle">{s}</text>)}
    <g stroke={ACCENT} fill={ACCENT}>
      {known.map(r => <g key={r.slot}>
        <line x1={x(r.slot)} x2={x(r.slot)} y1={y(r.lo!)} y2={y(r.hi!)} strokeWidth="1.5" />
        <circle cx={x(r.slot)} cy={y(r.mean!)} r="3" data-slot={r.slot} data-value={r.mean!} data-low={r.lo!} data-high={r.hi!}>
          <title>{`Pick ${r.slot}: ${fixed(r.mean)} (95% ${rangeText(r.lo, r.hi)}), ${r.n} picks`}</title>
        </circle>
      </g>)}
    </g>
  </svg>;
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function ValueTab({ summary }: { summary: DraftSummary }) {
  const { get, set } = useUrlState();
  const span = (get("span") ?? "window") as Span;
  const era = (get("era") ?? "all") as Era;
  const measure = (get("measure") ?? "ws") as Measure;
  const rows = span === "rapm" ? summary.value_by_pick.rapm : summary.value_by_pick[span][era][measure];
  const unit = span === "rapm" ? "RAPM, points per 100 possessions" : `${MEASURE_LABELS[measure]}${span === "window" ? ", first four seasons" : ", career to date"}`;
  const classes = span === "rapm" ? "2014–22" : span === "career" ? CAREER_ERA_LABELS[era].replace("All", "1966–2005") : ERA_LABELS[era].replace("All", "1966–2022");
  const digits = measure === "min" && span !== "rapm" ? 0 : span === "rapm" ? 2 : 1;
  const num = (v: number | null | undefined) => digits === 0 ? whole(v) : fixed(v, digits);
  const bands = summary.bands.filter(b => b.era === era && b.measure === measure);
  return <>
    <Section title="What each draft slot has returned"
      description="Mean value of every pick at each slot, with a 95% interval from resampling that slot's players. A pick who never played in the NBA counts as zero (a complete league table records his absence). Career uses classes 1966 to 2005; RAPM classes 2014 to 2022; 2023 to 2025 are too recent."
      actions={<>
        <Segmented label="Value" size="sm" value={span} onChange={next => set({ span: next === "window" ? null : next })} options={SPANS} />
        {span !== "rapm" && <Segmented label="Classes" size="sm" value={era} onChange={next => set({ era: next === "all" ? null : next })} options={ERAS} />}
        {span !== "rapm" && <Segmented label="Measure" size="sm" value={measure} onChange={next => set({ measure: next === "ws" ? null : next })} options={MEASURES} />}
      </>}>
      <ChartFrame title={`${unit} by pick`} source="Frozen courtlens-draft-value-v1 results; full-history season totals"
        sample={`Draft classes ${classes}; picks 1 to 60`} state={rows.some(r => r.mean !== null) ? "ready" : "empty"}>
        <ChartData fingerprint={`${span}-${era}-${measure}`}><SlotChart rows={rows} label={unit} /></ChartData>
      </ChartFrame>
      <Table aria-label={`${unit} by pick`} density="compact" data-table="value-by-pick" data-span={span} data-era={era} data-measure={measure}>
        <TableHeader><TableRow hoverable={false}>
          <TableHead align="right">Pick</TableHead><TableHead align="right">Picks</TableHead><TableHead align="right">Mean, 95%</TableHead>
          <TableHead align="right">Median</TableHead>
          {span !== "rapm" && <TableHead align="right">90th pct</TableHead>}
          {span !== "rapm" && <TableHead align="right">Played</TableHead>}
          {span === "career" && <TableHead align="right">Still active</TableHead>}
          {span === "rapm" && <TableHead align="right">No RAPM</TableHead>}
        </TableRow></TableHeader>
        <TableBody>{rows.map(r => <TableRow key={r.slot} data-row={r.slot}>
          <NumCell field="slot" value={r.slot} text={String(r.slot)} />
          <NumCell field="n" value={r.n} text={String(r.n)} />
          <TableCell numeric data-field="mean" data-value={r.mean ?? ""} data-low={r.lo ?? ""} data-high={r.hi ?? ""}>{num(r.mean)}<br /><small>{digits === 0 ? `${whole(r.lo)} to ${whole(r.hi)}` : rangeText(r.lo, r.hi, digits)}</small></TableCell>
          <NumCell field="median" value={r.median} text={num(r.median)} />
          {span !== "rapm" && <NumCell field="p90" value={r.p90} text={num(r.p90)} />}
          {span !== "rapm" && <NumCell field="played" value={r.played_share} text={percent(r.played_share)} />}
          {span === "career" && <NumCell field="active" value={r.active} text={String(r.active ?? 0)} />}
          {span === "rapm" && <NumCell field="no_rapm" value={r.no_rapm} text={String(r.no_rapm ?? 0)} />}
        </TableRow>)}</TableBody>
      </Table>
    </Section>
    {span === "window" && <Section title="Is one range of picks worth more than another?"
      description="Mean first-four-season value of the first range minus the second, with a 95% interval from resampling players within each range. Called higher only when the whole interval is above zero.">
      <Table aria-label="Slot range differences" density="compact" data-table="bands">
        <TableHeader><TableRow hoverable={false}>
          <TableHead>Ranges</TableHead><TableHead align="right">First, mean</TableHead><TableHead align="right">Second, mean</TableHead>
          <TableHead align="right">Difference, 95%</TableHead><TableHead>Verdict</TableHead>
        </TableRow></TableHeader>
        <TableBody>{bands.map(b => <TableRow key={b.band} data-row={b.band}>
          <TableCell>{BAND_LABELS[b.band] ?? b.band}</TableCell>
          <NumCell field="mean_a" value={b.mean_a} text={num(b.mean_a)} title={`${b.n_a} picks`} />
          <NumCell field="mean_b" value={b.mean_b} text={num(b.mean_b)} title={`${b.n_b} picks`} />
          <TableCell numeric tone={intervalTone(b.lo, b.hi)} data-field="diff" data-value={b.diff} data-low={b.lo} data-high={b.hi}>
            {signed(b.diff, digits)}<br /><small>{digits === 0 ? `${whole(b.lo)} to ${whole(b.hi)}` : rangeText(b.lo, b.hi, digits)}</small></TableCell>
          <TableCell data-field="verdict" data-value={b.verdict}>{b.verdict === "higher" ? "First range higher" : b.verdict === "lower" ? "First range lower" : "No measurable difference"}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </Section>}
  </>;
}

// ---- Classes ----------------------------------------------------------------------------------

function ClassTable({ data, order }: { data: DraftClass; order: "draft" | "redraft" | "career" }) {
  const complete = data.status === "complete";
  const season = seasonLabel(data.year);
  const rows = [...data.rows].sort((a, b) => order === "draft" ? a.pick - b.pick
    : order === "redraft" ? (a.redraft_window ?? 1e9) - (b.redraft_window ?? 1e9) : (a.redraft_career ?? 1e9) - (b.redraft_career ?? 1e9));
  const rapm = data.year >= 2014 && data.year <= LATEST_CLASS;
  const steals = new Set(data.steals), misses = new Set(data.misses);
  return <Table aria-label={`${data.year} draft class`} density="compact" data-table="class" data-year={data.year} data-order={order}>
    <TableHeader><TableRow hoverable={false}>
      {complete && order !== "draft" && <TableHead align="right">{order === "redraft" ? "Redraft" : "Career rank"}</TableHead>}
      <TableHead align="right">Pick</TableHead><TableHead align="right">Rd</TableHead><TableHead>Player</TableHead><TableHead>Team</TableHead><TableHead>From</TableHead>
      <TableHead align="right">{complete ? "WS, 4 seasons" : "WS to date"}</TableHead><TableHead align="right">{complete ? "Min, 4 seasons" : "Min to date"}</TableHead>
      {complete && <TableHead align="right">Career WS</TableHead>}
      {rapm && <TableHead align="right">RAPM</TableHead>}
      {complete && <TableHead align="right">Expected WS</TableHead>}
      {complete && <TableHead align="right">Surplus</TableHead>}
      {complete && order === "draft" && <TableHead align="right">Redraft</TableHead>}
    </TableRow></TableHeader>
    <TableBody>{rows.map(r => {
      const rank = order === "career" ? r.redraft_career : r.redraft_window;
      const tag = steals.has(r.pick) ? "Steal" : misses.has(r.pick) ? "Miss" : null;
      return <TableRow key={r.pick} data-row={r.pick} data-tag={tag ?? ""}>
        {complete && order !== "draft" && <NumCell field="rank" value={rank} text={String(rank ?? "—")} />}
        <NumCell field="pick" value={r.pick} text={String(r.pick)} />
        <NumCell field="round" value={r.round} text={String(r.round ?? "—")} />
        <PlayerCell row={r} season={r.photo_season} team={r.photo_team} />
        <TeamCell team={r.team} season={season} />
        <TableCell data-field="organization">{r.organization ?? "—"}{tag && <><br /><small data-field="tag">{tag}</small></>}</TableCell>
        <NumCell field="window_ws" value={complete ? r.window_ws : r.career_ws} text={fixed(complete ? r.window_ws : r.career_ws)} />
        <NumCell field="window_min" value={complete ? r.window_min : r.career_min} text={whole(complete ? r.window_min : r.career_min)} />
        {complete && <NumCell field="career_ws" value={r.career_ws} text={fixed(r.career_ws)} title={r.active ? "Still active in 2025-26: to date" : `${r.career_seasons} seasons`} />}
        {rapm && <NumCell field="rapm" value={r.window_rapm} text={signed(r.window_rapm, 2)} title={r.window_rapm === null ? "No RAPM in the window" : `${whole((r.window_rapm_seconds ?? 0) / 60)} minutes`} />}
        {complete && <NumCell field="expected" value={r.expected_window_ws} text={fixed(r.expected_window_ws)} />}
        {complete && <NumCell field="surplus" value={r.surplus_window_ws} text={signed(r.surplus_window_ws)}
          tone={r.surplus_window_ws === null ? undefined : tag === "Steal" ? "positive" : tag === "Miss" ? "negative" : undefined} />}
        {complete && order === "draft" && <NumCell field="rank" value={r.redraft_window} text={String(r.redraft_window ?? "—")} />}
      </TableRow>;
    })}</TableBody>
  </Table>;
}

function ClassesTab({ summary }: { summary: DraftSummary }) {
  const { get, set } = useUrlState();
  const years = summary.classes.map(c => c.year);
  const requested = Number(get("year"));
  const year = years.includes(requested) ? requested : LATEST_CLASS;
  const order = (get("order") ?? "draft") as "draft" | "redraft" | "career";
  const { data, error, loading, retry } = useFeed([String(year)], signal => getDraftClass(year, signal));
  const status = data?.status;
  return <Section title={`${year} NBA draft`}
    description={status === "complete" ? `Redraft ranks every pick by win shares over the first four seasons (ties by minutes, then the original pick); the career rank uses career win shares to date. Expected is the mean at the same slot in the same era from every other class; surplus is the difference. The ten largest surpluses are steals; the ten most negative first-round surpluses are misses.`
      : status === "censored" ? `Only ${data?.seasons_elapsed} of four seasons have been played, so this class shows value to date and is not redrafted or scored.`
        : status === "rookies" ? "The 2026 class plays its first season now: see the Rookies tab." : undefined}
    actions={<>
      <Field label="Class" layout="inline"><Select aria-label="Draft class" value={String(year)} onChange={event => set({ year: event.target.value === String(LATEST_CLASS) ? null : event.target.value })}>
        {[...years].reverse().map(y => <option key={y} value={y}>{y}</option>)}
      </Select></Field>
      {status === "complete" && <Segmented label="Order" size="sm" value={order} onChange={next => set({ order: next === "draft" ? null : next })}
        options={[{ value: "draft", label: "Draft order" }, { value: "redraft", label: "Redraft" }, { value: "career", label: "Career" }]} />}
    </>}>
    {error && <FeedFailure error={error} retry={retry} what="The draft class" />}
    {loading && <FeedSkeleton label="Loading the draft class" />}
    {data && <>
      <p data-field="class-source">{data.picks} picks; {data.played} played an NBA regular-season game{data.status === "complete" && data.active ? `; ${data.active} still active in 2025-26` : ""}. List: {data.source.name}{data.source.license ? ` (${data.source.license})` : ""}.</p>
      <ClassTable data={data} order={data.status === "complete" ? order : "draft"} />
    </>}
  </Section>;
}

// ---- Steals and misses ------------------------------------------------------------------------

function ListTable({ rows, label }: { rows: PickRow[]; label: string }) {
  return <Table aria-label={label} density="compact" data-table={label.toLowerCase().replace(/\s+/g, "-")}>
    <TableHeader><TableRow hoverable={false}>
      <TableHead align="right">Class</TableHead><TableHead align="right">Pick</TableHead><TableHead>Player</TableHead><TableHead>Team</TableHead>
      <TableHead align="right">WS, 4 seasons</TableHead><TableHead align="right">Expected</TableHead><TableHead align="right">Surplus</TableHead>
    </TableRow></TableHeader>
    <TableBody>{rows.map(r => <TableRow key={`${r.year}-${r.pick}`} data-row={`${r.year}-${r.pick}`}>
      <NumCell field="year" value={r.year} text={String(r.year)} />
      <NumCell field="pick" value={r.pick} text={String(r.pick)} />
      <PlayerCell row={r} season={r.photo_season} team={r.photo_team} />
      <TeamCell team={r.team} season={seasonLabel(r.year)} />
      <NumCell field="window_ws" value={r.window_ws} text={fixed(r.window_ws)} />
      <NumCell field="expected" value={r.expected_window_ws} text={fixed(r.expected_window_ws)} />
      <NumCell field="surplus" value={r.surplus_window_ws} text={signed(r.surplus_window_ws)} tone={(r.surplus_window_ws ?? 0) > 0 ? "positive" : "negative"} />
    </TableRow>)}</TableBody>
  </Table>;
}

function StealsTab({ summary }: { summary: DraftSummary }) {
  return <>
    <Section title="Biggest steals, 1966 to 2022" description="Win shares over the first four seasons minus the mean at the same slot in the same era from every other class. Any round.">
      <ListTable rows={summary.steals} label="Steals" />
    </Section>
    <Section title="Biggest misses, 1966 to 2022" description="The most negative surpluses among first-round picks. Surplus measures what a pick returned, not whether the choice was sound: a pick can fall short for reasons nobody controlled.">
      <ListTable rows={summary.misses} label="Misses" />
    </Section>
  </>;
}

// ---- Combine ----------------------------------------------------------------------------------

function CombineTab({ summary }: { summary: DraftSummary }) {
  const { get, set } = useUrlState();
  const measure = get("measure") && COMBINE_LABELS[get("measure")!] ? get("measure")! : "wingspan";
  const { data, error, loading, retry } = useFeed([], signal => getDraftCombine(signal));
  const correlations = summary.combine.correlations;
  const points = (data?.rows ?? []).filter(r => r[measure as keyof typeof r] !== null && r.window_ws !== null)
    .map(r => ({ r, x: r[measure as keyof typeof r] as number, y: r.window_ws! }));
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(0, ...ys), Math.max(...ys)];
  const left = 52, right = 628, top = 16, bottom = 260;
  const px = (v: number) => left + ((v - x0) / (x1 - x0 || 1)) * (right - left);
  const py = (v: number) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);
  const chosen = correlations.find(c => c.measure === measure && c.outcome === "window_ws");
  return <>
    <Section title="Combine measurements beside value"
      description="Pearson correlation between each NBA Draft Combine measurement and the player's value over his first four seasons, for drafted players in classes 2000 to 2022. Descriptive only: no model, no prediction and no adjustment for draft position, which already reflects these measurements.">
      <Table aria-label="Combine correlations" density="compact" data-table="combine-correlations">
        <TableHeader><TableRow hoverable={false}>
          <TableHead>Measurement</TableHead><TableHead align="right">Players</TableHead>
          <TableHead align="right">r with win shares, 95%</TableHead><TableHead align="right">r with minutes, 95%</TableHead>
        </TableRow></TableHeader>
        <TableBody>{Object.keys(COMBINE_LABELS).map(m => {
          const ws = correlations.find(c => c.measure === m && c.outcome === "window_ws");
          const mins = correlations.find(c => c.measure === m && c.outcome === "window_min");
          return <TableRow key={m} data-row={m}>
            <TableCell>{COMBINE_LABELS[m]}</TableCell>
            <NumCell field="n" value={ws?.n} text={String(ws?.n ?? "—")} />
            <TableCell numeric data-field="r_ws" data-value={ws?.r ?? ""} data-low={ws?.lo ?? ""} data-high={ws?.hi ?? ""}>{signed(ws?.r, 2)}<br /><small>{rangeText(ws?.lo, ws?.hi, 2)}</small></TableCell>
            <TableCell numeric data-field="r_min" data-value={mins?.r ?? ""} data-low={mins?.lo ?? ""} data-high={mins?.hi ?? ""}>{signed(mins?.r, 2)}<br /><small>{rangeText(mins?.lo, mins?.hi, 2)}</small></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </Section>
    <Section title={`${COMBINE_LABELS[measure]} and first-four-season win shares`}
      actions={<Field label="Measurement" layout="inline"><Select aria-label="Combine measurement" value={measure} onChange={event => set({ measure: event.target.value === "wingspan" ? null : event.target.value })}>
        {Object.entries(COMBINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select></Field>}>
      {error && <FeedFailure error={error} retry={retry} what="Combine rows" />}
      {loading && <FeedSkeleton label="Loading combine rows" />}
      {data && <ChartFrame title={`${COMBINE_LABELS[measure]} (${COMBINE_UNITS[measure]}) against win shares, first four seasons`}
        source="NBA Draft Combine via hoopR; frozen courtlens-draft-value-v1 results"
        sample={`${points.length} drafted players, classes 2000–22; r ${signed(chosen?.r, 2)} (95% ${rangeText(chosen?.lo, chosen?.hi, 2)})`}
        state={points.length ? "ready" : "empty"}>
        <ChartData fingerprint={measure}>
          <svg className="chart-graphic chart-reliability" viewBox="0 0 640 290" role="img" aria-label={`${COMBINE_LABELS[measure]} against win shares`}>
            <line x1={left} x2={right} y1={py(0)} y2={py(0)} stroke="var(--color-hairline-strong)" />
            <text x={left - 8} y={py(0)} dy="0.35em" textAnchor="end">0</text>
            <text x={left - 8} y={py(y1)} dy="0.35em" textAnchor="end">{fixed(y1, 0)}</text>
            <text x={left} y={bottom + 20} textAnchor="start">{fixed(x0, 1)}</text>
            <text x={right} y={bottom + 20} textAnchor="end">{fixed(x1, 1)}</text>
            <g fill={ACCENT} fillOpacity="0.55">
              {points.map(p => <circle key={`${p.r.year}-${p.r.player_id}`} cx={px(p.x)} cy={py(p.y)} r="2.5" data-player={p.r.player_id} data-x={p.x} data-value={p.y}>
                <title>{`${p.r.name} (${p.r.year}, pick ${p.r.pick}): ${fixed(p.x, 2)} ${COMBINE_UNITS[measure]}, ${fixed(p.y)} WS`}</title>
              </circle>)}
            </g>
          </svg>
        </ChartData>
      </ChartFrame>}
    </Section>
  </>;
}

// ---- Words ------------------------------------------------------------------------------------

function CoverageSection({ summary }: { summary: DraftSummary }) {
  return <Section title="Coverage" description="Every class from 1966 to 2026 has a complete pick list with no gap in pick numbers. Value is read from NBA regular seasons through 2025-26.">
    <Table aria-label="Coverage by class" density="compact" data-table="coverage">
      <TableHeader><TableRow hoverable={false}>
        <TableHead align="right">Class</TableHead><TableHead>Status</TableHead><TableHead align="right">Seasons</TableHead>
        <TableHead align="right">Picks</TableHead><TableHead align="right">Played</TableHead><TableHead align="right">Active 2025-26</TableHead><TableHead>Pick list</TableHead>
      </TableRow></TableHeader>
      <TableBody>{[...summary.classes].reverse().map(c => <TableRow key={c.year} data-row={c.year}>
        <NumCell field="year" value={c.year} text={String(c.year)} />
        <TableCell data-field="status" data-value={c.status}>{c.status === "complete" ? "Complete" : c.status === "censored" ? "Too recent" : "Rookies"}</TableCell>
        <NumCell field="seasons" value={c.seasons_elapsed} text={String(c.seasons_elapsed)} />
        <NumCell field="picks" value={c.picks} text={String(c.picks)} />
        <NumCell field="played" value={c.played} text={String(c.played)} />
        <NumCell field="active" value={c.active} text={String(c.active)} />
        <TableCell>{c.source}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Section>;
}

function NotesSection({ summary }: { summary: DraftSummary }) {
  const r = summary.registration;
  return <>
    <Section title="Caveats"><ul>{summary.caveats.map(c => <li key={c}>{c}</li>)}</ul></Section>
    <Section title="Credits and sources">
      <ul>{summary.credits.map(c => <li key={c}>{c}</li>)}</ul>
      <ul>{summary.sources.map(s => <li key={s.classes.join("-")}>Classes {s.classes[0]}–{s.classes[1]}: {s.name}{s.license ? ` (${s.license})` : ""}. {s.note}</li>)}</ul>
    </Section>
    <Section title="Method and reproducibility">
      <dl>
        <dt>Value</dt><dd>Win shares and minutes in the first four NBA seasons after the draft (the comparable window), career to date, and RAPM weighted by minutes for classes 2014–22. No prospect projection: that model is parked.</dd>
        <dt>Intervals</dt><dd>Seeded bootstrap over the players at each slot or range, {r.parameters.replicates.toLocaleString("en-US")} replicates, 95%. Seed {r.parameters.seed}.</dd>
        <dt>Registration</dt><dd><code>{r.identity}</code> · <code data-field="registration-sha" data-value={r.content_sha256}>{r.content_sha256.slice(0, 16)}</code>, committed {r.registered_on} before any outcome was summarized.</dd>
        <dt>Results</dt><dd><code data-field="results-sha" data-value={r.results_sha256}>{r.results_sha256.slice(0, 16)}</code>. Two runs give the same hash.</dd>
      </dl>
    </Section>
  </>;
}

// ---- Page --------------------------------------------------------------------------------------

export function DraftClassesResearch() {
  const { get, set } = useUrlState();
  const tab = (TABS.some(t => t.value === get("tab")) ? get("tab") : "rookies") as Tab;
  const { data, error, loading, retry } = useFeed([], signal => getDraftSummary(signal));
  const one = data?.value_by_pick.window.all.ws[0];
  const thirty = data?.value_by_pick.window.all.ws[29];
  const complete = data?.classes.filter(c => c.status === "complete").length;
  return <PageShell template="research">
    <PageHeader icon="graduation" title="Draft Classes" subtitle="What every NBA draft slot has returned since 1966, each class redrafted by what its players did, and how this year's rookies compare with past picks at the same spot." />
    <Segmented label="Draft Classes view" value={tab} onChange={next => set({ tab: next === "rookies" ? null : next, measure: null })} options={TABS} />
    {error && <FeedFailure error={error} retry={retry} what="Draft Classes" />}
    {loading && <FeedSkeleton label="Loading Draft Classes" />}
    {data && <ResearchLayout findings={<>
      <StatTile label="Pick 1, first four seasons" value={fixed(one?.mean)} unit="WS" footnote={`95% ${rangeText(one?.lo, one?.hi)}; ${one?.n} classes`} />
      <StatTile label="Pick 30, first four seasons" value={fixed(thirty?.mean)} unit="WS" footnote={`95% ${rangeText(thirty?.lo, thirty?.hi)}; ${thirty?.n} classes`} />
      <StatTile label="Classes redrafted" value={complete ?? 0} footnote="1966 to 2022; 2023–25 too recent" />
      <StatTile label="Picks covered" value={data.classes.reduce((s, c) => s + c.picks, 0).toLocaleString("en-US")} footnote="Every pick, 1966 to 2026" />
    </>}>
      {tab === "rookies" && <RookiesTab />}
      {tab === "value" && <ValueTab summary={data} />}
      {tab === "classes" && <ClassesTab summary={data} />}
      {tab === "steals" && <StealsTab summary={data} />}
      {tab === "combine" && <CombineTab summary={data} />}
      <CoverageSection summary={data} />
      <NotesSection summary={data} />
    </ResearchLayout>}
  </PageShell>;
}
