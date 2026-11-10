"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { awayFirst, formatRecord, liveRequest, periodLabel, seasonOf, teamCode, type LiveGameData, type LivePlay, type LiveTeam, type WinProbabilityLine, type WinProbabilitySwing } from "@/lib/live";
import { logoTeam, Panel } from "./live-panel";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { Segmented } from "./ui/kit";

const vars = (values: Record<`--${string}`, string>) => values as CSSProperties;

// ---------------------------------------------------------------- Probabilities & Game Flow

/** Game seconds before a period starts: four 12-minute quarters, then 5-minute overtimes. */
function periodStart(period: number) {
  return period <= 4 ? (period - 1) * 720 : 2880 + (period - 5) * 300;
}

function clockSeconds(clock: string | null) {
  if (!clock) return null;
  const [m, s] = clock.includes(":") ? clock.split(":") : ["0", clock];
  const value = Number(m) * 60 + Number(s);
  return Number.isFinite(value) ? value : null;
}

/** Seconds since tipoff when the play happened; null without a period or clock. */
export function elapsed(play: Pick<LivePlay, "period" | "clock">) {
  const left = clockSeconds(play.clock);
  if (play.period == null || left == null) return null;
  const length = play.period <= 4 ? 720 : 300;
  return periodStart(play.period) + Math.min(Math.max(length - left, 0), length);
}

/** Lead changes: times the leader switched (ties don't count as a change by themselves). */
export function leadChanges(plays: readonly Pick<LivePlay, "away_score" | "home_score">[]) {
  let leader: "away" | "home" | null = null, changes = 0;
  for (const p of plays) {
    if (p.away_score == null || p.home_score == null || p.away_score === p.home_score) continue;
    const now = p.away_score > p.home_score ? "away" : "home";
    if (leader && now !== leader) changes += 1;
    leader = now;
  }
  return changes;
}

const W = 600, H = 200;
type WinSource = "both" | "courtlens" | "espn";

/** One team's win-probability trace: dotted in the away colour above 50, solid in the home colour below. */
function WinPlot({ points, x, ticks, label, swings }: {
  points: { t: number; home: number }[]; x: (t: number) => number; ticks: { label: string; at: number }[]; label: string; swings?: WinProbabilitySwing[];
}) {
  const id = useId();
  const line = points.map(w => `${x(w.t).toFixed(1)},${((1 - w.home) * H).toFixed(1)}`).join(" L ");
  const area = points.length ? `M ${x(points[0].t)},${H / 2} L ${line} L ${x(points.at(-1)!.t)},${H / 2} Z` : "";
  return <div className="live-flow-plot"><div className="live-flow-canvas">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {ticks.map(t => <line key={t.label} className="live-flow-grid" x1={t.at * W / 100} x2={t.at * W / 100} y1={0} y2={H} />)}
      <defs>
        <clipPath id={`${id}-top`}><rect x={0} y={0} width={W} height={H / 2} /></clipPath>
        <clipPath id={`${id}-bottom`}><rect x={0} y={H / 2} width={W} height={H / 2} /></clipPath>
      </defs>
      <line className="live-flow-mid" x1={0} x2={W} y1={H / 2} y2={H / 2} />
      <path className="live-flow-area" data-side="away" clipPath={`url(#${id}-top)`} d={area} />
      <path className="live-flow-area" data-side="home" clipPath={`url(#${id}-bottom)`} d={area} />
      <path className="live-flow-line" data-side="away" clipPath={`url(#${id}-top)`} d={`M ${line}`} />
      <path className="live-flow-line" data-side="home" clipPath={`url(#${id}-bottom)`} d={`M ${line}`} />
      {swings?.map((s, i) => <line key={s.play_id} className="live-flow-swing" x1={x(s.t)} x2={x(s.t)} y1={0} y2={H}><title>{`${i + 1}: ${s.text ?? ""}`}</title></line>)}
    </svg>
    {swings?.map((s, i) => <span key={s.play_id} className="live-flow-swing-mark" style={vars({ "--at": `${x(s.t) / W * 100}%`, "--row": String(i) })} aria-hidden="true">{i + 1}</span>)}
    </div>
    <span className="live-flow-axis" aria-hidden="true"><span>100</span><span>50</span><span>100</span></span>
  </div>;
}

