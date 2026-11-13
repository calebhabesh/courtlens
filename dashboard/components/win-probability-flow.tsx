"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { awayFirst, seasonOf, teamCode, teamFullName, type LiveGame, type LiveTeam } from "@/lib/live";
import { seasonEra } from "@/lib/portrait-source";
import { marginText, ribbonPath, ribbonSize, whyFlow, type WhyFlow, type WhyGroup, type WinProbabilityPage, type WinProbabilityWhy } from "@/lib/win-probability";
import { ENGINE_INPUTS, MODEL_STACK } from "@/lib/win-probability-stack";
import { getWinProbabilityWhy, WorkbenchApiError } from "@/lib/workbench-api";
import { BrandMark } from "./brand";
import { teamColors } from "./live-game";
import { logoTeam } from "./live-panel";
import { PlayerPortrait } from "./player-portrait";
import { usePhone } from "./points-forecasts-research";
import { useFeed } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Icon, type IconName } from "./ui/icon";
import { Chip, Segmented } from "./ui/kit";

/**
 * Round 3: "How the model works" as a flow. Each input is a stream as wide as its points for the
 * chosen game, in the colour of the team it pushes toward; the streams join into the own read, the
 * line blends in by its fitted weight, and the in-game engine turns the pregame margin into the win
 * chance. Every number is the seal's, read through the breakdown API; with no sealed game the
 * diagram is drawn as a schematic with no numbers.
 */

const vars = (values: Record<`--${string}`, string>) => values as CSSProperties;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const one = (v: number) => Math.abs(v).toFixed(1);

type Side = "home" | "away" | "even";
type Step = "inputs" | "own" | "line" | "engine" | "chance";
type NodeKey = WhyGroup["group"] | "own" | "line" | "margin" | "state" | "engine" | "final";

const sideOf = (points: number): Side => points > 0.05 ? "home" : points < -0.05 ? "away" : "even";
const GROUP_ICONS: Record<WhyGroup["group"], IconName> = { players: "users", form: "trend", home_court: "home", rest_travel: "plane" };
const STEP_OF: Record<NodeKey, Step> = { players: "inputs", form: "inputs", home_court: "inputs", rest_travel: "inputs", own: "own", line: "line", margin: "line", state: "engine", engine: "engine", final: "chance" };

/** One game the diagram can draw: a board game (its why is fetched) or the stored worked example. */
export interface FlowOption { game: LiveGame; why?: WinProbabilityWhy; example?: boolean }

// ---- Geometry: a 1000 × 400 drawing; y is in pixels (the box is 400 px tall), x stretches -----------------------

const H = 400;
const X = { in: 236, own: 452, margin: 628, engine: 772, end: 836 };
const ROWS = [58, 126, 194, 262];
const LINE_Y = 346;
const MID = 196;
const BAR = 12;
const STATE = 18;

const SCHEMATIC: WhyFlow = {
  inputs: (["players", "form", "home_court", "rest_travel"] as const).map((key, i) => ({ key, label: ["Players available", "Recent form", "Home court", "Rest and travel"][i], points: [4, 3, 1.5, 1.5][i] })),
  own: 10, line: { status: "ok", points: 10, w: 1, book: null }, ownWeight: 0, margin: 10, homeWin: 0.75,
};

interface Band { key: string; nodes: NodeKey[]; side: Side; d: string }

