"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { awayFirst, seasonOf, teamCode, teamFullName, tipoff, WIN_MODEL_NAMES, type LiveGame, type LiveTeam } from "@/lib/live";
import { formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import { callRight, marginText, towardTeam, whyBars, type WhyGroup, type WhyOutPlayer, type WhyPlayer, type WhyRow, type WinProbabilityWhy } from "@/lib/win-probability";
import { getWinProbabilityWhy, WorkbenchApiError } from "@/lib/workbench-api";
import { CourtLensSays } from "./brand";
import { teamColors } from "./live-game";
import { logoTeam, Panel } from "./live-panel";
import { PlayerPortrait } from "./player-portrait";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { useFeed } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Icon, type IconName } from "./ui/icon";
import { ButtonSummary } from "./ui/kit";

/**
 * W4: the Pre-Game "why". Every number is the seal's, read through the breakdown API: the own read's
 * groups add up exactly, the market row is w × (line − own), and the win chance is the full model's
 * at tip-off. Round 3 (2026-11-12): bars run toward the away team (left) or the home team (right) in
 * that team's colour; logos, full names and player photos; the notes sit behind "About this prediction".
 */

const vars = (values: Record<`--${string}`, string>) => values as CSSProperties;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const num = (v: number, digits = 2) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ROW_ICONS: Record<WhyGroup["group"] | "own" | "market" | "prediction", IconName> = {
  players: "users", form: "trend", home_court: "home", rest_travel: "plane", own: "chart", market: "scale", prediction: "gauge",
};

interface Sides { home: LiveTeam; away: LiveTeam; season: string }

