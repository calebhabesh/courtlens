"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { DataDetailsButton } from "./ui/data-details";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { Button, IconButton, Segmented, Select } from "./ui/kit";
import { ResearchDisclosure } from "./research/research-page";
import { ObservedInputs } from "./four-factors-inputs";
import { fixed, signed } from "@/lib/draft-classes";
import {
  BOARD_KEYS, LAB_GROUPS, LAB_HINTS, LAB_LABELS, STEP, labBase, labMarginal, labRange, labSet, labTerms, labValue, stepSign,
  type LabBase, type LabKey, type LabState,
} from "@/lib/ortg-lab";
import { getFourFactors, getFourFactorsSeason, type FourFactorsSeason, type FourFactorsSummary } from "@/lib/research-r10";
import { teamArtwork } from "@/lib/team-era";

/*
 * Research → ORtg Calculator (RD02, after Databallr's ORTG Lab; R10's served inputs). Databallr's layout: a hero
 * bar, the inputs panel beside the equation card and its tabs, the stepper board, the methodology, then R10's
 * observed tables collapsed. Every number is computed on the page from the served counts (lib/ortg-lab.ts).
 */

type Tab = "marginal" | "decomposition" | "notes";
const TABS = [
  { value: "marginal", label: "Marginal value" },
  { value: "decomposition", label: "Decomposition" },
  { value: "notes", label: "Context notes" },
] as const;

const pct = (v: number, d = 1) => (v * 100).toFixed(d);
/** Gold above zero, blue below, none when it rounds to zero (no interval: identity tones, never green/red). */
const tone = (v: number, d = 2): "a" | "b" | undefined => { const r = Number(v.toFixed(d)); return r > 0 ? "a" : r < 0 ? "b" : undefined; };
const tricode = (team: string, season: string) => teamArtwork(team, season)?.tricode ?? team;

interface Baseline { base: LabBase; name: string; team: string | null; leagueOrtg: number; season: string; games: number; mu: number }

function Hero({ paper }: { paper: FourFactorsSummary["paper"] }) {
  return <PageHeader className="ol-hero"
    title={<><span className="ol-pill" aria-hidden="true"><Icon name="calculator" size={14} />ORTG Lab</span><span>Offensive Rating Calculator</span></>}
    actions={<a className="ol-link" href={paper.url} target="_blank" rel="noreferrer">Paper<Icon name="right" size={14} /></a>} />;
}

function Baseline({ data, season, team, teams, set }: { data: FourFactorsSummary; season: string; team: string | null; teams: readonly string[] | null; set: (u: Record<string, string | null>) => void }) {
  const latest = data.seasons.at(-1)!.season;
  return <div className="ol-baseline" role="group" aria-label="Starting point">
    <Select size="sm" aria-label="Season" value={season} onChange={e => set({ season: e.target.value === latest ? null : e.target.value, team: null })}>
      {[...data.seasons].reverse().map(s => <option key={s.season} value={s.season}>{s.season}</option>)}
    </Select>
    <span className="ol-team-pick">
      {team && <TeamLogo team={team} season={season} size={20} />}
      <Select size="sm" aria-label="Team" value={team ?? ""} disabled={!teams} onChange={e => set({ team: e.target.value || null })}>
        <option value="">League average</option>
        {(teams ?? []).map(t => <option key={t} value={t}>{tricode(t, season)}</option>)}
      </Select>
      {team && <IconButton size="sm" icon="close" label="Clear team" onClick={() => set({ team: null })} />}
    </span>
  </div>;
}

function Slider({ base, state, k, onSet }: { base: LabBase; state: LabState; k: LabKey; onSet: (k: LabKey, v: number) => void }) {
  const value = labValue(base, state, k), { min, max } = labRange(base, k), m = labMarginal(base, state, k);
  const id = `ol-${k}`, fill = Math.min(100, Math.max(0, (value - min) / (max - min) * 100));
  return <div className="ol-row" data-key={k}>
    <label className="ol-row-label" htmlFor={id}>{LAB_LABELS[k]}</label>
    <span className="ol-row-value" data-field="value" data-value={value}>{pct(value)}<small>%</small></span>
    <input id={id} type="range" className="ol-range" min={min} max={max} step={0.001} value={Math.min(max, Math.max(min, value))}
      aria-valuetext={`${pct(value)}%`} title={LAB_HINTS[k]} style={{ "--fill": `${fill}%` } as CSSProperties}
      onChange={e => onSet(k, Number(e.target.value))} />
    <span className="ol-row-delta" data-identity={tone(m)} data-field="marginal" data-value={m}>{signed(m, 2)}<small>/1%</small></span>
  </div>;
}