function layout(flow: WhyFlow) {
  const lineShare = flow.line.status === "ok" ? Math.abs(flow.line.points) * flow.line.w : 0;
  const total = flow.inputs.reduce((s, i) => s + Math.abs(i.points), 0);
  const k = Math.min(9, 150 / Math.max(total, lineShare + Math.abs(flow.own) * flow.ownWeight, Math.abs(flow.margin), 1));
  const bands: Band[] = [];
  // Inputs stack into the own read's bar in their order.
  const sizes = flow.inputs.map(i => ribbonSize(i.points, k));
  const ownH = Math.max(sizes.reduce((a, b) => a + b, 0), 4);
  const ownTop = MID - 34 - ownH / 2;
  let at = ownTop;
  flow.inputs.forEach((input, i) => {
    const size = sizes[i];
    bands.push({ key: input.key, nodes: [input.key, "own"], side: sideOf(input.points), d: ribbonPath({ x0: X.in, y0: ROWS[i] - size / 2, x1: X.own - BAR / 2, y1: at, size }) });
    at += size;
  });
  // The own read and the line blend into the pregame margin by the fitted weight.
  const ownOut = ribbonSize(flow.own * flow.ownWeight, k);
  const lineOut = flow.line.status === "ok" ? ribbonSize(flow.line.points * flow.line.w, k) : 0;
  const marginOut = Math.max(ribbonSize(flow.margin, k), 3);
  const marginH = Math.max(ownOut + lineOut, marginOut);
  const marginTop = MID - marginH / 2;
  if (ownOut) bands.push({ key: "own-margin", nodes: ["own", "margin"], side: sideOf(flow.own), d: ribbonPath({ x0: X.own + BAR / 2, y0: ownTop + ownH / 2 - ownOut / 2, x1: X.margin - BAR / 2, y1: marginTop, size: ownOut }) });
  if (lineOut && flow.line.status === "ok") bands.push({ key: "line-margin", nodes: ["line", "margin"], side: sideOf(flow.line.points), d: ribbonPath({ x0: X.in, y0: LINE_Y - lineOut / 2, x1: X.margin - BAR / 2, y1: marginTop + ownOut, size: lineOut }) });
  // The pregame margin and the game state feed the engine; the engine gives the chance.
  const engineH = marginOut + STATE;
  const engineTop = MID - engineH / 2;
  bands.push({ key: "margin-engine", nodes: ["margin", "engine"], side: sideOf(flow.margin), d: ribbonPath({ x0: X.margin + BAR / 2, y0: MID - marginOut / 2, x1: X.engine - BAR / 2, y1: engineTop, size: marginOut }) });
  bands.push({ key: "state-engine", nodes: ["state", "engine"], side: "even", d: ribbonPath({ x0: X.margin + 56, y0: LINE_Y - STATE / 2, x1: X.engine - BAR / 2, y1: engineTop + marginOut, size: STATE }) });
  bands.push({ key: "engine-final", nodes: ["engine", "final"], side: flow.homeWin >= 0.5 ? "home" : "away", d: ribbonPath({ x0: X.engine + BAR / 2, y0: engineTop, x1: X.end, y1: MID - engineH / 2, size: engineH }) });
  // With a line and a weight of 1, the own read is the fallback: a dashed path, not a band.
  const fallback = ownOut === 0 ? ribbonPath({ x0: X.own + BAR / 2, y0: ownTop + ownH / 2, x1: X.margin - BAR / 2, y1: marginTop + 1, size: 0 }).split("L")[0] : null;
  return { bands, fallback, bars: { own: { top: ownTop, h: ownH }, margin: { top: marginTop, h: marginH }, engine: { top: engineTop, h: engineH } } };
}

// ---- The diagram -----------------------------------------------------------------------------------------------------

interface Teams { home: LiveTeam; away: LiveTeam; season: string }

function Toward({ points, teams, word = "+" }: { points: number; teams: Teams | null; word?: string }) {
  const side = sideOf(points);
  if (!teams) return <span className="wpf-value" data-side="even">—</span>;
  if (side === "even") return <span className="wpf-value" data-side="even">Even</span>;
  const team = side === "home" ? teams.home : teams.away;
  return <span className="wpf-value" data-side={side} title={`Toward ${teamFullName(team, teams.season)}`}>
    <TeamLogo team={logoTeam(team)} season={teams.season} size={18} />{teamCode(team)} {word}{one(points)}
  </span>;
}

