"use client";

import { forwardRef, useMemo, useState } from "react";
import { BoxShapes, ShapeBox, tone, type BoxEntry } from "./roster-shape-box";
import { chartVars } from "./charts";
import { LookupInput } from "./lookup-input";
import { Icon } from "./ui/icon";
import { teamStyle } from "./ui/identity";
import { Button } from "./ui/kit";
import { teamAccent } from "@/lib/team-colors";
import {
  BOX, fitLine, missingStyles, one, sandboxRoster, seasonChanges, signed, whiteAsPlayer,
  type RosterShapes, type ShapeMode, type ShapePlayer, type ShapeTeam
} from "@/lib/roster-shapes";
import type { SixFactorTeam } from "@/lib/team-six-factors";
import type { LookupItem } from "@/lib/types";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const boxPct = (size: number | null, capacity: number) => size === null ? "—" : `${(size / capacity * 100).toFixed(1)}%`;
const fillOf = (entries: BoxEntry[], capacity: number) => entries.reduce((sum, e) => sum + (e.size ?? 0), 0) / capacity;

/** The roster's drawn players as box entries, at the server's sizes for the mode. */
export function teamEntries(team: ShapeTeam, mode: ShapeMode, mark?: (p: ShapePlayer) => BoxEntry["mark"]): BoxEntry[] {
  return team.roster.map(player => ({ player, size: mode === "playoff" ? player.size_playoff : player.size, mark: mark?.(player) }));
}

/** What's missing: archetypes under 2% of the box; in team view, the white space as one starter. */
export function Missing({ entries, data, detailed = false }: { entries: BoxEntry[]; data: RosterShapes; detailed?: boolean }) {
  const missing = missingStyles(entries, data.capacity, data.archetypes.clusters);
  const lacking = data.archetypes.clusters.filter(c => missing.includes(c.name));
  const fill = fillOf(entries, data.capacity);
  const best = Math.max(...data.teams.flatMap(t => t.roster.map(p => p.dpm ?? -Infinity)));
  const white = whiteAsPlayer(fill, data.capacity, data);
  // Each missing style is a chip tinted with its archetype colour, so the caption reads like the key.
  return <div className="shapes-missing">
    <div className="shapes-missing-row">
      {lacking.length ? <>
        <span className="shapes-missing-label">Lacks</span>
        <ul className="shapes-missing-chips" aria-label="Styles this roster lacks">
          {lacking.map(c => <li key={c.cluster} className="shapes-chip" title={c.description} style={chartVars({ "--chart-tone": tone(c.cluster) })}>{c.name}</li>)}
        </ul>
      </> : <span className="shapes-chip is-complete"><Icon name="check" size={14} />Every style drawn</span>}
    </div>
    {detailed && white !== null && <p className="shapes-missing-white">White is {white > best
      ? <>more than any one player adds (the league&apos;s best is <strong>{signed(best)} DPM</strong>)</>
      : <>a <strong>{signed(white)} DPM</strong> starter at 34 minutes</>}</p>}
  </div>;
}

/** A roster player as a local search candidate: found by name, team name or code; captioned with team, DPM and minutes. */
function candidate(player: ShapePlayer, team: ShapeTeam): LookupItem {
  return {
    id: player.player_id, canonical_id: player.player_id, kind: "player", display_name: player.player_name,
    subtitle: `${team.team_name} ${team.team_tricode}`, match_basis: "suggestion", match_score: 1,
    availability: { has_current_season: true, status: "available", seasons: [] },
    team_association: { basis: "selected_scope", teams: [team.team_tricode], observed_through: null, season: null, phase: null, before_date: null },
    destination_url: `/players/${player.player_id}`,
    metadata: { caption: `${team.team_tricode} · ${signed(player.dpm)} DPM · ${one(player.minutes_uncapped ?? player.minutes_per_game)} min` },
  };
}

