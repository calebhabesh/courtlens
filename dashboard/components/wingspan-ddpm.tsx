"use client";

import { useState } from "react";
import { ChartData, ChartFrame } from "./charts/chart-frame";
import { toneColor } from "./charts/semantics";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { Button, Select } from "./ui/kit";
import { Section } from "./ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { fixed, rangeText, signed } from "@/lib/draft-classes";
import { seasonEra } from "@/lib/portrait-source";
import {
  EXCLUSION_LABELS, VAR_LABELS, VERDICT_LABELS, feetInches, getNearest, getWingspan,
  type Correlation, type Mean, type WingspanPlayer, type WingspanSummary, type WingspanVar
} from "@/lib/research-r10";
import { teamArtwork } from "@/lib/team-era";

/**
 * Research R10 build-phase data on the Wingspan page: combine measurements beside DARKO's D-DPM
 * (courtlens-wingspan-ddpm-v1). Plain sections only (D13); layout is the design phase's. No cell
 * is green or red: an r is not a good or bad outcome, and a player's D-DPM has no interval here.
 */

const VARS: WingspanVar[] = ["height", "wingspan", "diff", "d_dpm"];
const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const PAGE = 50;
const ACCENT = toneColor("identity-a");
const HIGHLIGHT = toneColor("identity-b");

const varText = (v: WingspanVar, value: number | null | undefined) =>
  v === "d_dpm" ? signed(value, 2) : v === "diff" ? (value === null || value === undefined ? "—" : `${signed(value, 2)}″`) : feetInches(value);
const meanText = (v: WingspanVar | "weight", m: Mean) => v === "weight" ? fixed(m.mean, 1) : v === "d_dpm" ? signed(m.mean, 2) : fixed(m.mean, 2);

function NumCell({ field, value, text, title }: { field: string; value: number | null | undefined; text: string; title?: string }) {
  return <TableCell numeric data-field={field} data-value={value ?? ""} title={title}>{text}</TableCell>;
}

function TeamCell({ team, season }: { team: string | null; season: string | null }) {
  if (!team || !season) return <TableCell data-field="team" data-value="">—</TableCell>;
  const code = teamArtwork(team, season)?.tricode ?? team;
  return <TableCell data-field="team" data-value={team}><TeamLogo team={team} season={season} size={16} /> {code} <small>{season}</small></TableCell>;
}

function PlayerCell({ p }: { p: WingspanPlayer }) {
  return <TableCell data-field="player" data-value={p.player_id}>
    <PlayerIdentity playerId={p.player_id} name={p.name} size="sm" era={seasonEra(p.photo_season, p.photo_team)}
      subtitle={`${p.position_label ?? "—"} · ${p.combine_year} combine`} href={`/players/${p.player_id}`} />
  </TableCell>;
}

function CorrelationRows({ rows, position }: { rows: Correlation[]; position?: string }) {
  return <>{rows.map(c => <TableRow key={`${position ?? "all"}-${c.x}-${c.y}`} data-row={`${position ?? "all"}:${c.x}:${c.y}`}>
    {position && <TableCell data-field="position">{position}</TableCell>}
    <TableCell data-field="pair">{VAR_LABELS[c.x]} · {VAR_LABELS[c.y]}{"controlling_for" in c ? " (height held fixed)" : ""}</TableCell>
    <NumCell field="n" value={c.n} text={c.n.toLocaleString("en-US")} />
    <NumCell field="r" value={c.r} text={signed(c.r, 2)} />
    <TableCell numeric data-field="interval" data-low={c.low ?? ""} data-high={c.high ?? ""}>{rangeText(c.low, c.high, 2)}</TableCell>
    <TableCell data-field="verdict" data-value={c.verdict}>{VERDICT_LABELS[c.verdict]}</TableCell>
  </TableRow>)}</>;
}