/** Follow-up list under the charts: what moved the game most, in game order. */
function SwingList({ swings, away, home, season }: { swings: WinProbabilitySwing[]; away: LiveTeam; home: LiveTeam; season: string }) {
  return <ol className="live-swings" aria-label="Biggest swings">{swings.map(s => {
    const favoured = s.delta_home >= 0 ? home : away;
    return <li key={s.play_id} className="live-swing">
      <span className="live-swing-when">{s.period ? periodLabel(s.period) : ""} {s.clock}</span>
      <span className="live-swing-text">{s.text}</span>
      <span className="live-swing-score">{s.away_score}–{s.home_score}</span>
      <span className="live-swing-move"><TeamLogo team={logoTeam(favoured)} season={season} size={16} />{teamCode(favoured)} +{Math.abs(s.delta_home * 100).toFixed(1)}</span>
    </li>;
  })}</ol>;
}

/**
 * Follow-up 25: Probabilities & Game Flow, now with CourtLens's frozen model beside ESPN Analytics'
 * (labelled as theirs). Game flow is both scores over time, marked at the biggest swings.
 */
export function GameFlow({ data, className = "" }: { data: LiveGameData; className?: string }) {
  const [away, home] = awayFirst(data.game.teams);
  const plays = (data.plays ?? []).filter(p => elapsed(p) != null);
  const order = new Map(plays.map((p, i) => [p.id, i]));
  // ESPN doesn't list the probabilities in game order; each point takes its play's place.
  const wins = (data.win_probability ?? [])
    .filter(w => order.has(w.play_id))
    .sort((a, b) => order.get(a.play_id)! - order.get(b.play_id)!)
    .map(w => ({ t: elapsed(plays[order.get(w.play_id)!])!, home: w.home }));
  const [frozen, setFrozen] = useState<WinProbabilityLine | null>(null);
  const gameId = data.game.source_id, slate = data.game.slate_date, playCount = plays.length;
  useEffect(() => {
    if (!playCount) return;
    let live = true;
    liveRequest<WinProbabilityLine>(`/games/${gameId}/win-probability?slate_date=${slate}`)
      .then(line => { if (live) setFrozen(line?.model ? line : null); })
      .catch(() => { if (live) setFrozen(null); });
    return () => { live = false; };
  }, [gameId, slate, playCount]);
  const ours = frozen?.status === "ok" ? frozen.points ?? [] : [];
  const swings = frozen?.status === "ok" ? frozen.swings ?? [] : [];
  const hasWin = wins.length > 0 || ours.length > 0;
  const [chosenMode, setMode] = useState<"win" | "flow">("win");
  const mode = hasWin ? chosenMode : "flow";
  const [chosen, setSource] = useState<WinSource>("both");
  const source: WinSource = !ours.length ? "espn" : !wins.length ? "courtlens" : chosen;
  if (plays.length < 2) return null;
  const periods = Math.max(4, ...plays.map(p => p.period ?? 0));
  const end = periodStart(periods + 1);
  const x = (t: number) => (t / end) * W;
  const season = seasonOf(data.game.slate_date);
  const lastEspn = wins.at(-1);
  const lastOurs = ours.at(-1);
  const last = source === "espn" ? lastEspn : lastOurs;
  const top = Math.max(10, ...plays.map(p => Math.max(p.away_score ?? 0, p.home_score ?? 0)));
  const ceiling = Math.ceil(top / 25) * 25;
  const flow = (side: "away" | "home") => plays.map(p => `${x(elapsed(p)!).toFixed(1)},${(H - ((side === "away" ? p.away_score : p.home_score) ?? 0) / ceiling * H).toFixed(1)}`).join(" L ");
  const changes = leadChanges(plays);
  const ticks = Array.from({ length: periods }, (_, i) => ({ label: i < 4 ? ["1st", "2nd", "3rd", "4th"][i] : periodLabel(i + 1), at: x(periodStart(i + 1)) / W * 100 }));
  const team = (t: LiveTeam, value: string, note?: string) => <span className="live-flow-team" data-side={t.side}>
    <TeamLogo team={logoTeam(t)} season={season} size={20} />
    <span className="live-flow-code">{teamCode(t)}<span className="live-flow-key" aria-hidden="true" /></span>
    <strong className="live-flow-value">{value}</strong>{note && <span className="live-flow-note">{note}</span>}
  </span>;
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const describe = (name: string, value?: { home: number }) => value ? `Win probability by ${name}: ${teamCode(home)} ${percent(value.home)} at the latest play` : `Win probability by ${name}`;
  const axisTicks = <div className="live-flow-ticks" aria-hidden="true">{ticks.map(t => <span key={t.label} style={vars({ "--at": `${t.at}%` })}>{t.label}</span>)}</div>;
  const courtlensPlot = <div className="live-flow-source">
    <span className="live-flow-source-name">CourtLens{source === "both" && lastOurs && <strong>{teamCode(home)} {percent(lastOurs.home)}</strong>}</span>
    <WinPlot points={ours} x={x} ticks={ticks} label={describe("CourtLens", lastOurs)} swings={swings} />{axisTicks}
  </div>;
  const espnPlot = <div className="live-flow-source">
    <span className="live-flow-source-name">ESPN Analytics{source === "both" && lastEspn && <strong>{teamCode(home)} {percent(lastEspn.home)}</strong>}</span>
    <WinPlot points={wins} x={x} ticks={ticks} label={describe("ESPN Analytics", lastEspn)} />{axisTicks}
  </div>;
  return <Panel title="Probabilities & Game Flow" icon="chart-line" className={className}
    action={hasWin ? <Segmented label="Chart" size="sm" value={mode} onChange={v => setMode(v as "win" | "flow")} options={[{ value: "win", label: "Win Probability" }, { value: "flow", label: "Game Flow" }]} /> : undefined}>
    <div className="live-flow" data-mode={mode}>
      {mode === "win" && ours.length > 0 && wins.length > 0 && <div className="live-flow-sources"><Segmented label="Model" size="sm" value={source} onChange={v => setSource(v as WinSource)} options={[{ value: "both", label: "Both" }, { value: "courtlens", label: "CourtLens" }, { value: "espn", label: "ESPN" }]} /></div>}
      {(mode !== "win" || source !== "both") && <div className="live-flow-head">
        {mode === "win" && last
          ? <>{team(away, percent(1 - last.home))}{team(home, percent(last.home))}</>
          : <>{team(away, String(away.score ?? "—"))}<span className="live-flow-changes"><strong>{changes}</strong> Lead Changes</span>{team(home, String(home.score ?? "—"))}</>}
      </div>}
      {mode === "win" ? <div className="live-flow-pair" data-count={source === "both" ? 2 : 1}>
        {source !== "espn" && courtlensPlot}
        {source !== "courtlens" && espnPlot}
      </div> : <>
        <div className="live-flow-plot"><div className="live-flow-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Game flow: ${teamCode(away)} ${away.score ?? "—"}, ${teamCode(home)} ${home.score ?? "—"}, ${changes} lead changes`}>
            {ticks.map(t => <line key={t.label} className="live-flow-grid" x1={t.at * W / 100} x2={t.at * W / 100} y1={0} y2={H} />)}
            {[0.25, 0.5, 0.75].map(f => <line key={f} className="live-flow-grid" x1={0} x2={W} y1={H * f} y2={H * f} />)}
            <path className="live-flow-score" data-side="away" d={`M ${flow("away")}`} />
            <path className="live-flow-score" data-side="home" d={`M ${flow("home")}`} />
            {swings.map((s, i) => <line key={s.play_id} className="live-flow-swing" x1={x(s.t)} x2={x(s.t)} y1={0} y2={H}><title>{`${i + 1}: ${s.text ?? ""}`}</title></line>)}
          </svg>
          {swings.map((s, i) => <span key={s.play_id} className="live-flow-swing-mark" style={vars({ "--at": `${x(s.t) / W * 100}%`, "--row": String(i) })} aria-hidden="true">{i + 1}</span>)}
          </div>
          <span className="live-flow-axis" aria-hidden="true"><span>{ceiling}</span><span>{ceiling / 2}</span><span>0</span></span>
        </div>
        {axisTicks}
      </>}
      {swings.length > 0 && (mode === "flow" || source !== "espn") && <SwingList swings={swings} away={away} home={home} season={season} />}
      {mode === "win" && <p className="live-note">Above the line favours {teamCode(away)}, below favours {teamCode(home)}. {wins.length > 0 && "ESPN Analytics is their model, not ours. "}{frozen?.status === "no_inputs" && "CourtLens has no line for this game: no pregame inputs were sealed before tip-off. "}{frozen?.availability === "hindsight_box" && "This game predates the freeze, so CourtLens's inputs use hindsight on who played. "}</p>}
      {frozen && <p className="live-note live-flow-model">CourtLens model <code>{frozen.model.version}</code> · <code title={frozen.model.manifest_sha256}>{frozen.model.manifest_sha256.slice(0, 12)}</code> · <a className="live-link" href="/research/win-probability">How it is scored</a></p>}
    </div>
  </Panel>;
}

