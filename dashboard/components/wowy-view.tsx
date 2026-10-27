"use client";

import { useMemo, useState, type ReactNode } from "react";
import branding from "@/lib/team-branding.json";
import { formatDate } from "@/lib/format-date";
import {
  CLOCK_OPTIONS, FILTER_KEYS, MAX_COMBO, TAB_COLUMNS, activeFilters, assignRole, fmt, getWowyCombos, readState, requestParams, roleOf, shortName, signed, tone,
  type ComboCell, type Role, type Tier, type TierMetric, type VsState, type WowyCombosResponse, type WowyColumn, type WowyState, type WowyTab,
} from "@/lib/wowy";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { AccordionItem } from "./ui/accordion";
import { TeamGrid, teamDisplayName } from "./team-grid";
import { TeamLogo } from "./team-logo";
import { DataDetailsButton } from "./ui/data-details";
import { DatePicker } from "./ui/date-picker";
import { FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Icon } from "./ui/icon";
import { PlayerAvatar } from "./ui/identity";
import { SearchField } from "./ui/input";
import { Modal } from "./ui/modal";
import { PageHeader } from "./ui/panel";
import { Switch } from "./ui/switch";
import { Tooltip } from "./ui/tooltip";
import { Button, IconButton, RemovableChip, Segmented, Select } from "./ui/kit";

const BLURB = "A team's on/off combinations by date, game clock, opponent and matchup";
const TEAM_CATALOG = branding.teams;
const PHASES: Record<string, string> = { regular_season: "Reg Season", playoffs: "Playoffs" };
const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "combo", label: "Compare", hint: "Each player splits the table into lineups with and without them" },
  { value: "on", label: "Always on", hint: "Every lineup has them on the floor" },
  { value: "off", label: "Always off", hint: "Every lineup has them on the bench" },
];
const TABS: { value: WowyTab; label: string }[] = [{ value: "overview", label: "Overview" }, { value: "offense", label: "Offense" }, { value: "defense", label: "Defense" }, { value: "expanded", label: "Expanded" }];
const SHOWN_PLAYERS = 12;
const MINUTE_STEPS = Array.from({ length: 13 }, (_, i) => 12 - i);

const tricodeOf = (team: string) => TEAM_CATALOG.find(entry => entry.team_id === team || entry.tricode === team)?.tricode ?? team;
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The left rail's players: add a player to compare them, then choose how they shape the table. */
function PlayersPanel({ data, state, season, onRole }: { data: WowyCombosResponse; state: WowyState; season: string; onRole: (id: string, role: Role) => void }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const matches = data.roster.filter(p => (p.name ?? p.player_id).toLowerCase().includes(query.trim().toLowerCase()));
  const shown = query || all ? matches : matches.slice(0, SHOWN_PLAYERS);
  const era = { season, team: data.team_id };
  const name = (id: string) => data.names[id] ?? data.roster.find(p => p.player_id === id)?.name ?? id;
  const held = { combo: state.combo, on: state.on, off: state.off };
  const rows = state.combo.length ? 2 ** state.combo.length : 0;
  const full = state.combo.length >= MAX_COMBO;
  // Pressing a player's current role again clears it (assignRole's toggle).
  const remove = (id: string) => { const role = roleOf(state, id); if (role) onRole(id, role); };
  return <section className="wowy-panel wowy-players" aria-label="Players">
    <header className="wowy-panel-head"><h2>Players</h2></header>
    <div className="wowy-setup" role="group" aria-label="Your lineups">
      {ROLES.map(group => <div key={group.value} className="wowy-setup-group" data-role={group.value}>
        <div className="wowy-setup-head">
          <span className="wowy-setup-title">{group.label}{group.value === "combo" && <span className="wowy-count"> {state.combo.length}/{MAX_COMBO}</span>}</span>
          <span className="wowy-hint">{group.hint}</span>
        </div>
        {held[group.value].length > 0
          ? <div className="wowy-chips">{held[group.value].map(id => <RemovableChip key={id} size="sm" onRemove={() => remove(id)} removeLabel={`Remove ${name(id)}`}>{name(id)}</RemovableChip>)}</div>
          : <p className="wowy-setup-empty">{group.value === "combo" ? "Add a player below to start." : `Add a player, then choose ${group.label}.`}</p>}
      </div>)}
      {rows > 0 && <p className="wowy-setup-result"><Icon name="users" size={14} />{state.combo.length} {state.combo.length === 1 ? "player" : "players"} compared: {rows} lineup rows</p>}
    </div>
    <SearchField inputSize="sm" aria-label="Search players" placeholder="Search players" value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")} />
    <ul className="wowy-roster">
      {shown.map(player => {
        const role = roleOf(state, player.player_id);
        const label = player.name ?? player.player_id;
        return <li key={player.player_id} className="wowy-roster-row" data-role={role ?? undefined}>
          <PlayerAvatar playerId={player.player_id} name={label} team={data.team_id} era={era} size="md" className="wowy-roster-photo" />
          <span className="wowy-roster-text">
            <span className="wowy-roster-name">{label}</span>
            {!role && <span className="wowy-roster-meta">{Math.round(player.minutes).toLocaleString("en-US")} min · {player.games} games</span>}
          </span>
          <span className="wowy-roster-action">{role
            ? <IconButton size="sm" variant="ghost" icon="close" label={`Remove ${label}`} onClick={() => remove(player.player_id)} />
            : <Button size="sm" icon="plus" disabled={full} title={full ? `Up to ${MAX_COMBO} compared players` : undefined} aria-label={`Add ${label}`} onClick={() => onRole(player.player_id, "combo")}>Add</Button>}</span>
          {/* Under the name and the remove button, so all three options fit at full spacing. */}
          {role && <span className="wowy-roster-picker">
            <Segmented<Role> size="xs" label={`${label} role`} value={role} onChange={next => onRole(player.player_id, next)}
              options={ROLES.map(r => ({ value: r.value, label: r.label, disabled: r.value === "combo" && full && role !== "combo" }))} />
          </span>}
        </li>;
      })}
    </ul>
    {!query && matches.length > SHOWN_PLAYERS && <Button size="xs" variant="text" onClick={() => setAll(!all)}>{all ? "Fewer" : `All ${matches.length} Players`}</Button>}
  </section>;
}

function FilterGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <fieldset className="wowy-filter"><legend>{title}</legend>{hint && <p className="wowy-hint">{hint}</p>}{children}</fieldset>;
}

type OpponentMode = "all" | "tier" | "pick";

function FiltersPanel({ data, state, season, set, vsRoster }: {
  data: WowyCombosResponse; state: WowyState; season: string; set: (updates: Record<string, string | null>) => void;
  vsRoster: WowyCombosResponse["roster"] | null;
}) {
  const derived: OpponentMode = state.tierMetric ? "tier" : state.opponents.length ? "pick" : "all";
  const [mode, setMode] = useState<OpponentMode>(derived);
  const [synced, setSynced] = useState(derived);
  if (derived !== synced) { setSynced(derived); if (derived !== "all") setMode(derived); }
  const count = activeFilters(state);
  const others = TEAM_CATALOG.filter(t => t.tricode !== data.team_id && t.team_id !== data.team_id && tricodeOf(t.team_id) !== tricodeOf(data.team_id ?? ""));
  const togglePeriod = (p: number) => {
    const next = state.periods.includes(p) ? state.periods.filter(x => x !== p) : [...state.periods, p].sort();
    set({ periods: next.join(",") || null });
  };
  const toggleOpponent = (team: string) => {
    const next = state.opponents.includes(team) ? state.opponents.filter(t => t !== team) : [...state.opponents, team];
    set({ opp: next.join(",") || null, tierMetric: null, tier: null });
  };
  return <section className="wowy-panel wowy-filters" aria-label="Filters">
    <header className="wowy-panel-head">
      <h2><Icon name="sliders" size={16} />Filters{count > 0 && <span className="wowy-badge">{count}</span>}</h2>
      {count > 0 && <Button size="xs" variant="text" onClick={() => { set(Object.fromEntries(FILTER_KEYS.map(key => [key, null]))); setMode("all"); }}>Reset</Button>}
    </header>
    <FilterGroup title="Dates" hint="Inside the chosen season">
      <div className="wowy-dates">
        <DatePicker label="From" placeholder="From" value={state.from ?? ""} min={data.first_game ?? undefined} max={state.to ?? data.last_game ?? undefined} onChange={value => set({ from: value || null })} />
        <span>to</span>
        <DatePicker label="To" placeholder="To" value={state.to ?? ""} min={state.from ?? data.first_game ?? undefined} max={data.last_game ?? undefined} onChange={value => set({ to: value || null })} />
      </div>
    </FilterGroup>
    <FilterGroup title="Game Clock">
      <div className="wowy-chips" role="group" aria-label="Game clock">
        {CLOCK_OPTIONS.map(option => <Button key={option.value} size="xs" variant="ghost" dense pressed={state.clock === option.value}
          onClick={() => set({ clock: option.value === "full" ? null : option.value })}>{option.label}</Button>)}
      </div>
      {state.clock === "custom" && <div className="wowy-custom-clock">
        <div className="wowy-chips" role="group" aria-label="Periods">
          {[1, 2, 3, 4, 5].map(p => <Button key={p} size="xs" variant="ghost" dense pressed={state.periods.includes(p)} onClick={() => togglePeriod(p)}>{p === 5 ? "OT" : `Q${p}`}</Button>)}
        </div>
        <div className="wowy-minutes">
          <Select size="sm" aria-label="From minutes remaining" value={String(state.clockFrom)} onChange={e => set({ cfrom: e.target.value === "12" ? null : e.target.value })}>
            {MINUTE_STEPS.filter(m => m > state.clockTo).map(m => <option key={m} value={m}>{m}:00</option>)}
          </Select>
          <span>to</span>
          <Select size="sm" aria-label="To minutes remaining" value={String(state.clockTo)} onChange={e => set({ cto: e.target.value === "0" ? null : e.target.value })}>
            {MINUTE_STEPS.filter(m => m < state.clockFrom).map(m => <option key={m} value={m}>{m}:00</option>)}
          </Select>
          <span>left</span>
        </div>
      </div>}
    </FilterGroup>
    <FilterGroup title="Possessions">
      <Switch label="Exclude garbage time" checked={state.garbage} onChange={on => set({ garbage: on ? "1" : null })} />
      <Switch label="Common games only" checked={state.common} onChange={on => set({ common: on ? "1" : null })} />
    </FilterGroup>
    <FilterGroup title="Opponents">
      <Segmented<OpponentMode> size="sm" label="Opponents" value={mode} options={[{ value: "all", label: "All Teams" }, { value: "tier", label: "By Tier" }, { value: "pick", label: "Pick Teams" }]}
        onChange={next => { setMode(next); set(next === "tier" ? { opp: null, tierMetric: "defense", tier: "top" } : { opp: null, tierMetric: null, tier: null }); }} />
      {mode === "tier" && <>
        <Segmented<TierMetric> size="sm" label="Rank opponents by" value={state.tierMetric ?? "defense"} options={[{ value: "offense", label: "Offense" }, { value: "defense", label: "Defense" }, { value: "net", label: "Net" }]}
          onChange={next => set({ tierMetric: next, tier: state.tier ?? "top" })} />
        <Segmented<Tier> size="sm" label="Tier" value={state.tier ?? "top"} options={[{ value: "top", label: "Top 10" }, { value: "mid", label: "Mid 10" }, { value: "bottom", label: "Bottom 10" }]}
          onChange={next => set({ tier: next, tierMetric: state.tierMetric ?? "defense" })} />
        <ul className="wowy-tier" aria-label="Opponents in this tier">
          {data.opponents.map(team => <li key={team.team_id} title={`${teamDisplayName(team.team_id) ?? team.tricode}: #${team.rank} (${fmt(team.value)})`}>
            <TeamLogo team={team.team_id} season={season} size={20} /><span>{team.rank}</span></li>)}
        </ul>
      </>}
      {mode === "pick" && <div className="wowy-team-picks" role="group" aria-label="Pick opponents">
        {others.map(team => <button key={team.team_id} type="button" className="wowy-team-pick" aria-pressed={state.opponents.includes(team.tricode)} onClick={() => toggleOpponent(team.tricode)}>
          <TeamLogo team={team.team_id} season={season} size={24} /><span>{team.tricode}</span>
        </button>)}
      </div>}
    </FilterGroup>
    <FilterGroup title="Player vs Player" hint="Rows only where this opponent was on the floor, off it, or split by both">
      <Select size="sm" aria-label="Opponent team" value={state.vsTeam ?? ""} onChange={e => set({ vsTeam: e.target.value || null, vs: null })}>
        <option value="">Opponent team…</option>
        {others.map(team => <option key={team.team_id} value={team.tricode}>{team.artwork_name}</option>)}
      </Select>
      {state.vsTeam && <Select size="sm" aria-label="Opponent player" value={state.vs ?? ""} onChange={e => set({ vs: e.target.value || null })}>
        <option value="">{vsRoster ? "Opponent player…" : "Loading players…"}</option>
        {(vsRoster ?? []).map(p => <option key={p.player_id} value={p.player_id}>{p.name ?? p.player_id}</option>)}
      </Select>}
      {state.vs && <Segmented<VsState> size="sm" label="Opponent on the floor" value={state.vsState}
        options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }, { value: "split", label: "On / Off Split", disabled: state.combo.length >= MAX_COMBO }]}
        onChange={next => set({ vsState: next === "on" ? null : next })} />}
    </FilterGroup>
  </section>;
}

