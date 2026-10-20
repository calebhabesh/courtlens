"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import branding from "@/lib/team-branding.json";
import { formatDate } from "@/lib/format-date";
import {
  FILTERS, OPTION_LABELS, getFreeAgency, isRosterStale, isStale, matchesFilter, matchesSearch, sortAgents,
  type CurrentStatus, type FreeAgencyFilter, type FreeAgencySort, type FreeAgent, type MovesIndex, type RosterIndex,
} from "@/lib/free-agency";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PageHeader } from "./ui/panel";
import { PlayerAvatar } from "./ui/identity";
import { Icon } from "./ui/icon";
import { SearchField } from "./ui/input";
import { Chip, Segmented, Select } from "./ui/kit";

const TEAMS = [...branding.teams].sort((a, b) => a.artwork_name.localeCompare(b.artwork_name));
type Klass = "all" | "ufa" | "rfa";
const CLASSES: { value: Klass; label: string }[] = [{ value: "all", label: "All" }, { value: "ufa", label: "UFA" }, { value: "rfa", label: "RFA" }];
const STATUS_LABEL: Record<CurrentStatus, string> = { unsigned: "Unsigned", signed: "Signed", returned: "Returned", abroad: "Abroad" };
const SORTS: { key: FreeAgencySort; label: string }[] = [{ key: "name", label: "Name" }, { key: "status", label: "Status" }, { key: "stats", label: "Stats" }, { key: "age", label: "Age" }];
const stat = (value: number | null) => value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
const observedLabel = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** A calendar date from the page (no time zone shift): "Oct 17". */
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function SortHeader({ sort, current, onSort, className }: { sort: FreeAgencySort; current: FreeAgencySort; onSort: (sort: FreeAgencySort) => void; className?: string }) {
  const label = SORTS.find(s => s.key === sort)!.label;
  return <th scope="col" className={className} aria-sort={current === sort ? (sort === "stats" || sort === "age" ? "descending" : "ascending") : undefined}>
    <button type="button" className="fa-sort" data-active={current === sort || undefined} onClick={() => onSort(sort)}>
      {current === sort && <Icon name="chevron-down" size={14} />}{label}
    </button>
  </th>;
}

/** Why the current status reads as it does: Wikipedia's latest move or the roster, flagged when it differs from NBA.com. */
function MoveNote({ player, roster, moves }: { player: FreeAgent; roster: RosterIndex | null; moves: MovesIndex | null }) {
  if (player.retired || player.status_source === "nba") return null;
  const move = player.latest_move;
  let label: string;
  let title: string;
  if (player.status_source === "roster" || !move) {
    label = player.current_team_tricode ? `On ${player.current_team_tricode} roster` : "Not on an NBA roster";
    title = roster ? `${roster.source}, ${observedLabel(roster.observed_at)}` : "Roster check";
  } else {
    const when = move.date ? ` · ${dayLabel(move.date)}` : "";
    label = move.kind === "waived" ? `Waived by ${move.team_tricode ?? "team"}${when}`
      : move.kind === "cut" ? `Cut by ${move.team_tricode ?? "team"} in camp`
      : move.kind === "abroad" ? `${move.club ?? "Club abroad"}${move.country ? ` (${move.country})` : ""}${when}`
      : move.kind === "two_way" ? `Two-way deal${when}`
      : `Signed${when}`;
    title = moves ? `${moves.source}, revision ${moves.revision_id}` : "Wikipedia";
  }
  const flagged = player.changed;
  return <span className={flagged ? "fa-roster-flag" : "fa-move-note"} title={flagged ? `${title}: NBA.com's tracker does not revisit later moves` : title}>
    {flagged && <Icon name="alert" size={14} />}{label}
  </span>;
}

function Movement({ player }: { player: FreeAgent }) {
  return <span className="fa-move">
    {player.old_team_id ? <TeamLogo team={player.old_team_id} size={20} /> : <span className="fa-move-none">—</span>}
    <Icon name="right" size={14} />
    {player.current_team_id
      ? <><TeamLogo team={player.current_team_id} size={20} /><strong>{player.current_team_tricode}</strong></>
      : <span className="fa-move-open">{player.current_status === "abroad" ? "Abroad" : "Open market"}</span>}
  </span>;
}