// ---------------------------------------------------------------- Matchups (season series)

function shortDate(iso: string | null, withTime = false) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", { weekday: withTime ? "short" : undefined, month: "numeric", day: "numeric", hour: withTime ? "numeric" : undefined, minute: withTime ? "2-digit" : undefined, timeZone: "America/New_York" }).format(new Date(iso));
}

/** Follow-up 28: the season series, who leads it, and each meeting. */
export function Matchups({ data, className = "" }: { data: LiveGameData; className?: string }) {
  const series = data.season_series;
  if (!series?.games.length) return null;
  const [away, home] = awayFirst(data.game.teams);
  const season = seasonOf(data.game.slate_date);
  const byId = new Map(data.game.teams.map(t => [t.source_id, t]));
  return <Panel title="Matchups" icon="swords" className={className}>
    <div className="live-series-head">
      <span className="live-series-team"><TeamLogo team={logoTeam(away)} season={season} size={32} />{teamCode(away)}</span>
      <span className="live-series-lead"><span>{series.short_summary ?? "Season series"}</span><strong>{series.score ?? "0-0"}</strong></span>
      <span className="live-series-team"><TeamLogo team={logoTeam(home)} season={season} size={32} />{teamCode(home)}</span>
    </div>
    <ol className="live-series-games">{series.games.map((g, i) => {
      const host = byId.get(g.teams.find(t => t.side === "home")?.source_id ?? "");
      const score = (team: LiveTeam) => g.teams.find(t => t.source_id === team.source_id);
      const played = g.state === "post" || g.state === "in";
      const cell = (team: LiveTeam, align: "start" | "end") => {
        const s = score(team);
        return <span className="live-series-score" data-align={align} data-won={s?.winner || undefined} data-lost={s?.winner === false || undefined}>
          {played ? <>{s?.winner && align === "end" && <span className="live-banner-win" aria-hidden="true" />}{s?.score ?? "—"}{s?.winner && align === "start" && <span className="live-banner-win live-series-win-left" aria-hidden="true" />}</> : <span className="live-banner-record">{formatRecord(team.record)}</span>}
        </span>;
      };
      return <li key={g.source_id} className="live-series-game" aria-current={g.source_id === data.game.source_id ? "true" : undefined}>
        {cell(away, "start")}
        <span className="live-series-mid">
          <span>Game {i + 1}{host ? ` @ ${teamCode(host)}` : ""}</span>
          <strong>{played ? g.detail ?? "Final" : shortDate(g.date, true)}</strong>
          {played && <span>{shortDate(g.date)}</span>}
        </span>
        {cell(home, "end")}
      </li>;
    })}</ol>
  </Panel>;
}