/** Trade sandbox: search any other roster's players to add or this team's to remove, and redraw the box. */
export function Sandbox({ team, data, mode, add, drop, onChange }: {
  team: ShapeTeam; data: RosterShapes; mode: ShapeMode; add: string[]; drop: string[]; onChange: (add: string[], drop: string[]) => void;
}) {
  const entries = useMemo(() => sandboxRoster(team, data.teams, add, drop, mode, data), [team, data, add, drop, mode]);
  const before = mode === "playoff" ? team.fill_playoff : team.fill;
  const after = fillOf(entries, data.capacity);
  // Before typing, the biggest shapes first: the players most likely to change the box.
  const addable = useMemo(() => data.teams.filter(t => t.team_tricode !== team.team_tricode)
    .flatMap(t => t.roster.filter(p => p.dpm !== null && (p.minutes_uncapped ?? p.minutes_per_game) !== null).map(p => ({ p, t })))
    .sort((a, b) => (b.p.size ?? 0) - (a.p.size ?? 0) || a.p.player_name.localeCompare(b.p.player_name))
    .map(({ p, t }) => candidate(p, t)), [data.teams, team]);
  const removable = useMemo(() => [...team.roster].sort((a, b) => (b.size ?? -1) - (a.size ?? -1)).map(p => candidate(p, team)), [team]);
  const [addText, setAddText] = useState(""), [dropText, setDropText] = useState("");
  const byId = new Map(data.teams.flatMap(t => t.roster.map(p => [p.player_id, { player: p, team: t }] as const)));
  const changed = add.length + drop.length > 0;
  return <section className="player-open-section player-glass shapes-sandbox" aria-label="Trade sandbox">
    <header className="player-open-heading"><h2><Icon name="swap" size={20} />Trade Sandbox</h2>
      <span>{changed ? <>Fill {pct(before)} to <strong data-tone={after > before ? "up" : after < before ? "down" : undefined}>{pct(after)}</strong> ({signed((after - before) * 100)})</> : "Add or remove players to redraw the box"}</span></header>
    <div className="shapes-sandbox-controls">
      <div className="shapes-sandbox-search">
        <LookupInput label="Add a player" placeholder="Add a player: search name or team" value={addText} onChange={setAddText} candidates={addable} excludedIds={add} limit={12}
          portalDropdown dropdownMinWidth={340} onSelect={item => { setAddText(""); onChange([...add, item.canonical_id], drop); }} />
      </div>
      <div className="shapes-sandbox-search">
        <LookupInput label="Remove a player" placeholder={`Remove a ${team.team_tricode} player`} value={dropText} onChange={setDropText} candidates={removable} excludedIds={drop} limit={20}
          portalDropdown dropdownMinWidth={340} onSelect={item => { setDropText(""); onChange(add, [...drop, item.canonical_id]); }} />
      </div>
      {changed && <Button size="md" variant="ghost" icon="reset" onClick={() => onChange([], [])}>Reset</Button>}
    </div>
    {changed && <ul className="shapes-sandbox-changes" aria-label="Sandbox changes">
      {add.map(id => byId.get(id) && <li key={`add-${id}`}><Button size="sm" variant="secondary" iconAfter="close" aria-label={`Undo adding ${byId.get(id)!.player.player_name}`}
        onClick={() => onChange(add.filter(x => x !== id), drop)}>+ {byId.get(id)!.player.player_name} <small>{byId.get(id)!.team.team_tricode}</small></Button></li>)}
      {drop.map(id => byId.get(id) && <li key={`drop-${id}`}><Button size="sm" variant="secondary" iconAfter="close" aria-label={`Undo removing ${byId.get(id)!.player.player_name}`}
        onClick={() => onChange(add, drop.filter(x => x !== id))}>− {byId.get(id)!.player.player_name}</Button></li>)}
    </ul>}
    <p className="player-reference-note">Added players bring their own minutes and DPM; when the roster adds up to more than 240 minutes a game, players keep theirs in order of minutes until the team reaches 240 and the bench gets what is left. Added shapes are outlined in the box above. A what-if, not a forecast.</p>
  </section>;
}