function Row({ player, roster, moves }: { player: FreeAgent; roster: RosterIndex | null; moves: MovesIndex | null }) {
  const tags = [player.position, player.class.toUpperCase(), player.two_way ? "Two-Way Free Agent" : player.option ? OPTION_LABELS[player.option] : null].filter(Boolean);
  return <tr>
    <th scope="row"><Link className="fa-player" href={`/players/${player.player_id}`}>
      <PlayerAvatar playerId={player.player_id} name={player.name} team={player.current_team_id ?? player.old_team_id} size="md" />
      <span><strong>{player.name}</strong><small>{tags.join(" · ")}</small></span>
    </Link></th>
    <td>{player.retired
      ? <span className="fa-status" data-status="retired" title="NBA.com's note on this player says he retired">Retired</span>
      : <span className="fa-status-cell">
        <span className="fa-status" data-status={player.current_status}>{STATUS_LABEL[player.current_status]}</span>
        {player.changed && <small>NBA.com: {STATUS_LABEL[player.status]}</small>}
      </span>}</td>
    <td><span className="fa-move-cell"><Movement player={player} /><MoveNote player={player} roster={roster} moves={moves} /></span></td>
    <td><span className="fa-stats">
      {([["PTS", player.points_per_game], ["REB", player.rebounds_per_game], ["AST", player.assists_per_game]] as const).map(([label, value]) =>
        <span key={label}><strong>{stat(value)}</strong><small>{label}</small></span>)}
    </span></td>
    <td><span className="fa-age"><strong>{player.age ?? "—"}</strong><small>{player.experience === null ? "" : `${player.experience} yr exp`}</small></span></td>
    <td className="fa-terms" title="Deal terms are not on the source">—</td>
    <td className="fa-source">{player.note && player.note_url
      ? <a href={player.note_url} target="_blank" rel="noreferrer">{player.note}<Icon name="external" size={14} /></a>
      : <span>{player.note ?? "NBA tracker"}</span>}</td>
  </tr>;
}

