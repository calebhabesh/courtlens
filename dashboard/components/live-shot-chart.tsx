"use client";

import { useState, type ReactNode } from "react";
import { periodLabel, teamCode, type LivePlay, type LivePlayer, type LiveTeam } from "@/lib/live";
import { teamRecord } from "./compare-player-slot";
import { PlayerPortrait } from "./player-portrait";
import { Checkbox } from "./ui/checkbox";
import { Popover } from "./ui/menu";
import { Button, MenuTrigger, Segmented } from "./ui/kit";

/** Feet from the baseline to the basket's centre. */
const RIM = 5.25;
const ARC = 23.75;
const CORNER_X = RIM + Math.sqrt(ARC * ARC - 22 * 22);

/** One end of the court in feet, baseline at x=0; the right end is this mirrored. */
function HalfLines({ mirror }: { mirror?: boolean }) {
  return <g transform={mirror ? "translate(94 50) rotate(180)" : undefined}>
    <rect x={0} y={17} width={19} height={16} />
    <circle cx={19} cy={25} r={6} />
    <line x1={4} y1={22} x2={4} y2={28} />
    <circle cx={RIM} cy={25} r={0.75} />
    <path d={`M ${RIM} 21 A 4 4 0 0 1 ${RIM} 29`} />
    <path d={`M 0 3 L ${CORNER_X} 3 A ${ARC} ${ARC} 0 0 1 ${CORNER_X} 47 L 0 47`} />
  </g>;
}

/** ESPN spots are feet from the attacking basket: x across (basket at 25), y out from it. */
export function courtPoint(play: Pick<LivePlay, "x" | "y">, side: "home" | "away"): [number, number] | null {
  if (play.x == null || play.y == null) return null;
  const length = Math.min(Math.max(RIM + play.y, 0.5), 46.5);
  const across = Math.min(Math.max(play.x, 0.5), 49.5);
  return side === "away" ? [length, across] : [94 - length, 50 - across];
}

type PlayType = "2made" | "2missed" | "3made" | "3missed";
const PLAY_TYPES: { value: PlayType; label: string }[] = [
  { value: "2made", label: "2PT FG Made" }, { value: "2missed", label: "2PT FG Missed" },
  { value: "3made", label: "3PT Made" }, { value: "3missed", label: "3PT Missed" },
];

