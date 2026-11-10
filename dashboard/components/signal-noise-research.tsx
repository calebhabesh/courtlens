"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { LookupInput } from "./lookup-input";
import {
  Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchLinks, ResearchSection, FormulaLine, type GlossaryGroup,
} from "./research/research-page";
import { niceTicks, SeasonLineChart } from "./research/season-line-chart";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar } from "./ui/identity";
import { Button, IconButton, Segmented, Select } from "./ui/kit";
import { useReducedMotion } from "@/lib/motion";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import { evidenceUrl } from "@/lib/research-facts";
import { signed } from "@/lib/research-values";
import {
  BAND_LABELS, exampleSeasons, formatPct, formatRho, formatSample, getPlayerExample, getSignalNoise, PRIOR_STATS, reached, rmsePoints, sampleText, sampleUnit, sampleWords,
  shrinkingWins, squaredPoints, stripOrder, stripReach, TEST_STATS, whatIf,
  type Bin, type Family, type PlayerExample, type Posterior, type SeasonPrior, type SignalNoiseSummary, type StatResult, type ValidationBlock,
} from "@/lib/signal-noise";
import { getPlayerCareer } from "@/lib/workbench-api";
import { teamAccent } from "@/lib/team-colors";

/**
 * Research → Signal vs Noise (R03, designed in RD13). Every number is the frozen courtlens-signal-noise-v1 run's or the worked example's;
 * exact values sit on `data-*` for the real-data check. A level counts only where a bin of observed players shows it, so a stat that never
 * gets there (3P%) draws no point and no fitted curve: its fitted M is never presented as a stabilization point.
 */