/** Free Agency (alignment row 14): NBA.com's 2026 tracker in Databallr's one large table. */
export function FreeAgencyView() {
  const { get, set } = useUrlState();
  const filter = (FILTERS.find(f => f.value === get("status"))?.value ?? "all") as FreeAgencyFilter;
  const klass = (CLASSES.find(c => c.value === get("class"))?.value ?? "all") as Klass;
  const team = get("team");
  const query = get("q") ?? "";
  const sort = (SORTS.find(s => s.key === get("sort"))?.key ?? "stats") as FreeAgencySort;
  const feed = useFeed([], signal => getFreeAgency(signal));
  const data = feed.data;
  const players = data?.status === "available" ? data.players : [];
  const scoped = players.filter(p => (klass === "all" || p.class === klass) && (!team || p.old_team_tricode === team || p.new_team_tricode === team) && matchesSearch(p, query));
  const rows = sortAgents(scoped.filter(p => matchesFilter(p, filter)), sort);
  // Retired players (per NBA.com's note) are not part of the market.
  const market = players.filter(p => !p.retired);
  const count = (status: CurrentStatus) => market.filter(p => p.current_status === status).length;
  // The page is as fresh as its newest status source: Wikipedia's moves, else NBA.com's tracker.
  const updated = data?.status === "available" ? data.moves?.observed_at ?? data.observed_at : null;
  const moved = market.length ? (count("signed") + count("returned")) / market.length : 0;
  return <div className="fa-page" role="region" aria-label="Free Agency">
    <header className="fa-header">
      <div>
        <p className="fa-eyebrow">{data?.status === "available" ? data.year : 2026} NBA Offseason</p>
        <PageHeader className="fa-title" title="Free Agency Tracker" subtitle="NBA.com's free-agent class, kept current with Wikipedia's dated moves and ESPN's rosters. Deal terms are not on the source and stay unknown." />
      </div>
      {data?.status === "available" && updated && <div className="fa-freshness">
        <span className="fa-fresh" data-stale={isStale(updated) || undefined}><Icon name={isStale(updated) ? "alert" : "circle-check"} size={14} />{isStale(updated) ? "Source stale" : "Source current"}</span>
        <span>Updated {observedLabel(updated)}</span>
        <a href={data.url} target="_blank" rel="noreferrer">NBA source<Icon name="external" size={14} /></a>
        {data.moves && <a href={data.moves.url} target="_blank" rel="noreferrer">Wikipedia<Icon name="external" size={14} /></a>}
        <DataDetailsButton rows={[
          { label: "NBA.com tracker observed", value: formatDate(data.observed_at) },
          { label: "Capture", value: data.capture === "operator_import" ? "Operator import (page saved in a browser)" : "Scheduled fetch" },
          { label: "Raw page SHA-256", value: data.raw_sha256, mono: true },
          { label: "Latest moves", value: data.moves ? `${data.moves.source}, revision ${data.moves.revision_id}, checked ${observedLabel(data.moves.observed_at)}` : "No Wikipedia moves sealed" },
          ...(data.moves?.ambiguous.length ? [{ label: "Names matching two Wikipedia entries", value: data.moves.ambiguous.join(", ") }] : []),
          { label: "Roster check", value: data.roster_index ? `${data.roster_index.source}, ${observedLabel(data.roster_index.observed_at)}` : "No roster source admitted" },
          ...(data.roster_index?.unmatched ? [{ label: "Unmatched roster players", value: data.roster_index.unmatched.length ? data.roster_index.unmatched.join(", ") : "None" }] : []),
          { label: "Bundle", value: data.manifest_sha256, mono: true },
          { label: "Version", value: data.version, mono: true },
        ]}><ul className="fa-method">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></DataDetailsButton>
      </div>}
    </header>
    {feed.error && <FeedFailure error={feed.error} retry={feed.retry} what="Free Agency" />}
    {feed.loading && <FeedSkeleton label="Loading free agency" />}
    {data?.status === "not_configured" && <GatedNote why={data.limitations[0]}>No free-agent tracker snapshot is installed yet. An operator imports NBA.com&apos;s tracker with <code>courtlens import-free-agency</code>.</GatedNote>}
    {data?.status === "available" && <>
      <section className="fa-summary" aria-label="Tracker summary">
        <dl>
          <div><dt>Tracked</dt><dd>{market.length}</dd></div>
          <div><dt>Unsigned</dt><dd>{count("unsigned")}</dd></div>
          <div><dt>Signed</dt><dd data-tone="accent">{count("signed")}</dd></div>
          <div><dt>Returned</dt><dd data-tone="accent">{count("returned")}</dd></div>
          <div><dt>Abroad</dt><dd>{count("abroad")}</dd></div>
          <div><dt title="Current status or team differs from NBA.com's tracker">Changed Since Tracker</dt><dd data-tone="flag">{market.filter(p => p.changed).length}</dd>
            {data.roster_index && <p className="fa-summary-note" data-stale={isRosterStale(data.roster_index.observed_at) || undefined}>
              {isRosterStale(data.roster_index.observed_at) && <Icon name="alert" size={14} />}Rosters as of {observedLabel(data.roster_index.observed_at)}</p>}
            {data.moves && <p className="fa-summary-note" data-stale={isRosterStale(data.moves.observed_at) || undefined}>
              {isRosterStale(data.moves.observed_at) && <Icon name="alert" size={14} />}Wikipedia as of {observedLabel(data.moves.observed_at)}</p>}</div>
        </dl>
        <div className="fa-market"><span>Market Moved</span><span className="fa-market-track" role="img" aria-label={`${Math.round(moved * 100)}% signed or returned`}>
          <span style={{ "--moved": `${(moved * 100).toFixed(2)}%` } as CSSProperties} /></span><strong>{Math.round(moved * 100)}%</strong></div>
      </section>
      <div className="fa-chips" role="group" aria-label="Status">
        {FILTERS.map(f => <Chip key={f.value} size="sm" pressed={filter === f.value} onClick={() => set({ status: f.value === "all" ? null : f.value })}>
          {f.label}<span className="fa-chip-count">{scoped.filter(p => matchesFilter(p, f.value)).length}</span>
        </Chip>)}
      </div>
      <div className="fa-filters">
        <SearchField value={query} onChange={event => set({ q: event.target.value || null })} onClear={() => set({ q: null })} placeholder="Search player, team, or source note"
          aria-label="Search player, team, or source note" wrapperClassName="fa-search" />
        <Select size="lg" aria-label="Team" value={team ?? ""} onChange={event => set({ team: event.target.value || null })}>
          <option value="">All Teams</option>
          {TEAMS.map(t => <option key={t.tricode} value={t.tricode}>{t.artwork_name}</option>)}
        </Select>
        <Segmented<Klass> size="lg" label="Free-agent class" value={klass} onChange={value => set({ class: value === "all" ? null : value })} options={CLASSES} />
      </div>
      <div className="fa-table-wrap" role="region" aria-label="Free agents" tabIndex={0}>
        <table className="fa-table">
          <colgroup><col className="fa-col-player" /><col className="fa-col-status" /><col className="fa-col-team" /><col className="fa-col-stats" /><col className="fa-col-age" /><col className="fa-col-terms" /><col className="fa-col-source" /></colgroup>
          <thead>
            <tr className="fa-groups"><th scope="colgroup">Player</th><th scope="colgroup" colSpan={2}>Movement</th><th scope="colgroup">2025-26</th><th scope="colgroup">Profile</th><th scope="colgroup" colSpan={2}>Deal</th></tr>
            <tr className="fa-columns">
              <SortHeader sort="name" current={sort} onSort={next => set({ sort: next })} className="fa-lead" />
              <SortHeader sort="status" current={sort} onSort={next => set({ sort: next })} />
              <th scope="col">Team</th>
              <SortHeader sort="stats" current={sort} onSort={next => set({ sort: next === "stats" ? null : next })} />
              <SortHeader sort="age" current={sort} onSort={next => set({ sort: next })} />
              <th scope="col">Terms</th><th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>{rows.map(player => <Row key={player.player_id} player={player} roster={data.roster_index} moves={data.moves} />)}</tbody>
        </table>
        {!rows.length && <p className="fa-empty">No free agents match these filters.</p>}
      </div>
      <p className="fa-provenance">Sources: NBA.com free-agent tracker (class, profile and stats), observed {formatDate(data.observed_at)}{data.moves && <>; {data.moves.source}, checked {observedLabel(data.moves.observed_at)}</>}{data.roster_index && `; ${data.roster_index.source}, ${observedLabel(data.roster_index.observed_at)}`}. Returned means the same team before and after (re-signed or option exercised). Stats are NBA.com&apos;s per-game figures.</p>
    </>}
  </div>;
}
