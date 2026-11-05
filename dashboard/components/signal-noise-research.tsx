"use client";

import { useMemo } from "react";
import { ChartData, ChartFrame } from "./charts/chart-frame";
import { EntityField } from "./entity-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { ButtonLink, Select } from "./ui/kit";
import { PageHeader, Section } from "./ui/panel";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { seasonEra } from "@/lib/portrait-source";
import {
  formatPct, formatSample, getPlayerExample, getSignalNoise, LEVEL_LABELS,
  type Level, type PlayerExample, type Posterior, type SignalNoiseSummary, type StatResult
} from "@/lib/signal-noise";

/**
 * Research → Signal vs Noise (R03). A deliberately plain build-phase page (D13): shared tables,
 * tiles and chart frame only. Every number is the served frozen result; exact values sit on
 * `data-value` so the browser check can compare them with the API.
 */
const STAT_NAMES: Record<string, string> = {
  fg3_pct: "3P%", ft_pct: "FT%", fg2_pct: "2P%", rim_fg_pct: "Rim FG%", ts_pct: "TS%"
};
const EXAMPLE_SEASONS = Array.from({ length: 2026 - 1984 + 1 }, (_, i) => `${1984 + i}-${String((1985 + i) % 100).padStart(2, "0")}`).reverse();

const fixed = (value: number | null | undefined, digits = 3) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
const range = (low: number | null | undefined, high: number | null | undefined, format: (v: number | null | undefined) => string) =>
  low == null || high == null ? "—" : `${format(low)} to ${format(high)}`;
const units = (stat: StatResult) => stat.family === "per_36" ? "minutes" : stat.unit;

function LevelCell({ stat, level }: { stat: StatResult; level: Level | undefined }) {
  if (!level) return <TableCell numeric>—</TableCell>;
  if (level.status === "reached") return <TableCell numeric data-value={level.n ?? ""} data-status={level.status}>
    {formatSample(level.n)} {units(stat)}
  </TableCell>;
  if (level.status === "not_reached") return <TableCell numeric data-value="" data-extrapolated={level.extrapolated ?? ""} data-status={level.status}>
    <strong>Not reached</strong> in observed samples (fitted curve: {formatSample(level.extrapolated)}, not observed)
  </TableCell>;
  return <TableCell numeric data-status={level.status}>{LEVEL_LABELS[level.status]}{level.n != null ? ` (${formatSample(level.n)})` : ""}</TableCell>;
}

