"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { runStatShiftRoster } from "@/lib/workbench-api";
import { DEFAULT_SHIFT_STATS, SHIFT_STATS, clearShift, floorCsv, formatShift, shiftValue, type FloorResponse, type RosterPlayer, type ShiftStat, type StatShiftRosterResponse } from "@/lib/shared-floor";
import { formatDate } from "@/lib/format-date";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamGrid, teamDisplayName } from "./team-grid";
import branding from "@/lib/team-branding.json";
import { TeamLogo } from "./team-logo";
import { Modal } from "./ui/modal";
import { OverlayPortal } from "./ui/overlay-portal";
import { PageHeader } from "./ui/panel";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar } from "./ui/identity";
import { Checkbox } from "./ui/checkbox";
import { Icon } from "./ui/icon";
import { Button, IconButton, Segmented, Select } from "./ui/kit";

const BLURB = "Analyze how individual player stats change when playing with or without specific teammates";
const TEAM_CATALOG = branding.teams;
const GATES = { min_possessions: 100, min_games: 5 };
const PHASES: Record<string, string> = { regular_season: "Reg Season", playoffs: "Playoffs" };
type View = "shift" | "without" | "with";
const VIEWS = [{ value: "shift", label: "Difference" }, { value: "without", label: "Without" }, { value: "with", label: "With" }] as const;
// Career-table vocabulary for the group labels (alignment patterns: Tables).
const GROUPS: Record<string, string> = { usg: "Profile", ts: "Scoring", "3p": "Scoring", pm: "Impact", ortg: "Impact", drtg: "Impact" };
const group = (stat: ShiftStat) => GROUPS[stat.key] ?? "Counting";

const ids = (value: string | null) => (value ?? "").split(",").filter(Boolean).slice(0, 2);
const shortName = (name: string) => { const parts = name.split(" "); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name; };
const firstName = (name: string) => name.split(" ")[0];
const minutes = (value: number) => Math.round(value).toLocaleString("en-US");
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Groups consecutive columns under one label, as the career table does. */
function groupRuns(stats: ShiftStat[]) {
  const runs: { label: string; span: number }[] = [];
  for (const stat of stats) {
    const last = runs.at(-1);
    if (last && last.label === group(stat)) last.span += 1; else runs.push({ label: group(stat), span: 1 });
  }
  return runs;
}

/** Databallr's "without → with" arrow. */
const To = () => <><Icon name="right" size={14} className="sls-to" /><span className="sr-only"> to </span></>;

function Delta({ value, stat }: { value: ReturnType<typeof shiftValue>; stat: ShiftStat }) {
  if (value.difference == null) return <span className="sls-delta" title={value.reason ?? "Below the sample gates on one side"}>—</span>;
  const tone = Math.abs(value.difference) < 0.05 ? undefined : value.difference > 0 ? "up" : "down";
  const interval = value.lower != null && value.upper != null ? `95% interval ${formatShift(value.lower, stat, true)} to ${formatShift(value.upper, stat, true)}` : value.reason ?? "No interval";
  return <span className="sls-delta" data-tone={tone} data-clear={clearShift(value) || undefined} title={interval}>
    {formatShift(value.difference, stat, true)}{clearShift(value) && <><span className="sls-clear" /><span className="sr-only"> (interval excludes zero)</span></>}
  </span>;
}

function ShiftCell({ result, stat, view }: { result: FloorResponse; stat: ShiftStat; view: View }) {
  const value = shiftValue(result, stat);
  if (view !== "shift") return <span className="sls-single">{formatShift(view === "with" ? value.with : value.without, stat)}</span>;
  return <span className="sls-cell">
    <span className="sls-pair">{formatShift(value.without, stat)}<To /><strong>{formatShift(value.with, stat)}</strong></span>
    <Delta value={value} stat={stat} />
  </span>;
}