function Inputs({ base, state, onSet, onReset, baseline }: { base: LabBase; state: LabState; onSet: (k: LabKey, v: number) => void; onReset: () => void; baseline: ReactNode }) {
  return <section id="ortg-inputs" className="ol-panel ol-inputs" aria-label="Inputs" tabIndex={-1}>
    <div className="ol-inputs-head"><h2 className="ol-kicker">Inputs</h2><Button size="sm" variant="ghost" icon="refresh" onClick={onReset}>Reset</Button></div>
    {baseline}
    {LAB_GROUPS.map(g => <div key={g.label} className="ol-group" role="group" aria-label={g.label}>
      <h3 className="ol-kicker ol-group-label">{g.label}</h3>
      {g.keys.map(k => <Slider key={k} base={base} state={state} k={k} onSet={onSet} />)}
    </div>)}
  </section>;
}

function Equation({ b, state }: { b: Baseline; state: LabState }) {
  const t = labTerms(b.base, state), diff = t.ortg - b.leagueOrtg;
  const term = (label: string, field: string, value: number, text: string) => <div className="ol-term">
    <span className="ol-term-label">{label}</span><strong className="ol-term-value" data-field={field} data-value={value}>{fixed(value, 3)}</strong><span className="ol-term-text">{text}</span>
  </div>;
  return <div className="ol-well ol-equation" role="group" aria-label="Offensive rating">
    <div className="ol-term ol-term-main">
      <span className="ol-term-label">ORTG</span>
      <strong className="ol-ortg" data-field="ortg" data-value={t.ortg}>{fixed(t.ortg, 1)}</strong>
      <span className="ol-term-text">league avg <span data-field="league-ortg" data-value={b.leagueOrtg}>{fixed(b.leagueOrtg, 1)}</span></span>
      <span className="ol-vs" data-identity={tone(diff)} data-field="vs-avg" data-value={diff}>{signed(diff, 2)} vs avg</span>
    </div>
    <span className="ol-op" aria-hidden="true">=</span>
    {term("xSHOT", "xshot", t.xshot, "Possessions that survive the turnover tax.")}
    <span className="ol-op" aria-hidden="true">×</span>
    {term("xEFF", "xeff", t.xeff, "Points created once a scoring event starts.")}
    <span className="ol-op" aria-hidden="true">×</span>
    {term("xPOSS", "xposs", t.xposs, "Recycle loops from ORBs and missed final FTs.")}
  </div>;
}

function Fact({ label, field, value, text }: { label: string; field: string; value: number; text: string }) {
  return <div className="ol-fact"><dt>{label}</dt><dd data-field={field} data-value={value}>{text}</dd></div>;
}

function Decomposition({ b, state }: { b: Baseline; state: LabState }) {
  const t = labTerms(b.base, state);
  return <div className="ol-cards">
    <section className="ol-card" aria-label="Shot profile"><h3 className="ol-kicker">Shot Profile</h3><dl className="ol-facts">
      <Fact label="eFG%" field="efg" value={t.efg} text={`${pct(t.efg)}%`} />
      <Fact label="Miss rate" field="miss-rate" value={t.missRate} text={`${pct(t.missRate)}%`} />
      <Fact label="Shot value / FGA" field="shot-value" value={t.shotValue} text={fixed(t.shotValue, 3)} />
      <Fact label="FT value / FGA" field="ft-value" value={t.ftValue} text={fixed(t.ftValue, 3)} />
      <Fact label="FG ORB recycle" field="fg-recycle" value={t.fgRecycle} text={`${pct(t.fgRecycle, 2)}%`} />
      <Fact label="FT ORB recycle" field="ft-recycle" value={t.ftRecycle} text={`${pct(t.ftRecycle, 2)}%`} />
    </dl></section>
    <section className="ol-card" aria-label="Possession flow"><h3 className="ol-kicker">Possession Flow</h3><dl className="ol-facts">
      <Fact label="Possession denominator" field="den" value={t.den} text={fixed(t.den, 3)} />
      <Fact label="TOV survival" field="tov-survival" value={t.xshot} text={`${pct(t.xshot)}%`} />
      <Fact label="FT-ending weight (μ)" field="mu" value={b.mu} text={fixed(b.mu, 3)} />
      <div className="ol-fact"><dt>Formula</dt><dd className="ol-formula">100 × {fixed(t.xshot, 3)} × {fixed(t.xeff, 3)} × {fixed(t.xposs, 3)}</dd></div>
    </dl></section>
  </div>;
}