/** Since last season: last season's box beside this one, departures and arrivals outlined. */
export function SinceLastSeason({ team, previous, data, mode }: { team: ShapeTeam; previous: ShapeTeam | null; data: RosterShapes; mode: ShapeMode }) {
  const { arrivals, departures } = seasonChanges(previous, team);
  const left = new Set(departures.map(p => p.player_id)), joined = new Set(arrivals.map(p => p.player_id));
  const now = teamEntries(team, mode, p => joined.has(p.player_id) ? "added" : undefined);
  const then = previous ? teamEntries(previous, mode, p => left.has(p.player_id) ? "left" : undefined) : [];
  const fillNow = fillOf(now, data.capacity), fillThen = fillOf(then, data.capacity);
  const list = (players: ShapePlayer[], label: string) => <div className="shapes-change-list">
    <h3>{label} · {players.length}</h3>
    {players.length ? <ul>{players.filter(p => p.size !== null).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).map(p => <li key={p.player_id}>
      <span className="shapes-swatch" style={chartVars({ "--chart-tone": tone(p.archetype?.primary) })} aria-hidden="true" />{p.player_name}<small>{boxPct(p.size, data.capacity)}</small>
    </li>)}{players.some(p => p.size === null) && <li className="shapes-change-unknown">+ {players.filter(p => p.size === null).length} without a DPM or minutes</li>}</ul> : <p className="player-open-empty">None</p>}
  </div>;
  return <section className="player-open-section player-glass shapes-since" aria-label="Since last season">
    <header className="player-open-heading"><h2><Icon name="history" size={20} />Since {data.reference_season}</h2>
      <span>Fill {pct(fillThen)} to {pct(fillNow)} ({signed((fillNow - fillThen) * 100)}) · departures dashed, arrivals outlined</span></header>
    <div className="shapes-since-boxes">
      {[{ label: data.reference_season, entries: then, fill: fillThen }, { label: data.label, entries: now, fill: fillNow }].map(box => <figure key={box.label}>
        <figcaption><span>{box.label}</span><strong>{pct(box.fill)}</strong></figcaption>
        <span className="shapes-box" style={teamStyle(team.team_id)}>
          <ShapeBox entries={box.entries} mode={mode} capacity={data.capacity} label={`${team.team_name} ${box.label}: ${pct(box.fill)} of the box`} />
        </span>
      </figure>)}
    </div>
    <div className="shapes-change-lists">{list(departures, "Departures")}{list(arrivals, "Arrivals")}</div>
  </section>;
}

/** Fill vs results: 2025-26 fill against 2025-26 net rating, one point per team. */
export function FillVsResults({ shapes, factors }: { shapes: RosterShapes; factors: SixFactorTeam[] }) {
  const points = shapes.teams.flatMap(t => {
    const team = factors.find(f => f.tricode === t.team_tricode || f.team_id === t.team_id);
    return team && team.net !== null ? [{ x: t.fill * 100, y: team.net, team: t }] : [];
  });
  const fit = fitLine(points);
  if (points.length < 3) return null;
  const W = 640, H = 360, pad = { l: 44, r: 16, t: 16, b: 36 };
  const xMax = Math.max(10, Math.ceil(Math.max(...points.map(p => p.x)) / 10) * 10);
  const yMax = Math.max(10, Math.ceil(Math.max(...points.map(p => Math.abs(p.y))) / 10) * 10);
  const sx = (x: number) => pad.l + (x / xMax) * (W - pad.l - pad.r), sy = (y: number) => pad.t + ((yMax - y) / (2 * yMax)) * (H - pad.t - pad.b);
  return <section className="player-open-section player-glass shapes-results" aria-label="Fill vs results">
    <header className="player-open-heading"><h2><Icon name="scatter" size={20} />Fill vs Results</h2>
      <span>{shapes.season} fill against {shapes.season} net rating{fit ? ` · r = ${fit.r.toFixed(2)}` : ""}</span></header>
    <svg className="shapes-results-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${shapes.season} box fill against net rating for ${points.length} teams${fit ? `, correlation ${fit.r.toFixed(2)}` : ""}`}>
      {[-yMax, -yMax / 2, 0, yMax / 2, yMax].map(y => <g key={y}><line className={y === 0 ? "shapes-axis-zero" : "shapes-axis-grid"} x1={pad.l} x2={W - pad.r} y1={sy(y)} y2={sy(y)} /><text className="shapes-axis-label" x={pad.l - 8} y={sy(y)} textAnchor="end" dominantBaseline="central">{signed(y, 0)}</text></g>)}
      {Array.from({ length: xMax / 10 + 1 }, (_, i) => i * 10).map(x => <text key={x} className="shapes-axis-label" x={sx(x)} y={H - pad.b + 16} textAnchor="middle">{x}%</text>)}
      <text className="shapes-axis-title" x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle">Box filled</text>
      {fit && <line className="shapes-fit-line" x1={sx(0)} x2={sx(xMax)} y1={sy(Math.max(-yMax, Math.min(yMax, fit.a)))} y2={sy(Math.max(-yMax, Math.min(yMax, fit.a + fit.b * xMax)))} />}
      {points.map(p => <g key={p.team.team_id} className="shapes-results-point">
        <circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill={teamAccent(p.team.team_tricode) ?? "var(--color-status-unknown)"} />
        <text className="shapes-results-code" x={sx(p.x) + 8} y={sy(p.y)} dominantBaseline="central">{p.team.team_tricode}</text>
        <title>{`${p.team.team_name}: ${p.x.toFixed(0)}% filled, net ${signed(p.y)}`}</title>
      </g>)}
    </svg>
    <p className="player-reference-note">Net rating is points per 100 possessions from the team box scores. DARKO&apos;s DPM learned from these same games, so the fit describes how well the picture tracks the season, not how well it predicts the next one.</p>
  </section>;
}