function ShiftTable({ data, subject, stats, view, sort, onSort, onSubject, names }: {
  data: StatShiftRosterResponse; subject: RosterPlayer; stats: ShiftStat[]; view: View; sort: string | null;
  onSort: (key: string | null) => void; onSubject: (id: string) => void; names: Map<string, RosterPlayer>;
}) {
  const sorted = useMemo(() => {
    const rows = [...data.shifts];
    const stat = stats.find(s => s.key === sort);
    const key = (r: FloorResponse) => stat ? (view === "shift" ? shiftValue(r, stat).difference : shiftValue(r, stat)[view]) : r.cells[view === "without" ? 1 : 0].minutes;
    return rows.sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
  }, [data.shifts, stats, sort, view]);
  const name = shortName(subject.name ?? subject.player_id);
  // Headshots from the analysed team-season, not today's photo.
  const era = { season: String(data.context.season ?? ""), team: data.team_id };
  return <section className="sls-table player-glass" aria-label={`Per 75 stats without and with ${subject.name}`}>
    <header className="sls-table-head">
      <PlayerAvatar playerId={subject.player_id} name={subject.name ?? subject.player_id} team={data.team_id} era={era} size="md" />
      <h2>{view === "shift" ? <>Per 75 stats <strong>without</strong> and <strong>with {subject.name}</strong></>
        : <>Per 75 stats <strong>{view === "with" ? "with" : "without"} {subject.name}</strong></>}</h2>
    </header>
    <div className="player-ref-grid-frame"><div className="player-ref-grid-scroll" role="region" aria-label="Teammate stat shifts" tabIndex={0}>
      <table className="player-ref-grid sls-grid" style={{ "--columns": stats.length } as CSSProperties}>
        <colgroup><col className="player-ref-grid-lead-column" />{stats.map(s => <col key={s.key} />)}</colgroup>
        <thead>
          <tr className="player-ref-grid-tier-1"><th className="player-ref-grid-lead" rowSpan={1} scope="col">Player</th>
            {groupRuns(stats).map((run, i) => <th key={`${run.label}-${i}`} colSpan={run.span} scope="colgroup" className="group-start">{run.label}</th>)}</tr>
          <tr className="player-ref-grid-tier-2">
            <th className="player-ref-grid-lead sls-lead-sub" scope="col">
              <button type="button" className="sls-sort" aria-pressed={!sort} onClick={() => onSort(null)}>{view === "shift" ? <>Min w/o<To />Min w/ {name}</> : `Min ${view === "with" ? "w/" : "w/o"} ${name}`}{!sort && <Icon name="chevron-down" size={14} />}</button>
            </th>
            {stats.map((s, i) => <th key={s.key} scope="col" className={i === 0 || group(stats[i - 1]) !== group(s) ? "group-start" : undefined} title={s.title}>
              <button type="button" className="sls-sort" aria-pressed={sort === s.key} onClick={() => onSort(sort === s.key ? null : s.key)}>{s.label}{sort === s.key && <Icon name="chevron-down" size={14} />}</button>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {sorted.map(result => {
            const player = names.get(result.request.player_id ?? "");
            const [withCell, withoutCell] = result.cells;
            const small = withCell.sample_status !== "available" || withoutCell.sample_status !== "available";
            return <tr key={result.request.player_id} data-small={small || undefined}>
              <th scope="row" className="player-ref-grid-lead sls-player">
                <button type="button" className="sls-player-button" onClick={() => onSubject(result.request.player_id ?? "")} title={`View ${player?.name}'s table`}>
                  <PlayerAvatar playerId={result.request.player_id ?? undefined} name={player?.name ?? ""} team={data.team_id} era={era} size="sm" />
                  <span><strong>{player?.name ?? result.request.player_id}</strong>
                    <small>{view === "shift" ? <>{minutes(withoutCell.minutes)} min w/o<To />{minutes(withCell.minutes)} min with</> : `${minutes((view === "with" ? withCell : withoutCell).minutes)} min ${view === "with" ? "with" : "without"}`}{small ? " · small sample" : ""}</small></span>
                </button>
              </th>
              {stats.map((s, i) => <td key={s.key} className={i === 0 || group(stats[i - 1]) !== group(s) ? "group-start" : undefined}><ShiftCell result={result} stat={s} view={view} /></td>)}
            </tr>;
          })}
        </tbody>
      </table>
    </div></div>
    <details className="sls-cells">
      <summary>Presence/Absence Cells ({sorted.length * 2})</summary>
      <div className="player-ref-grid-frame"><div className="player-ref-grid-scroll" role="region" aria-label="Presence and absence cells" tabIndex={0}>
        <table className="player-ref-grid sls-cell-grid">
          <thead><tr className="player-ref-grid-tier-2"><th className="player-ref-grid-lead" scope="col">Player</th><th scope="col">{name}</th><th scope="col">Games</th><th scope="col">Stints</th><th scope="col">Minutes</th><th scope="col">Off. Poss.</th><th scope="col">Def. Poss.</th><th scope="col">Sample</th></tr></thead>
          <tbody>{sorted.flatMap(result => result.partitions.map(cell => <tr key={`${result.request.player_id}-${cell.key}`}>
            <th scope="row" className="player-ref-grid-lead">{names.get(result.request.player_id ?? "")?.name}</th>
            <td>{cell.present.length ? "On" : "Off"}</td><td>{cell.games}</td><td>{cell.stints}</td><td>{minutes(cell.minutes)}</td>
            <td>{Math.round(cell.offensive_possessions)}</td><td>{Math.round(cell.defensive_possessions)}</td>
            <td>{cell.sample_status === "available" ? "Passes" : cell.sample_status === "empty" ? "Empty" : "Below gates"}</td>
          </tr>))}</tbody>
        </table>
      </div></div>
    </details>
  </section>;
}

function PairCard({ result, focal, other, season, stats }: { result: FloorResponse; focal: RosterPlayer; other: RosterPlayer; season: string; stats: ShiftStat[] }) {
  const [withCell, withoutCell] = result.cells;
  const otherFirst = firstName(other.name ?? other.player_id);
  return <article className="sls-card" aria-label={`${focal.name} with and without ${other.name}`}>
    <header className="sls-card-head">
      <span className="sls-card-brand">CourtLens</span><span className="sls-card-season">{season}</span>
      <span className="sls-card-faces">
        <PlayerAvatar playerId={focal.player_id} name={focal.name ?? ""} team={result.request.team_id} era={{ season, team: result.request.team_id }} size="lg" className="sls-card-face" />
        <PlayerAvatar playerId={other.player_id} name={other.name ?? ""} team={result.request.team_id} era={{ season, team: result.request.team_id }} size="md" className="sls-card-other" />
      </span>
      <h3>{focal.name}</h3><p>Stats per 75 possessions</p>
    </header>
    <div className="sls-card-sides">
      <span className="sls-card-side" data-side="with">With {otherFirst}<small>({minutes(withCell.minutes)} mins)</small></span>
      <span className="sls-card-side" data-side="without">Without {otherFirst}<small>({minutes(withoutCell.minutes)} mins)</small></span>
    </div>
    <dl className="sls-card-rows">
      {stats.map(stat => {
        const value = shiftValue(result, stat);
        const d = value.difference;
        const pill = d == null || Math.abs(d) < 0.05 ? null : <span className="sls-pill" data-side={d > 0 ? "with" : "without"} data-clear={clearShift(value) || undefined}
          title={value.lower != null && value.upper != null ? `95% interval ${formatShift(value.lower, stat, true)} to ${formatShift(value.upper, stat, true)}` : value.reason ?? undefined}>{formatShift(Math.abs(d), stat, true)}</span>;
        return <div key={stat.key} className="sls-card-row">
          <span className="sls-pill-slot">{d != null && d > 0 && pill}</span>
          <dd>{formatShift(value.with, stat)}</dd>
          <dt title={stat.title}>{stat.label}</dt>
          <dd>{formatShift(value.without, stat)}</dd>
          <span className="sls-pill-slot">{d != null && d < 0 && pill}</span>
        </div>;
      })}
    </dl>
  </article>;
}

/** Databallr's roster drawer: fixed across the foot of the screen, no frame around the faces (follow-ups 9, 12). */
function RosterTray({ roster, team, season, selected, open, onOpen, onToggle, onTeam }: {
  roster: RosterPlayer[]; team: string; season: string; selected: string[]; open: boolean;
  onOpen: (open: boolean) => void; onToggle: (id: string) => void; onTeam: () => void;
}) {
  // At document.body: the route's enter transform would otherwise anchor `fixed` to the page.
  return <OverlayPortal><aside className="sls-tray" data-open={open || undefined} aria-label="Roster"><div className="sls-tray-inner">
    <div className="sls-tray-head">
      <TeamLogo team={team} season={season} size={20} />
      <strong>{teamDisplayName(team) ?? team}</strong>
      <span className="sls-tray-hint">{selected.length ? `${selected.length} of 2 picked` : "Pick one or two players"}</span>
      <Button size="sm" variant="ghost" className="sls-tray-change" onClick={onTeam}>Change Team</Button>
      <IconButton size="sm" variant="ghost" icon="chevron-down" className="sls-tray-toggle" label={open ? "Hide roster" : "Show roster"} expanded={open} onClick={() => onOpen(!open)} />
    </div>
    {open && <ul className="sls-tray-grid">
      {roster.map(player => <li key={player.player_id}><button type="button" className="sls-tray-item" aria-pressed={selected.includes(player.player_id)} onClick={() => onToggle(player.player_id)}
        title={`${player.name} · ${minutes(player.minutes)} min · ${player.games} games`}>
        <PlayerAvatar playerId={player.player_id} name={player.name ?? player.player_id} team={team} era={{ season, team }} size="lg" />
        <span className="sls-tray-name">{player.name ?? player.player_id}</span>
      </button></li>)}
    </ul>}
  </div></aside></OverlayPortal>;
}

// Databallr's Customize Stats groups, limited to the columns the stint box supports.
const STAT_GROUPS: { label: string; keys: string[] }[] = [
  { label: "General", keys: ["pts", "ast", "reb", "tov", "usg", "pm"] },
  { label: "Shooting", keys: ["ts", "3p", "fta", "fga", "3pa"] },
  { label: "Rebounding", keys: ["oreb", "dreb"] },
  { label: "Team on Court", keys: ["ortg", "drtg"] },
];

/** A dialog like Databallr's: grouped checkboxes, applied only on Save Changes (follow-up 8). */
function CustomizeStats({ open, current, onClose, onSave }: { open: boolean; current: string[]; onClose: () => void; onSave: (keys: string[]) => void }) {
  const [draft, setDraft] = useState(current);
  const [shown, setShown] = useState(open);
  if (open !== shown) { setShown(open); if (open) setDraft(current); }
  const toggle = (key: string, on: boolean) => setDraft(keys => on ? [...keys, key] : keys.filter(k => k !== key));
  return <Modal isOpen={open} onClose={onClose} title="Customize Stats" className="sls-customize-dialog">
    <div className="sls-customize-groups">
      {STAT_GROUPS.map(group => <fieldset key={group.label} className="sls-customize-group"><legend>{group.label}</legend>
        {group.keys.map(key => { const stat = SHIFT_STATS.find(s => s.key === key)!; return <Checkbox key={key} label={stat.label} title={stat.title} checked={draft.includes(key)} onChange={on => toggle(key, on)} />; })}
      </fieldset>)}
    </div>
    <footer className="sls-customize-actions">
      <Button size="md" variant="text" onClick={() => setDraft(DEFAULT_SHIFT_STATS)}>Defaults</Button>
      <Button size="md" variant="danger" onClick={() => setDraft([])}>Clear All</Button>
      <span className="sls-customize-spacer" />
      <Button size="md" onClick={onClose}>Cancel</Button>
      <Button size="md" variant="primary" disabled={!draft.length} onClick={() => onSave(SHIFT_STATS.map(s => s.key).filter(k => draft.includes(k)))}>Save Changes</Button>
    </footer>
  </Modal>;
}

/** Team URLs carry the tricode; the picker hands back the franchise id. */
const tricodeOf = (team: string) => TEAM_CATALOG.find(entry => entry.team_id === team || entry.tricode === team)?.tricode ?? team;

export function TeamStatShiftView() {
  const { get, set } = useUrlState();
  const team = get("team");
  const players = ids(get("players"));
  const view = (VIEWS.find(v => v.value === get("view"))?.value ?? "shift") as View;
  const sort = get("sort");
  const chosen = (get("stats") ?? "").split(",").filter(key => SHIFT_STATS.some(s => s.key === key));
  const statKeys = chosen.length ? chosen : DEFAULT_SHIFT_STATS;
  const stats = SHIFT_STATS.filter(s => statKeys.includes(s.key));
  // Databallr opens on the team picker; closing it leaves the page unfilled (follow-up 6).
  const [picker, setPicker] = useState(() => !get("team"));
  const [customize, setCustomize] = useState(false);
  const [trayOpen, setTrayOpen] = useState(true);
  const scope = { team_id: team, season: get("season"), phase: get("phase") ?? "regular_season", release_id: get("releaseId"), ...GATES };
  const inputs = [team, scope.season, scope.phase, scope.release_id] as const;
  const primary = useFeed([...inputs, players[0] ?? null], signal => runStatShiftRoster({ ...scope, subject_id: players[0] ?? null }, signal));
  const secondary = useFeed([...inputs, players[1] ?? "none"], signal => players[1] ? runStatShiftRoster({ ...scope, subject_id: players[1] }, signal) : Promise.resolve(null));
  const data = primary.data;
  const season = String(data?.context.season ?? scope.season ?? "");
  const names = useMemo(() => new Map((data?.roster ?? []).map(p => [p.player_id, p])), [data]);
  const seasons = [...new Set((data?.available_scopes ?? []).map(s => s.season))];
  const phases = (data?.available_scopes ?? []).filter(s => s.season === season).map(s => s.phase);
  const subjects = players.map(id => names.get(id)).filter((p): p is RosterPlayer => Boolean(p));
  const covered = Boolean(team) && data?.available_scopes.some(s => s.season === season && s.phase === data.context.phase);
  const toggle = (id: string) => {
    const next = players.includes(id) ? players.filter(p => p !== id) : [...players, id].slice(-2);
    set({ players: next.join(",") || null, sort: null });
  };
  const results = [primary.data, secondary.data].flatMap(d => d?.shifts ?? []);
  const cross = (focal: RosterPlayer, response: StatShiftRosterResponse | null) => response?.shifts.find(r => r.request.player_id === focal.player_id) ?? null;
  return <div className="sls-page" role="region" aria-label="Stat Line Shift" data-tray={covered ? (trayOpen ? "open" : "closed") : undefined}>
    <PageHeader className="pvp-header" icon="chart-column" title="Stat Line Shift" subtitle={BLURB} />
    <div className="sls-console"><FilterBar label="Stat Line Shift controls" summary={[season, team ?? "No Team", PHASES[scope.phase] ?? scope.phase].filter(Boolean).join(" · ")}
      scope={<>
        <Select size="md" aria-label="Season" value={season} onChange={event => set({ season: event.target.value, players: null, sort: null })}>
          {(seasons.length ? seasons : [season]).map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Button size="md" aria-label={team ? `Team, ${teamDisplayName(team) ?? team}` : "Select Team"} onClick={() => setPicker(true)}>{team ? <><TeamLogo team={team} season={season} size={20} />{team}</> : "Team"}</Button>
        <Select size="md" aria-label="Season phase" value={scope.phase} onChange={event => set({ phase: event.target.value, players: null, sort: null })}>
          {(phases.length ? phases : [scope.phase]).map(p => <option key={p} value={p}>{PHASES[p] ?? p}</option>)}
        </Select>
        <Button size="md" variant="primary" icon="sliders" aria-haspopup="dialog" onClick={() => setCustomize(true)}>Customize Stats</Button>
      </>}
      details={data ? <DataDetailsButton rows={[
        { label: "Coverage", value: `${data.observed_games} of ${data.expected_games} games reconstructed (${data.coverage_status})` },
        { label: "Excluded stints", value: data.excluded_stints },
        { label: "Sample gates", value: `${GATES.min_possessions} possessions and ${GATES.min_games} games on each side` },
        { label: "Stint dataset", value: String(data.context.stint_dataset_id ?? "None"), mono: true },
        { label: "Through", value: data.context.before_date ? formatDate(String(data.context.before_date)) : "—" },
        { label: "Operation version", value: data.operation_version, mono: true },
      ]}>
        <ul className="sls-method">
          <li>Each row uses only that player&apos;s stints. &quot;With&quot; is every stint the selected player shares the floor with him; &quot;without&quot; is the rest. Differences are with minus without.</li>
          <li>Counting stats are per 75 possessions (per 100 × 0.75); defensive rebounds use defensive possessions. USG% is the player&apos;s FGA + 0.44 FTA + TOV over all five teammates&apos; on the floor. +/- is the team&apos;s net points per 75.</li>
          <li>A difference shows only when both sides pass the gates. The dot marks a 95% game-cluster interval that excludes zero; hover a value for the interval. These are descriptive, not causal or forecasts.</li>
          <li>Stints are IM03&apos;s accepted reconstructions (IM02-repaired lineups included). Player stats come from the sealed stint box; a field that did not conserve to the box score in a game is unknown there, never zero.</li>
        </ul>
        {results.length > 0 && <Button size="md" onClick={() => download(floorCsv(results), `courtlens-stat-line-shift-${(team ?? "team").toLowerCase()}-${season}.csv`, "text/csv")}>Export CSV</Button>}
        {results.length > 0 && <Button size="md" onClick={() => download(JSON.stringify({ schema: "courtlens-stat-line-shift-evidence-v1", results }, null, 2), "stat-line-shift-evidence.json", "application/json")}>Save Evidence JSON</Button>}
      </DataDetailsButton> : undefined} /></div>
    <Modal isOpen={picker} onClose={() => setPicker(false)} title="Select Team" description="30 NBA teams" className="sls-team-modal">
      <TeamGrid variant="compact" selected={team ? TEAM_CATALOG.find(entry => entry.tricode === team)?.team_id : null} season={season}
        onSelect={next => { const code = tricodeOf(next); set({ team: code === team ? null : code, players: null, sort: null }); setPicker(false); }} />
      {team && <Button size="md" stretch className="sls-team-clear" onClick={() => { set({ team: null, players: null, sort: null }); setPicker(false); }}>Clear Team</Button>}
    </Modal>
    <CustomizeStats open={customize} current={statKeys} onClose={() => setCustomize(false)}
      onSave={keys => { set({ stats: keys.join(",") === DEFAULT_SHIFT_STATS.join(",") ? null : keys.join(",") }); setCustomize(false); }} />
    {primary.error && <FeedFailure error={primary.error} retry={primary.retry} what="Stat Line Shift" />}
    {primary.loading && <FeedSkeleton label="Loading stat line shift" />}
    {data && !team && <div className="sls-empty"><p>Select a team to begin</p><Button size="md" variant="primary" onClick={() => setPicker(true)}>Select Team</Button></div>}
    {data && team && !covered && <GatedNote why="Stat Line Shift reads IM03's accepted stints, which cover 2023-24 to 2025-26.">No stints for {team} in {season} {PHASES[scope.phase] ?? scope.phase}.</GatedNote>}
    {data && covered && <>
      {subjects.length === 2 && <div className="sls-full-tables"><span>View full table for:</span>
        {subjects.map(p => <Button key={p.player_id} size="sm" icon="table" onClick={() => set({ players: p.player_id })}>{p.name}</Button>)}</div>}
      {subjects.length === 1 && <div className="sls-crumbs">
        <Segmented<View> size="sm" label="Table values" value={view} onChange={value => set({ view: value === "shift" ? null : value })}
          options={VIEWS.map(v => ({ value: v.value, label: v.value === "shift" ? "Difference" : `Stats ${v.value === "with" ? "w/" : "w/o"} ${shortName(subjects[0].name ?? "")}` }))} />
        <span>Click a name to view their table. Click a column header to focus that stat.</span>
      </div>}
      {subjects.length === 0 && <div className="sls-empty"><p>Select one or two players to analyze their combined statistics</p></div>}
      {subjects.length === 1 && <ShiftTable data={data} subject={subjects[0]} stats={stats} view={view} sort={sort} names={names}
        onSort={key => set({ sort: key })} onSubject={id => set({ players: id, sort: null })} />}
      {subjects.length === 2 && (secondary.loading ? <FeedSkeleton label="Loading the second player" /> : <div className="sls-cards">
        {[[subjects[0], subjects[1], secondary.data], [subjects[1], subjects[0], primary.data]].map(([focal, other, response]) => {
          const result = cross(focal as RosterPlayer, response as StatShiftRosterResponse | null);
          return result ? <PairCard key={(focal as RosterPlayer).player_id} result={result} focal={focal as RosterPlayer} other={other as RosterPlayer} season={season} stats={stats} /> : null;
        })}
      </div>)}
      {data.coverage_status === "partial" && <p className="sls-coverage">{data.observed_games} of {data.expected_games} games reconstructed; games without accepted stints are left out, not counted as zero.</p>}
      <RosterTray roster={data.roster} team={team!} season={season} selected={players} open={trayOpen} onOpen={setTrayOpen} onToggle={toggle} onTeam={() => setPicker(true)} />
    </>}
  </div>;
}