function Node({ k, x, y, align = "center", active, onHover, children, className = "" }: {
  k: NodeKey; x: number; y: number; align?: "start" | "center" | "end"; active: NodeKey | null; onHover: (key: NodeKey | null) => void; children: ReactNode; className?: string;
}) {
  return <div className={`wpf-node ${className}`} data-node={k} data-align={align} data-on={active === k || undefined}
    style={vars({ "--x": `${x / 10}%`, "--y": `${y}px` })} onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)}>{children}</div>;
}

function Diagram({ flow, teams, active, setActive, step }: { flow: WhyFlow | null; teams: Teams | null; active: NodeKey | null; setActive: (k: NodeKey | null) => void; step: Step }) {
  const f = flow ?? SCHEMATIC;
  const { bands, fallback, bars } = layout(f);
  const lit = (nodes: NodeKey[]) => active ? nodes.includes(active) : STEP_OF[nodes[0]] === step || STEP_OF[nodes[1]] === step;
  const fav = teams ? (f.homeWin >= 0.5 ? teams.home : teams.away) : null;
  const favP = f.homeWin >= 0.5 ? f.homeWin : 1 - f.homeWin;
  const line = f.line;
  return <div className="wpf-diagram" data-schematic={flow ? undefined : true} data-active={active ?? undefined}>
    <svg className="wpf-svg" viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {bands.map(b => <path key={b.key} className="wpf-band" data-band={b.key} data-side={b.side} data-lit={lit(b.nodes) || undefined} d={b.d}
        onMouseEnter={() => setActive(b.nodes[0])} onMouseLeave={() => setActive(null)} />)}
      {fallback && <path className="wpf-fallback" d={fallback} vectorEffect="non-scaling-stroke" />}
      {(["own", "margin", "engine"] as const).map(key => <rect key={key} className="wpf-bar" data-bar={key} x={X[key] - BAR / 2} y={bars[key].top} width={BAR} height={bars[key].h} rx="3" />)}
    </svg>
    {f.inputs.map((input, i) => <Node key={input.key} k={input.key} x={0} y={ROWS[i]} align="start" active={active} onHover={setActive}>
      <span className="wpf-icon"><Icon name={GROUP_ICONS[input.key]} size={16} /></span>
      <span className="wpf-node-text"><strong>{input.label}</strong><Toward points={flow ? input.points : 0} teams={flow ? teams : null} /></span>
    </Node>)}
    <Node k="line" x={0} y={LINE_Y} align="start" active={active} onHover={setActive}>
      <span className="wpf-icon" data-tone="market"><Icon name="scale" size={16} /></span>
      <span className="wpf-node-text"><strong>Betting line</strong>
        {!flow ? <span className="wpf-value" data-side="even">—</span>
          : line.status === "ok" ? <span className="wpf-sub"><Toward points={line.points} teams={teams} word="by " /> · weight {pct(line.w)}</span>
          : <span className="wpf-sub">{line.status === "no_line" ? "No line at the seal" : "Not used by this model"}</span>}
      </span>
    </Node>
    <Node k="own" x={X.own} y={bars.own.top} active={active} onHover={setActive} className="wpf-above">
      <strong>Own read</strong><span className="wpf-sub">Linear model</span>{flow && teams && <span className="wpf-margin" data-side={sideOf(f.own)}>{marginText(f.own, teamCode(teams.home), teamCode(teams.away))}</span>}
      {fallback && <span className="wpf-sub wpf-fallback-note">fallback when no line</span>}
    </Node>
    <Node k="margin" x={X.margin} y={bars.margin.top} active={active} onHover={setActive} className="wpf-above">
      <strong>Pregame margin</strong>{flow && teams ? <span className="wpf-margin" data-side={sideOf(f.margin)}>{marginText(f.margin, teamCode(teams.home), teamCode(teams.away))}</span> : <span className="wpf-sub">expected score gap</span>}
    </Node>
    <Node k="state" x={X.margin + 56} y={LINE_Y} align="end" active={active} onHover={setActive}>
      <span className="wpf-node-text wpf-text-end"><strong>Game state</strong><span className="wpf-sub">score, clock, possession, fouls</span></span>
      <span className="wpf-icon"><Icon name="clock" size={16} /></span>
    </Node>
    <Node k="engine" x={X.engine} y={bars.engine.top} active={active} onHover={setActive} className="wpf-above">
      <span className="wpf-icon" data-tone="engine"><Icon name="cpu" size={16} /></span><strong>In-game engine</strong><span className="wpf-sub">LightGBM</span>
    </Node>
    <Node k="final" x={X.end + 8} y={MID} align="start" active={active} onHover={setActive} className="wpf-final">
      <span className="wpf-final-kicker"><BrandMark size={16} framed={false} />Prediction</span>
      {fav && teams ? <>
        <span className="wpf-final-team"><TeamLogo team={logoTeam(fav)} season={teams.season} size={48} /><strong className="wpf-final-pct">{pct(favP)}</strong></span>
        <span className="wpf-final-name">{teamFullName(fav, teams.season)}</span>
      </> : <span className="wpf-final-name">Win chance for each team</span>}
    </Node>
  </div>;
}