const vars = (props: Record<string, string>) => props as CSSProperties;
const STAT_NAMES: Record<string, string> = { fg3_pct: "3P%", ft_pct: "FT%", fg2_pct: "2P%", rim_fg_pct: "Rim FG%", ts_pct: "TS%" };
const FAMILY_OPTIONS = [{ value: "percentage" as const, label: "Percentages" }, { value: "per_36" as const, label: "Per 36 minutes" }];
const FAMILY_UNIT: Record<Family, string> = { percentage: "attempts of each kind", per_36: "minutes" };
const DEFAULT_STAT = "fg3_pct";
const DEFAULT_SEASON = "2025-26";
const pctAt = (value: number, end: number) => `${Math.max(0, Math.min(1, value / end)) * 100}%`;
const sq = (value: number | null | undefined) => typeof value === "number" ? signed(squaredPoints(value), 1) : "—";
const sqBand = (g: { low: number | null; high: number | null } | undefined) => g && typeof g.low === "number" && typeof g.high === "number" ? `${signed(squaredPoints(g.low), 1)} to ${signed(squaredPoints(g.high), 1)}` : null;
const toneOf = (g: { low: number | null; high: number | null } | undefined) => !g || g.low == null || g.high == null ? undefined : g.low > 0 ? "good" as const : g.high < 0 ? "bad" as const : undefined;
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const PHONE = "(max-width: 767px)";
/** Phone layout for a table whose columns change at phone width (the shrinkage test); the server renders the desktop table. */
function usePhone() {
  return useSyncExternalStore(
    notify => { const query = window.matchMedia(PHONE); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

// ---- The answer --------------------------------------------------------------------------------

function Answer({ data }: { data: SignalNoiseSummary }) {
  const by = new Map(data.stabilization.stats.map(s => [s.key, s]));
  const ft = by.get("ft_pct")?.levels["0.5"], ts = by.get("ts_pct")?.levels["0.5"], three = by.get("fg3_pct")?.levels["0.5"];
  const wins = shrinkingWins(data);
  const tested = TEST_STATS.filter(stat => data.validation[stat]).length;
  const others = data.stabilization.stats.filter(s => s.key !== "fg3_pct" && reached(s.levels["0.5"]) && reached(s.levels["0.7"])).length;
  return <ResearchSection id="answer" icon="target" title="How long until a stat means something?">
    <div className="sn-answer">
      <p className="sn-headline" data-field="headline">
        Free-throw percentage starts to mean something after about <strong data-field="ft-half" data-value={ft?.n ?? ""}>{formatSample(ft?.n)}</strong> attempts and true shooting after <strong data-field="ts-half" data-value={ts?.n ?? ""}>{formatSample(ts?.n)}</strong>.
        Three-point percentage never got there in a season: its largest group of shooters reached <strong data-field="three-largest" data-value={three?.largest_rho ?? ""}>{formatRho(three?.largest_rho, 2)}</strong> at <strong data-field="three-largest-n" data-value={three?.largest_n ?? ""}>{formatSample(three?.largest_n)}</strong> attempts.
      </p>
      <p className="sn-lead" data-field="answer-shrink" data-wins={wins.length} data-tested={tested}>
        {wins.length === tested
          ? `Pulling a shooting percentage toward the league average predicted next season better than the raw percentage for all ${tested} stats tested.`
          : `Pulling a shooting percentage toward the league average predicted next season better than the raw percentage for ${wins.length} of ${tested} stats tested.`}
      </p>
      <p className="sn-note" data-field="answer-rule" data-value={others}>&ldquo;Means something&rdquo; is a reliability of 0.5: half of the spread between players is skill and half is luck. The other {others} stats reach both 0.5 and 0.7.</p>
    </div>
  </ResearchSection>;
}

// ---- The strip ---------------------------------------------------------------------------------

function StripRow({ stat, end, onOpen, onJump, active }: { stat: StatResult; end: number; onOpen: (key: string) => void; onJump: (key: string) => void; active: boolean }) {
  const half = stat.levels["0.5"], seventy = stat.levels["0.7"];
  const ok = reached(half);
  const firstBin = stat.bins.find(b => b.reported)?.n ?? 0;
  return <li className="sn-strip-row" data-stat={stat.key} data-status={half?.status ?? ""} data-value={ok ? half.n : ""} data-low={half?.interval.low ?? ""} data-high={half?.interval.high ?? ""}
    data-seventy={reached(seventy) ? seventy.n : ""} data-typical={stat.median_sample ?? ""} data-largest={half?.largest_n ?? ""} data-active={active || undefined}>
    <span className="sn-strip-name">
      <Button size="sm" variant="ghost" aria-pressed={active} onClick={() => onOpen(stat.key)} aria-label={`Choose ${stat.label} for the reliability curve`}>{stat.label}</Button>
      <IconButton size="xs" variant="ghost" icon="chart-line" label={`Go to the ${stat.label} curve`} onClick={() => onJump(stat.key)} data-field="curve-jump" />
    </span>
    <span className="sn-track" aria-hidden="true">
      {typeof stat.median_sample === "number" && <span className="sn-track-typical" style={vars({ "--sn-at": pctAt(stat.median_sample, end) })} />}
      {ok ? <>
        {half.interval.low != null && half.interval.high != null && <span className="sn-track-span" style={vars({ "--sn-low": pctAt(half.interval.low, end), "--sn-high": pctAt(half.interval.high, end) })} />}
        {reached(seventy) && <span className="sn-track-seventy" style={vars({ "--sn-at": pctAt(seventy.n, end) })} />}
        <span className="sn-track-dot" style={vars({ "--sn-at": pctAt(half.n, end) })} />
      </> : <span className="sn-track-observed" style={vars({ "--sn-low": pctAt(firstBin, end), "--sn-high": pctAt(half?.largest_n ?? 0, end) })} />}
    </span>
    <span className="sn-strip-value">
      {ok ? <><strong>{sampleText(half.n, stat)}</strong><small>{formatSample(half.interval.low)} to {formatSample(half.interval.high)}</small></>
        : <><strong data-field="not-reached">Not reached</strong><small>{formatRho(half?.largest_rho, 2)} at {sampleText(half?.largest_n, stat)}</small></>}
    </span>
  </li>;
}

function Strip({ stats, family, end, onOpen, onJump, active }: { stats: readonly StatResult[]; family: Family; end: number; onOpen: (key: string) => void; onJump: (key: string) => void; active: string }) {
  const ticks = niceTicks([0, end]).filter(t => t >= 0 && t <= end);
  return <figure className="sn-figure" data-chart="strip" data-family={family} data-end={end}>
    <figcaption className="sn-figure-title">Reliability 0.5 with its 95% interval, in {FAMILY_UNIT[family]}</figcaption>
    <div className="sn-strip-axis" aria-hidden="true">
      <span />
      <span className="sn-strip-scale">{ticks.map(t => <span key={t} style={vars({ "--sn-at": pctAt(t, end) })} data-edge={t === 0 ? "start" : t === end ? "end" : undefined}>{whole(t)}</span>)}</span>
      <span />
    </div>
    <ul className="sn-strip" aria-label={`Stabilization, ${family === "percentage" ? "percentages" : "per 36 minutes"}`}>
      {stats.map(stat => <StripRow key={stat.key} stat={stat} end={end} onOpen={onOpen} onJump={onJump} active={stat.key === active} />)}
    </ul>
    <ul className="sn-key">
      <li><span className="sn-key-mark" data-mark="dot" aria-hidden="true" />Reliability 0.5</li>
      <li><span className="sn-key-mark" data-mark="seventy" aria-hidden="true" />Reliability 0.7</li>
      <li><span className="sn-key-mark" data-mark="typical" aria-hidden="true" />A typical season (median)</li>
      {stats.some(s => !reached(s.levels["0.5"])) && <li><span className="sn-key-mark" data-mark="observed" aria-hidden="true" />Observed range, 0.5 not reached</li>}
    </ul>
  </figure>;
}

function LevelCell({ stat, level }: { stat: StatResult; level: "0.5" | "0.7" }) {
  const l = stat.levels[level];
  if (reached(l)) return <GridValue text={sampleText(l.n, stat)} sub={`${formatSample(l.interval.low)} to ${formatSample(l.interval.high)}`} />;
  return <GridValue text="Not reached" muted />;
}

function StabilizationSection({ data, family, onFamily, active, onOpen, onJump }: { data: SignalNoiseSummary; family: Family; onFamily: (f: Family) => void; active: string; onOpen: (key: string) => void; onJump: (key: string) => void }) {
  const stats = stripOrder(data.stabilization.stats, family);
  const end = niceTicks([0, stripReach(stats)]).at(-1) ?? 1;
  const levelData = (s: StatResult, level: "0.5" | "0.7") => { const l = s.levels[level]; return { field: `level-${level}`, status: l?.status, value: reached(l) ? l.n : "", low: l?.interval.low ?? "", high: l?.interval.high ?? "", extrapolated: l?.extrapolated ?? "" }; };
  const columns: GridColumn<StatResult>[] = [
    { key: "half", label: "Reliability 0.5 at", group: "95% interval under each", width: "md", data: s => levelData(s, "0.5"), cell: s => <LevelCell stat={s} level="0.5" /> },
    { key: "seventy", label: "Reliability 0.7 at", group: "95% interval under each", width: "md", data: s => levelData(s, "0.7"), cell: s => <LevelCell stat={s} level="0.7" /> },
    { key: "typical", label: "Typical season", title: "The median full-season sample of the player-seasons measured", width: "md", data: s => ({ field: "typical", value: s.median_sample ?? "" }), cell: s => <GridValue text={sampleText(s.median_sample, s)} /> },
    { key: "largest", label: "Largest bin", title: "The bin of players with the biggest samples: its mean sample and its reliability, 95% interval under it", width: "lg",
      data: s => { const b = largestBin(s); return { field: "largest", n: b?.n ?? "", value: b?.rho ?? "", low: b?.rho_interval.low ?? "", high: b?.rho_interval.high ?? "" }; },
      cell: s => { const b = largestBin(s); return b ? <GridValue text={`${formatRho(b.rho)} at ${sampleText(b.n, s)}`} sub={`${formatRho(b.rho_interval.low)} to ${formatRho(b.rho_interval.high)}`} /> : <GridValue text={null} />; } },
    { key: "seasons", label: "Player-seasons", width: "sm", data: s => ({ field: "player-seasons", value: s.eligible_player_seasons }), cell: s => <GridValue text={whole(s.eligible_player_seasons)} /> },
  ];
  return <ResearchSection id="stabilization" icon="ruler" title="How many attempts each stat needs"
    aside={<Segmented size="sm" label="Stat family" value={family} onChange={onFamily} options={FAMILY_OPTIONS} />}>
    <p className="sn-lead">Each player-season&apos;s games are split at random into two halves, 500 times. How well the halves agree, stepped up to the full sample, is the stat&apos;s reliability: the share of the spread between players that is skill rather than luck.</p>
    <Strip stats={stats} family={family} end={end} onOpen={onOpen} onJump={onJump} active={active} />
    {stats.filter(s => !reached(s.levels["0.5"])).map(s => { const b = largestBin(s); return <p key={s.key} className="sn-note" data-field="not-reached-note" data-stat={s.key} data-low={b?.rho_interval.low ?? ""} data-high={b?.rho_interval.high ?? ""}>
      A level counts only where a group of observed players shows it. {s.label}&apos;s largest group is still below 0.5, so it has no point here; its 95% interval there runs from {formatRho(b?.rho_interval.low)} to {formatRho(b?.rho_interval.high)}.
    </p>; })}
    <StatsGrid<StatResult> label="Stabilization points" name="stabilization" density="compact" height="auto" leadWidth="md" className="sn-grid sn-stab" rows={stats} rowKey={s => s.key}
      rowData={s => ({ stat: s.key })}
      lead={{ label: "Stat", cell: s => <><span className="sn-name">{s.label}</span><span className="sn-name-sub">{s.family === "per_36" ? "minutes" : s.unit}</span></> }}
      columns={columns} />
  </ResearchSection>;
}

const largestBin = (s: StatResult): Bin | undefined => [...s.bins].filter(b => b.reported).sort((a, b) => b.n - a.n)[0];

// ---- The curve ---------------------------------------------------------------------------------

function Curve({ stat }: { stat: StatResult }) {
  const bins = stat.bins.filter(b => b.reported);
  const levelsReached = reached(stat.levels["0.5"]) && reached(stat.levels["0.7"]);
  const m = stat.m?.value ?? null;
  const maxN = Math.max(...bins.map(b => b.n));
  const half = stat.levels["0.5"], seventy = stat.levels["0.7"];
  // The strip's marks on the curve (owner, RD13 round 4): each reached level where it crosses, with its 95% interval, and the typical season.
  const marks = ([["0.5", half, 0.5], ["0.7", seventy, 0.7]] as const).flatMap(([level, l, rho]) => reached(l) ? [{ level, n: l.n, low: l.interval.low, high: l.interval.high, rho }] : []);
  const typical = typeof stat.median_sample === "number" ? stat.median_sample : null;
  const ticks = niceTicks([0, Math.max(maxN, typical ?? 0, ...marks.map(m => m.high ?? m.n))]).filter(t => t >= 0);
  const end = ticks.at(-1) ?? maxN;
  const x = (n: number) => (n / end) * 100;
  const y = (rho: number) => (1 - Math.max(0, Math.min(1, rho))) * 100;
  // The fitted n/(n+M) only over the observed bins, and only where every level is reached (owner, RD13 (4)).
  const curve = levelsReached && m ? Array.from({ length: 61 }, (_, i) => { const n = (maxN * i) / 60; return `${i ? "L" : "M"}${x(n).toFixed(3)},${y(n / (n + m)).toFixed(3)}`; }).join("") : "";
  return <div className="sn-curve" data-chart="curve" data-stat={stat.key} data-end={end} data-fitted={curve ? "drawn" : "not-drawn"}>
    <div className="sn-curve-frame">
      <div className="sn-curve-y" aria-hidden="true">{[0, 0.5, 0.7, 1].map(t => <span key={t} style={vars({ "--sn-y": `${y(t)}%` })}>{t === 0 || t === 1 ? t.toFixed(0) : t.toFixed(1)}</span>)}</div>
      <div className="sn-curve-plot" role="img" aria-label={`${stat.label} reliability by season sample: ${bins.map(b => `${formatSample(b.n)} ${sampleUnit(stat)} ${formatRho(b.rho, 2)}`).join(", ")}`}>
        {[0, 0.25, 0.5, 0.7, 1].map(t => <span key={t} className="sn-curve-grid" data-level={t === 0.5 || t === 0.7 || undefined} style={vars({ "--sn-y": `${y(t)}%` })} />)}
        {typical != null && <span className="sn-curve-typical" data-field="curve-typical" data-n={typical} style={vars({ "--sn-x": `${x(typical)}%` })} />}
        {curve && <svg className="sn-curve-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path className="sn-curve-line" d={curve} vectorEffect="non-scaling-stroke" /></svg>}
        {bins.map(b => <span key={b.bin} className="sn-bin" data-bin={b.bin} data-n={b.n} data-value={b.rho} data-low={b.rho_interval.low ?? ""} data-high={b.rho_interval.high ?? ""}
          title={`${formatSample(b.n)} ${sampleUnit(stat)}: reliability ${formatRho(b.rho)} (95% ${formatRho(b.rho_interval.low)} to ${formatRho(b.rho_interval.high)}), ${whole(b.players_per_split)} players`}
          style={vars({ "--sn-x": `${x(b.n)}%`, "--sn-y": `${y(b.rho)}%`, "--sn-top": `${y(b.rho_interval.high ?? b.rho)}%`, "--sn-bottom": `${y(b.rho_interval.low ?? b.rho)}%` })}>
          <span className="sn-bin-bar" /><span className="sn-bin-dot" />
        </span>)}
        {marks.map(m => <span key={m.level} className="sn-curve-mark" data-field="curve-mark" data-level={m.level} data-n={m.n} data-low={m.low ?? ""} data-high={m.high ?? ""}
          title={`Reliability ${m.level} at ${sampleText(m.n, stat)} (95% ${formatSample(m.low)} to ${formatSample(m.high)})`}
          style={vars({ "--sn-x": `${x(m.n)}%`, "--sn-y": `${y(m.rho)}%`, "--sn-low": `${x(m.low ?? m.n)}%`, "--sn-high": `${x(m.high ?? m.n)}%` })}>
          <span className="sn-curve-mark-span" /><span className="sn-curve-mark-dot" />
        </span>)}
      </div>
      <div className="sn-curve-x" aria-hidden="true">{ticks.map(t => <span key={t} style={vars({ "--sn-x": `${x(t)}%` })} data-edge={t === 0 ? "start" : t === end ? "end" : undefined}>{whole(t)}</span>)}</div>
      <span className="sn-curve-xlabel" aria-hidden="true">Season sample, {stat.family === "per_36" ? "minutes" : stat.unit}</span>
    </div>
    <ul className="sn-key">
      <li><span className="sn-key-mark" data-mark="bin" aria-hidden="true" />A bin of player-seasons with similar samples, with its 95% interval</li>
      {curve && <li><span className="sn-key-mark" data-mark="curve" aria-hidden="true" />Fitted curve, n / (n + M)</li>}
      {marks.length > 0 && <li><span className="sn-key-mark" data-mark="cross-half" aria-hidden="true" /><span className="sn-key-mark" data-mark="cross-seventy" aria-hidden="true" />Where it reaches 0.5 and 0.7, with 95% intervals, as in the strip</li>}
      {typical != null && <li><span className="sn-key-mark" data-mark="typical" aria-hidden="true" />A typical season (median)</li>}
      <li><span className="sn-key-mark" data-mark="level" aria-hidden="true" />Reliability 0.5 and 0.7</li>
    </ul>
  </div>;
}

function CurveSection({ data, active, onOpen }: { data: SignalNoiseSummary; active: string; onOpen: (key: string) => void }) {
  const stats = data.stabilization.stats;
  const stat = stats.find(s => s.key === active) ?? stats[0];
  const half = stat.levels["0.5"], seventy = stat.levels["0.7"];
  const b = largestBin(stat);
  return <ResearchSection id="curve" icon="chart-line" title={`Reliability by sample size: ${stat.label}`}
    aside={<Select size="sm" aria-label="Curve stat" value={stat.key} onChange={event => onOpen(event.target.value)}>
      {FAMILY_OPTIONS.map(f => <optgroup key={f.value} label={f.label}>{stats.filter(s => s.family === f.value).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}
    </Select>}>
    <p className="sn-lead" data-field="curve-line" data-stat={stat.key}>
      {reached(half) && reached(seventy)
        ? <>{stat.label} reaches 0.5 at <strong>{sampleWords(half.n, stat)}</strong> ({formatSample(half.interval.low)} to {formatSample(half.interval.high)}) and 0.7 at <strong>{sampleWords(seventy.n, stat)}</strong> ({formatSample(seventy.interval.low)} to {formatSample(seventy.interval.high)}). A typical season has {sampleWords(stat.median_sample, stat)}.</>
        : <>No bin of {stat.label} reaches 0.5. The largest, at <strong>{sampleWords(b?.n, stat)}</strong>, is <strong>{formatRho(b?.rho)}</strong> (95% {formatRho(b?.rho_interval.low)} to {formatRho(b?.rho_interval.high)}). A typical season has {sampleWords(stat.median_sample, stat)}.</>}
    </p>
    {!(reached(half) && reached(seventy)) && <p className="sn-note" data-field="curve-not-drawn">The fitted curve isn&apos;t drawn for {stat.label}: it would cross 0.5 before any observed bin does, and a level counts only where a bin shows it.</p>}
    <figure className="sn-figure"><Curve stat={stat} /></figure>
  </ResearchSection>;
}

function BinsDisclosure({ data, active }: { data: SignalNoiseSummary; active: string }) {
  const stat = data.stabilization.stats.find(s => s.key === active) ?? data.stabilization.stats[0];
  const columns: GridColumn<Bin>[] = [
    { key: "range", label: "Season sample", width: "md", data: b => ({ field: "range", low: b.sample_low, high: b.sample_high }), cell: b => <GridValue text={`${formatSample(b.sample_low)} to ${formatSample(b.sample_high)}`} /> },
    { key: "players", label: "Players per split", width: "sm", data: b => ({ field: "players", value: b.players_per_split }), cell: b => <GridValue text={whole(b.players_per_split)} sub={b.reported ? null : "Too few, not used"} /> },
    { key: "n", label: "Mean sample", width: "sm", data: b => ({ field: "n", value: b.n }), cell: b => <GridValue text={formatSample(b.n)} /> },
    { key: "r", label: "Split-half r", width: "sm", data: b => ({ field: "r", value: b.r, sd: b.r_split_sd }), cell: b => <GridValue text={formatRho(b.r)} sub={`SD ${formatRho(b.r_split_sd)}`} /> },
    { key: "rho", label: "Reliability, 95%", width: "md", data: b => ({ field: "rho", value: b.rho, low: b.rho_interval.low ?? "", high: b.rho_interval.high ?? "" }), cell: b => <GridValue text={formatRho(b.rho)} sub={`${formatRho(b.rho_interval.low)} to ${formatRho(b.rho_interval.high)}`} /> },
  ];
  return <ResearchDisclosure id="bins" icon="table" title={`${stat.label} by bin`}>
    <StatsGrid<Bin> label={`${stat.label} bins`} name="bins" density="compact" height="auto" leadWidth="sm" className="sn-grid sn-auto" rows={stat.bins} rowKey={b => String(b.bin)}
      rowData={b => ({ bin: b.bin })} lead={{ label: "Bin", cell: b => <span className="sn-name">{b.bin}</span> }} columns={columns} />
  </ResearchDisclosure>;
}

// ---- The worked example ------------------------------------------------------------------------

interface ExampleRow { key: string; label: string; counts: string; raw: number | null; shrunk: Posterior; prior: SeasonPrior | null; composed?: boolean; unknown?: string }

function exampleRows(example: PlayerExample): ExampleRow[] {
  const e = example.estimates;
  if (!e) return [];
  const comp = (key: "fg3_pct" | "ft_pct" | "fg2_pct"): ExampleRow => ({ key, label: STAT_NAMES[key], counts: `${whole(e[key].makes)} / ${whole(e[key].attempts)}`, raw: e[key].raw, shrunk: e[key].shrunk, prior: e[key].prior });
  const rim: ExampleRow = example.rim.status === "available"
    ? { key: "rim_fg_pct", label: "Rim FG%", counts: `${whole(example.rim.makes)} / ${whole(example.rim.attempts)}`, raw: example.rim.raw, shrunk: example.rim.shrunk, prior: example.rim.prior }
    : { key: "rim_fg_pct", label: "Rim FG%", counts: "—", raw: null, shrunk: { value: null, low: null, high: null }, prior: null, unknown: example.rim.reason };
  return [comp("fg3_pct"), comp("ft_pct"), comp("fg2_pct"),
    { key: "ts_pct", label: "TS%", counts: `${whole(e.ts_pct.points)} pts / ${e.ts_pct.attempts.toFixed(1)} TSA`, raw: e.ts_pct.raw, shrunk: e.ts_pct.shrunk, prior: null, composed: true }, rim];
}

function ExampleStrip({ rows }: { rows: readonly ExampleRow[] }) {
  return <figure className="sn-figure" data-chart="example-strip">
    <figcaption className="sn-figure-title">Raw and shrunk on one scale</figcaption>
    <div className="sn-strip-axis" aria-hidden="true">
      <span />
      <span className="sn-strip-scale">{[0, 0.25, 0.5, 0.75, 1].map(t => <span key={t} style={vars({ "--sn-at": pctAt(t, 1) })} data-edge={t === 0 ? "start" : t === 1 ? "end" : undefined} data-minor={t === 0.25 || t === 0.75 || undefined}>{formatPct(t, 0)}</span>)}</span>
      <span />
    </div>
    <ul className="sn-ex-strip">{rows.map(row => {
      const prior = row.prior?.status === "available" ? row.prior.mean : null;
      return <li key={row.key} className="sn-ex-row" data-stat={row.key}>
        <span className="sn-name">{row.label}</span>
        <span className="sn-track" aria-hidden="true">
          {prior != null && <span className="sn-track-prior" style={vars({ "--sn-at": pctAt(prior, 1) })} />}
          {row.shrunk.low != null && row.shrunk.high != null && <span className="sn-track-span" data-series="shrunk" style={vars({ "--sn-low": pctAt(row.shrunk.low, 1), "--sn-high": pctAt(row.shrunk.high, 1) })} />}
          {row.shrunk.value != null && <span className="sn-track-dot" data-series="shrunk" style={vars({ "--sn-at": pctAt(row.shrunk.value, 1) })} />}
          {row.raw != null && <span className="sn-track-dot" data-series="raw" style={vars({ "--sn-at": pctAt(row.raw, 1) })} />}
        </span>
        <span className="sn-strip-value">{row.unknown ? <small>Unknown</small> : <><strong>{formatPct(row.raw)}</strong><small>to {formatPct(row.shrunk.value)}</small></>}</span>
      </li>;
    })}</ul>
    <ul className="sn-key">
      <li><span className="sn-key-mark" data-mark="raw" aria-hidden="true" />Raw</li>
      <li><span className="sn-key-mark" data-mark="shrunk" aria-hidden="true" />Shrunk, with its 95% interval</li>
      <li><span className="sn-key-mark" data-mark="prior" aria-hidden="true" />League prior</li>
    </ul>
  </figure>;
}

const PATHS = [{ value: "fg3_pct" as const, label: "3P%" }, { value: "ft_pct" as const, label: "FT%" }, { value: "ts_pct" as const, label: "TS%" }];
type PathKey = typeof PATHS[number]["value"];

function ExamplePath({ example, path, onPath }: { example: PlayerExample; path: PathKey; onPath: (p: PathKey) => void }) {
  const unit = path === "fg3_pct" ? "3PA" : path === "ft_pct" ? "FTA" : "TSA";
  const unitText = path === "fg3_pct" ? "three-point attempts" : path === "ft_pct" ? "free-throw attempts" : "true-shooting attempts";
  const points = example.path.map((p, i) => ({
    season: `${i + 1}`, value: p[path].raw, label: `Game ${i + 1} · ${formatDate(p.game_date)} · ${path === "ts_pct" ? p[path].attempts.toFixed(1) : whole(p[path].attempts)} ${unit}`,
  }));
  const shrunk = example.path.map(p => p[path].shrunk);
  const step = Math.max(1, Math.ceil(points.length / 6));
  // Every step-th game, and the last one unless it would sit on top of the tick before it.
  const ticks = points.map((_, i) => i).filter(i => i % step === 0 || (i === points.length - 1 && i % step >= step / 2));
  return <figure className="sn-figure sn-path" data-chart="path" data-path={path} data-games={points.length}>
    <div className="sn-figure-head">
      <figcaption className="sn-figure-title">{PATHS.find(p => p.value === path)?.label} through the season, game by game</figcaption>
      <Segmented size="sm" label="Season path" value={path} onChange={onPath} options={PATHS} />
    </div>
    {points.filter(p => p.value !== null).length < 2
      ? <p className="sn-note" data-field="path-empty">Not enough games with {unitText} to draw a line.</p>
      : <SeasonLineChart label={`Raw and shrunk ${PATHS.find(p => p.value === path)?.label} for ${example.player_name}, game by game`} points={points} name="Raw" overlay={{ name: "Shrunk", values: shrunk }}
        format={v => formatPct(v)} axisFormat={v => formatPct(v, 0)} xTicks={ticks} floor={0} />}
    <ul className="sn-key">
      <li><span className="sn-key-mark" data-mark="raw" aria-hidden="true" />Raw, season to date</li>
      <li><span className="sn-key-mark" data-mark="shrunk" aria-hidden="true" />Shrunk, season to date</li>
    </ul>
    <p className="sn-note">The shrunk line starts near the league prior and moves toward the raw rate as attempts add up. No interval is served for the path.</p>
  </figure>;
}

function ExampleCard({ example, seasons, onSeason, onPlayer }: { example: PlayerExample; seasons: readonly string[]; onSeason: (s: string) => void; onPlayer: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const team = example.teams[0] ?? null;
  const tint = teamAccent(team, example.season);
  const close = () => { setOpen(false); setText(""); };
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element;
      if (root.current?.contains(target) || target.closest(".lookup-dropdown")) return;
      setOpen(false); setText("");
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return <div ref={root} className="sn-card" data-player={example.player_id} data-season={example.season} data-searching={open || undefined} style={tint ? vars({ "--sn-team": tint }) : undefined}>
    <PlayerAvatar playerId={example.player_id} name={example.player_name} team={team} size="lg" era={seasonEra(example.season, team)} />
    {open ? <div className="sn-card-search" role="search" onKeyDown={event => { if (event.key === "Escape") close(); }}>
      <LookupInput label="Search players" placeholder={`Search ${example.season} players`} value={text} onChange={setText} kinds={["player"]} season={example.season} phase="regular_season"
        excludedIds={[example.player_id]} limit={10} portalDropdown dropdownMinWidth={280} autoFocus openOnFocus={false} clearable={false}
        onSelect={item => { close(); onPlayer(item.canonical_id); }} />
    </div> : <span className="sn-card-copy">
      <a className="sn-card-name" href={`/players/${example.player_id}?season=${example.season}`}>{example.player_name}</a>
      <span className="sn-card-sub" data-field="card-sub">{example.teams.map(t => <span key={t} className="sn-card-team" data-team={t}><TeamLogo team={t} season={example.season} size={16} />{t}</span>)}
        <span>{example.games} {example.games === 1 ? "game" : "games"}</span></span>
    </span>}
    <span className="sn-card-tool"><IconButton size="xs" variant="ghost" icon={open ? "close" : "search"} label={open ? "Cancel the search" : `Replace ${example.player_name}`} onClick={() => open ? close() : setOpen(true)} /></span>
    <span className="sn-card-season">
      <Select size="sm" aria-label="Example season" value={example.season} onChange={event => onSeason(event.target.value)}>
        {seasons.map(s => <option key={s} value={s}>{s}</option>)}
      </Select>
    </span>
  </div>;
}

interface WhatIfSource { key: string; label: string; unit: string; words: string; makes: number; attempts: number; alpha: number; beta: number; mean: number; strength: number }

function whatIfSources(example: PlayerExample): WhatIfSource[] {
  const e = example.estimates;
  if (!e) return [];
  const from = (key: string, label: string, unit: string, words: string, makes: number, attempts: number, prior: SeasonPrior): WhatIfSource[] =>
    prior.status === "available" ? [{ key, label, unit, words, makes, attempts, alpha: prior.alpha, beta: prior.beta, mean: prior.mean, strength: prior.strength }] : [];
  return [
    ...from("fg3_pct", "3P%", "3PA", "three-point attempts", e.fg3_pct.makes, e.fg3_pct.attempts, e.fg3_pct.prior),
    ...from("ft_pct", "FT%", "FTA", "free-throw attempts", e.ft_pct.makes, e.ft_pct.attempts, e.ft_pct.prior),
    ...from("fg2_pct", "2P%", "2PA", "two-point attempts", e.fg2_pct.makes, e.fg2_pct.attempts, e.fg2_pct.prior),
    ...(example.rim.status === "available" ? from("rim_fg_pct", "Rim FG%", "rim FGA", "attempts at the rim", example.rim.makes, example.rim.attempts, example.rim.prior) : []),
  ];
}

/**
 * What if (owner-approved, RD13 round 4): the season's served prior applied to makes and attempts the reader picks, starting from the
 * player's own. The same posterior mean the frozen run uses (shrunkRate); no interval is computed on the page.
 */
function WhatIf({ example }: { example: PlayerExample }) {
  const sources = whatIfSources(example);
  const [key, setKey] = useState(sources[0]?.key ?? "");
  const source = sources.find(s => s.key === key) ?? sources[0];
  const own = source ? { attempts: source.attempts, rate: source.attempts > 0 ? source.makes / source.attempts : source.mean } : { attempts: 0, rate: 0 };
  const [picked, setPicked] = useState<Record<string, { attempts: number; rate: number }>>({});
  if (!source) return null;
  const state = picked[source.key] ?? own;
  const max = Math.max(source.key === "ft_pct" ? 400 : 600, Math.ceil(source.attempts / 100) * 100);
  const result = whatIf(state.rate, state.attempts, source.alpha, source.beta);
  const changed = state.attempts !== own.attempts || Math.abs(state.rate - own.rate) > 1e-9;
  const set = (next: Partial<{ attempts: number; rate: number }>) => setPicked(p => ({ ...p, [source.key]: { ...state, ...next } }));
  const fill = (value: number, top: number) => `${Math.max(0, Math.min(100, (value / top) * 100))}%`;
  return <figure className="sn-figure sn-whatif" data-chart="what-if" data-stat={source.key} data-attempts={state.attempts} data-makes={result.makes} data-shrunk={result.shrunk} data-weight={result.weight}>
    <div className="sn-figure-head">
      <figcaption className="sn-figure-title">What if: choose the attempts and the raw rate</figcaption>
      <Segmented size="sm" label="What-if stat" value={source.key} onChange={setKey} options={sources.map(s => ({ value: s.key, label: s.label }))} />
    </div>
    <div className="sn-whatif-inputs">
      <label className="sn-whatif-row">
        <span className="sn-whatif-label">Attempts</span>
        <span className="sn-whatif-value" data-field="whatif-attempts">{whole(state.attempts)} {source.unit}</span>
        <input type="range" className="sn-range" min={0} max={max} step={1} value={state.attempts} aria-valuetext={`${whole(state.attempts)} ${source.words}`}
          style={vars({ "--sn-fill": fill(state.attempts, max) })} onChange={event => set({ attempts: Number(event.target.value) })} />
      </label>
      <label className="sn-whatif-row">
        <span className="sn-whatif-label">Raw {source.label}</span>
        <span className="sn-whatif-value" data-field="whatif-rate">{formatPct(state.rate)}</span>
        <input type="range" className="sn-range" min={0} max={1} step={0.005} value={state.rate} aria-valuetext={formatPct(state.rate)}
          style={vars({ "--sn-fill": fill(state.rate, 1) })} onChange={event => set({ rate: Number(event.target.value) })} />
      </label>
    </div>
    <dl className="sn-whatif-out">
      <div><dt>Made / attempts</dt><dd data-field="whatif-counts">{whole(result.makes)} / {whole(state.attempts)}</dd></div>
      <div data-series="raw"><dt>Raw</dt><dd data-field="whatif-raw">{formatPct(result.raw)}</dd></div>
      <div data-series="shrunk"><dt>Shrunk</dt><dd data-field="whatif-shrunk">{formatPct(result.shrunk)}</dd></div>
      <div><dt>League prior</dt><dd data-field="whatif-prior">{formatPct(source.mean)}</dd></div>
    </dl>
    <span className="sn-track sn-whatif-track" aria-hidden="true">
      <span className="sn-track-prior" style={vars({ "--sn-at": pctAt(source.mean, 1) })} />
      <span className="sn-track-dot" data-series="shrunk" style={vars({ "--sn-at": pctAt(result.shrunk, 1) })} />
      {result.raw != null && <span className="sn-track-dot" data-series="raw" style={vars({ "--sn-at": pctAt(result.raw, 1) })} />}
    </span>
    <p className="sn-lead" data-field="whatif-line">With {whole(state.attempts)} {source.words}, the player&apos;s own shooting carries <strong>{formatPct(result.weight, 0)}</strong> of the weight and the league prior, worth {source.strength.toFixed(1)} attempts in {example.season}, carries the rest.</p>
    <FormulaLine><span data-field="whatif-formula">Shrunk {source.label} = ({whole(result.makes)} + {source.alpha.toFixed(1)}) / ({whole(state.attempts)} + {source.strength.toFixed(1)}) = {formatPct(result.shrunk)}</span></FormulaLine>
    <div className="sn-whatif-foot">
      <p className="sn-note">A mean only: the page applies the season&apos;s prior to the numbers chosen here, so there is no interval. The table above has the served values.</p>
      {changed && <Button size="sm" variant="ghost" icon="reset" onClick={() => setPicked(p => { const next = { ...p }; delete next[source.key]; return next; })}>{example.player_name}&apos;s season</Button>}
    </div>
  </figure>;
}

function ExampleBody({ example, path, onPath }: { example: PlayerExample; path: PathKey; onPath: (p: PathKey) => void }) {
  if (!example.estimates) return <GatedNote>No regular-season games for {example.player_name} in {example.season}: every value is unknown, not zero. Pick one of their seasons above.</GatedNote>;
  const rows = exampleRows(example);
  const three = example.estimates.fg3_pct;
  const columns: GridColumn<ExampleRow>[] = [
    { key: "raw", label: "Raw", width: "sm", data: r => ({ field: "raw", value: r.raw ?? "" }), cell: r => <GridValue text={r.unknown ? null : formatPct(r.raw)} /> },
    { key: "shrunk", label: "Shrunk, 95%", width: "md", data: r => ({ field: "shrunk", value: r.shrunk.value ?? "", low: r.shrunk.low ?? "", high: r.shrunk.high ?? "" }),
      cell: r => <GridValue text={r.unknown ? null : formatPct(r.shrunk.value)} sub={r.shrunk.low != null && r.shrunk.high != null ? `${formatPct(r.shrunk.low)} to ${formatPct(r.shrunk.high)}` : null} /> },
    { key: "prior", label: "League prior", title: "The season's prior mean, and its strength in league-average attempts", width: "md",
      data: r => ({ field: "prior", value: r.prior?.status === "available" ? r.prior.mean : "", strength: r.prior?.status === "available" ? r.prior.strength : "" }),
      cell: r => r.composed ? <GridValue text="From the three above" muted /> : r.prior?.status === "available" ? <GridValue text={formatPct(r.prior.mean)} sub={`${r.prior.strength.toFixed(1)} attempts`} /> : <GridValue text={null} /> },
    { key: "counts", label: "Made / attempts", width: "md", data: r => ({ field: "counts", value: r.counts }), cell: r => <GridValue text={r.counts === "—" ? null : r.counts} /> },
  ];
  return <>
    <StatsGrid<ExampleRow> label="Worked example" name="example" density="compact" height="auto" leadWidth="sm" className="sn-grid sn-auto" rows={rows} rowKey={r => r.key} rowData={r => ({ stat: r.key })}
      lead={{ label: "Stat", cell: r => <span className="sn-name">{r.label}</span> }} columns={columns} />
    {rows.filter(r => r.unknown).map(r => <p key={r.key} className="sn-note" data-field="unknown" data-stat={r.key}>{r.label} unknown: {r.unknown}</p>)}
    {three.prior.status === "available" && three.attempts > 0 && <FormulaLine>
      <span data-field="formula">Shrunk 3P% = ({whole(three.makes)} + {three.prior.alpha.toFixed(1)}) / ({whole(three.attempts)} + {three.prior.strength.toFixed(1)}) = {formatPct(three.shrunk.value)}</span>
    </FormulaLine>}
    <p className="sn-note">The prior adds α league makes and β league misses to the player&apos;s own, α + β being its strength. It is league-wide, not by position, so a centre&apos;s few threes are pulled toward the league&apos;s shooters. TS% is rebuilt from shrunk 2P%, 3P% and FT% with the player&apos;s attempt mix.</p>
    <ExampleStrip rows={rows} />
    <WhatIf key={`${example.player_id}-${example.season}`} example={example} />
    <ExamplePath example={example} path={path} onPath={onPath} />
  </>;
}

function ExampleSection({ data }: { data: SignalNoiseSummary }) {
  const { get, set } = useUrlState();
  const playerId = get("player");
  const season = get("exampleSeason") ?? DEFAULT_SEASON;
  const path = (PATHS.some(p => p.value === get("path")) ? get("path") : "fg3_pct") as PathKey;
  const { data: example, error, loading, retry, stale } = useFeed([playerId, season], signal => getPlayerExample(playerId, season, signal));
  const shown = example ?? stale;
  const id = shown?.player_id ?? null;
  const { data: career } = useFeed([id], () => id ? getPlayerCareer(id, { phase: "regular_season" }) : Promise.resolve(null));
  const priorSeasons = useMemo(() => (data.priors.fg3_pct ?? []).map(p => p.season), [data]);
  const played = career && career.player_id === id ? career.seasons.filter(s => s.item).map(s => s.season) : [];
  const seasons = shown ? exampleSeasons(played, priorSeasons, shown.season) : [];
  const isDefault = !playerId && season === DEFAULT_SEASON;
  return <ResearchSection id="example" icon="user" title="A worked example">
    <p className="sn-lead">Shrinking pulls a percentage toward the league by adding a season&apos;s league-wide prior to the player&apos;s own makes and attempts. A small sample moves a long way; a large one barely moves.</p>
    {error && <FeedFailure error={error} retry={retry} what="The worked example" />}
    {loading && !shown && <FeedSkeleton label="Loading the worked example" />}
    {shown && <div className="sn-example" data-stale={loading || undefined} aria-busy={loading}>
      <div className="sn-example-head">
        <ExampleCard example={shown} seasons={seasons} onSeason={s => set({ exampleSeason: s === DEFAULT_SEASON ? null : s, player: shown.player_id })} onPlayer={next => set({ player: next, exampleSeason: shown.season === DEFAULT_SEASON ? null : shown.season })} />
        {!isDefault && <Button size="sm" variant="ghost" icon="reset" onClick={() => set({ player: null, exampleSeason: null })}>Default example</Button>}
      </div>
      {shown.selection_rule && <p className="sn-note" data-field="selection-rule">{shown.selection_rule}</p>}
      <ExampleBody example={shown} path={path} onPath={p => set({ path: p === "fg3_pct" ? null : p })} />
    </div>}
    <ResearchLinks label="Shrunk values elsewhere" links={[{ label: "Shrunk columns in Stats", href: "/stats?shrunk=1&viewId=shooting" }]} />
  </ResearchSection>;
}

// ---- Does shrinking help? ----------------------------------------------------------------------

interface TestRow { stat: string; block: ValidationBlock }

function TestSection({ data }: { data: SignalNoiseSummary }) {
  const { get, set } = useUrlState();
  const bands = data.validation.fg3_pct?.bands.map(b => b.band) ?? [];
  const band = bands.includes(get("band") ?? "") ? get("band")! : "all";
  const rows: TestRow[] = TEST_STATS.flatMap(stat => {
    const v = data.validation[stat];
    if (!v) return [];
    const block = band === "all" ? v.pooled : v.bands.find(b => b.band === band);
    return block ? [{ stat, block }] : [];
  });
  const wins = shrinkingWins(data);
  const target = data.registration.parameters.validation_target_seasons as string[] | undefined;
  const phone = usePhone();
  const [view, setView] = useState<"gains" | "errors">("gains");
  const gain = (key: "raw_minus_shrunk" | "prior_minus_shrunk", label: string): GridColumn<TestRow> => ({
    key, label, group: phone ? "Gain, squared points" : "Shrunk's gain, squared points, 95%", width: phone ? "sm" : "md",
    data: r => ({ field: key, value: r.block[key]?.value ?? "", low: r.block[key]?.low ?? "", high: r.block[key]?.high ?? "" }),
    cell: r => { const g = r.block[key]; return <GridValue text={sq(g?.value)} sub={sqBand(g)} tone={toneOf(g)} title={toneOf(g) ? "95% interval excludes zero" : "95% interval includes zero"} />; },
  });
  const err = (key: "raw" | "prior" | "shrunk", label: string): GridColumn<TestRow> => ({
    key: `error-${key}`, label, group: "Error, RMSE in points", width: "sm",
    data: r => ({ field: `mse-${key}`, value: r.block.mse?.[key] ?? "" }),
    cell: r => <GridValue text={r.block.mse ? rmsePoints(r.block.mse[key]).toFixed(1) : null} />,
  });
  return <ResearchSection id="test" icon="scale" title="Does shrinking predict next season better?"
    aside={<Segmented size="sm" label="Attempts this season" value={band} onChange={next => set({ band: next === "all" ? null : next })}
      options={[{ value: "all", label: "All" }, ...bands.map(b => ({ value: b, label: BAND_LABELS[b] ?? b }))]} />}>
    <p className="sn-lead" data-field="test-line" data-wins={wins.length}>Yes. Predicting each player&apos;s percentage next season from this season&apos;s, the shrunk value beat the raw one for {wins.length === TEST_STATS.length ? `all ${wins.length}` : `${wins.length} of ${TEST_STATS.length}`} stats, and its edge is largest for players with few attempts.</p>
    <p className="sn-note">Above zero, shrunk had the lower error. Gains are differences of mean squared error in squared percentage points, weighted by next season&apos;s attempts{target ? `, on target seasons ${target[0]} to ${target.at(-1)}` : ""}. The bands are this season&apos;s attempts of that stat.</p>
    <ul className="rs-legend" aria-label="Colour key">
      <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />Shrunk better: 95% interval above zero</li>
      <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />Shrunk worse: 95% interval below zero</li>
      <li><span className="rs-swatch" aria-hidden="true" />Interval includes zero</li>
    </ul>
    {phone && <Segmented size="sm" label="Test columns" value={view} onChange={setView} options={[{ value: "gains", label: "Gains" }, { value: "errors", label: "Errors, RMSE" }]} />}
    <StatsGrid<TestRow> label="Shrinkage test" name="test" density="compact" height="auto" leadWidth="md" className={phone ? "sn-grid sn-test sn-test-phone" : "sn-grid sn-test"} rows={rows} rowKey={r => r.stat}
      rowData={r => ({ stat: r.stat, band })}
      lead={{ label: "Stat", cell: r => <><span className="sn-name">{STAT_NAMES[r.stat]}</span><span className="sn-name-sub" data-field="pairs" data-value={r.block.pairs} data-players={r.block.players ?? ""}>{whole(r.block.pairs)} pairs{r.block.players ? ` · ${whole(r.block.players)} players` : ""}</span></> }}
      columns={[
        ...(!phone || view === "gains" ? [gain("raw_minus_shrunk", "Over raw"), gain("prior_minus_shrunk", "Over the prior mean")] : []),
        ...(!phone || view === "errors" ? [err("raw", "Raw"), err("prior", "Prior mean"), err("shrunk", "Shrunk")] : []),
      ]} />
  </ResearchSection>;
}

// ---- Priors over time --------------------------------------------------------------------------

function PriorSection({ data }: { data: SignalNoiseSummary }) {
  const { get, set } = useUrlState();
  const stat = (PRIOR_STATS as readonly string[]).includes(get("prior") ?? "") ? get("prior")! : "fg3_pct";
  const view = get("priorView") === "strength" ? "strength" : "mean";
  const fits = data.priors[stat] ?? [];
  const points = fits.map(f => ({ season: f.season, value: view === "mean" ? f.mean : f.strength, label: `${f.season} · from ${f.seasons.join(", ")}` }));
  const step = Math.max(1, Math.ceil(points.length / 7));
  const ticks = points.map((_, i) => i).filter(i => (points.length - 1 - i) % step === 0);
  const latest = data.priors.ft_pct?.find(f => f.season === DEFAULT_SEASON), ftM = data.stabilization.stats.find(s => s.key === "ft_pct")?.m?.value;
  const rimLatest = data.priors.rim_fg_pct?.find(f => f.season === DEFAULT_SEASON), rimM = data.stabilization.stats.find(s => s.key === "rim_fg_pct")?.m?.value;
  return <ResearchSection id="priors" icon="history" title="The league prior, season by season">
    <p className="sn-lead">Each season&apos;s prior is fitted on up to three earlier seasons only, never that season or a later one. Its strength acts like that many league-average attempts, and it should sit near the stabilization point: for FT% in {DEFAULT_SEASON} it is <strong data-field="ft-strength" data-value={latest?.strength ?? ""}>{latest?.strength.toFixed(1) ?? "—"}</strong> against <strong data-value={ftM ?? ""}>{formatSample(ftM)}</strong>, for Rim FG% <strong data-field="rim-strength" data-value={rimLatest?.strength ?? ""}>{rimLatest?.strength.toFixed(1) ?? "—"}</strong> against <strong data-value={rimM ?? ""}>{formatSample(rimM)}</strong>.</p>
    <figure className="sn-figure sn-prior" data-chart="priors" data-stat={stat} data-view={view}>
      <div className="sn-figure-head">
        <Segmented size="sm" label="Prior stat" value={stat} onChange={next => set({ prior: next === "fg3_pct" ? null : next })} options={PRIOR_STATS.map(s => ({ value: s, label: STAT_NAMES[s] }))} />
        <Segmented size="sm" label="Prior measure" value={view} onChange={next => set({ priorView: next === "mean" ? null : next })} options={[{ value: "mean", label: "Prior mean" }, { value: "strength", label: "Strength" }]} />
      </div>
      <SeasonLineChart label={`${STAT_NAMES[stat]} prior ${view === "mean" ? "mean" : "strength"} by season`} points={points} xTicks={ticks}
        format={v => view === "mean" ? formatPct(v) : `${v.toFixed(1)} attempts`} axisFormat={v => view === "mean" ? formatPct(v, 0) : whole(v)} />
      {stat === "rim_fg_pct" && <p className="sn-note" data-field="rim-start">Rim attempts start in 2014-15, so rim priors start in 2015-16.</p>}
    </figure>
  </ResearchSection>;
}

// ---- Coverage, reading, About ------------------------------------------------------------------

function NotCovered({ data }: { data: SignalNoiseSummary }) {
  type Row = SignalNoiseSummary["not_covered"][number];
  return <ResearchSection id="not-covered" icon="eye-off" title="What this doesn't cover">
    <p className="sn-lead">A stat can be split only where it has a value for each game. These can&apos;t be:</p>
    <StatsGrid<Row> label="Not covered" name="not-covered" density="compact" height="auto" leadWidth="xl" className="sn-grid sn-auto sn-wrap" rows={data.not_covered} rowKey={r => r.family}
      lead={{ label: "Stats", cell: r => <span className="sn-name">{r.family}</span> }}
      columns={[{ key: "reason", label: "Why", width: "fill", align: "left", data: r => ({ field: "reason", value: r.family }), cell: r => <span className="sn-reason">{r.reason}</span> }]} />
  </ResearchSection>;
}

const GLOSSARY: GlossaryGroup[] = [
  { label: "Stabilization", icon: "ruler", items: [
    { term: "Reliability", text: "The share of the spread between players in a stat that is skill rather than luck, from 0 to 1." },
    { term: "Split-half", text: "Each player-season's games are split at random into two halves; reliability starts from how well the halves agree." },
    { term: "Spearman–Brown", text: "Steps the agreement between two halves up to what the full sample would show." },
    { term: "Bin", text: "One eighth of a stat's player-seasons, grouped by season sample. Reliability is measured within each bin." },
    { term: "Stabilization point", text: "The sample where reliability reaches 0.5. It is reported only where a bin of observed players shows it." },
    { term: "Typical season", text: "The median full-season sample of the player-seasons measured." },
  ] },
  { label: "Shrinkage", icon: "scale", items: [
    { term: "Prior", text: "A season's league-wide beta distribution of a percentage, fitted on up to three earlier seasons." },
    { term: "Strength", text: "α + β: the prior acts like that many league-average attempts." },
    { term: "Shrunk", text: "(makes + α) / (attempts + α + β): the player's percentage pulled toward the league." },
    { term: "95% interval", text: "For a shrunk value, the middle 95% of its posterior. For a gain or a reliability, a 95% bootstrap interval." },
    { term: "Squared points", text: "Mean squared error of a percentage, in percentage points squared. RMSE is its square root, in points." },
  ] },
];

function Reading() {
  return <>
    <ResearchSection id="reading" icon="book" title="How to read">
      <ResearchCards columns={3}>
        <ResearchCard kicker="Reliability"><p className="sn-card-text">0.5 means half of what separates players is skill. Below that, a hot or cold stretch says more about luck than about the player.</p></ResearchCard>
        <ResearchCard kicker="Sample"><p className="sn-card-text">Shooting stats count attempts of that kind; per-36 rates count minutes. Points sit where a bin shows the level, with a 95% interval.</p></ResearchCard>
        <ResearchCard kicker="Shrinkage"><p className="sn-card-text">A shrunk value is an estimate with an interval, not a verdict. Two players whose intervals overlap aren&apos;t ranked against each other.</p></ResearchCard>
      </ResearchCards>
    </ResearchSection>
    <ResearchDisclosure id="glossary" icon="list-ordered" title="Terms, defined"><Glossary groups={GLOSSARY} /></ResearchDisclosure>
  </>;
}

function About({ data }: { data: SignalNoiseSummary }) {
  const p = data.registration.parameters as Record<string, unknown>;
  const min = p.min_season_sample as { per_36_minutes: number; percentage: number } | undefined;
  const three = data.stabilization.stats.find(s => s.key === "fg3_pct");
  const rim = Object.values(data.coverage.rim);
  const mismatch = rim.reduce((n, r) => n + r.player_games_fga_mismatch, 0), playerGames = rim.reduce((n, r) => n + r.player_games, 0);
  const source = data.inputs.shot_detail.source.replace(/@[0-9a-f]+/, "");
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Method">
      <dl className="sn-defs">
        <dt>Stabilization</dt><dd data-field="method-stab">Regular seasons {data.stabilization_seasons[0]} to {data.stabilization_seasons.at(-1)}: {whole(data.stabilization.player_seasons_split)} player-seasons with {String(p.min_valid_games)} or more games, {whole(data.stabilization.players)} players. Each stat&apos;s player-seasons are grouped into {String(p.bins)} bins by season sample (at least {min?.percentage} attempts, or {min?.per_36_minutes} minutes for per-36 rates; bins need {String(p.min_players_per_bin)} players). Games are split at random {String(p.splits)} times; the mean split-half correlation is stepped up with Spearman–Brown, with a {String(p.bootstrap_replicates)}-replicate player bootstrap for the interval.</dd>
        <dt>Levels</dt><dd>A curve n / (n + M) is fitted to the bins, so 0.5 sits at M and 0.7 at 7M/3. A level is reported only where a bin reaches it.{three?.m && three.levels["0.5"]?.status === "not_reached" && <span data-field="three-fitted" data-value={three.m.value}> For 3P% the fitted curve would put 0.5 at {sampleWords(three.m.value, three)} (95% {formatSample(three.m.low)} to {formatSample(three.m.high)}), but no bin reaches 0.5, so it isn&apos;t a stabilization point.</span>}</dd>
        <dt>Priors</dt><dd>Beta-binomial empirical Bayes, fitted by maximum likelihood on the player-season makes and attempts of up to {String(p.prior_seasons_back)} earlier regular seasons. TS% isn&apos;t a single proportion, so it is rebuilt from shrunk 2P%, 3P% and FT%; its interval uses {whole(Number(p.ts_interval_draws))} draws.</dd>
        <dt>The test</dt><dd>Predict each player&apos;s raw value next season from this season&apos;s raw value, the prior mean or the shrunk value. Mean squared error weighted by next season&apos;s attempts; {String(p.bootstrap_replicates)} player-bootstrap replicates. Registered with no pass mark.</dd>
        <dt>Coverage</dt><dd data-field="coverage">Game logs: regular seasons {data.inputs.game_log_seasons[0]} to {data.inputs.game_log_seasons[1]}. Rim FG%: NBA shot detail ({source}) for {whole(rim.length)} seasons; its field-goal attempts disagree with the box score in {whole(mismatch)} of {whole(playerGames)} player-games. TS% points equal 2·2PM + 3·3PM + FTM in every player-season ({data.coverage.ts_identity_failures} exceptions). There is no 2026-27 shot detail, so 2026-27 rim values are unknown.</dd>
        <dt>Limits</dt><dd>Reliability is relative to the players in each bin, whose true spread differs from bin to bin. Splitting by game keeps each game&apos;s attempts together, which understates reliability slightly against shot-level splits.</dd>
        <dt>Fixed in advance</dt><dd>Registered on {formatDate(data.registration.registered_on)}, before any fit. Two runs from the same seed give the same results.</dd>
        <dt>Hashes</dt><dd>Registration <code>{data.registration.content_sha256.slice(0, 16)}</code> · results <code data-field="results-sha" data-value={data.results_sha256}>{data.results_sha256.slice(0, 16)}</code>.</dd>
        <dt>Credits</dt><dd data-field="credits">Split-half reliability and the Spearman–Brown prediction formula (Spearman 1910; Brown 1910), as used for stabilization points by Russell Carleton for baseball and Darryl Blackport for the NBA. Beta-binomial empirical Bayes after Efron and Morris (1975) and David Robinson. The numbers here are CourtLens&apos;s own.</dd>
      </dl>
      <ResearchLinks label="Evidence" links={[{ label: "How this analysis was built", href: evidenceUrl("docs/evidence/research/r03/README.md"), icon: "external" }]} />
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Page --------------------------------------------------------------------------------------

function Sections({ data }: { data: SignalNoiseSummary }) {
  const { get, set } = useUrlState();
  const keys = new Set(data.stabilization.stats.map(s => s.key));
  const active = keys.has(get("stat") ?? "") ? get("stat")! : DEFAULT_STAT;
  const activeFamily = data.stabilization.stats.find(s => s.key === active)?.family ?? "percentage";
  const family: Family = get("family") === "per_36" ? "per_36" : get("family") === "percentage" ? "percentage" : activeFamily;
  const reducedMotion = useReducedMotion();
  // A stat's name in the strip only selects its curve; the chart icon beside it selects it and goes there.
  const open = (key: string) => set({ stat: key === DEFAULT_STAT ? null : key });
  const jump = (key: string) => {
    open(key);
    document.getElementById("curve")?.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
  };
  return <>
    <Answer data={data} />
    <StabilizationSection data={data} family={family} onFamily={f => set({ family: f === activeFamily ? null : f })} active={active} onOpen={open} onJump={jump} />
    <CurveSection data={data} active={active} onOpen={key => set({ stat: key === DEFAULT_STAT ? null : key })} />
    <BinsDisclosure data={data} active={active} />
    <ExampleSection data={data} />
    <TestSection data={data} />
    <PriorSection data={data} />
    <NotCovered data={data} />
    <Reading />
    <About data={data} />
  </>;
}

export function SignalNoiseResearch() {
  const { data, error, loading, retry } = useFeed([], signal => getSignalNoise(signal));
  return <PageShell template="research">
    <div className="rs-column sn-page">
      <PageHeader className="sq-hero research-hero" icon="waveform" title="Signal vs Noise" subtitle="How big a sample each stat needs before it says more about the player than about luck, and shooting pulled toward the league." />
      <ResearchIntro
        tagline={data ? <span data-field="hero-meta">{[`${whole(data.stabilization.player_seasons_split)} player-seasons`, `${whole(data.stabilization.players)} players`, `${data.stabilization_seasons[0]} to ${data.stabilization_seasons.at(-1)}`, "registered before any fit"]
          .map((item, i) => <Fragment key={item}>{i > 0 ? " · " : ""}<span className="sn-meta-item">{item}</span></Fragment>)}</span> : null}
        links={[{ label: "Shrunk columns in Stats", href: "/stats?shrunk=1&viewId=shooting", icon: "table" }, { label: "Learning", href: "/methodology/learning", icon: "graduation" }]} />
      {error && <FeedFailure error={error} retry={retry} what="Signal vs Noise" />}
      {loading && <FeedSkeleton label="Loading Signal vs Noise" />}
      {data && <Sections data={data} />}
    </div>
  </PageShell>;
}
