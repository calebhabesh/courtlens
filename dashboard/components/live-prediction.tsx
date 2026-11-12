"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { awayFirst, seasonOf, teamCode, tipoff, WIN_MODEL_NAMES, type LiveGame, type LiveTeam } from "@/lib/live";
import { formatDate } from "@/lib/format-date";
import { callRight, marginText, towardTeam, whyBars, type WhyOutPlayer, type WhyPlayer, type WhyRow, type WinProbabilityWhy } from "@/lib/win-probability";
import { getWinProbabilityWhy, WorkbenchApiError } from "@/lib/workbench-api";
import { logoTeam, Panel } from "./live-panel";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { useFeed } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { ButtonSummary } from "./ui/kit";

/**
 * W4: the Pre-Game "why". Every number is the seal's, read through the breakdown API: the own read's
 * groups add up exactly, the market row is w × (line − own), and the win chance is the full model's
 * at tip-off. Bars run toward the away team (left) or the home team (right); none is coloured.
 */

const vars = (values: Record<`--${string}`, string>) => values as CSSProperties;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const num = (v: number, digits = 2) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Header({ why, home, away, season }: { why: WinProbabilityWhy; home: LiveTeam; away: LiveTeam; season: string }) {
  const homeFav = why.prediction.home_win >= 0.5;
  const team = homeFav ? home : away;
  const p = homeFav ? why.prediction.home_win : 1 - why.prediction.home_win;
  return <p className="lp-headline" data-field="headline" data-home-win={why.prediction.home_win}>
    <span>CourtLens favors</span>
    <span className="lp-team"><TeamLogo team={logoTeam(team)} season={season} size={20} /><strong>{teamCode(team)}</strong></span>
    <span>· <strong>{pct(p)}</strong> to win · predicted margin {marginText(why.prediction.home_margin, teamCode(home), teamCode(away))}</span>
  </p>;
}

function Bars({ why, home, away }: { why: WinProbabilityWhy; home: string; away: string }) {
  const bars = whyBars(why);
  const scale = Math.max(1, ...bars.map(b => Math.abs(b.points)));
  return <div className="lp-bars" role="table" aria-label="What moved the prediction, in points of margin">
    <div className="lp-bar-row lp-bar-axis" role="row">
      <span role="columnheader" className="sr-only">Reason</span>
      <span role="columnheader" className="lp-axis-label"><span>toward {away}</span><span>toward {home}</span></span>
      <span role="columnheader" className="sr-only">Points</span>
    </div>
    {bars.map(bar => <div key={bar.key} className="lp-bar-row" role="row" data-kind={bar.kind} data-row={bar.key} data-points={bar.points}>
      <span role="cell" className="lp-bar-label">{bar.label}</span>
      <span role="cell" className="lp-bar-track" aria-hidden="true">
        <span className="lp-bar" data-side={bar.points >= 0 ? "home" : "away"} style={vars({ "--lp-width": `${(Math.abs(bar.points) / scale) * 50}%` })} />
      </span>
      <span role="cell" className="lp-bar-value">{bar.kind === "group" || bar.kind === "market" ? towardTeam(bar.points, home, away) : marginText(bar.points, home, away)}{bar.kind === "prediction" && <> <Icon name="right" size={14} className="lp-arrow" /><span className="sr-only">gives</span> {pct(why.prediction.home_win >= 0.5 ? why.prediction.home_win : 1 - why.prediction.home_win)}</>}</span>
    </div>)}
  </div>;
}

function MarketNote({ why, home, away }: { why: WinProbabilityWhy; home: string; away: string }) {
  const m = why.market;
  if (m.status === "ok") return <p className="lp-note" data-field="market">The line is {marginText(m.line, home, away)}{m.book ? ` (${m.book})` : ""}. The model moves {Math.round(m.w * 100)}% of the way from its own read to it.</p>;
  if (m.status === "no_line") return <p className="lp-note" data-field="market">No line when this was sealed; own read only.</p>;
  if (m.status === "sealed_before_freeze") return <p className="lp-note" data-field="market">Sealed before the market-informed model was frozen, so this is the Original model&apos;s call: own read only.</p>;
  return null;
}

/** An estimate in the own forecast's points; below zero the missing player was a net minus. */
export function absence(cost: number | null, code: string): string {
  if (cost == null) return "no rating, not counted";
  const size = Number(Math.abs(cost).toFixed(1));
  if (size === 0) return `about no effect on ${code}`;
  return cost > 0 ? `costs ${code} about ${size.toFixed(1)} points` : `helps ${code} about ${size.toFixed(1)} points`;
}