function MarginalBoard({ b, state }: { b: Baseline; state: LabState }) {
  const rows = BOARD_KEYS.map(k => ({ k, m: labMarginal(b.base, state, k) })).sort((x, y) => y.m - x.m);
  const top = Math.max(...rows.map(r => Math.abs(r.m)), 1e-9);
  return <ol className="ol-board-list" aria-label="Marginal value board">
    {rows.map(({ k, m }) => <li key={k} data-key={k}>
      <span className="ol-board-label">{LAB_LABELS[k]}{k === "tov" && <small> −1%</small>}</span>
      <span className="ol-bar" aria-hidden="true"><span className="ol-bar-fill" data-identity={tone(m)} style={{ "--w": `${Math.abs(m) / top * 100}%` } as CSSProperties} /></span>
      <span className="ol-board-value" data-identity={tone(m)} data-field="marginal" data-value={m}>{signed(m, 2)}</span>
    </li>)}
  </ol>;
}

function Notes({ b }: { b: Baseline }) {
  return <ul className="ol-notes">
    <li>Starting point: <strong>{b.name}</strong>, {b.season} regular season ({b.games.toLocaleString("en-US")} games), counted from play-by-play.</li>
    <li>ΔORTG on each control is the change for one point better, the others held: one point up, or one point down for TOV%.</li>
    <li>ORTG is points per 100 estimated possessions (FGA + TOV − ORB + μ FTA), so it runs a little off NBA.com&apos;s.</li>
    <li>Moving one input holds the others, which real offenses can&apos;t do; read it as accounting, not a forecast.</li>
  </ul>;
}

function Stepper({ base, state, k, onSet }: { base: LabBase; state: LabState; k: LabKey; onSet: (k: LabKey, v: number) => void }) {
  const value = labValue(base, state, k), m = labMarginal(base, state, k);
  return <li className="ol-step" data-key={k}>
    <div className="ol-step-main">
      <span className="ol-kicker">{LAB_LABELS[k]}</span>
      <span className="ol-step-control">
        <IconButton size="sm" variant="secondary" icon="chevron-down" label={`${LAB_LABELS[k]} down one point`} onClick={() => onSet(k, value - STEP)} />
        <span className="ol-step-value" data-field="value" data-value={value}>{pct(value)}<small>%</small></span>
        <IconButton size="sm" variant="secondary" icon="chevron-up" label={`${LAB_LABELS[k]} up one point`} onClick={() => onSet(k, value + STEP)} />
      </span>
    </div>
    <div className="ol-step-side">
      <span className="ol-kicker">ΔORTG</span>
      <span className="ol-step-delta" data-identity={tone(m)} data-field="marginal" data-value={m} title={stepSign(k) < 0 ? "ORTG change for one point down" : "ORTG change for one point up"}>{signed(m, 2)}</span>
    </div>
  </li>;
}

function Board({ b, state, onSet, onReset }: { b: Baseline; state: LabState; onSet: (k: LabKey, v: number) => void; onReset: () => void }) {
  const t = labTerms(b.base, state), diff = t.ortg - b.leagueOrtg;
  const tile = (label: string, value: string, field: string, raw: number, extra?: ReactNode) => <div className="ol-tile">
    <span className="ol-kicker">{label}</span><strong className={label === "ORTG" ? "ol-tile-value ol-tile-ortg" : "ol-tile-value"} data-field={field} data-value={raw}>{value}</strong>{extra}
  </div>;
  return <section className="ol-panel ol-board" aria-label="Stepper board">
    <div className="ol-tiles">
      {tile("ORTG", fixed(t.ortg, 1), "ortg", t.ortg, <span className="ol-vs ol-vs-sm" data-identity={tone(diff)}>{signed(diff, 2)} vs avg</span>)}
      {tile("xSHOT", fixed(t.xshot, 3), "xshot", t.xshot)}
      {tile("xEFF", fixed(t.xeff, 3), "xeff", t.xeff)}
      {tile("xPOSS", fixed(t.xposs, 3), "xposs", t.xposs)}
    </div>
    <div className="ol-board-actions">
      <Button size="sm" icon="refresh" onClick={onReset}>Reset to {b.team ? tricode(b.team, b.season) : "league average"}</Button>
      <Button size="sm" onClick={() => { const el = document.getElementById("ortg-inputs"); el?.scrollIntoView({ block: "start" }); el?.focus({ preventScroll: true }); }}>Show sliders</Button>
    </div>
    <ul className="ol-steps" aria-label="Steppers">{BOARD_KEYS.map(k => <Stepper key={k} base={b.base} state={state} k={k} onSet={onSet} />)}</ul>
  </section>;
}