// ---------------------------------------------------------------- Standings

/** Follow-up 29: both teams' divisions as ESPN lists them, the two teams highlighted. */
export function DivisionStandings({ data, className = "" }: { data: LiveGameData; className?: string }) {
  const groups = data.standings;
  if (!groups?.length) return null;
  const season = seasonOf(data.game.slate_date);
  const playing = new Set(data.game.teams.map(t => t.source_id));
  return <Panel title={`${season} Standings`} icon="list-ordered" className={className}
    action={<a className="live-link" href={`/standings?season=${season}&group=division`}>Full standings <Icon name="right" size={14} /></a>}>
    {groups.map(group => <div key={group.division ?? ""} className="live-standings-group">
      {group.conference && <p className="live-standings-conf">{group.conference}</p>}
      <table className="live-standings">
        <thead><tr><th scope="col">{group.division}</th><th scope="col">W</th><th scope="col">L</th><th scope="col">PCT</th><th scope="col">GB</th><th scope="col">STRK</th></tr></thead>
        <tbody>{group.entries.map(row => <tr key={row.team_source_id} data-current={playing.has(row.team_source_id) || undefined}>
          <th scope="row"><span className="live-standings-team">{row.tricode && <TeamLogo team={row.tricode} season={season} size={16} />}{row.name}</span></th>
          <td>{row.wins ?? "—"}</td><td>{row.losses ?? "—"}</td><td>{row.pct ?? "—"}</td><td>{row.gb ?? "—"}</td><td>{row.streak ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>)}
    <p className="live-note">ESPN&apos;s standings when this game was read.</p>
  </Panel>;
}

// ---------------------------------------------------------------- Recap and news

function published(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(iso));
}

/**
 * Follow-ups 30 and 35: the game's recap (Gamecast's middle column, text first) and NBA stories
 * (its right column), each linking to ESPN.
 */
export function NewsPanel({ data, part, className = "" }: { data: LiveGameData; part: "recap" | "stories"; className?: string }) {
  const news = data.news;
  if (part === "recap") {
    const recap = news?.recap;
    if (!recap) return null;
    return <Panel title="Recap" icon="news" className={className}>
      <article className="live-recap">
        {recap.image && /* eslint-disable-next-line @next/next/no-img-element -- ESPN's recap photo, linked to its source */
          <img className="live-recap-image" src={recap.image} alt="" loading="lazy" />}
        <div className="live-recap-text">
          <h3>{recap.link ? <a href={recap.link} target="_blank" rel="noreferrer">{recap.headline}</a> : recap.headline}</h3>
          {recap.description && <p>{recap.description.replace(/^—\s*/, "")}</p>}
          <span className="live-note">{[published(recap.published), recap.source].filter(Boolean).join(" · ")}</span>
        </div>
      </article>
    </Panel>;
  }
  if (!news?.stories.length) return null;
  return <Panel title="NBA News" icon="news" className={className}>
    <ul className="live-stories">{news.stories.map(story => <li key={story.headline}>
      {story.image && /* eslint-disable-next-line @next/next/no-img-element -- ESPN story photo, linked to its source */
        <img src={story.image} alt="" loading="lazy" />}
      <span>
        {story.link ? <a href={story.link} target="_blank" rel="noreferrer">{story.headline}</a> : <strong>{story.headline}</strong>}
        <span className="live-note">{published(story.published)}</span>
      </span>
    </li>)}</ul>
    <p className="live-note">From ESPN; links open their site.</p>
  </Panel>;
}