/** A column of Databallr's lineup table: a rating read against the league with a 3P% line, or a rate. */
interface LineupColumn { key: string; label: string; title: string; column: WowyColumn; sub?: WowyColumn }

function tabColumns(tab: WowyTab): LineupColumn[] {
  const find = (key: string) => [...TAB_COLUMNS.overview, ...TAB_COLUMNS.offense, ...TAB_COLUMNS.defense].find(c => c.key === key)!;
  const off: LineupColumn = { key: "off", label: "Off", title: "Points scored per 100 possessions, its change against the league average, and 3P%", column: find("ortg"), sub: find("fg3_pct") };
  const def: LineupColumn = { key: "def", label: "Def", title: "Points allowed per 100 possessions, its change against the league average, and opponent 3P%", column: find("drtg"), sub: find("opp_fg3_pct") };
  if (tab === "overview") return [off, def];
  const factors = (set: WowyColumn[]) => set.filter(c => !c.delta && !c.key.endsWith("3a_rate")).map(c => ({ key: c.key, label: c.label, title: c.title, column: c }));
  if (tab === "expanded") return [off, def, ...factors(TAB_COLUMNS.expanded)];
  const lead = tab === "offense" ? off : def;
  return [lead, ...factors(TAB_COLUMNS[tab])];
}