function Scatter({ data }: { data: WingspanSummary }) {
  const { get, set } = useUrlState();
  const x = (VARS.includes(get("x") as WingspanVar) ? get("x") : "wingspan") as WingspanVar;
  const y = (VARS.includes(get("y") as WingspanVar) ? get("y") : "d_dpm") as WingspanVar;
  const usesRating = x === "d_dpm" || y === "d_dpm";
  const group = data.players.filter(p => usesRating ? p.in_population : p.measured);
  const points = group.filter(p => p[x] !== null && p[y] !== null).map(p => ({ p, x: p[x]!, y: p[y]! }));
  const c = data.correlations.find(r => (r.x === x && r.y === y) || (r.x === y && r.y === x)) ?? null;
  const bounds = (k: "x" | "y") => { const v = points.map(pt => pt[k]); return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1]; };
  const [x0, x1] = bounds("x"), [y0, y1] = bounds("y");
  const left = 56, right = 624, top = 12, bottom = 262;
  const px = (v: number) => left + (v - x0) / ((x1 - x0) || 1) * (right - left);
  const py = (v: number) => bottom - (v - y0) / ((y1 - y0) || 1) * (bottom - top);
  const selected = get("build");
  return <ChartFrame title={`${VAR_LABELS[y]} against ${VAR_LABELS[x]}`}
    source="NBA Draft Combine via hoopR; DARKO season-end boards; frozen courtlens-wingspan-ddpm-v1 results"
    sample={x === y ? `${points.length} players` : `${points.length.toLocaleString("en-US")} players; r ${signed(c?.r, 2)} (95% ${rangeText(c?.low, c?.high, 2)})`}
    note="Descriptive association, not a prediction or a cause. Each point is one player."
    state={points.length ? "ready" : "empty"}>
    <ChartData fingerprint={`${x}-${y}`}>
      <svg className="chart-graphic chart-reliability" viewBox="0 0 640 300" role="img" aria-label={`${VAR_LABELS[y]} against ${VAR_LABELS[x]}`}>
        <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--color-hairline-strong)" />
        <line x1={left} x2={left} y1={top} y2={bottom} stroke="var(--color-hairline-strong)" />
        <text x={left - 8} y={py(y0)} dy="0.35em" textAnchor="end">{varText(y, y0)}</text>
        <text x={left - 8} y={py(y1)} dy="0.35em" textAnchor="end">{varText(y, y1)}</text>
        <text x={left} y={bottom + 20} textAnchor="start">{varText(x, x0)}</text>
        <text x={right} y={bottom + 20} textAnchor="end">{varText(x, x1)}</text>
        <text x={(left + right) / 2} y={bottom + 34} textAnchor="middle">{VAR_LABELS[x]}</text>
        <g fill={ACCENT} fillOpacity="0.45">
          {points.map(pt => <circle key={pt.p.player_id} cx={px(pt.x)} cy={py(pt.y)} r="2.5" data-player={pt.p.player_id} data-x={pt.x} data-value={pt.y}>
            <title>{`${pt.p.name}: ${varText(x, pt.x)}, ${varText(y, pt.y)}`}</title>
          </circle>)}
        </g>
        {points.filter(pt => pt.p.player_id === selected).map(pt => <circle key="sel" cx={px(pt.x)} cy={py(pt.y)} r="6" fill={HIGHLIGHT} data-selected={pt.p.player_id} />)}
      </svg>
    </ChartData>
    <div>
      <Field label="Across" layout="inline"><Select aria-label="Horizontal axis" value={x} onChange={e => set({ x: e.target.value === "wingspan" ? null : e.target.value })}>
        {VARS.map(v => <option key={v} value={v}>{VAR_LABELS[v]}</option>)}</Select></Field>
      <Field label="Up" layout="inline"><Select aria-label="Vertical axis" value={y} onChange={e => set({ y: e.target.value === "d_dpm" ? null : e.target.value })}>
        {VARS.map(v => <option key={v} value={v}>{VAR_LABELS[v]}</option>)}</Select></Field>
    </div>
  </ChartFrame>;
}

