"use client";

import Link from "next/link";
import { ShapeIcon, tone, type BoxEntry } from "./roster-shape-box";
import {
  fullestAverage, missingStyles, one, shapeKind, signed, styleShares, teamFill, valueAbove, whiteAsPlayer,
  type RosterShapes, type ShapeHistory, type ShapeMode, type ShapeTeam
} from "@/lib/roster-shapes";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const ordinalOf = (n: number, of: number) => `${n} of ${of}`;

/** Databallr's side panel: fill and value, fit, what fills the box (lacking styles flagged), the drawn
 * players, the rest. A table row and its shape in the box highlight together through `active`. */
export function TeamPanel({ team, entries, data, mode, active, onActive }: {
  team: ShapeTeam; entries: BoxEntry[]; data: RosterShapes; mode: ShapeMode;
  active: string | null; onActive: (id: string | null) => void;
}) {
  const fill = entries.reduce((sum, e) => sum + (e.size ?? 0), 0) / data.capacity;
  const others = data.teams.filter(t => t.team_tricode !== team.team_tricode);
  const fillRank = 1 + others.filter(t => teamFill(t, mode) > fill).length;
  const drawn = entries.filter(e => e.size !== null).sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const notDrawn = entries.filter(e => e.size === null);
  const eased = drawn.filter(e => e.size && e.player.fit_ease !== null);
  const easedSize = eased.reduce((sum, e) => sum + e.size!, 0);
  const ease = easedSize ? eased.reduce((sum, e) => sum + e.player.fit_ease! * e.size!, 0) / easedSize : null;
  const easeRank = ease === null ? null : 1 + others.filter(t => (t.fit_ease ?? -1) > ease).length;
  const shares = styleShares(entries, data.capacity);
  const ticks = fullestAverage(data.teams, mode, data.capacity);
  const rows = [...data.archetypes.clusters.filter(c => c.cluster < 6).map(c => ({ key: c.cluster, name: c.name, description: c.description })), { key: -1, name: "Unknown", description: "No derived archetype" }];
  const lacking = new Set(missingStyles(entries, data.capacity, data.archetypes.clusters));
  const best = Math.max(...data.teams.flatMap(t => t.roster.map(p => p.dpm ?? -Infinity)));
  const white = whiteAsPlayer(fill, data.capacity, data);
  const scale = Math.max(0.05, ...rows.map(r => Math.max(shares.get(r.key) ?? 0, ticks.get(r.key) ?? 0)));
  return <aside className="shapes-panel" aria-label={`${team.team_name} roster summary`}>
    <div className="shapes-panel-figures">
      <p><strong>{pct(fill)}</strong><span><b>of the box filled</b>, {ordinalOf(fillRank, data.teams.length)}. {drawn.filter(e => e.size).length} players in the box, worth {valueAbove(entries, mode, data).toFixed(1)} per 100 above replacement.</span></p>
      <p><strong>{ease === null ? "—" : Math.round(ease * 100)}</strong><span><b>ease of fit</b>{easeRank ? `, ${ordinalOf(easeRank, data.teams.length)}` : ""}: the box-weighted average of each player&apos;s ease (0 hardest, 100 plugs in anywhere). An estimate.</span></p>
    </div>
    <section className="shapes-panel-fills" aria-label="What fills the box">
      <h3>What fills the box</h3>
      <p>Share of the box by style. The tick is the average of the season&apos;s five fullest rosters; styles under 2% are flagged as lacking.</p>
      <dl>{rows.map(row => {
        const share = shares.get(row.key) ?? 0, tick = ticks.get(row.key) ?? 0;
        return <div key={row.key} title={row.description}>
          <dt>{row.name}{lacking.has(row.name) && <span className="shapes-fill-lacks">Lacks</span>}</dt>
          <dd>
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
              <rect className="shapes-fill-track" width="100" height="8" />
              <rect width={share / scale * 100} height="8" fill={tone(row.key < 0 ? null : row.key)} />
              <line className="shapes-fill-tick" x1={tick / scale * 100} x2={tick / scale * 100} y1="-1" y2="9" />
            </svg>
            <span>{pct(share)}</span>
          </dd>
        </div>;
      })}</dl>
    </section>
    <div className="shapes-panel-table" role="region" aria-label={`${team.team_name} players in the box`} tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Player</th><th scope="col">MPG</th><th scope="col">DPM</th><th scope="col" title="Ease of fit, 0 hardest to 100 plugs in anywhere">Fit</th><th scope="col">Box</th></tr></thead>
        <tbody>{drawn.map(({ player, size, minutes, mark }) => {
          const dpm = player.dpm === null ? null : player.dpm + (mode === "playoff" ? player.playoff_shift ?? 0 : 0);
          return <tr key={player.player_id} data-mark={mark} className={player.player_id === active ? "is-active" : undefined}
            onPointerEnter={() => onActive(player.player_id)} onPointerLeave={() => onActive(null)}
            onFocus={() => onActive(player.player_id)} onBlur={() => onActive(null)}>
            <th scope="row"><ShapeIcon kind={shapeKind(player.fit_band)} color={tone(player.archetype?.primary)} size={14} /><Link href={`/players/${player.player_id}`}>{player.player_name}</Link></th>
            <td>{one(minutes ?? player.minutes_per_game)}</td>
            <td data-tone={dpm === null || Math.abs(dpm) < 0.05 ? undefined : dpm > 0 ? "up" : "down"}>{signed(dpm)}</td>
            <td>{player.fit_ease === null ? "—" : Math.round(player.fit_ease * 100)}</td>
            <td><strong>{size === null ? "—" : `${(size / data.capacity * 100).toFixed(1)}%`}</strong></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {white !== null && <p className="shapes-panel-undrawn"><b>White</b> is {white > best
      ? <>more than any one player adds (the league&apos;s best is {signed(best)} DPM).</>
      : <>a {signed(white)} DPM starter at 34 minutes.</>}</p>}
    {notDrawn.length > 0 && <p className="shapes-panel-undrawn"><b>Not drawn:</b> {notDrawn.map(({ player }) => `${player.player_name} (${player.dpm === null ? "no DPM" : "no minutes"})`).join(", ")}.</p>}
  </aside>;
}

/** Season by season: this franchise's actual fill each season, the projection dashed. */
export function SeasonStrip({ team, history, data, mode }: { team: ShapeTeam; history: ShapeHistory; data: RosterShapes; mode: ShapeMode }) {
  const bars = history.seasons.map(s => ({ season: s.season, fill: s.fills[team.team_id] ?? null, projected: false }));
  if (data.projected) bars.push({ season: data.season, fill: teamFill(team, mode), projected: true });
  const top = Math.max(1, ...bars.map(b => b.fill ?? 0));
  const W = 820, H = 80, gap = 2, width = (W - gap * (bars.length - 1)) / bars.length;
  const y100 = H - H / top;
  return <section className="shapes-strip" aria-label="Season by season">
    <h3>Season by season</h3>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${team.team_name} box fill by season, ${bars[0]?.season} to ${bars.at(-1)?.season}`}>
      {top > 1 && <line className="shapes-strip-full" x1="0" x2={W} y1={y100} y2={y100} />}
      {bars.map((bar, i) => {
        const h = bar.fill === null ? 0 : (bar.fill / top) * H;
        return <rect key={bar.season} className={`shapes-strip-bar ${bar.projected ? "is-projected" : ""} ${bar.season === data.season ? "is-current" : ""}`}
          x={i * (width + gap)} y={H - h} width={width} height={Math.max(h, bar.fill === null ? 0 : 1)}>
          <title>{`${bar.season}${bar.projected ? " (projected)" : ""}: ${bar.fill === null ? "no team" : `${pct(bar.fill)} of the box`}`}</title>
        </rect>;
      })}
    </svg>
    <p className="shapes-strip-axis"><span>{bars[0]?.season}</span>{top > 1 && <span>Dashed line: a full box</span>}<span>{bars.at(-1)?.season}</span></p>
  </section>;
}