/** A lineup photo: lit when on the floor, dimmed with Databallr's OFF label when not. */
function Face({ id, name, on, team, era, opponent }: { id: string; name: string; on: boolean; team: string | null; era: { season: string; team: string } | null; opponent: boolean }) {
  return <span className="wowy-face" data-off={on ? undefined : true} data-opponent={opponent || undefined}>
    <span className="wowy-face-photo">
      <PlayerAvatar playerId={id} name={name} team={team} era={era} size="lg" />
      {!on && <span className="wowy-face-off" aria-hidden="true">Off</span>}
    </span>
    <span className="wowy-face-name" title={name}>{shortName(name)}<span className="sr-only"> {on ? "on" : "off"}{opponent ? " (opponent)" : ""}</span></span>
  </span>;
}

function Rating({ cell, column, league }: { cell: ComboCell; column: LineupColumn; league: number | null }) {
  const value = column.column.value(cell);
  const change = column.column.delta && value != null && league != null ? value - league : null;
  return <span className="wowy-value">
    <strong>{fmt(value)}</strong>
    {column.column.delta && <small data-tone={tone(change, column.column.better)}>{signed(change)}</small>}
    {column.sub && <small className="wowy-value-sub">{fmt(column.sub.value(cell))}%</small>}
  </span>;
}

/** Databallr's WOWY Combos card: one row per on/off mix with the players' photos, then ON − OFF. */
function LineupTable({ data, state, season, summary }: { data: WowyCombosResponse; state: WowyState; season: string; summary: string }) {
  const [open, setOpen] = useState<ComboCell | null>(null);
  const team = data.team_id ?? "";
  // From the answer's own request, so a combination still loading never relabels the old one.
  const asked = data.request;
  const split = asked.vs_player && asked.vs_state === "split" ? asked.vs_player : null;
  const dims = [...asked.combo, ...(split ? [split] : [])];
  const columns = tabColumns(state.tab);
  const name = (id: string) => data.names[id] ?? id;
  const league = data.league_rating;
  const subs = columns.some(c => c.sub);
  const only = asked.combo.length === 1 && !split ? data.cells : null;
  const on = only?.find(c => c.present.length === 1), off = only?.find(c => c.present.length === 0);
  const diff = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null ? a - b : null;
  const shift = data.shifts[0];
  return <section className="wowy-card" aria-label="WOWY combos" data-wide={state.tab === "overview" ? undefined : true}>
    <header className="wowy-card-head">
      <span className="wowy-card-brand">CourtLens</span>
      <span className="wowy-card-scope">WOWY Combos • {season} • {phaseName(data)}<small>{summary}{data.provisional ? " · Provisional" : ""}</small></span>
    </header>
    <div className="wowy-card-scroll" role="region" aria-label="On/off combinations" tabIndex={0}>
      <table className="wowy-table">
        <thead><tr>
          <th scope="col" className="wowy-lead"><span className="wowy-lead-label"><TeamLogo team={team} season={season} size={20} />Lineup</span></th>
          <th scope="col" title="Minutes">Min</th>
          {columns.map(c => <th key={c.key} scope="col" title={c.title}>{c.label}</th>)}
          <th scope="col" title="Net rating: offense minus defense, per 100 possessions">Net</th>
        </tr></thead>
        <tbody>
          {data.cells.map(cell => {
            // Each player keeps their column in every row (follow-up 10).
            const order = dims;
            const small = cell.sample_status !== "available";
            return <tr key={cell.key} data-small={small || undefined}>
                <th scope="row" className="wowy-lead">
                  <Tooltip content="Click for lineup composition" className="wowy-lineup-tip">
                    <button type="button" className="wowy-lineup" aria-haspopup="dialog" onClick={() => setOpen(cell)}>
                      {order.map(id => <Face key={id} id={id} name={name(id)} on={cell.present.includes(id)} opponent={id === split}
                        team={id === split ? asked.vs_team : team} era={id === split ? null : { season, team }} />)}
                    </button>
                  </Tooltip>
                </th>
                <td><span className="wowy-value"><strong>{Math.round(cell.minutes).toLocaleString("en-US")}</strong>{subs && <small className="wowy-value-sub">3P%:</small>}</span></td>
                {columns.map(c => <td key={c.key}><Rating cell={cell} column={c} league={league} /></td>)}
                <td><span className="wowy-net" data-tone={tone(cell.net_rating, "up")} title={interval(cell.net_interval)}>{signed(cell.net_rating)}</span></td>
              </tr>;
          })}
          {on && off && <tr className="wowy-onoff" data-small={shift?.net_difference == null || undefined}>
            <th scope="row" className="wowy-lead">On − Off</th>
            <td />
            {columns.map(c => {
              const change = diff(c.column.value(on), c.column.value(off));
              return <td key={c.key}><span className="wowy-value"><strong data-tone={tone(change, c.column.better)}>{c.column.percent ? fmt(change) : signed(change)}</strong></span></td>;
            })}
            <td><span className="wowy-net" data-tone={tone(diff(on.net_rating, off.net_rating), "up")} title={shift ? interval(shift.interval) : undefined}>{signed(diff(on.net_rating, off.net_rating))}</span></td>
          </tr>}
        </tbody>
      </table>
    </div>
    <Modal isOpen={open != null} onClose={() => setOpen(null)} title="Lineup Composition" className="wowy-composition-modal">
      {open && <Composition data={data} cell={open} order={dims} split={split} season={season} />}
    </Modal>
  </section>;
}

