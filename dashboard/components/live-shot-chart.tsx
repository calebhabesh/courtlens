"use client";

import { useState } from "react";
import { periodLabel, teamCode, type LivePlay, type LiveTeam } from "@/lib/live";
import { Segmented } from "./ui/kit";

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

export function ShotChart({ plays, teams, periods }: { plays: readonly LivePlay[]; teams: readonly LiveTeam[]; periods: number }) {
  const [period, setPeriod] = useState("all");
  // Only attempts with a court spot: the counts match the marks.
  const shots = plays.filter(p => p.shot === "field_goal" && p.side && p.x != null && (period === "all" || String(p.period) === period));
  const away = teams.find(t => t.side === "away"), home = teams.find(t => t.side === "home");
  const count = (side: "home" | "away") => {
    const own = shots.filter(s => s.side === side);
    return `${own.filter(s => s.scoring).length}-${own.length}`;
  };
  const options = [{ value: "all", label: "All" }, ...Array.from({ length: periods }, (_, i) => ({ value: String(i + 1), label: i < 4 ? String(i + 1) : periodLabel(i + 1) }))];
  return <div className="live-shots">
    <Segmented label="Shot chart period" options={options} value={period} onChange={setPeriod} size="sm" stretch />
    <div className="live-shots-teams">
      {away && <span className="live-shots-team" data-side="away"><span className="live-swatch" aria-hidden="true" />{teamCode(away)} {count("away")}</span>}
      {home && <span className="live-shots-team" data-side="home">{teamCode(home)} {count("home")}<span className="live-swatch" aria-hidden="true" /></span>}
    </div>
    <svg className="live-court" viewBox="0 0 94 50" role="img" aria-label={`Shot chart, ${period === "all" ? "all periods" : periodLabel(Number(period))}: ${away ? `${teamCode(away)} ${count("away")}` : ""}${home ? `, ${teamCode(home)} ${count("home")}` : ""} field goals`}>
      <g className="live-court-lines">
        <rect x={0} y={0} width={94} height={50} />
        <line x1={47} y1={0} x2={47} y2={50} />
        <circle cx={47} cy={25} r={6} />
        <HalfLines />
        <HalfLines mirror />
      </g>
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