/** The share card: the team's box with its name, fill and key, sized for an image. */
export const ShareCard = forwardRef<SVGSVGElement, { team: ShapeTeam; entries: BoxEntry[]; data: RosterShapes; mode: ShapeMode; season: string }>(function ShareCard({ team, entries, data, mode, season }, ref) {
  const fill = fillOf(entries, data.capacity);
  const size = 520, x = 20, y = 70;
  const missing = missingStyles(entries, data.capacity, data.archetypes.clusters);
  const keys = data.archetypes.clusters.filter(c => c.cluster < 6);
  return <svg ref={ref} className="shapes-share-card" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 680" width={560} height={680} aria-hidden="true">
    <rect width="560" height="680" rx="12" fill="var(--color-surface-1)" />
    <text x={x} y={36} fill="var(--color-text)" fontSize="22" fontWeight="700" fontFamily="system-ui, sans-serif">{team.team_name}</text>
    <text x={x} y={56} fill="var(--color-text-secondary)" fontSize="13" fontFamily="system-ui, sans-serif">{season}{mode === "playoff" ? " · Playoff-Adjusted" : ""} · the box is a +{data.box_net} team</text>
    <text x={x + size} y={44} fill="var(--color-text)" fontSize="30" fontWeight="700" textAnchor="end" fontFamily="system-ui, sans-serif">{pct(fill)}</text>
    <rect x={x} y={y} width={size} height={size} fill="var(--color-white)" stroke={teamAccent(team.team_tricode) ?? "var(--color-status-unknown)"} strokeWidth="6" />
    <svg x={x + 3} y={y + 3} width={size - 6} height={size - 6} viewBox={`0 0 ${BOX} ${BOX}`}>
      <g fill="var(--color-on-accent)" fontFamily="system-ui, sans-serif"><BoxShapes entries={entries} mode={mode} capacity={data.capacity} large /></g>
    </svg>
    <text x={x} y={612} fill="var(--color-text-secondary)" fontSize="12" fontFamily="system-ui, sans-serif">{missing.length ? `Lacks ${missing.join(" · ")}` : "Every style drawn"} · squarer shapes are easier to build around</text>
    {keys.map((c, i) => <g key={c.cluster} transform={`translate(${x + (i % 3) * 176} ${632 + Math.floor(i / 3) * 20})`}>
      <rect width="10" height="10" y="-9" rx="2" fill={tone(c.cluster)} />
      <text x="16" fill="var(--color-text-secondary)" fontSize="12" fontFamily="system-ui, sans-serif">{c.name}</text>
    </g>)}
  </svg>;
});