function Methodology({ data }: { data: FourFactorsSummary }) {
  const p = data.paper;
  const card = (title: string, body: ReactNode) => <section className="ol-card ol-method-card" aria-label={title}><h3 className="ol-kicker">{title}</h3>{body}</section>;
  return <section className="ol-panel ol-method" aria-labelledby="ol-method-title">
    <div className="ol-method-head">
      <div><p className="ol-kicker">Methodology</p><h2 id="ol-method-title" className="ol-method-title">How this calculator is built</h2></div>
      <a className="ol-link ol-link-pill" href={p.url} target="_blank" rel="noreferrer">{p.earlier_title}<Icon name="right" size={14} /></a>
    </div>
    <div className="ol-prose">
      <p>This calculator follows <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> by {p.authors} (arXiv:{p.arxiv}; first posted as “{p.earlier_title}”), the paper Databallr&apos;s ORTG Lab credits.</p>
      <p>The paper writes offensive rating as a turnover-survival term, a scoring term and a possession-extension term. This page keeps that structure and starts from each season&apos;s counted inputs, for the league or any team.</p>
    </div>
    <div className="ol-well ol-form">
      <p className="ol-kicker">Calculator form</p>
      <p className="ol-form-line">ORTG = 100 × xSHOT × xEFF × xPOSS</p>
      <div className="ol-form-terms">
        <p><strong>xSHOT</strong> is the turnover survival term, 1 − TOV%.</p>
        <p><strong>xEFF</strong> is the scoring term, 2 × eFG% + FT Rate × FT% (the paper&apos;s FTr + 2 eFG%).</p>
        <p><strong>xPOSS</strong> is the recycle multiplier, 1 / (1 − ORB%(1 − FG%) + μ × FT Rate): it grows when missed shots or missed final free throws come back as offensive rebounds.</p>
      </div>
    </div>
    <div className="ol-cards">
      {card("Turnovers and possessions", <div className="ol-prose">
        <p>TOV% is the paper&apos;s Eq. (10), turnovers per estimated possession, and the page uses xSHOT = 1 − TOV% directly.</p>
        <p>μ is the share of free throws that end a possession, counted each season ({fixed(data.seasons.at(-1)!.mu, 3)} in {data.seasons.at(-1)!.season}; the paper published {fixed(p.published_2024_25.mu, 3)} for 2024-25).</p>
      </div>)}
      {card("Rebounding adjustments", <div className="ol-prose">
        <p>Instead of one ORB%, the page exposes <strong>2P OREB%</strong>, <strong>3P OREB%</strong> and <strong>FT OREB%</strong> (after a missed final free throw), each the share of that kind of miss the offense rebounded.</p>
        <p><strong>ORB%</strong> is a master dial: it moves 2P and 3P OREB% together, and it reads back the paper&apos;s Eq. (9), every offensive rebound over missed field goals. Rebounds after missed and-ones stay at the starting rate.</p>
      </div>)}
      {card("eFG and TS controls", <div className="ol-prose">
        <p><strong>eFG%</strong> and <strong>TS%</strong> are read from the shooting inputs and are also dials. One point of eFG% writes back +1.0 2P% and +0.667 3P%, which moves eFG% by exactly one point.</p>
        <p>TS% moves 2P%, 3P% (two thirds as much) and FT% together by the amount that moves TS% exactly. Editing any one input moves both readouts.</p>
      </div>)}
      {card("Exact at the start", <div className="ol-prose">
        <p>The split rebounds are Databallr&apos;s adaptation; the paper discusses separate free-throw rebounding in Remark 2. At the starting point they add up to the counted ORB%, so the rating equals the served Eq. (11) for every season and team.</p>
        <p>After any move the rating is still Eq. (11) on the inputs shown; the split only decides how ORB% follows a change in shooting.</p>
      </div>)}
    </div>
  </section>;
}