const phaseName = (data: WowyCombosResponse) => String(data.context.phase) === "playoffs" ? "Playoffs" : "Regular Season";
const interval = (i: { lower: number | null; upper: number | null; reason: string | null }) =>
  i.lower != null && i.upper != null ? `95% interval ${signed(i.lower)} to ${signed(i.upper)}`
    : `interval unavailable${i.reason ? ` (${i.reason.charAt(0).toLowerCase()}${i.reason.slice(1)})` : ""}`;

/** One figure of the composition dialog: label, value and its change against the league. */
function Stat({ label, title, value, change, better, plain }: {
  label: string; title?: string; value: number | null | undefined; change?: number | null; better?: "up" | "down"; plain?: string;
}) {
  return <div className="wowy-stat" title={title}>
    <span className="wowy-stat-label">{label}</span>
    <strong data-tone={plain === undefined && better === undefined ? tone(value ?? null, "up") : undefined}>{plain ?? (better === undefined ? signed(value) : fmt(value))}</strong>
    {change !== undefined && <small data-tone={tone(change ?? null, better ?? null)}>{signed(change)}</small>}
  </div>;
}

/** Databallr's lineup composition: the mix, its ratings and rates against the league, and teammate help. */
function Composition({ data, cell, order, split, season }: { data: WowyCombosResponse; cell: ComboCell; order: string[]; split: string | null; season: string }) {
  const team = data.team_id ?? "";
  const name = (id: string) => data.names[id] ?? id;
  const league = data.league_factors ?? {};
  const rating = data.league_rating;
  const f = (key: string) => cell.factors[key] ?? null;
  const vs = (value: number | null, base: number | null | undefined) => value != null && base != null ? value - base : null;
  const oppOreb = f("dreb_pct") != null ? 100 - f("dreb_pct")! : null;
  const help = cell.teammate_help;
  const mates = (cell.teammates ?? []).filter(m => m.share >= 5).slice(0, 10);
  const era = { season, team };
  return <div className="wowy-composition">
    <header className="wowy-composition-head">
      <span className="wowy-card-brand">CourtLens</span>
      <span className="wowy-composition-title"><TeamLogo team={team} season={season} size={24} />Lineups</span>
      <span className="wowy-composition-season">{season}</span>
    </header>
    <div className="wowy-composition-faces">
      {order.map(id => <Face key={id} id={id} name={name(id)} on={cell.present.includes(id)} opponent={id === split}
        team={id === split ? data.request.vs_team : team} era={id === split ? null : era} />)}
      <span className="wowy-face wowy-help-face" title="Minutes-weighted average DARKO of the other teammates on the floor">
        <span className="wowy-help-disc" data-tone={tone(help?.net ?? null, "up")}>{help ? signed(help.net) : "—"}</span>
        <span className="wowy-face-name">Team Help</span>
      </span>
    </div>
    <div className="wowy-stat-row">
      <Stat label="Min" value={null} plain={Math.round(cell.minutes).toLocaleString("en-US")} />
      <Stat label="Net" title={interval(cell.net_interval)} value={cell.net_rating} />
      <Stat label="Off" value={cell.offensive_rating} change={vs(cell.offensive_rating, rating)} better="up" />
      <Stat label="Def" value={cell.defensive_rating} change={vs(cell.defensive_rating, rating)} better="down" />
      <Stat label="O-3P%" value={f("fg3_pct")} change={vs(f("fg3_pct"), league.fg3_pct)} better="up" />
      <Stat label="D-3P%" value={f("opp_fg3_pct")} change={vs(f("opp_fg3_pct"), league.fg3_pct)} better="down" />
    </div>
    <div className="wowy-composition-ends">
      <section aria-label="Offensive">
        <h3>Offensive</h3>
        <div className="wowy-stat-row">
          <Stat label="TS%" title="True shooting: points per two shooting possessions (FGA + 0.44 FTA)" value={f("ts_pct")} change={vs(f("ts_pct"), league.ts_pct)} better="up" />
          <Stat label="TOV%" title="Player turnovers per 100 possessions" value={f("tov_100")} change={vs(f("tov_100"), league.tov_100)} better="down" />
          <Stat label="ORB%" title="Share of available offensive rebounds" value={f("oreb_pct")} change={vs(f("oreb_pct"), league.oreb_pct)} better="up" />
        </div>
      </section>
      <section aria-label="Defensive">
        <h3>Defensive</h3>
        <div className="wowy-stat-row">
          <Stat label="D-TS%" title="Opponent true shooting" value={f("opp_ts_pct")} change={vs(f("opp_ts_pct"), league.ts_pct)} better="down" />
          <Stat label="D-TOV%" title="Opponent player turnovers per 100 possessions" value={f("opp_tov_100")} change={vs(f("opp_tov_100"), league.tov_100)} better="up" />
          <Stat label="D-ORB%" title="Opponent share of their available offensive rebounds" value={oppOreb} change={vs(oppOreb, league.oreb_pct)} better="down" />
        </div>
      </section>
    </div>
    <section className="wowy-help" aria-label="Teammate help">
      <h3>Teammate Help{help ? ` (${help.players})` : ""}</h3>
      <p className="wowy-hint">Weighted average DARKO of the other teammates on the floor</p>
      {help ? <p className="wowy-help-sum">
        <strong data-tone={tone(help.net, "up")}>{signed(help.net)}</strong> Net = <strong data-tone={tone(help.offense, "up")}>{signed(help.offense)}</strong> Off + <strong data-tone={tone(help.defense, "up")}>{signed(help.defense)}</strong> Def
      </p> : <p className="wowy-hint">DARKO isn&apos;t loaded for {season}.</p>}
    </section>
    {mates.length > 0 && <section className="wowy-mates" aria-label="Shared floor">
      <h3>Shared Floor with Lineup % · DARKO</h3>
      <ul>
        {mates.map(m => <li key={m.player_id} className="wowy-mate">
          <span className="wowy-mate-share">{Math.round(m.share)}%</span>
          <PlayerAvatar playerId={m.player_id} name={name(m.player_id)} team={team} era={era} size="md" className="wowy-mate-photo" />
          <span className="wowy-mate-name">{name(m.player_id)}</span>
          <span className="wowy-mate-dpm" data-tone={tone(m.dpm, "up")}>{signed(m.dpm)}</span>
        </li>)}
      </ul>
    </section>}
    <p className="wowy-composition-foot">
      {cell.games} games · {cell.stints} stints · {Math.round(cell.offensive_possessions)} offensive / {Math.round(cell.defensive_possessions)} defensive possessions · Net {interval(cell.net_interval)}
      {cell.sample_status !== "available" ? " · Under the sample gates (100 possessions each way, 5 games)" : ""}
      {help ? ` · DARKO as of ${data.darko_as_of ? formatDate(data.darko_as_of) : "the phase's end"}${help.coverage < 99.5 ? `, ${Math.round(help.coverage)}% of teammate minutes rated` : ""}` : ""}
    </p>
  </div>;
}