function OutList({ team, players, season }: { team: LiveTeam; players: WhyOutPlayer[] | undefined; season: string }) {
  return <div className="lp-out-team">
    <span className="lp-team"><TeamLogo team={logoTeam(team)} season={season} size={16} /><strong>{teamCode(team)}</strong></span>
    {players?.length ? <ul>{players.map(p => <li key={p.player_id ?? p.name}>
      <span>{p.player_id ? <Link href={`/players/${p.player_id}?season=${season}`}>{p.name}</Link> : p.name}</span>
      <span className="lp-muted">{absence(p.cost, teamCode(team))}</span>
    </li>)}</ul> : <span className="lp-muted">Nobody listed Out</span>}
  </div>;
}

function PlayerList({ team, players, season }: { team: LiveTeam; players: WhyPlayer[] | undefined; season: string }) {
  return <div className="lp-out-team">
    <span className="lp-team"><TeamLogo team={logoTeam(team)} season={season} size={16} /><strong>{teamCode(team)}</strong></span>
    {players?.length ? <ol>{players.map(p => <li key={p.player_id}>
      <span><Link href={`/players/${p.player_id}?season=${season}`}>{p.name}</Link></span>
      <span className="lp-muted">{num(p.minutes, 1)} min · rating {p.rating > 0 ? "+" : ""}{num(p.rating, 1)}{p.default_rating ? " (default)" : ""}</span>
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

function Footer({ why, home, away }: { why: WinProbabilityWhy; home: LiveTeam; away: LiveTeam }) {
  const sealed = tipoff(why.captured_at);
  const ages = why.ages ?? {};
  const facts = [
    sealed && `Sealed ${sealed}`,
    ages.box_through && `box scores through ${formatDate(ages.box_through, "compact")}`,
    ages.rating_snapshot_cutoff && `ratings as of ${formatDate(ages.rating_snapshot_cutoff, "compact")}`,
    ages.injury_report_at && `injury report read ${tipoff(ages.injury_report_at)}`,
  ].filter(Boolean);
  const other = why.model === "market_informed" ? why.tip_off_home.original : null;
  const right = callRight(why);
  return <>
    {why.result && <p className="lp-result" data-field="result" data-right={right == null ? undefined : String(right)}>
      Final: {teamCode(away)} {why.result.away_score}, {teamCode(home)} {why.result.home_score}
      {right != null && <> · the call was <span className="lp-mark">{right ? "right" : "wrong"}<Icon name={right ? "check" : "close"} size={14} /></span></>}
    </p>}
    <p className="lp-note" data-field="ages">{facts.join(" · ")}</p>
    <p className="lp-note" data-field="model">
      Model: {why.model === "market_informed" ? "Market-informed model, on trial against the Original" : WIN_MODEL_NAMES.original}
      {other != null && ` (the Original gave ${other >= 0.5 ? teamCode(home) : teamCode(away)} ${pct(other >= 0.5 ? other : 1 - other)})`} · Not betting advice.
    </p>
  </>;
}

export function PredictionBody({ why, game }: { why: WinProbabilityWhy; game: LiveGame }) {
  const [away, home] = awayFirst(game.teams);
  const season = seasonOf(game.slate_date);
  const h = teamCode(home), a = teamCode(away);
  return <div className="lp-body" data-model={why.model} data-seal={why.seal}>
    <Header why={why} home={home} away={away} season={season} />
    <Bars why={why} home={h} away={a} />
    <MarketNote why={why} home={h} away={a} />
    <p className="lp-note">The win chance comes from the full model at tip-off, so it is not a straight conversion of the margin.</p>
    <div className="lp-section">
      <h3>Who&apos;s out</h3>
      <div className="lp-out">
        <OutList team={away} players={why.out?.away} season={season} />
        <OutList team={home} players={why.out?.home} season={season} />
      </div>
      <p className="lp-note">{why.availability_note}</p>
    </div>
    <Footer why={why} home={home} away={away} />
    {why.players && <details className="lp-toggle">
      <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Players available, by expected minutes</ButtonSummary>
      <div className="lp-toggle-body lp-out">
        <PlayerList team={away} players={why.players.away} season={season} />
        <PlayerList team={home} players={why.players.home} season={season} />
      </div>
    </details>}
    <details className="lp-toggle">
      <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Exact inputs</ButtonSummary>
      <div className="lp-toggle-body"><ExactInputs why={why} /></div>
    </details>
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