function Lab({ data, b, teams, season, set }: { data: FourFactorsSummary; b: Baseline; teams: readonly string[] | null; season: string; set: (u: Record<string, string | null>) => void }) {
  const [state, setState] = useState(b.base.state);
  const [tab, setTab] = useState<Tab>("decomposition");
  const onSet = (k: LabKey, v: number) => setState(s => labSet(b.base, s, k, v));
  const reset = () => setState(b.base.state);
  return <>
    <div className="ol-main">
      <Inputs base={b.base} state={state} onSet={onSet} onReset={reset} baseline={<Baseline data={data} season={season} team={b.team} teams={teams} set={set} />} />
      <section className="ol-panel ol-result" aria-label="Result">
        <Equation b={b} state={state} />
        <Segmented label="Result view" size="sm" options={TABS} value={tab} onChange={setTab} className="ol-tabs" dense />
        <div className="ol-tab-body" role="region" aria-label={TABS.find(t => t.value === tab)!.label}>
          {tab === "decomposition" ? <Decomposition b={b} state={state} /> : tab === "marginal" ? <MarginalBoard b={b} state={state} /> : <Notes b={b} />}
        </div>
      </section>
    </div>
    <Board b={b} state={state} onSet={onSet} onReset={reset} />
  </>;
}

/** Research → ORtg Calculator. */
export function OrtgLabView() {
  const { get, set } = useUrlState();
  const summary = useFeed([], signal => getFourFactors(signal));
  const data = summary.data;
  const season = data?.seasons.find(s => s.season === get("season"))?.season ?? data?.seasons.at(-1)?.season ?? null;
  const seasonFeed = useFeed([season], signal => season ? getFourFactorsSeason(season, signal) : Promise.resolve(null as FourFactorsSeason | null));
  const teamParam = get("team");
  const seasonData = seasonFeed.data && seasonFeed.data.season === season ? seasonFeed.data : null;
  const teams = useMemo(() => seasonData ? [...seasonData.teams].map(t => t.team).sort((x, y) => tricode(x, seasonData.season).localeCompare(tricode(y, seasonData.season))) : null, [seasonData]);
  const baseline = useMemo<Baseline | null>(() => {
    const head = data?.seasons.find(s => s.season === season);
    if (!data || !head) return null;
    const teamRow = teamParam && seasonData ? seasonData.teams.find(t => t.team === teamParam) ?? null : null;
    const row = teamRow ?? head.league;
    const base = labBase(row, head.mu);
    if (!base || head.league.ortg_factors == null) return null;
    return { base, name: teamRow ? tricode(teamRow.team, head.season) : "League average", team: teamRow?.team ?? null, leagueOrtg: head.league.ortg_factors, season: head.season, games: head.games, mu: head.mu };
  }, [data, season, teamParam, seasonData]);
  if (summary.error) return <PageShell template="research"><div className="rs-column ol-page"><FeedFailure error={summary.error} retry={summary.retry} what="Four-factor inputs" /></div></PageShell>;
  if (summary.loading || !data || !season) return <PageShell template="research"><div className="rs-column ol-page"><FeedSkeleton label="Loading the ORTG lab" /></div></PageShell>;
  const waitingTeam = Boolean(teamParam) && !seasonData && !seasonFeed.error;
  const details = <DataDetailsButton rows={[
    { label: "Registration", value: `${data.registration.identity} · ${data.registration.content_sha256}`, mono: true },
    { label: "Results SHA-256", value: data.registration.results_sha256, mono: true },
  ]} />;
  return <PageShell template="research" className="ol-shell">
    <div className="rs-column ol-page" data-section="ortg-lab">
      <Hero paper={data.paper} />
      {waitingTeam || !baseline ? <FeedSkeleton label="Loading team inputs" />
        : <Lab key={`${baseline.season}-${baseline.team ?? "league"}`} data={data} b={baseline} teams={teams} season={season} set={set} />}
      <Methodology data={data} />
      <ResearchDisclosure id="observed" icon="table" title="Observed Inputs & Caveats">
        <ObservedInputs data={data} season={season} seasonData={seasonData} seasonError={seasonFeed.error} retry={seasonFeed.retry} details={details} />
      </ResearchDisclosure>
      <p className="ol-sources">Data: NBA play-by-play (PlayByPlayV3 via shufinskiy/nba_data), counted by CourtLens. Method: {data.paper.authors}. Design after Databallr&apos;s ORTG Lab.</p>
    </div>
  </PageShell>;
}