function NearestSection({ data, playerId }: { data: WingspanSummary; playerId: string }) {
  const { data: near, error, loading, retry } = useFeed([playerId], signal => getNearest(playerId, signal));
  const target = data.players.find(p => p.player_id === playerId);
  const scale = data.nearest.scaling;
  return <Section title={`Nearest builds to ${target?.name ?? playerId}`}
    description={`The ${data.nearest.k} measured players closest in barefoot height and wingspan, each standardized by its mean and standard deviation over all ${data.population.measured.toLocaleString("en-US")} measured players (height ${fixed(scale.height?.mean, 2)} ± ${fixed(scale.height?.sd, 2)} in, wingspan ${fixed(scale.wingspan?.mean, 2)} ± ${fixed(scale.wingspan?.sd, 2)} in); Euclidean distance.`}>
    {error && <FeedFailure error={error} retry={retry} what="Nearest builds" />}
    {loading && <FeedSkeleton label="Loading nearest builds" />}
    {near && near.state === "not_measured" && <GatedNote>No barefoot height and wingspan for this player: nearest builds are unknown.</GatedNote>}
    {near && near.state === "ready" && <Table aria-label="Nearest builds" density="compact" data-table="nearest">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Player</TableHead><TableHead>Team</TableHead><TableHead align="right">Height</TableHead><TableHead align="right">Wingspan</TableHead>
        <TableHead align="right">Diff</TableHead><TableHead align="right">Career D-DPM</TableHead><TableHead align="right">Distance</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {target && <TableRow data-row={target.player_id} data-current="true">
          <PlayerCell p={target} /><TeamCell team={target.photo_team} season={target.photo_season} />
          <NumCell field="height" value={target.height} text={feetInches(target.height)} />
          <NumCell field="wingspan" value={target.wingspan} text={feetInches(target.wingspan)} />
          <NumCell field="diff" value={target.diff} text={varText("diff", target.diff)} />
          <NumCell field="d_dpm" value={target.d_dpm} text={signed(target.d_dpm, 2)} />
          <NumCell field="distance" value={0} text="—" />
        </TableRow>}
        {near.neighbours.map(n => <TableRow key={n.player_id} data-row={n.player_id}>
          <PlayerCell p={n} /><TeamCell team={n.photo_team} season={n.photo_season} />
          <NumCell field="height" value={n.height} text={feetInches(n.height)} />
          <NumCell field="wingspan" value={n.wingspan} text={feetInches(n.wingspan)} />
          <NumCell field="diff" value={n.diff} text={varText("diff", n.diff)} />
          <NumCell field="d_dpm" value={n.d_dpm} text={signed(n.d_dpm, 2)} />
          <NumCell field="distance" value={n.distance} text={fixed(n.distance, 3)} />
        </TableRow>)}
      </TableBody>
    </Table>}
  </Section>;
}