/** The phone version: the same stages as a vertical list, each with its value. */
function Pipeline({ flow, teams }: { flow: WhyFlow | null; teams: Teams | null }) {
  const f = flow ?? SCHEMATIC;
  const max = Math.max(...f.inputs.map(i => Math.abs(i.points)), 1);
  return <ol className="wpf-pipeline">
    <li className="wpf-pipe-group">
      {f.inputs.map(input => <span key={input.key} className="wpf-pipe-input" data-node={input.key}>
        <span className="wpf-icon"><Icon name={GROUP_ICONS[input.key]} size={16} /></span><span>{input.label}</span>
        <span className="wpf-pipe-bar" data-side={flow ? sideOf(input.points) : "even"} style={vars({ "--wpf-size": `${(Math.abs(input.points) / max) * 100}%` })} />
        <Toward points={flow ? input.points : 0} teams={flow ? teams : null} />
      </span>)}
    </li>
    <li><Icon name="arrow-right" size={14} /><strong>Own read</strong>{flow && teams && <span className="wpf-margin">{marginText(f.own, teamCode(teams.home), teamCode(teams.away))}</span>}</li>
    <li><Icon name="scale" size={14} /><strong>Betting line</strong>{flow && teams && f.line.status === "ok" ? <span className="wpf-margin">{marginText(f.line.points, teamCode(teams.home), teamCode(teams.away))}, weight {pct(f.line.w)}</span> : <span className="wpf-sub">{flow ? "none" : ""}</span>}</li>
    <li><Icon name="cpu" size={14} /><strong>In-game engine</strong><span className="wpf-sub">LightGBM, from the pregame margin and the game state</span></li>
    <li className="wpf-pipe-final"><BrandMark size={18} framed={false} /><strong>Prediction</strong>{flow && teams && <span className="wpf-margin">{teamFullName(f.homeWin >= 0.5 ? teams.home : teams.away, teams.season)} {pct(Math.max(f.homeWin, 1 - f.homeWin))}</span>}</li>
  </ol>;
}

// ---- The step details: plain words first, then the method -----------------------------------------------------------

function Spec({ items }: { items: [string, ReactNode][] }) {
  return <dl className="wpf-spec">{items.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}</dl>;
}