function playType(shot: LivePlay): PlayType {
  return `${shot.points_attempted === 3 ? 3 : 2}${shot.scoring ? "made" : "missed"}` as PlayType;
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

/** ESPN's filter: a checkbox list where nothing ticked means everything, with Reset. */
function FilterMenu({ label, summary, active, onReset, children }: { label: string; summary: string; active: boolean; onReset: () => void; children: ReactNode }) {
  return <Popover className="live-shot-filter" renderTrigger={props => <MenuTrigger {...props} size="sm" selected={active} aria-label={`${label}: ${summary}`}>{summary}</MenuTrigger>}>
    <div className="live-shot-filter-panel" role="group" aria-label={label}>
      <div className="live-shot-filter-head"><strong>{label}</strong><Button size="sm" variant="ghost" onClick={onReset} disabled={!active}>Reset</Button></div>
      {children}
    </div>
  </Popover>;
}

/**
 * Follow-up 26: ESPN's shot chart filters (quarters, play types, players by team), the home
 * team's logo at centre court. Counts follow the filters and match the marks.
 */
export function ShotChart({ plays, teams, periods, players = [], season }: {
  plays: readonly LivePlay[]; teams: readonly LiveTeam[]; periods: number; players?: readonly LivePlayer[]; season?: string;
}) {
  const [quarters, setQuarters] = useState<number[]>([]);
  const [types, setTypes] = useState<PlayType[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const away = teams.find(t => t.side === "away"), home = teams.find(t => t.side === "home");
  const [rosterSide, setRosterSide] = useState<"away" | "home">("away");
  // Only attempts with a court spot: the counts match the marks.
  const shots = plays.filter(p => p.shot === "field_goal" && p.side && p.x != null
    && (!quarters.length || quarters.includes(p.period ?? 0))
    && (!types.length || types.includes(playType(p)))
    && (!picked.length || (p.player_source_id != null && picked.includes(p.player_source_id))));
  const count = (side: "home" | "away") => {
    const own = shots.filter(s => s.side === side);
    return `${own.filter(s => s.scoring).length}-${own.length}`;
  };
  const shooters = new Set(plays.filter(p => p.shot === "field_goal" && p.player_source_id).map(p => p.player_source_id!));
  const roster = (side: "home" | "away") => {
    const team = side === "away" ? away : home;
    return players.filter(p => p.team_source_id === team?.source_id && shooters.has(p.source_id));
  };
  const periodName = (n: number) => n <= 4 ? `${["1st", "2nd", "3rd", "4th"][n - 1]} Quarter` : periodLabel(n);
  const quarterSummary = !quarters.length ? "All Quarters" : quarters.length === 1 ? periodName(quarters[0]) : `${quarters.length} Quarters`;
  const typeSummary = !types.length ? "All Play Types" : types.length === 1 ? PLAY_TYPES.find(t => t.value === types[0])!.label : `${types.length} Play Types`;
  const playerSummary = !picked.length ? "All Players" : picked.length === 1 ? (players.find(p => p.source_id === picked[0])?.short_name ?? "1 Player") : `${picked.length} Players`;
  const side = roster(rosterSide);
  const rosterTeam = rosterSide === "away" ? away : home;
  const allSide = side.length > 0 && side.every(p => picked.includes(p.source_id));
  const art = home?.tricode ? teamRecord(home.tricode, season) : null;
  const scope = [quarters.length ? quarterSummary : "all periods", types.length ? typeSummary : null, picked.length ? playerSummary : null].filter(Boolean).join(", ");
  return <div className="live-shots">
    <div className="live-shot-filters">
      <FilterMenu label="Quarters" summary={quarterSummary} active={quarters.length > 0} onReset={() => setQuarters([])}>
        {Array.from({ length: periods }, (_, i) => i + 1).map(n => <Checkbox key={n} label={periodName(n)} checked={quarters.includes(n)} onChange={() => setQuarters(q => toggle(q, n))} />)}
      </FilterMenu>
      <FilterMenu label="Play Types" summary={typeSummary} active={types.length > 0} onReset={() => setTypes([])}>
        {PLAY_TYPES.map(t => <Checkbox key={t.value} label={t.label} checked={types.includes(t.value)} onChange={() => setTypes(list => toggle(list, t.value))} />)}
      </FilterMenu>
      {players.length > 0 && <FilterMenu label="Players" summary={playerSummary} active={picked.length > 0} onReset={() => setPicked([])}>
        {away && home && <Segmented label="Team" size="sm" stretch value={rosterSide} onChange={v => setRosterSide(v as "away" | "home")}
          options={[{ value: "away", label: teamCode(away) }, { value: "home", label: teamCode(home) }]} />}
        <Checkbox label="Select All" checked={allSide} onChange={() => setPicked(list => allSide ? list.filter(id => !side.some(p => p.source_id === id)) : [...new Set([...list, ...side.map(p => p.source_id)])])} />
        {(["Starters", "Bench"] as const).map(group => {
          const rows = side.filter(p => (p.starter === true) === (group === "Starters"));
          return rows.length ? <div key={group} className="live-shot-filter-group" role="group" aria-label={group}>
            <span className="live-shot-filter-label">{group}</span>
            {rows.map(p => <Checkbox key={p.source_id} checked={picked.includes(p.source_id)} onChange={() => setPicked(list => toggle(list, p.source_id))}
              label={<span className="live-shot-filter-player">
                {/* Follow-up 34: the player's season photo beside the name. */}
                <PlayerPortrait playerId={p.canonical_id ?? undefined} name={p.name} size="sm" era={season ? { season, team: rosterTeam?.tricode ?? null } : null} className="live-shot-filter-photo" />
                <span>{p.name}{p.jersey && <span className="live-shot-filter-jersey"> #{p.jersey}</span>}</span>
              </span>} />)}
          </div> : null;
        })}
      </FilterMenu>}
    </div>
    <div className="live-shots-teams">
      {away && <span className="live-shots-team" data-side="away"><span className="live-swatch" aria-hidden="true" />{teamCode(away)} {count("away")}</span>}
      {home && <span className="live-shots-team" data-side="home">{teamCode(home)} {count("home")}<span className="live-swatch" aria-hidden="true" /></span>}
    </div>
    <svg className="live-court" viewBox="0 0 94 50" role="img" aria-label={`Shot chart, ${scope}: ${away ? `${teamCode(away)} ${count("away")}` : ""}${home ? `, ${teamCode(home)} ${count("home")}` : ""} field goals`}>
      <g className="live-court-lines">
        <rect x={0} y={0} width={94} height={50} />
        <line x1={47} y1={0} x2={47} y2={50} />
        <circle cx={47} cy={25} r={6} />
        <HalfLines />
        <HalfLines mirror />
      </g>
      {art && <image className="live-court-logo" href={art.asset} x={42} y={20} width={10} height={10} preserveAspectRatio="xMidYMid meet" aria-hidden="true" />}
      {shots.map(shot => {
        const point = courtPoint(shot, shot.side!);
        if (!point) return null;
        const [x, y] = point;
        return <g key={shot.id} className="live-shot" data-side={shot.side} data-made={shot.scoring || undefined}>
          <title>{`${periodLabel(shot.period ?? 1)} ${shot.clock ?? ""} · ${shot.text}`}</title>
          {shot.scoring
            ? <circle cx={x} cy={y} r={0.85} />
            : <path d={`M ${x - 0.7} ${y - 0.7} L ${x + 0.7} ${y + 0.7} M ${x - 0.7} ${y + 0.7} L ${x + 0.7} ${y - 0.7}`} />}
        </g>;
      })}
    </svg>
    <p className="live-shots-legend"><span><span className="live-legend-made" aria-hidden="true" />Made</span><span><span className="live-legend-missed" aria-hidden="true">×</span>Missed</span></p>
  </div>;
}