function LeagueTable({ stats }: { stats: StatResult[] }) {
  return <Table aria-label="Stabilization points" density="compact">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Stat</TableHead><TableHead>Sample unit</TableHead>
      <TableHead align="right">Player-seasons</TableHead><TableHead align="right">Median season sample</TableHead>
      <TableHead align="right">Reliability 0.5 at</TableHead><TableHead align="right">95% interval</TableHead>
      <TableHead align="right">Reliability 0.7 at</TableHead><TableHead align="right">95% interval</TableHead>
      <TableHead align="right">Largest bin: sample, reliability</TableHead>
    </TableRow></TableHeader>
    <TableBody>{stats.map(stat => {
      const half = stat.levels["0.5"], seventy = stat.levels["0.7"];
      return <TableRow key={stat.key} data-stat={stat.key}>
        <TableCell><strong>{stat.label}</strong></TableCell>
        <TableCell>{units(stat)}</TableCell>
        <TableCell numeric>{stat.eligible_player_seasons.toLocaleString("en-US")}</TableCell>
        <TableCell numeric>{formatSample(stat.median_sample)}</TableCell>
        <LevelCell stat={stat} level={half} />
        <TableCell numeric>{range(half?.interval.low, half?.interval.high, formatSample)}</TableCell>
        <LevelCell stat={stat} level={seventy} />
        <TableCell numeric>{range(seventy?.interval.low, seventy?.interval.high, formatSample)}</TableCell>
        <TableCell numeric>{formatSample(half?.largest_n)}, {fixed(half?.largest_rho)}</TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}

/** Observed bin reliabilities with intervals, the fitted n/(n+M) curve and the 0.5 and 0.7 lines. */
function StabilizationCurve({ stat }: { stat: StatResult }) {
  const bins = stat.bins.filter(bin => bin.reported);
  const m = stat.m?.value ?? null;
  const maxN = Math.max(...bins.map(bin => bin.n), ...(m ? [m * 7 / 3] : [])) * 1.08;
  const x = (n: number) => 64 + (n / maxN) * 384;
  const y = (rho: number) => 232 - Math.max(0, Math.min(1, rho)) * 200;
  const curve = m ? Array.from({ length: 81 }, (_, i) => { const n = (maxN * i) / 80; return `${x(n)},${y(n / (n + m))}`; }).join(" ") : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(maxN * t));
  return <ChartFrame title={`${stat.label}: reliability by sample size`} source="NBA game logs, regular seasons 2014-15 to 2025-26"
    sample={`${stat.eligible_player_seasons.toLocaleString("en-US")} player-seasons in ${bins.length} bins, 500 random splits each`}
    note="Dots: each bin's split-half correlation stepped up to the full sample (Spearman–Brown), with its 95% player-bootstrap interval. Line: the fitted n/(n+M).">
    <ChartData fingerprint={stat.key}>
      <svg className="chart-graphic chart-reliability" viewBox="0 0 480 280" role="img"
        aria-label={`${stat.label} reliability against ${units(stat)}: ${bins.map(bin => `${formatSample(bin.n)} ${fixed(bin.rho, 2)}`).join(", ")}`}>
        {[0, 0.5, 0.7, 1].map(t => <g key={t}>
          <line x1="64" x2="448" y1={y(t)} y2={y(t)} stroke={t === 0.5 || t === 0.7 ? "var(--color-text-secondary)" : "var(--color-hairline-strong)"} strokeDasharray={t === 0.5 || t === 0.7 ? "4 4" : undefined} />
          <text x="56" y={y(t) + 4} textAnchor="end">{t.toFixed(1)}</text>
        </g>)}
        {ticks.map(tick => <text key={tick} x={x(tick)} y="252" textAnchor="middle">{tick.toLocaleString("en-US")}</text>)}
        <text x="256" y="274" textAnchor="middle">Full-season sample ({units(stat)})</text>
        <text transform="translate(16,132) rotate(-90)" textAnchor="middle">Reliability</text>
        {curve && <polyline points={curve} fill="none" stroke="var(--color-identity-b)" strokeWidth="2" />}
        {bins.map(bin => <g key={bin.bin} fill="var(--color-identity-a)" stroke="var(--color-identity-a)">
          <title>{`Bin ${bin.bin}: ${formatSample(bin.n)} ${units(stat)}, reliability ${fixed(bin.rho)} (${range(bin.rho_interval.low, bin.rho_interval.high, v => fixed(v))}), ${Math.round(bin.players_per_split)} players`}</title>
          {bin.rho_interval.low != null && bin.rho_interval.high != null && <line x1={x(bin.n)} x2={x(bin.n)} y1={y(bin.rho_interval.low)} y2={y(bin.rho_interval.high)} strokeWidth="2" />}
          <circle cx={x(bin.n)} cy={y(bin.rho)} r="4" />
        </g>)}
      </svg>
    </ChartData>
  </ChartFrame>;
}

function BinTable({ stat }: { stat: StatResult }) {
  return <Table aria-label={`${stat.label} bins`} density="compact">
    <TableHeader><TableRow hoverable={false}>
      <TableHead align="right">Bin</TableHead><TableHead align="right">Season sample</TableHead>
      <TableHead align="right">Players per split</TableHead><TableHead align="right">Mean full sample</TableHead>
      <TableHead align="right">Split-half r</TableHead><TableHead align="right">SD across splits</TableHead>
      <TableHead align="right">Reliability</TableHead><TableHead align="right">95% interval</TableHead>
    </TableRow></TableHeader>
    <TableBody>{stat.bins.map(bin => <TableRow key={bin.bin} data-bin={bin.bin}>
      <TableCell numeric>{bin.bin}</TableCell>
      <TableCell numeric>{formatSample(bin.sample_low)}–{formatSample(bin.sample_high)}</TableCell>
      <TableCell numeric>{Math.round(bin.players_per_split).toLocaleString("en-US")}{bin.reported ? "" : " (too few, not used)"}</TableCell>
      <TableCell numeric data-value={bin.n}>{formatSample(bin.n)}</TableCell>
      <TableCell numeric data-value={bin.r}>{fixed(bin.r)}</TableCell>
      <TableCell numeric>{fixed(bin.r_split_sd)}</TableCell>
      <TableCell numeric data-value={bin.rho}>{fixed(bin.rho)}</TableCell>
      <TableCell numeric>{range(bin.rho_interval.low, bin.rho_interval.high, v => fixed(v))}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}

function PriorTable({ data, season }: { data: SignalNoiseSummary; season: string }) {
  return <Table aria-label={`Priors for ${season}`} density="compact">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Stat</TableHead><TableHead align="right">Prior mean</TableHead><TableHead align="right">Prior strength α+β</TableHead>
      <TableHead align="right">α</TableHead><TableHead align="right">β</TableHead><TableHead>Seasons read</TableHead><TableHead align="right">Player-seasons</TableHead>
    </TableRow></TableHeader>
    <TableBody>{(["fg3_pct", "ft_pct", "fg2_pct", "rim_fg_pct"] as const).map(stat => {
      const fit = data.priors[stat]?.find(row => row.season === season);
      return <TableRow key={stat} data-stat={stat}>
        <TableCell><strong>{STAT_NAMES[stat]}</strong></TableCell>
        {fit ? <>
          <TableCell numeric data-value={fit.mean}>{formatPct(fit.mean)}</TableCell>
          <TableCell numeric data-value={fit.strength}>{fixed(fit.strength, 1)}</TableCell>
          <TableCell numeric>{fixed(fit.alpha, 2)}</TableCell>
          <TableCell numeric>{fixed(fit.beta, 2)}</TableCell>
          <TableCell>{fit.seasons.join(", ")}</TableCell>
          <TableCell numeric>{fit.player_seasons.toLocaleString("en-US")}</TableCell>
        </> : <TableCell colSpan={6}>Unknown: {stat === "rim_fg_pct" ? "rim attempts start in 2014-15, so rim priors start in 2015-16" : "a prior needs an earlier season of game logs (from 1983-84)"}.</TableCell>}
      </TableRow>;
    })}</TableBody>
  </Table>;
}

function PosteriorCells({ post }: { post: Posterior }) {
  return <>
    <TableCell numeric data-value={post.value ?? ""}>{formatPct(post.value)}</TableCell>
    <TableCell numeric>{range(post.low, post.high, v => formatPct(v))}</TableCell>
  </>;
}

function ExampleTable({ example }: { example: PlayerExample }) {
  const e = example.estimates;
  if (!e) return <GatedNote>No regular-season games for this player in {example.season}: every value is unknown, not zero.</GatedNote>;
  const rows = [
    { key: "fg3_pct", made: e.fg3_pct.makes, tries: e.fg3_pct.attempts, raw: e.fg3_pct.raw, post: e.fg3_pct.shrunk, prior: e.fg3_pct.prior },
    { key: "ft_pct", made: e.ft_pct.makes, tries: e.ft_pct.attempts, raw: e.ft_pct.raw, post: e.ft_pct.shrunk, prior: e.ft_pct.prior },
    { key: "fg2_pct", made: e.fg2_pct.makes, tries: e.fg2_pct.attempts, raw: e.fg2_pct.raw, post: e.fg2_pct.shrunk, prior: e.fg2_pct.prior },
  ];
  return <Table aria-label="Worked example" density="compact">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Stat</TableHead><TableHead align="right">Made / attempts</TableHead><TableHead align="right">Raw</TableHead>
      <TableHead align="right">Shrunk</TableHead><TableHead align="right">95% credible interval</TableHead><TableHead>Arithmetic</TableHead>
    </TableRow></TableHeader>
    <TableBody>
      {rows.map(row => <TableRow key={row.key} data-stat={row.key}>
        <TableCell><strong>{STAT_NAMES[row.key]}</strong></TableCell>
        <TableCell numeric>{row.made} / {row.tries}</TableCell>
        <TableCell numeric data-value={row.raw ?? ""}>{formatPct(row.raw)}</TableCell>
        <PosteriorCells post={row.post} />
        <TableCell>{row.prior.status === "available" ? `(${row.made} + ${fixed(row.prior.alpha, 1)}) / (${row.tries} + ${fixed(row.prior.strength, 1)})` : `Unknown: ${row.prior.reason}`}</TableCell>
      </TableRow>)}
      <TableRow data-stat="ts_pct">
        <TableCell><strong>TS%</strong></TableCell>
        <TableCell numeric>{e.ts_pct.points} pts / {fixed(e.ts_pct.attempts, 1)} TSA</TableCell>
        <TableCell numeric data-value={e.ts_pct.raw ?? ""}>{formatPct(e.ts_pct.raw)}</TableCell>
        <PosteriorCells post={e.ts_pct.shrunk} />
        <TableCell>Composed from shrunk 2P%, 3P% and FT% with this attempt mix</TableCell>
      </TableRow>
      <TableRow data-stat="rim_fg_pct">
        <TableCell><strong>Rim FG%</strong></TableCell>
        {example.rim.status === "available" ? <>
          <TableCell numeric>{example.rim.makes} / {example.rim.attempts}</TableCell>
          <TableCell numeric data-value={example.rim.raw ?? ""}>{formatPct(example.rim.raw)}</TableCell>
          <PosteriorCells post={example.rim.shrunk} />
          <TableCell>{example.rim.prior.status === "available" ? `(${example.rim.makes} + ${fixed(example.rim.prior.alpha, 1)}) / (${example.rim.attempts} + ${fixed(example.rim.prior.strength, 1)})` : ""}</TableCell>
        </> : <TableCell colSpan={5}>Unknown: {example.rim.reason}</TableCell>}
      </TableRow>
    </TableBody>
  </Table>;
}

/** Season-to-date raw and shrunk 3P% after each game. */
function ExamplePath({ example }: { example: PlayerExample }) {
  const points = example.path.filter(point => point.fg3_pct.attempts > 0);
  const values = points.flatMap(point => [point.fg3_pct.raw, point.fg3_pct.shrunk]).filter((v): v is number => v !== null);
  const state = points.length < 2 ? "empty" : "ready";
  const lo = Math.max(0, Math.min(...values, 0.2) - 0.05), hi = Math.min(1, Math.max(...values, 0.5) + 0.05);
  const maxA = Math.max(1, ...points.map(point => point.fg3_pct.attempts));
  const x = (a: number) => 64 + (a / maxA) * 384;
  const y = (v: number) => 232 - ((v - lo) / (hi - lo)) * 200;
  const line = (pick: "raw" | "shrunk") => points.flatMap(point => point.fg3_pct[pick] === null ? [] : [`${x(point.fg3_pct.attempts)},${y(point.fg3_pct[pick] as number)}`]).join(" ");
  return <ChartFrame title={`${example.player_name}: 3P% through the season`} state={state} source="NBA game logs and the season's frozen prior"
    sample={`${example.games} games, ${maxA} three-point attempts`} note="The shrunk line starts at the prior and moves toward the raw rate as attempts add up.">
    <ChartData fingerprint={`${example.player_id}-${example.season}`}>
      <ul className="chart-legend chart-legend-inline">
        <li><span className="chart-key chart-key-a" aria-hidden="true" />Raw 3P%</li>
        <li><span className="chart-key chart-key-b" aria-hidden="true" />Shrunk 3P%</li>
      </ul>
      <svg className="chart-graphic chart-reliability" viewBox="0 0 480 280" role="img" aria-label={`Raw and shrunk 3P% by attempts for ${example.player_name}`}>
        {[lo, (lo + hi) / 2, hi].map(t => <g key={t}>
          <line x1="64" x2="448" y1={y(t)} y2={y(t)} stroke="var(--color-hairline-strong)" />
          <text x="56" y={y(t) + 4} textAnchor="end">{formatPct(t, 0)}</text>
        </g>)}
        {[0, Math.round(maxA / 2), maxA].map(tick => <text key={tick} x={x(tick)} y="252" textAnchor="middle">{tick}</text>)}
        <text x="256" y="274" textAnchor="middle">Season-to-date three-point attempts</text>
        <polyline points={line("raw")} fill="none" stroke="var(--color-identity-a)" strokeWidth="2" />
        <polyline points={line("shrunk")} fill="none" stroke="var(--color-identity-b)" strokeWidth="2" />
      </svg>
    </ChartData>
  </ChartFrame>;
}

function ValidationTable({ data }: { data: SignalNoiseSummary }) {
  const delta = (v: number | null | undefined) => typeof v === "number" ? (v * 10000).toFixed(1) : "—";
  return <Table aria-label="Does shrinking predict next season better?" density="compact">
    <TableHeader><TableRow hoverable={false}>
      <TableHead>Stat</TableHead><TableHead>Attempts this season</TableHead><TableHead align="right">Player pairs</TableHead>
      <TableHead align="right">Error, raw</TableHead><TableHead align="right">Error, prior mean</TableHead><TableHead align="right">Error, shrunk</TableHead>
      <TableHead align="right">Raw minus shrunk, 95%</TableHead>
    </TableRow></TableHeader>
    <TableBody>{(["fg3_pct", "ft_pct", "fg2_pct", "ts_pct", "rim_fg_pct"] as const).flatMap(stat => {
      const block = data.validation[stat];
      if (!block) return [];
      return [{ band: "All", ...block.pooled }, ...block.bands].map((row, index) => <TableRow key={`${stat}-${row.band}`} data-stat={stat} data-band={row.band}>
        <TableCell>{index === 0 ? <strong>{STAT_NAMES[stat]}</strong> : ""}</TableCell>
        <TableCell>{row.band}</TableCell>
        <TableCell numeric>{row.pairs.toLocaleString("en-US")}</TableCell>
        <TableCell numeric>{delta(row.mse?.raw)}</TableCell>
        <TableCell numeric>{delta(row.mse?.prior)}</TableCell>
        <TableCell numeric data-value={row.mse?.shrunk ?? ""}>{delta(row.mse?.shrunk)}</TableCell>
        <TableCell numeric data-value={row.raw_minus_shrunk?.value ?? ""}>{delta(row.raw_minus_shrunk?.value)} ({delta(row.raw_minus_shrunk?.low)} to {delta(row.raw_minus_shrunk?.high)})</TableCell>
      </TableRow>);
    })}</TableBody>
  </Table>;
}

function Example({ season, playerId, onChange }: { season: string; playerId: string | null; onChange: (updates: Record<string, string | null>) => void }) {
  const { data, error, loading, retry } = useFeed([playerId, season], signal => getPlayerExample(playerId, season, signal));
  const team = data?.teams[0] ?? null;
  return <>
    <div>
      <Field label="Season" layout="inline"><Select aria-label="Example season" value={data?.season ?? season}
        onChange={event => onChange({ exampleSeason: event.target.value, player: data?.player_id ?? playerId })}>
        {EXAMPLE_SEASONS.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>
      <EntityField label="Player" value={data?.player_id ?? playerId ?? ""} season={data?.season ?? season} phase="regular_season"
        initialName={data?.player_name} onChange={value => onChange({ player: value || null, exampleSeason: data?.season ?? season })} />
    </div>
    {error && <FeedFailure error={error} retry={retry} what="The worked example" />}
    {loading && <FeedSkeleton label="Loading the worked example" />}
    {data && <>
      <PlayerIdentity playerId={data.player_id} name={data.player_name} team={team} era={seasonEra(data.season, team)} size="md"
        href={`/players/${data.player_id}?season=${data.season}`} subtitle={`${data.season} regular season · ${data.games} games`} />
      {data.selection_rule && <p>{data.selection_rule}</p>}
      <p>Shrinkage adds the prior&apos;s α makes and β misses to the player&apos;s own: shrunk = (makes + α) / (attempts + α + β). A small sample moves a long way toward the league; a large one barely moves. The prior is league-wide, not by position, so a centre&apos;s few threes are pulled toward the league&apos;s shooters.</p>
      <ExampleTable example={data} />
      <ExamplePath example={data} />
    </>}
  </>;
}

export function SignalNoiseResearch() {
  const { get, set } = useUrlState();
  const { data, error, loading, retry } = useFeed([], signal => getSignalNoise(signal));
  const statKey = get("stat") ?? "fg3_pct";
  const priorSeason = get("priorSeason") ?? "2026-27";
  const stats = useMemo(() => data?.stabilization.stats ?? [], [data]);
  const stat = stats.find(entry => entry.key === statKey) ?? stats[0];
  const byKey = useMemo(() => new Map(stats.map(entry => [entry.key, entry])), [stats]);
  const priorSeasons = useMemo(() => [...new Set(Object.values(data?.priors ?? {}).flatMap(rows => rows.map(row => row.season)))].sort().reverse(), [data]);
  const fg3 = byKey.get("fg3_pct"), ft = byKey.get("ft_pct"), ts = byKey.get("ts_pct");
  const v3 = data?.validation.fg3_pct?.pooled;
  return <PageShell template="research">
    <PageHeader icon="waveform" title="Signal vs Noise" subtitle="How big a sample each stat needs, and shooting percentages shrunk toward the league." />
    {error && <FeedFailure error={error} retry={retry} what="Signal vs Noise" />}
    {loading && <FeedSkeleton label="Loading Signal vs Noise" />}
    {data && stat && <ResearchLayout findings={<>
      <StatTile label="3P%: reliability 0.5" value={fg3?.levels["0.5"]?.status === "reached" ? formatSample(fg3.levels["0.5"].n) : "Not reached"}
        footnote={`Largest bin ${fixed(fg3?.levels["0.5"]?.largest_rho, 2)} at ${formatSample(fg3?.levels["0.5"]?.largest_n)} 3PA; fitted curve ${formatSample(fg3?.levels["0.5"]?.extrapolated ?? fg3?.levels["0.5"]?.n)}`} />
      <StatTile label="FT%: reliability 0.5" value={ft?.levels["0.5"]?.n != null ? `${formatSample(ft.levels["0.5"].n)} FTA` : "Not reached"}
        footnote={`95% ${range(ft?.levels["0.5"]?.interval.low, ft?.levels["0.5"]?.interval.high, formatSample)}; 0.7 at ${formatSample(ft?.levels["0.7"]?.n)}`} />
      <StatTile label="TS%: reliability 0.5" value={ts?.levels["0.5"]?.n != null ? `${formatSample(ts.levels["0.5"].n)} TSA` : "Not reached"}
        footnote={`0.7 at ${formatSample(ts?.levels["0.7"]?.n)} TSA`} />
      <StatTile label="Shrunk 3P% vs raw, next season" value={v3?.mse ? `${((1 - v3.mse.shrunk / v3.mse.raw) * 100).toFixed(0)}% lower error` : null}
        footnote={`${v3?.pairs.toLocaleString("en-US") ?? "—"} player pairs, 2015-16 to 2025-26`} />
    </>}>
      <Section title="How many attempts until a stat means something?"
        description={`Each player-season's games (2014-15 to 2025-26, regular season) are split at random into two halves 500 times. The correlation between halves, stepped up with the Spearman–Brown formula, is the stat's reliability: the share of its spread between players that is skill rather than luck. A level counts as reached only where a sample-size bin actually shows it.`}>
        <LeagueTable stats={stats} />
      </Section>

      <Section title="Stabilization curve" actions={<Field label="Stat" layout="inline"><Select aria-label="Stat" value={stat.key}
        onChange={event => set({ stat: event.target.value === "fg3_pct" ? null : event.target.value })}>
        {stats.map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</Select></Field>}
        description={stat.m ? `Fitted M = ${formatSample(stat.m.value)} ${units(stat)} (95% ${range(stat.m.low, stat.m.high, formatSample)}): reliability is n/(n+M), so 0.5 at M and 0.7 at 7M/3.` : undefined}>
        <StabilizationCurve stat={stat} />
        <BinTable stat={stat} />
      </Section>

      <Section title="Shrinkage priors" actions={<Field label="Season" layout="inline"><Select aria-label="Prior season" value={priorSeason}
        onChange={event => set({ priorSeason: event.target.value === "2026-27" ? null : event.target.value })}>
        {priorSeasons.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>}
        description="Beta-binomial empirical Bayes. Each season's prior is fitted by maximum likelihood on the player-season makes and attempts of up to three earlier regular seasons only; never that season or a later one. TS% is not a single proportion, so it is rebuilt from shrunk 2P%, 3P% and FT%. On the Stats page, the Shrunk % button adds these columns beside the raw ones.">
        <PriorTable data={data} season={priorSeason} />
        <p>A prior&apos;s strength α+β acts like that many league-average attempts. It should sit near the stabilization point M, and it does: FT% {fixed(data.priors.ft_pct?.find(row => row.season === "2025-26")?.strength, 1)} against M {formatSample(ft?.m?.value)}, Rim FG% {fixed(data.priors.rim_fg_pct?.find(row => row.season === "2025-26")?.strength, 1)} against {formatSample(byKey.get("rim_fg_pct")?.m?.value)}.</p>
      </Section>

      <Section title="Worked example" actions={<ButtonLink size="sm" variant="text" href="/stats?shrunk=1&viewId=shooting">Shrunk columns in Stats</ButtonLink>}>
        <Example season={get("exampleSeason") ?? "2025-26"} playerId={get("player")} onChange={set} />
      </Section>

      <Section title="Does shrinking help?"
        description="Registered check, no gate: predict each player's raw value next season from this season's raw value, the prior mean, or the shrunk value. Mean squared error weighted by next season's attempts, ×10,000. Target seasons 2015-16 to 2024-25; 200 player-bootstrap replicates for the interval.">
        <ValidationTable data={data} />
      </Section>

      <Section title="Coverage and what is not covered">
        <ul>
          <li>Game logs: regular seasons {data.inputs.game_log_seasons[0]} to {data.inputs.game_log_seasons[1]}; earlier seasons are season totals only. Stabilization uses 2014-15 to 2025-26 ({data.stabilization.player_seasons_split.toLocaleString("en-US")} player-seasons with 10 or more games, {data.stabilization.players.toLocaleString("en-US")} players).</li>
          <li>Rim FG%: NBA shot detail ({data.inputs.shot_detail.source.replace(/@([0-9a-f]{8})[0-9a-f]+/, " at commit $1")}) covers every logged game from 2014-15 to 2025-26. Its field-goal attempts disagree with the box score in {Object.values(data.coverage.rim).reduce((sum, row) => sum + row.player_games_fga_mismatch, 0).toLocaleString("en-US")} of {Object.values(data.coverage.rim).reduce((sum, row) => sum + row.player_games, 0).toLocaleString("en-US")} player-games. There is no 2026-27 shot detail, so 2026-27 rim values are unknown.</li>
          <li>TS%: points equal 2·2PM + 3·3PM + FTM in every player-season ({data.coverage.ts_identity_failures} exceptions).</li>
          {data.not_covered.map(entry => <li key={entry.family}><strong>{entry.family}:</strong> {entry.reason}</li>)}
        </ul>
      </Section>

      <Section title="Method and credit">
        <ul>
          <li>Registration <code>{data.registration.identity}</code> · <code>{data.registration.content_sha256.slice(0, 16)}</code>, committed before any fit. Results <code>{data.results_sha256.slice(0, 16)}</code>; two runs from seed 3003 give the same hash.</li>
          <li>Split-half reliability and the Spearman–Brown prediction formula (Spearman 1910; Brown 1910), as used for stabilization points by Russell Carleton for baseball and Darryl Blackport for the NBA. Beta-binomial empirical Bayes after Efron and Morris (1975) and David Robinson. The numbers here are CourtLens&apos;s own.</li>
          <li>Reliability is relative to the players in each bin, whose true spread differs from bin to bin. Splitting by game keeps each game&apos;s attempts together, which understates reliability slightly against shot-level splits.</li>
          <li>Shrunk values are estimates with intervals, not verdicts: CourtLens ranks no player above another when their intervals overlap.</li>
        </ul>
      </Section>
    </ResearchLayout>}
  </PageShell>;
}