function Roster({ why, teams }: { why: WinProbabilityWhy; teams: Teams }) {
  if (!why.players) return null;
  return <div className="wpf-roster">{([["away", teams.away], ["home", teams.home]] as const).map(([side, team]) => <div key={side} className="wpf-roster-team" data-side={side}>
    <TeamLogo team={logoTeam(team)} season={teams.season} size={24} />
    <span className="wpf-faces">{why.players![side].slice(0, 5).map(p => <PlayerPortrait key={p.player_id} playerId={p.player_id} name={p.name} size="sm" era={seasonEra(teams.season, logoTeam(team))} alt={`${p.name}, ${p.minutes.toFixed(0)} expected minutes`} />)}</span>
  </div>)}</div>;
}

function Details({ step, why, flow, teams, data }: { step: Step; why: WinProbabilityWhy | null; flow: WhyFlow | null; teams: Teams | null; data: WinProbabilityPage }) {
  const code = (side: "home" | "away") => teams ? teamCode(teams[side]) : side;
  const margin = (points: number) => teams ? marginText(points, code("home"), code("away")) : "—";
  const w = data.head_to_head?.model.w;
  if (step === "inputs") {
    const how: Record<WhyGroup["group"], string> = {
      players: `Each available player's rating (time-decay RAPM, refreshed monthly), weighted by expected minutes: the mean of their last ${MODEL_STACK.recentAppearances} games. Players ESPN lists as Out are removed.`,
      form: `Ridge regression on game margins (λ ${MODEL_STACK.formRidgeLambda}); a game ${data.model.pregame.form_half_life_days} days old counts half.`,
      home_court: "A fitted home edge, the home part of form, and Denver's and Utah's altitude.",
      rest_travel: "Days of rest, back-to-backs, games in seven days and distance travelled.",
    };
    const groups = why?.own.groups ?? SCHEMATIC.inputs.map(i => ({ group: i.key, label: i.label, contribution: 0, rows: [] }));
    return <div className="wpf-details" data-step="inputs">
      <p className="wpf-lead">Four things CourtLens knows before tip-off, each worth points toward one team.</p>
      <div className="wpf-cards">
        {groups.map(g => <div key={g.group} className="wpf-card" data-group={g.group}>
          <span className="wpf-card-head"><span className="wpf-icon"><Icon name={GROUP_ICONS[g.group]} size={16} /></span><strong>{g.label}</strong>{why && <Toward points={g.contribution} teams={teams} />}</span>
          {g.group === "players" && why && teams && <Roster why={why} teams={teams} />}
          {g.rows.length > 1 && <ul className="wpf-rows">{g.rows.filter(r => Math.abs(r.contribution) >= 0.05).map(r => <li key={r.input}><span>{r.label}</span><Toward points={r.contribution} teams={teams} /></li>)}</ul>}
          <p className="wpf-how">{how[g.group]}</p>
        </div>)}
      </div>
    </div>;
  }
  if (step === "own") return <div className="wpf-details" data-step="own">
    <p className="wpf-lead">The inputs add up to CourtLens&apos;s own predicted margin.</p>
    {flow && teams && <p className="wpf-equation" data-field="own-equation">
      {flow.inputs.map((input, i) => <span key={input.key} className="wpf-term">{i > 0 && <span className="wpf-op">+</span>}<span className="wpf-term-label">{input.label}</span><Toward points={input.points} teams={teams} /></span>)}
      <span className="wpf-op">=</span><span className="wpf-term wpf-term-total"><span className="wpf-term-label">Own read</span><span className="wpf-margin" data-side={sideOf(flow.own)}>{margin(flow.own)}</span></span>
    </p>}
    <Spec items={[
      ["Method", `Linear regression (least squares) of the final margin on ${MODEL_STACK.ownInputs} inputs`],
      ["Trained on", `Every regular-season game, ${MODEL_STACK.ownFitSeasons}`],
      ["Output", "The expected home margin in points"],
    ]} />
  </div>;
  if (step === "line") return <div className="wpf-details" data-step="line">
    <p className="wpf-lead">The betting line moves the own read by a fitted weight.{w != null && w >= 0.995 ? " The fit gave 100%: with a line, the pregame margin is the line; with none, it is the own read." : ""}</p>
    {flow && teams && <p className="wpf-equation" data-field="line-equation">
      <span className="wpf-term"><span className="wpf-term-label">Own read</span><span className="wpf-margin" data-side={sideOf(flow.own)}>{margin(flow.own)}</span></span>
      <span className="wpf-op"><Icon name="arrow-right" size={16} /></span>
      {flow.line.status === "ok" ? <><span className="wpf-term"><span className="wpf-term-label">Line ({flow.line.book ?? "sportsbook"}), weight {pct(flow.line.w)}</span><span className="wpf-margin" data-side={sideOf(flow.line.points)}>{margin(flow.line.points)}</span></span>
        <span className="wpf-op">=</span></> : <span className="wpf-term"><span className="wpf-term-label">{flow.line.status === "no_line" ? "No line at the seal" : "Sealed for the Original model"}</span></span>}
      <span className="wpf-term wpf-term-total"><span className="wpf-term-label">Pregame margin</span><span className="wpf-margin" data-side={sideOf(flow.margin)}>{margin(flow.margin)}</span></span>
    </p>}
    <Spec items={[
      ["Rule", "Pregame margin = own read + weight × (line − own read)"],
      ["Weight", `Least squares on ${MODEL_STACK.weightFitGames.toLocaleString("en-US")} games, ${MODEL_STACK.weightFitSeasons}, kept between 0 and 1${w != null ? `: ${w.toFixed(2)}` : ""}`],
      ["Line", "ESPN's line (DraftKings) when the game is sealed; closing lines for training"],
    ]} />
  </div>;
  if (step === "engine") return <div className="wpf-details" data-step="engine">
    <p className="wpf-lead">On every play, gradient-boosted trees turn the pregame margin and the game so far into a forecast of the final margin.</p>
    <ul className="wpf-chips" aria-label={`The engine's ${MODEL_STACK.engineInputs} inputs`}>{ENGINE_INPUTS.map(g => <li key={g.label}><strong>{g.label}</strong><span>{g.features.length}</span></li>)}</ul>
    <Spec items={[
      ["Mean", `A LightGBM booster for the expected final margin, starting from ${MODEL_STACK.startShrink} × a random-walk baseline; it can only rise with the lead and the pregame margin`],
      ["Spread", "A second LightGBM booster for how uncertain that margin is"],
      ["End game", `A LightGBM classifier for the last ${MODEL_STACK.endGameSeconds / 60} minutes (margins −${MODEL_STACK.endGameClip} to +${MODEL_STACK.endGameClip}), blended in as the clock runs down`],
      ["Trained on", `A game state every ${MODEL_STACK.stateSeconds} seconds of clock, through ${data.model.trained_through}`],
    ]} />
  </div>;
  const fav = flow && teams ? (flow.homeWin >= 0.5 ? teams.home : teams.away) : null;
  return <div className="wpf-details" data-step="chance">
    <p className="wpf-lead">The win chance is how often the forecast final margin lands on each team&apos;s side; a tie goes to an overtime model.</p>
    {flow && teams && fav && <div className="wpf-split" data-field="split">
      <span className="wpf-split-team" data-side="away"><TeamLogo team={logoTeam(teams.away)} season={teams.season} size={28} /><strong>{pct(1 - flow.homeWin)}</strong></span>
      <span className="wpf-split-bar" style={vars({ "--wpf-away-share": `${(1 - flow.homeWin) * 100}%` })} aria-hidden="true"><span data-side="away" /><span data-side="home" /></span>
      <span className="wpf-split-team" data-side="home"><strong>{pct(flow.homeWin)}</strong><TeamLogo team={logoTeam(teams.home)} season={teams.season} size={28} /></span>
    </div>}
    <Spec items={[
      ["At tip-off", "The engine's first state: 0–0, 48 minutes left. So the chance is not a straight conversion of the margin."],
      ["Then", "It updates on every play during the game (on Live). The sealed pregame chance never changes."],
      ...(why && why.model === "market_informed" && teams ? [["Original model", `${pct(Math.max(why.tip_off_home.original, 1 - why.tip_off_home.original))} for ${teamFullName(why.tip_off_home.original >= 0.5 ? teams.home : teams.away, teams.season)}, from the own read alone`] as [string, string]] : []),
    ]} />
  </div>;
}