function PlayersSection({ data }: { data: WingspanSummary }) {
  const { get, set } = useUrlState();
  const [all, setAll] = useState(false);
  const position = POSITIONS.find(p => p === get("pos")) ?? null;
  const status = get("status") === "active" || get("status") === "inactive" ? get("status") : null;
  const rows = data.players
    .filter(p => p.measured && (!position || p.position === position))
    .filter(p => status === null || (status === "active" ? p.active === true : p.active === false))
    .sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id));
  const shown = all ? rows : rows.slice(0, PAGE);
  const now = data.current.state === "ready" ? `${data.current.season}, games through ${data.current.data_date}` : "unavailable";
  return <Section title="Players"
    description={`Measured combine participants, longest wingspan first. Percentiles (p) rank height, wingspan and diff among all measured players and career D-DPM within the ${data.population.analysis} players in the correlations. Current D-DPM is DARKO's newest board (${now}); active means on that board.`}
    actions={<>
      <Field label="Position" layout="inline"><Select aria-label="Position" value={position ?? ""} onChange={e => set({ pos: e.target.value || null })}>
        <option value="">All positions</option>{POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</Select></Field>
      <Field label="Status" layout="inline"><Select aria-label="Status" value={status ?? ""} onChange={e => set({ status: e.target.value || null })} disabled={data.current.state !== "ready"}>
        <option value="">All players</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
    </>}>
    <p data-field="player-count" data-value={rows.length}>{rows.length.toLocaleString("en-US")} players</p>
    <Table aria-label="Wingspan players" density="compact" data-table="players">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Player</TableHead><TableHead>Team</TableHead><TableHead align="right">Height</TableHead><TableHead align="right">Wingspan</TableHead>
        <TableHead align="right">Diff (W−H)</TableHead><TableHead align="right">Career D-DPM</TableHead><TableHead align="right">Seasons</TableHead>
        <TableHead align="right">D-DPM now</TableHead><TableHead align="right">Builds</TableHead>
      </TableRow></TableHeader>
      <TableBody>{shown.map(p => <TableRow key={p.player_id} data-row={p.player_id} aria-selected={get("build") === p.player_id}>
        <PlayerCell p={p} /><TeamCell team={p.photo_team} season={p.photo_season} />
        {(["height", "wingspan", "diff", "d_dpm"] as const).map(v => <TableCell key={v} numeric data-field={v} data-value={p[v] ?? ""} data-percentile={p.percentiles[v] ?? ""}
          title={v === "d_dpm" && p.d_dpm === null ? (p.exclusion ? EXCLUSION_LABELS[p.exclusion] : undefined) : undefined}>
          {varText(v, p[v])}<br /><small>{p.percentiles[v] === undefined ? "—" : `p${Math.round(p.percentiles[v]!)}`}</small>
        </TableCell>)}
        <NumCell field="seasons" value={p.career_seasons} text={p.career_seasons ? `${p.career_seasons}` : "—"}
          title={p.first_season ? `${p.first_season} to ${p.last_season}, ${Math.round(p.career_minutes).toLocaleString("en-US")} minutes` : undefined} />
        <NumCell field="d_dpm_now" value={p.d_dpm_now} text={signed(p.d_dpm_now, 2)} />
        <TableCell numeric><Button size="sm" onClick={() => set({ build: p.player_id })} aria-label={`Nearest builds to ${p.name}`}>Nearest</Button></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {rows.length > PAGE && <Button size="lg" onClick={() => setAll(!all)}>{all ? `Show the first ${PAGE}` : `Show all ${rows.length.toLocaleString("en-US")}`}</Button>}
  </Section>;
}

function Notes({ data }: { data: WingspanSummary }) {
  const r = data.registration;
  const pop = data.population;
  return <>
    <Section title="Who is counted" description={`${pop.players_with_person_id.toLocaleString("en-US")} combine participants since 2000 with an NBA person ID; ${pop.measured.toLocaleString("en-US")} measured; ${pop.analysis.toLocaleString("en-US")} with a career D-DPM.`}>
      <Table aria-label="Exclusions" density="compact" data-table="exclusions">
        <TableHeader><TableRow hoverable={false}><TableHead>Left out of the D-DPM correlations</TableHead><TableHead align="right">Players</TableHead></TableRow></TableHeader>
        <TableBody>{Object.entries(pop.exclusions).map(([k, n]) => <TableRow key={k} data-row={k}>
          <TableCell>{EXCLUSION_LABELS[k] ?? k}</TableCell><NumCell field="count" value={n} text={n.toLocaleString("en-US")} />
        </TableRow>)}</TableBody>
      </Table>
    </Section>
    <Section title="Caveats"><ul>{data.caveats.map(c => <li key={c}>{c}</li>)}</ul></Section>
    <Section title="Credits and sources">
      <ul>{data.credits.map(c => <li key={c}>{c}</li>)}</ul>
      <ul>{data.sources.map(s => <li key={s.name}>{s.name}: {s.detail}</li>)}</ul>
    </Section>
    <Section title="Method and reproducibility">
      <dl>
        <dt>Career D-DPM</dt><dd>Minutes-weighted mean of DARKO&rsquo;s season-end regular-season D-DPM over seasons with at least {r.parameters.min_season_minutes} minutes, {data.darko_seasons?.[0]} to {data.darko_seasons?.[1]}.</dd>
        <dt>Intervals</dt><dd>Seeded bootstrap over players, {r.parameters.replicates.toLocaleString("en-US")} replicates, 95%. Seed {r.parameters.seed}.</dd>
        <dt>Registration</dt><dd><code>{r.identity}</code> · <code data-field="registration-sha" data-value={r.content_sha256}>{r.content_sha256.slice(0, 16)}</code>, committed {r.registered_on} before any correlation was computed.</dd>
        <dt>Results</dt><dd><code data-field="results-sha" data-value={r.results_sha256}>{r.results_sha256.slice(0, 16)}</code>. Two runs give the same hash.</dd>
      </dl>
    </Section>
  </>;
}

export function WingspanDdpm() {
  const { get } = useUrlState();
  const { data, error, loading, retry } = useFeed([], signal => getWingspan(signal));
  if (error) return <FeedFailure error={error} retry={retry} what="Wingspan and D-DPM" />;
  if (loading || !data) return <FeedSkeleton label="Loading wingspan and D-DPM" />;
  const primary = data.correlations[0];
  const measuredFirst = [...data.players].filter(p => p.measured).sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id))[0];
  const build = data.players.some(p => p.player_id === get("build")) ? get("build")! : measuredFirst?.player_id;
  return <div data-section="wingspan-ddpm">
    <Section title="Wingspan and defense (DARKO D-DPM)"
      description={`Pearson correlation between combine measurements and career D-DPM for the ${data.population.analysis} combine participants since 2000 who played a ${data.registration.parameters.min_season_minutes}-minute season. An association is called positive or negative only when its 95% interval excludes zero. Descriptive: not a prediction, not a cause.`}>
      <p data-field="headline" data-value={primary.r ?? ""}>Wingspan minus height against career D-DPM: r {signed(primary.r, 2)} (95% {rangeText(primary.low, primary.high, 2)}), {primary.n} players. Wingspan with height held fixed: partial r {signed(data.partial.r, 2)} (95% {rangeText(data.partial.low, data.partial.high, 2)}).</p>
      <Table aria-label="Correlations" density="compact" data-table="correlations">
        <TableHeader><TableRow hoverable={false}><TableHead>Pair</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">r</TableHead><TableHead align="right">95% interval</TableHead><TableHead>Verdict</TableHead></TableRow></TableHeader>
        <TableBody><CorrelationRows rows={[...data.correlations, data.partial]} /></TableBody>
      </Table>
      <Table aria-label="Correlations within position" density="compact" data-table="within-position">
        <TableHeader><TableRow hoverable={false}><TableHead>Position</TableHead><TableHead>Pair</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">r</TableHead><TableHead align="right">95% interval</TableHead><TableHead>Verdict</TableHead></TableRow></TableHeader>
        <TableBody>{POSITIONS.map(pos => <CorrelationRows key={pos} position={pos} rows={data.within_position.filter(w => w.position === pos)} />)}</TableBody>
      </Table>
    </Section>
    <Scatter data={data} />
    <Section title="Positional averages" description="Measurements average every measured player at the position (first listed combine position); career D-DPM averages the players in the correlations. Intervals: 95% bootstrap over players.">
      <Table aria-label="Positional averages" density="compact" data-table="positional-averages">
        <TableHeader><TableRow hoverable={false}>
          <TableHead>Position</TableHead><TableHead align="right">Players</TableHead><TableHead align="right">Height (in)</TableHead><TableHead align="right">Wingspan (in)</TableHead>
          <TableHead align="right">Diff (in)</TableHead><TableHead align="right">Weight (lb)</TableHead><TableHead align="right">Rated</TableHead><TableHead align="right">Career D-DPM</TableHead>
        </TableRow></TableHeader>
        <TableBody>{data.positional_averages.map(a => <TableRow key={a.position} data-row={a.position}>
          <TableCell data-field="position">{a.position === "ALL" ? "All" : a.position}</TableCell>
          <NumCell field="measured" value={a.height.n} text={a.height.n.toLocaleString("en-US")} />
          {(["height", "wingspan", "diff", "weight", "d_dpm"] as const).flatMap(v => {
            const cell = <TableCell key={v} numeric data-field={v} data-value={a[v].mean ?? ""} data-low={a[v].low ?? ""} data-high={a[v].high ?? ""} data-n={a[v].n}>
              {meanText(v, a[v])}<br /><small>{rangeText(a[v].low, a[v].high, v === "weight" ? 1 : 2)}</small></TableCell>;
            return v === "d_dpm" ? [<NumCell key="rated" field="rated" value={a.d_dpm.n} text={a.d_dpm.n.toLocaleString("en-US")} />, cell] : [cell];
          })}
        </TableRow>)}</TableBody>
      </Table>
    </Section>
    <PlayersSection data={data} />
    {build && <NearestSection data={data} playerId={build} />}
    <Notes data={data} />
  </div>;
}