/** Plain-language parts of what holds for every row, for the card header. */
function heldParts(data: WowyCombosResponse, state: WowyState): string[] {
  const name = (id: string) => data.names[id] ?? id;
  return [
    ...state.on.map(id => `${name(id)} on`), ...state.off.map(id => `${name(id)} off`),
    state.vs && state.vsState !== "split" ? `${name(state.vs)} (${state.vsTeam}) ${state.vsState}` : null,
    state.vsTeam && !state.vs ? `vs ${state.vsTeam}` : null,
    state.clock !== "full" ? (state.clock === "custom"
      ? `${state.periods.length ? state.periods.map(p => p === 5 ? "OT" : `Q${p}`).join(", ") : "any period"}, ${state.clockFrom}:00 to ${state.clockTo}:00 left`
      : CLOCK_OPTIONS.find(o => o.value === state.clock)?.label) : null,
    state.from || state.to ? `${state.from ? formatDate(state.from) : "start"} to ${state.to ? formatDate(state.to) : "end"}` : null,
    state.garbage ? "No garbage time" : null, state.common ? "Common games" : null,
    state.tierMetric ? `vs ${state.tier} 10 ${state.tierMetric === "net" ? "net" : state.tierMetric}s` : null,
    state.opponents.length ? `vs ${state.opponents.join(", ")}` : null,
  ].filter((part): part is string => Boolean(part));
}