// ---- The section body ------------------------------------------------------------------------------------------------

const STEPS: { value: Step; label: string; icon: IconName }[] = [
  { value: "inputs", label: "Inputs", icon: "users" },
  { value: "own", label: "Own read", icon: "chart" },
  { value: "line", label: "Betting line", icon: "scale" },
  { value: "engine", label: "In-game engine", icon: "cpu" },
  { value: "chance", label: "Win chance", icon: "gauge" },
];

export function ModelFlow({ options, data }: { options: FlowOption[]; data: WinProbabilityPage }) {
  const phone = usePhone();
  const [chosen, setChosen] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("inputs");
  const [active, setActive] = useState<NodeKey | null>(null);
  const option = options.find(o => o.game.source_id === chosen) ?? options[0] ?? null;
  const fetchId = option && !option.why ? option.game.source_id : null;
  const { data: fetched } = useFeed([fetchId, option?.game.slate_date ?? null], async () => {
    if (!fetchId || !option) return null;
    try { return await getWinProbabilityWhy(fetchId, option.game.slate_date); }
    catch (e) { if (e instanceof WorkbenchApiError && e.status === 404) return null; throw e; }
  });
  const why = option?.why ?? (fetchId ? fetched ?? null : null);
  const flow = why ? whyFlow(why) : null;
  const season = option ? seasonOf(option.game.slate_date) : "";
  const [away, home] = option ? awayFirst(option.game.teams) : [null, null];
  const teams = away && home ? { home, away, season } : null;
  return <div className="wpf" style={option ? teamColors(option.game.teams, season) : undefined} data-field="flow" data-game={why?.game_id} data-step={step}>
    {options.length > 1 && <div className="wpf-games" role="group" aria-label="Game shown in the diagram">
      {options.map(o => { const [a, h] = awayFirst(o.game.teams); const s = seasonOf(o.game.slate_date);
        return <Chip key={o.game.source_id} size="sm" pressed={o === option} onClick={() => setChosen(o.game.source_id)} aria-label={`${teamFullName(a, s)} at ${teamFullName(h, s)}${o.example ? ", the worked example" : ""}`}>
          <TeamLogo team={logoTeam(a)} season={s} size={18} /><span>{teamCode(a)}</span><span className="wpf-at">at</span><TeamLogo team={logoTeam(h)} season={s} size={18} /><span>{teamCode(h)}</span>{o.example && <span className="wpf-at">example</span>}
        </Chip>; })}
    </div>}
    {!option && <p className="wpf-note" data-field="flow-schematic">No sealed game to draw yet; the diagram shows the model&apos;s shape.</p>}
    {phone ? <Pipeline flow={flow} teams={teams} /> : <Diagram flow={flow} teams={teams} active={active} setActive={setActive} step={step} />}
    {!phone && flow && <p className="wpf-legend"><span className="wpf-key" data-side="away" />toward {teams ? teamFullName(teams.away, season) : "away"}<span className="wpf-key" data-side="home" />toward {teams ? teamFullName(teams.home, season) : "home"}<span className="wpf-legend-note">Band width is points of margin. Hover to trace a stream.</span></p>}
    <Segmented className="wpf-steps" size="sm" label="Model step" value={step} onChange={setStep} options={STEPS.map(s => ({ value: s.value, label: s.label, icon: s.icon }))} />
    <Details step={step} why={why} flow={flow} teams={teams} data={data} />
  </div>;
}