function Toggle({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <details className="lp-toggle">
    <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">{label}</ButtonSummary>
    <div className={`lp-toggle-body ${className}`}>{children}</div>
  </details>;
}

/** Both teams, large, with the sealed chance for each and the favourite's side washed in its colour. */
function Matchup({ why, sides }: { why: WinProbabilityWhy; sides: Sides }) {
  const p = why.prediction.home_win;
  const favoured = p >= 0.5 ? "home" : "away";
  const side = (team: LiveTeam, chance: number) => <span className="lp-side" data-side={team.side} data-favoured={team.side === favoured || undefined}>
    <TeamLogo team={logoTeam(team)} season={sides.season} size={72} />
    <span className="lp-side-text"><span className="lp-side-name">{teamFullName(team, sides.season)}</span><strong className="lp-side-pct">{pct(chance)}</strong></span>
  </span>;
  return <div className="lp-matchup" data-favoured={favoured}>
    {side(sides.away, 1 - p)}
    <span className="lp-matchup-mid"><span className="lp-matchup-label">Win chance</span><span className="lp-split" aria-hidden="true" style={vars({ "--lp-away": `${(1 - p) * 100}%` })}><span data-side="away" /><span data-side="home" /></span></span>
    {side(sides.home, p)}
  </div>;
}

function Header({ why, sides }: { why: WinProbabilityWhy; sides: Sides }) {
  const homeFav = why.prediction.home_win >= 0.5;
  const team = homeFav ? sides.home : sides.away;
  const p = homeFav ? why.prediction.home_win : 1 - why.prediction.home_win;
  return <p className="lp-headline" data-field="headline" data-home-win={why.prediction.home_win}>
    <CourtLensSays size={15} />{" "}
    <span>favors</span>
    <span className="lp-team"><TeamLogo team={logoTeam(team)} season={sides.season} size={24} /><strong>{teamFullName(team, sides.season)}</strong></span>
    <span>· <strong>{pct(p)}</strong> to win · predicted margin {marginText(why.prediction.home_margin, teamCode(sides.home), teamCode(sides.away))}</span>
  </p>;
}

function Bars({ why, sides }: { why: WinProbabilityWhy; sides: Sides }) {
  const bars = whyBars(why);
  const scale = Math.max(1, ...bars.map(b => Math.abs(b.points)));
  const home = teamCode(sides.home), away = teamCode(sides.away);
  return <div className="lp-bars" role="table" aria-label="What moved the prediction, in points of margin">
    <div className="lp-bar-row lp-bar-axis" role="row">
      <span role="columnheader" className="sr-only">Reason</span>
      <span role="columnheader" className="lp-axis-label">
        <span className="lp-axis-team" data-side="away"><TeamLogo team={logoTeam(sides.away)} season={sides.season} size={28} />toward {teamFullName(sides.away, sides.season)}</span>
        <span className="lp-axis-team" data-side="home">toward {teamFullName(sides.home, sides.season)}<TeamLogo team={logoTeam(sides.home)} season={sides.season} size={28} /></span>
      </span>
      <span role="columnheader" className="sr-only">Points</span>
    </div>
    {bars.map(bar => <div key={bar.key} className="lp-bar-row" role="row" data-kind={bar.kind} data-row={bar.key} data-points={bar.points}>
      <span role="cell" className="lp-bar-label"><span className="lp-bar-icon" aria-hidden="true"><Icon name={ROW_ICONS[bar.key as keyof typeof ROW_ICONS] ?? "chart"} size={14} /></span>{bar.label}</span>
      <span role="cell" className="lp-bar-track" aria-hidden="true">
        <span className="lp-bar" data-side={bar.points >= 0 ? "home" : "away"} style={vars({ "--lp-width": `${(Math.abs(bar.points) / scale) * 50}%` })} />
      </span>
      <span role="cell" className="lp-bar-value" data-side={Math.abs(bar.points) < 0.05 ? undefined : bar.points > 0 ? "home" : "away"}>{bar.kind === "group" || bar.kind === "market" ? towardTeam(bar.points, home, away) : marginText(bar.points, home, away)}{bar.kind === "prediction" && <> <Icon name="right" size={14} className="lp-arrow" /><span className="sr-only">gives</span> {pct(why.prediction.home_win >= 0.5 ? why.prediction.home_win : 1 - why.prediction.home_win)}</>}</span>
    </div>)}
  </div>;
}

function MarketNote({ why, sides }: { why: WinProbabilityWhy; sides: Sides }) {
  const m = why.market;
  const home = teamCode(sides.home), away = teamCode(sides.away);
  const text = m.status === "ok" ? `The line is ${marginText(m.line, home, away)}${m.book ? ` (${m.book})` : ""}. The model moves ${Math.round(m.w * 100)}% of the way from its own read to it.`
    : m.status === "no_line" ? "No line when this was sealed; own read only."
    : m.status === "sealed_before_freeze" ? "Sealed before the market-informed model was frozen, so this is the Original model's call: own read only." : null;
  return text ? <p className="lp-callout" data-field="market"><Icon name="scale" size={14} /><span>{text}</span></p> : null;
}

/** An estimate in the own forecast's points; below zero the missing player was a net minus. */
export function absence(cost: number | null, code: string): string {
  if (cost == null) return "no rating, not counted";
  const size = Number(Math.abs(cost).toFixed(1));
  if (size === 0) return `about no effect on ${code}`;
  return cost > 0 ? `costs ${code} about ${size.toFixed(1)} points` : `helps ${code} about ${size.toFixed(1)} points`;
}

function TeamHead({ team, sides, count }: { team: LiveTeam; sides: Sides; count?: ReactNode }) {
  return <span className="lp-team-head" data-side={team.side}><TeamLogo team={logoTeam(team)} season={sides.season} size={32} /><strong>{teamFullName(team, sides.season)}</strong>{count != null && <span className="lp-count">{count}</span>}</span>;
}

function OutList({ team, players, sides, scale }: { team: LiveTeam; players: WhyOutPlayer[] | undefined; sides: Sides; scale: number }) {
  const code = teamCode(team);
  return <div className="lp-out-team" data-side={team.side}>
    <TeamHead team={team} sides={sides} count={players ? `${players.length} out` : undefined} />
    {players?.length ? <ul>{players.map(p => <li key={p.player_id ?? p.name} className="lp-person">
      <PlayerPortrait playerId={p.player_id ?? undefined} name={p.name} size="md" era={seasonEra(sides.season, logoTeam(team))} />
      <span className="lp-person-text">
        <span className="lp-person-name">{p.player_id ? <Link href={`/players/${p.player_id}?season=${sides.season}`}>{p.name}</Link> : p.name}</span>
        <span className="lp-muted">{absence(p.cost, code)}</span>
      </span>
      {p.cost != null && <span className="lp-cost" data-sign={p.cost > 0.05 ? "costs" : p.cost < -0.05 ? "helps" : "none"} aria-hidden="true">
        <span className="lp-cost-bar" style={vars({ "--lp-cost": `${Math.min(1, Math.abs(p.cost) / scale) * 100}%` })} /><span className="lp-cost-num">{p.cost > 0.05 ? "−" : p.cost < -0.05 ? "+" : ""}{Math.abs(p.cost).toFixed(1)}</span>
      </span>}
    </li>)}</ul> : <span className="lp-muted lp-none">Nobody listed Out</span>}
  </div>;
}

function PlayerList({ team, players, sides }: { team: LiveTeam; players: WhyPlayer[] | undefined; sides: Sides }) {
  const most = Math.max(36, ...(players ?? []).map(p => p.minutes));
  return <div className="lp-out-team" data-side={team.side}>
    <TeamHead team={team} sides={sides} />
    {players?.length ? <ol>{players.map(p => <li key={p.player_id} className="lp-person">
      <PlayerPortrait playerId={p.player_id} name={p.name} size="sm" era={seasonEra(sides.season, logoTeam(team))} />
      <span className="lp-person-text">
        <span className="lp-person-name"><Link href={`/players/${p.player_id}?season=${sides.season}`}>{p.name}</Link></span>
        <span className="lp-minutes" aria-hidden="true"><span style={vars({ "--lp-min": `${(p.minutes / most) * 100}%` })} /></span>
      </span>
      <span className="lp-muted lp-person-stat">{num(p.minutes, 1)} min · rating {p.rating > 0 ? "+" : ""}{num(p.rating, 1)}{p.default_rating ? " (default)" : ""}</span>
    </li>)}</ol> : <span className="lp-muted">Unknown</span>}
  </div>;
}

type InputRow = WhyRow & { group: string };

function ExactInputs({ why }: { why: WinProbabilityWhy }) {
  const rows: InputRow[] = why.own.groups.flatMap(g => g.rows.map(r => ({ ...r, group: g.label })));
  if (why.market.status === "ok") rows.push({ input: "market", label: "Line minus own read", value: why.market.line - why.own.own, coefficient: why.market.w, contribution: why.market.adjustment, group: "Market adjustment" });
  const columns: GridColumn<InputRow>[] = [
    { key: "value", label: "Value", width: "sm", data: r => ({ field: "value", value: r.value }), cell: r => <GridValue text={num(r.value, 3)} /> },
    { key: "coefficient", label: "Coefficient", width: "sm", data: r => ({ field: "coefficient", value: r.coefficient }), cell: r => <GridValue text={num(r.coefficient, 3)} /> },
    { key: "contribution", label: "Points", title: "Coefficient × value, in home-margin points", width: "sm", data: r => ({ field: "contribution", value: r.contribution }), cell: r => <GridValue text={num(r.contribution, 3)} /> },
  ];
  return <>
    <StatsGrid<InputRow> label="Exact inputs" name="why-inputs" density="compact" height="auto" leadWidth="lg" rows={rows} rowKey={r => r.input}
      rowData={r => ({ input: r.input })} lead={{ label: "Input", cell: r => <><span className="lp-input-name">{r.label}</span><span className="lp-muted">{r.group}</span></> }} columns={columns} />
    <p className="lp-note">Points are in the home team&apos;s margin. Seal <code>{why.seal}</code> · model manifest <code>{why.manifest_sha256.slice(0, 16)}…</code></p>
  </>;
}

function Result({ why, sides }: { why: WinProbabilityWhy; sides: Sides }) {
  if (!why.result) return null;
  const right = callRight(why);
  return <p className="lp-result" data-field="result" data-right={right == null ? undefined : String(right)}>
    Final: {teamCode(sides.away)} {why.result.away_score}, {teamCode(sides.home)} {why.result.home_score}
    {right != null && <> · the call was <span className="lp-mark">{right ? "right" : "wrong"}<Icon name={right ? "check" : "close"} size={14} /></span></>}
  </p>;
}

function About({ why }: { why: WinProbabilityWhy }) {
  const sealed = tipoff(why.captured_at);
  const ages = why.ages ?? {};
  const facts = [
    sealed && `Sealed ${sealed}`,
    ages.box_through && `box scores through ${formatDate(ages.box_through, "compact")}`,
    ages.rating_snapshot_cutoff && `ratings as of ${formatDate(ages.rating_snapshot_cutoff, "compact")}`,
    ages.injury_report_at && `injury report read ${tipoff(ages.injury_report_at)}`,
  ].filter(Boolean);
  return <ul className="lp-about">
    <li data-field="ages">{facts.join(" · ")}</li>
    <li>{why.availability_note}</li>
    <li>The win chance comes from the full model at tip-off, so it is not a straight conversion of the margin.</li>
  </ul>;
}

export function PredictionBody({ why, game }: { why: WinProbabilityWhy; game: LiveGame }) {
  const [away, home] = awayFirst(game.teams);
  const sides: Sides = { home, away, season: seasonOf(game.slate_date) };
  const out = [...(why.out?.away ?? []), ...(why.out?.home ?? [])];
  const costScale = Math.max(1, ...out.map(p => Math.abs(p.cost ?? 0)));
  const other = why.model === "market_informed" ? why.tip_off_home.original : null;
  return <div className="lp-body" data-model={why.model} data-seal={why.seal} style={teamColors(game.teams, sides.season)}>
    <Matchup why={why} sides={sides} />
    <Header why={why} sides={sides} />
    <Result why={why} sides={sides} />
    <section className="lp-section" aria-label="What moved the prediction">
      <h3><Icon name="chart" size={16} />What moved the prediction</h3>
      <Bars why={why} sides={sides} />
      <MarketNote why={why} sides={sides} />
    </section>
    <section className="lp-section" aria-label="Who's out">
      <h3><Icon name="alert" size={16} />Who&apos;s out</h3>
      <div className="lp-out">
        <OutList team={away} players={why.out?.away} sides={sides} scale={costScale} />
        <OutList team={home} players={why.out?.home} sides={sides} scale={costScale} />
      </div>
    </section>
    <div className="lp-toggles">
      {why.players && <Toggle label="Players available, by expected minutes" className="lp-out">
        <PlayerList team={away} players={why.players.away} sides={sides} />
        <PlayerList team={home} players={why.players.home} sides={sides} />
      </Toggle>}
      <Toggle label="Exact inputs"><ExactInputs why={why} /></Toggle>
      <Toggle label="About this prediction"><About why={why} /></Toggle>
    </div>
    <p className="lp-note lp-model" data-field="model">
      Model: {why.model === "market_informed" ? "Market-informed model, on trial against the Original" : WIN_MODEL_NAMES.original}
      {other != null && ` (the Original gave ${other >= 0.5 ? teamCode(home) : teamCode(away)} ${pct(other >= 0.5 ? other : 1 - other)})`} · Not betting advice.
    </p>
  </div>;
}

/** The first Pre-Game panel. A game with no seal says so; nothing is invented in its place. */
export function PredictionPanel({ game }: { game: LiveGame }) {
  const sealedCard = game.prediction?.status !== "no_seal";
  const { data, error, loading } = useFeed([game.source_id, game.slate_date, sealedCard ? "1" : "0"], async () => {
    if (!sealedCard) return null;
    try { return await getWinProbabilityWhy(game.source_id, game.slate_date); }
    catch (e) { if (e instanceof WorkbenchApiError && e.status === 404) return null; throw e; }
  });
  return <Panel title="CourtLens prediction" icon="gauge" className="live-pregame-prediction">
    {loading ? <p className="lp-muted" role="status">Loading the sealed prediction…</p>
      : error ? <p className="lp-muted" role="alert">The prediction is unavailable right now.</p>
      : data ? <PredictionBody why={data} game={game} />
      : <p className="lp-muted" data-field="no-seal">No prediction was sealed for this game.</p>}
  </Panel>;
}