export function WowyView() {
  const { get, set } = useUrlState();
  const state = readState(get);
  const params = requestParams(state);
  // Databallr opens on the team picker; closing it leaves the page unfilled.
  const [picker, setPicker] = useState(() => !get("team"));
  const feed = useFeed([params.toString()], signal => getWowyCombos(params, signal));
  // Keep the last answer on screen while a new combination loads.
  const [shown, setShown] = useState<WowyCombosResponse | null>(null);
  if (feed.data && feed.data !== shown) setShown(feed.data);
  const data = feed.data ?? shown;
  const vsParams = useMemo(() => new URLSearchParams(state.vsTeam ? { team_id: state.vsTeam, ...(state.season ? { season: state.season } : {}), phase: state.phase } : {}), [state.vsTeam, state.season, state.phase]);
  const vsFeed = useFeed([state.vsTeam ? vsParams.toString() : null], signal => state.vsTeam ? getWowyCombos(vsParams, signal) : Promise.resolve(null));
  const season = String(data?.context.season ?? state.season ?? "");
  const seasons = [...new Set((data?.available_scopes ?? []).map(s => s.season))];
  const phases = (data?.available_scopes ?? []).filter(s => s.season === season).map(s => s.phase);
  const covered = Boolean(state.team) && data?.coverage_status !== "source_blocked";
  const team = state.team;
  const resetPlayers = { combo: null, on: null, off: null, vs: null };
  const rows = data?.cells ?? [];
  return <div className="wowy-page" role="region" aria-label="WOWY">
    <PageHeader className="pvp-header" icon="users" title="WOWY" subtitle={BLURB} />
    <div className="wowy-console"><FilterBar label="WOWY controls" summary={[team ?? "No Team", season, PHASES[state.phase] ?? state.phase].join(" · ")}
      scope={<>
        <Button size="md" aria-label={team ? `Team, ${teamDisplayName(team) ?? team}` : "Select Team"} onClick={() => setPicker(true)}>{team ? <><TeamLogo team={team} season={season} size={20} />{team}</> : "Team"}</Button>
        <Select size="md" aria-label="Season" value={season} onChange={event => set({ season: event.target.value, ...resetPlayers, from: null, to: null })}>
          {(seasons.length ? seasons : [season]).map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select size="md" aria-label="Season phase" value={state.phase} onChange={event => set({ phase: event.target.value === "regular_season" ? null : event.target.value, ...resetPlayers, from: null, to: null })}>
          {(phases.length ? phases : [state.phase]).map(p => <option key={p} value={p}>{PHASES[p] ?? p}</option>)}
        </Select>
      </>}
      details={data && covered ? <DataDetailsButton rows={[
        { label: "Coverage", value: `${data.observed_games} of ${data.expected_games} games reconstructed (${data.coverage_status})` },
        { label: "Excluded stints", value: data.excluded_stints },
        { label: "Sample gates", value: "100 possessions each way and 5 games per row; rows under them are muted" },
        { label: "Stint dataset", value: String(data.context.stint_dataset_id ?? "None"), mono: true },
        { label: "Evidence hash", value: data.evidence_hash || "—", mono: true },
        { label: "Operation version", value: data.operation_version, mono: true },
      ]}>
        <ul className="wowy-method">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        {rows.length > 0 && <Button size="md" onClick={() => download(comboCsv(data), `courtlens-wowy-${(team ?? "team").toLowerCase()}-${season}.csv`, "text/csv")}>Export CSV</Button>}
        {rows.length > 0 && <Button size="md" onClick={() => download(JSON.stringify(data, null, 2), "wowy-evidence.json", "application/json")}>Save Evidence JSON</Button>}
      </DataDetailsButton> : undefined} /></div>
    <Modal isOpen={picker} onClose={() => setPicker(false)} title="Select Team" description="30 NBA teams" className="wowy-team-modal">
      <TeamGrid variant="compact" selected={team ? TEAM_CATALOG.find(entry => entry.tricode === team)?.team_id : null} season={season}
        onSelect={next => { const code = tricodeOf(next); set({ team: code === team ? null : code, ...resetPlayers, opp: null, vsTeam: null }); setPicker(false); }} />
      {team && <Button size="md" stretch className="wowy-team-clear" onClick={() => { set({ team: null, ...resetPlayers }); setPicker(false); }}>Clear Team</Button>}
    </Modal>
    {feed.error && <FeedFailure error={feed.error} retry={feed.retry} what="WOWY" />}
    {!data && feed.loading && <FeedSkeleton label="Loading WOWY" />}
    {data && !team && <div className="wowy-empty"><p>Select a team to begin</p><Button size="md" variant="primary" onClick={() => setPicker(true)}>Select Team</Button></div>}
    {data && team && !covered && <GatedNote why="WOWY reads accepted play-by-play stints, which cover the seasons listed in the season menu.">No stints for {team} in {season} {PHASES[state.phase] ?? state.phase}.</GatedNote>}
    {data && covered && <div className="wowy-layout" aria-busy={feed.loading || undefined}>
      {/* Players left, the table in the middle, filters right (follow-up 11). */}
      <aside className="wowy-rail wowy-rail-players">
        <PlayersPanel data={data} state={state} season={season} onRole={(id, role) => set(assignRole(state, id, role))} />
      </aside>
      <section className="wowy-main" aria-label="Combinations">
        <div className="wowy-toolbar">
          <Segmented<WowyTab> size="sm" label="Table view" value={state.tab} options={TABS} onChange={next => set({ tab: next === "overview" ? null : next })} />
          {data.total && <span className="wowy-games">{data.total.games} games · {Math.round(data.total.minutes).toLocaleString("en-US")} min</span>}
        </div>
        {rows.length > 0 ? <LineupTable data={data} state={state} season={season} summary={heldParts(data, state).join(" · ") || "All Games"} />
          : <div className="wowy-empty"><Icon name="users" size={20} /><p>Add up to five players to compare every lineup with and without them</p></div>}
        {rows.length > 0 && <>
          <p className="wowy-legend">Click a lineup cell for detailed information about that lineup combination</p>
          <div className="wowy-about">
            <AccordionItem title="Data sources">
              <p>Accepted play-by-play stints for {season} {phaseName(data)}: {data.observed_games} of {data.expected_games} games.{data.provisional ? " The season is under way: these are provisional, rebuilt daily from the latest games." : ""} Changes under Off and Def are against the {season} league average{data.league_rating != null ? ` (${fmt(data.league_rating)})` : ""}; faded rows are under the sample gates (100 possessions each way, 5 games).{data.darko_as_of ? ` Teammate help uses DARKO Daily Plus-Minus by Kostya Medvedovsky (darko.app), as of ${formatDate(data.darko_as_of)}.` : ""}</p>
            </AccordionItem>
            <AccordionItem title="What is NBA WOWY analysis?">
              <p>WOWY (with or without you) splits a team&apos;s minutes by which players were on the floor. Each compared player doubles the rows: every mix of them on and off, with how the team scored and allowed points in those minutes. Always on and Always off players hold for every row. It describes what happened in those minutes; teammates, opponents and luck all shape it, so it is not a player&apos;s causal impact.</p>
            </AccordionItem>
          </div>
        </>}
        {data.total == null && rows.length === 0 && state.combo.length > 0 && <p className="wowy-legend">No stints match these filters.</p>}
        {data.coverage_status === "partial" && <p className="wowy-legend">{data.observed_games} of {data.expected_games} games reconstructed; games without accepted stints are left out, not counted as zero.</p>}
      </section>
      <aside className="wowy-rail wowy-rail-filters">
        <FiltersPanel data={data} state={state} season={season} set={set} vsRoster={vsFeed.data?.roster ?? null} />
      </aside>
    </div>}
  </div>;
}

function comboCsv(data: WowyCombosResponse): string {
  const keys = [...new Set(Object.values(TAB_COLUMNS).flat().filter(c => c.percent).map(c => c.key))];
  const name = (id: string) => data.names[id] ?? id;
  const head = ["on", "off", "games", "stints", "minutes", "off_poss", "def_poss", "ortg", "drtg", "net", "net_lower", "net_upper", "sample", ...keys];
  const quote = (v: unknown) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "");
  const lines = [...data.cells, ...(data.total ? [data.total] : [])].map(c => [
    c.key === "all" ? "Team total" : c.present.map(name).join(" + "), c.absent.map(name).join(" + "), c.games, c.stints, c.minutes.toFixed(1),
    c.offensive_possessions.toFixed(1), c.defensive_possessions.toFixed(1), fmt(c.offensive_rating, 2), fmt(c.defensive_rating, 2), fmt(c.net_rating, 2),
    fmt(c.net_interval.lower, 2), fmt(c.net_interval.upper, 2), c.sample_status, ...keys.map(k => fmt(c.factors[k], 2)),
  ].map(quote).join(","));
  return [head.join(","), ...lines].join("\n");
}
