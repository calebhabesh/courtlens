"use client";

import { FIRST_GAME_LOG_SEASON, isTotalsSeason, seasonOptionLabel } from "@/lib/season-basis";
import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
// The Stats table look, as the career and matchup tables borrow it.
import "./stats-explorer.css";
import { TeamLogo } from "./team-logo";
import { ConferenceMark } from "./conference-mark";
import { NetTrend } from "./team-trend";
import { SortHeader } from "./table-ui";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Menu, MenuItem } from "./ui/menu";
import { PageHeader } from "./ui/panel";
import { MenuTrigger, Segmented, Select } from "./ui/kit";
import { formatDate } from "@/lib/format-date";
import type { WorkbenchCatalog } from "@/lib/types";
import {
  ALL_COLUMNS, LUCK_SHARES, TEAM_VIEWS, VENUES, WINDOWS, columnRanks, formatValue, getTeamSixFactors, luckLabel, sortTeams, viewColumns, withStandings,
  type SixFactorTeam, type TeamColumn, type TeamCounting, type TeamVenue, type TeamView,
} from "@/lib/team-six-factors";

const PHASES = [{ value: "regular_season", label: "Regular Season" }, { value: "playoffs", label: "Playoffs" }] as const;
const DEFAULT_SORT: Record<TeamView, string> = { overall: "net", offense: "off", defense: "def", standings: "seed" };
const VIEW_OPTIONS: { value: TeamView; label: string; title: string }[] = [
  { value: "overall", label: "Overall", title: "Ratings and six factors" },
  { value: "offense", label: "Offense", title: "Offensive six factors and rates" },
  { value: "defense", label: "Defense", title: "Defensive six factors and opponent rates" },
  { value: "standings", label: "Standings", title: "Seed, record and streak; strength of schedule; expected wins and close games" },
];
const share = (raw: string | null) => LUCK_SHARES.find(value => String(value) === raw) ?? 0;
const tone = (column: TeamColumn, value: number | null) => !column.signed || value == null || Math.abs(value) < 0.05 ? undefined : value > 0 ? "up" : "down";

/**
 * NBA Team Stats (alignment row 4): Databallr's six-factor team table. Each side's rating against
 * league average splits into shooting, turnover and rebound points per 100, in the Stats table look.
 */
export function TeamsSixFactorView({ catalog }: { catalog: WorkbenchCatalog | null }) {
  const { get, set } = useUrlState();
  const season = get("season") || catalog?.default_season || "";
  const phase = get("phase") === "playoffs" ? "playoffs" : "regular_season";
  // Seasons before the game logs come as whole-season totals: no windows, no home and away.
  const totals = isTotalsSeason(catalog, season);
  const windowValue = totals ? "" : WINDOWS.find(entry => entry.value === get("window"))?.value ?? "";
  const windowDays = WINDOWS.find(entry => entry.value === windowValue)?.days ?? null;
  const offenseLuck = share(get("offenseLuck")), defenseLuck = share(get("defenseLuck"));
  const view: TeamView = VIEW_OPTIONS.find(entry => entry.value === get("view"))?.value ?? "overall";
  const venue: TeamVenue | null = !totals && (get("venue") === "home" || get("venue") === "away") ? get("venue") as TeamVenue : null;
  const layout = get("layout") === "cards" ? "cards" : "table";
  const conference = get("conf") === "east" ? "Eastern" : get("conf") === "west" ? "Western" : null;
  const counting: TeamCounting = get("counting") === "totals" ? "totals" : "per_100";
  const columns = viewColumns(view);
  const sortKey = columns.some(column => column.key === get("sort")) ? get("sort")! : DEFAULT_SORT[view];
  const sortColumn = ALL_COLUMNS.find(column => column.key === sortKey)!;
  const sortDir = get("dir") === "asc" || get("dir") === "desc" ? get("dir") as "asc" | "desc" : sortColumn.higherBetter ? "desc" : "asc";
  const beforeDate = get("beforeDate") || get("before_date");
  const releaseId = get("releaseId") || get("release_id");

  const { data, error, loading, retry } = useFeed([season, phase, beforeDate, releaseId, String(windowDays), String(offenseLuck), String(defenseLuck), venue ?? ""],
    signal => getTeamSixFactors({ season, phase, beforeDate, releaseId, windowDays, offenseLuck, defenseLuck, venue }, signal));
  // A conference ranks and seeds its own teams; every value stays relative to the league average.
  // Before 1970-71 there were no conferences: East and West are the Eastern and Western Divisions.
  const shownTeams = useMemo(() => data ? withStandings(data.teams.filter(team => !conference || (team.conference ?? team.division) === conference)) : [], [data, conference]);
  const teams = useMemo(() => sortTeams(shownTeams, sortColumn, sortDir, counting), [shownTeams, sortColumn, sortDir, counting]);
  const ranks = useMemo(() => new Map(ALL_COLUMNS.map(column => [column.key, columnRanks(shownTeams, column, counting)])), [shownTeams, counting]);
  const scopeParams = new URLSearchParams({ season, phase, ...(beforeDate ? { beforeDate } : {}) }).toString();
  const phases = PHASES.filter(entry => !catalog?.stats_scopes || catalog.stats_scopes.some(scope => scope.season === season && scope.phase === entry.value));
  const sort = (key: string) => {
    const column = ALL_COLUMNS.find(entry => entry.key === key)!;
    const natural = column.higherBetter ? "desc" : "asc";
    const next = key === sortKey ? (sortDir === "desc" ? "asc" : "desc") : natural;
    set({ sort: key, dir: next === natural ? null : next });
  };
  const luckActive = offenseLuck > 0 || defenseLuck > 0;
  const windowLabel = WINDOWS.find(entry => entry.value === windowValue)!.label;
  const venueLabel = VENUES.find(entry => entry.value === (venue ?? ""))!.label;
  const estimated = totals && data != null && data.teams.length > 0 && data.teams.every(team => team.o_ts == null);

  return <div className="teams-page" role="region" aria-label="NBA Team Stats">
    <PageHeader className="pvp-header" icon="users" title="NBA Team Stats" subtitle={`Six Factor Analysis · ${season} Season`} />
    <div className="teams-console"><FilterBar label="Team stats controls" summary={[season, phase === "playoffs" ? "Playoffs" : "Regular Season", conference && conference.slice(0, 4), windowDays && windowLabel, venue && venueLabel].filter(Boolean).join(" · ")}
      scope={<>
        <Select size="md" aria-label="Season" value={season} onChange={event => set({ season: event.target.value, beforeDate: null, before_date: null })}>
          {[...(catalog?.seasons ?? [season])].reverse().map(entry => <option key={entry} value={entry}>{seasonOptionLabel(entry)}</option>)}
        </Select>
        <Select size="md" aria-label="Season phase" value={phase} onChange={event => set({ phase: event.target.value === "playoffs" ? "playoffs" : null, beforeDate: null, before_date: null })}>
          {phases.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </Select>
        <Segmented size="md" label="Conference" className="teams-conference" value={get("conf") === "east" || get("conf") === "west" ? get("conf")! : "league"}
          onChange={value => set({ conf: value === "league" ? null : value })}
          options={[{ value: "league", label: "League", title: "All teams, ranked across the league" },
            { value: "east", label: <ConferenceMark conference="East" />, title: "Eastern Conference, ranked within the conference" },
            { value: "west", label: <ConferenceMark conference="West" />, title: "Western Conference, ranked within the conference" }]} />
        {!totals && <Segmented size="md" label="Time window" value={windowValue} onChange={value => set({ window: value || null })}
          options={WINDOWS.map(entry => ({ value: entry.value, label: entry.days ? <><span className="teams-window-last">Last </span>{entry.label.replace("Last ", "")}</> : entry.label, title: entry.days ? `Games in the ${entry.days} days ending at the last game in scope` : "Every game in scope" }))} />}
        <Menu align="left" renderTrigger={props => <MenuTrigger {...props} size="md" icon="sliders" selected={luckActive}
        aria-label={`3P luck: offense ${luckLabel(offenseLuck)}, defense ${luckLabel(defenseLuck)}`}>3P Luck</MenuTrigger>}>
        {(["offense", "defense"] as const).map(sideKey => <div key={sideKey} role="group" aria-label={`${sideKey === "offense" ? "Offense" : "Defense"} 3P%`}>
          <p className="teams-menu-group" aria-hidden="true">{sideKey === "offense" ? "Own 3P%" : "Opponent 3P%"}</p>
          {LUCK_SHARES.map(value => {
            const current = (sideKey === "offense" ? offenseLuck : defenseLuck) === value;
            return <MenuItem key={value} label={luckLabel(value)} icon={current ? "check" : undefined} className={current ? "teams-menu-current" : undefined}
              onClick={() => set({ [sideKey === "offense" ? "offenseLuck" : "defenseLuck"]: value ? String(value) : null })} />;
          })}
        </div>)}
        </Menu>
      </>}
      modes={<>
        <Segmented size="md" label="Team view" value={view} onChange={value => set({ view: value === "overall" ? null : value, sort: null, dir: null })} options={VIEW_OPTIONS} />
        {!totals && <Segmented size="md" label="Venue" value={venue ?? ""} onChange={value => set({ venue: value || null })}
          options={VENUES.map(entry => ({ value: entry.value, label: entry.label, title: entry.value ? `${entry.label} games only, against the league average over every game` : "Home and away games" }))} />}
        <Segmented size="md" label="Layout" value={layout} onChange={value => set({ layout: value === "cards" ? "cards" : null })}
          options={[{ value: "table", label: "Table", icon: "table" }, { value: "cards", label: "Cards", icon: "cards" }]} />
        <Segmented size="md" label="Counting" value={counting} onChange={value => set({ counting: value === "totals" ? "totals" : null })}
          options={[{ value: "per_100", label: "Per 100", title: "Per 100 possessions" }, { value: "totals", label: "Totals", title: "Points over the span: relative terms × possessions / 100" }]} />
      </>}
      details={data ? <DataDetailsButton scope={{ releaseId: String(data.context.release_id ?? ""), season, phase, beforeDate: String(data.context.before_date ?? "") }} rows={[
        { label: "Games", value: `${data.window.games.toLocaleString("en-US")} games${data.window.first_game ? `, ${formatDate(data.window.first_game)} to ${formatDate(data.window.last_game!)}` : ""}${data.window.excluded_games ? `; ${data.window.excluded_games} without both box scores excluded` : ""}` },
        { label: "Method", value: "Possessions = FGA + 0.44 FTA − OREB + TOV, so rating = 200 × TS% × (1 − TOV/poss + OREB/poss). Each side's gap to league splits exactly at the midpoint into shooting (TS), turnover and rebound points per 100; OFF + DEF = Net. Defense applies the split to opponents with the sign flipped, so positive is better everywhere." },
        { label: "3P luck", value: `Regresses three-point percentage toward league (${data.league.fg3_pct != null ? `${(data.league.fg3_pct * 100).toFixed(1)}%` : "unknown"}) at fixed attempts, 2.7 points per regressed make (3 × 0.9 for misses partly recovered on the offensive glass). Offense: ${luckLabel(offenseLuck)}; defense: ${luckLabel(defenseLuck)}.` },
        { label: "League", value: `ORTG ${data.league.rating?.toFixed(1) ?? "—"} · TS ${data.league.ts_pct != null ? (data.league.ts_pct * 100).toFixed(1) : "—"}% · TOV ${data.league.tov_per_100?.toFixed(1) ?? "—"}/100 · ORB ${data.league.orb_pct != null ? (data.league.orb_pct * 100).toFixed(1) : "—"}%` },
        { label: "Schedule and luck", value: "Adj Net solves every team's net rating plus the average strength of the opponents it faced, pinned so the league averages zero (Basketball-Reference's SRS, per 100 possessions); SOS is that opponent average, so Adj Net = Net + SOS. xW = games × PF¹⁴ / (PF¹⁴ + PA¹⁴); Luck = wins − xW; Close = games decided by five points or fewer. Seed orders the teams shown by win percentage, ties by net rating, not the NBA's tiebreakers. Seed, W–L, GB, L10, Strk and the trend cover every game in scope, whatever the window or venue." },
        { label: "Method version", value: `${data.method_version} · ${data.context_method_version}`, mono: true },
        { label: "Source", value: "CourtLens admitted team box scores (descriptive; not a forecast). Databallr's version reads play-by-play first- and second-chance points, so values differ slightly." },
        ...data.warnings.map(value => ({ label: "Source warning", value })),
      ]} /> : undefined} /></div>
    {totals && <p className="teams-note">{season} has season totals only (game logs start in {FIRST_GAME_LOG_SEASON}): records come from the standings, and last ten, streaks, close games, the trend, schedule strength and home and away need games.
      {estimated && " Turnovers and offensive rebounds were not kept before 1973-74, so ratings are Basketball-Reference's estimates and the six factors are unknown."}</p>}
    {error && <FeedFailure error={error} retry={retry} what="team stats" />}
    {loading && !data && <FeedSkeleton label="Loading team stats" />}
    {data && !teams.length && <p className="teams-empty">{conference ? `No ${conference} Conference teams in this scope.` : "No team games in this scope."}</p>}
    {data && teams.length > 0 && layout === "table" && <section className="stats-workspace teams-table" aria-label="Team six factors" aria-busy={loading || undefined}>
      <div className="stats-table-frame is-table">
        <div className="table-wrapper stats-scroll-region teams-scroll" role="region" aria-label="Team table scroll area" tabIndex={0}>
          <table className="data-table dense-stats-table teams-grid" data-view={view}>
            <colgroup><col className="teams-name-column" />{columns.map(column => <col key={column.key} />)}</colgroup>
            <thead>
              <tr className="stats-header-tier-1">
                <th className="pinned-col teams-name-group"><span className="sr-only">Team</span></th>
                {TEAM_VIEWS[view].map((group, index) => <th key={group.label} colSpan={group.columns.length} scope="colgroup" className={`stats-group-th ${index > 0 ? "group-start" : ""}`}>{group.label}</th>)}
              </tr>
              <tr className="stats-header-tier-2">
                <th scope="col" className="pinned-col teams-name"><span className="teams-name-label"><span>Rk</span><span>Team</span></span></th>
                {TEAM_VIEWS[view].flatMap((group, index) => group.columns.map((column, position) => <SortHeader key={column.key} label={column.label} metric={column.key} description={column.title}
                  active={sortKey === column.key} direction={sortDir} onSort={sort} className={`num ${index > 0 && position === 0 ? "group-start" : ""}`} />))}
              </tr>
            </thead>
            <tbody key={`${season}-${phase}-${windowValue}`} className="pvp-fade">
              {teams.map((team, index) => <tr key={team.team_id}>
                <th scope="row" className="pinned-col teams-name">
                  <span className="teams-identity">
                    <span className="teams-rank-badge" data-top={index < 3 || undefined}>{index + 1}</span>
                    <TeamLogo team={team.tricode} season={season} size={32} />
                    <Link href={`/teams/${team.team_id}?${scopeParams}`} title={`${team.name} · ${team.wins}–${team.losses}`}>{team.tricode}</Link>
                    <span className="teams-record">{team.wins}–{team.losses}</span>
                  </span>
                </th>
                {TEAM_VIEWS[view].flatMap((group, groupIndex) => group.columns.map((column, position) => <ValueCell key={column.key} team={team} column={column} counting={counting}
                  rank={ranks.get(column.key)?.get(team.team_id)} groupStart={groupIndex > 0 && position === 0} />))}
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </section>}
    {data && teams.length > 0 && layout === "cards" && <TeamCards teams={teams} counting={counting} ranks={ranks} season={season} scopeParams={scopeParams} />}
    {data && teams.length > 0 && <p className="teams-note">
      Points per 100 possessions against league average; positive is better on both ends, and each side&apos;s three terms add up to OFF or DEF exactly.{conference ? ` Ranks are within the ${conference} Conference.` : ""}
      {view === "standings" ? " Seed, W–L, GB, L10 and Strk cover every game in scope; Adj Net = Net + SOS." : ""}
      {venue ? ` ${venueLabel} games only, against the league average over every game.` : ""}
      {luckActive ? " 3P luck adjusts ratings and shooting terms only." : ""} {windowDays ? `${windowLabel}: ${data.window.games} games to ${formatDate(data.window.last_game!)}.` : ""}
    </p>}
  </div>;
}

function ValueCell({ team, column, counting, rank, groupStart }: { team: SixFactorTeam; column: TeamColumn; counting: TeamCounting; rank?: number; groupStart: boolean }) {
  const value = column.value(team, counting);
  return <td className={`stats-metric-cell num teams-cell ${groupStart ? "group-start" : ""}`} data-tone={tone(column, value)}>
    <span className="teams-value">{column.display ? column.display(team) : formatValue(value, column.format, counting)}</span>
    {rank != null && !column.unranked && <span className="teams-cell-rank">#{rank}</span>}
  </td>;
}

const CARD_TERMS: { side: string; total: string; terms: string[] }[] = [
  { side: "Offense", total: "off", terms: ["o_ts", "o_tov", "o_orb"] },
  { side: "Defense", total: "def", terms: ["d_ts", "d_tov", "d_drb"] },
];

/** Cards: each team's net rating over its six factors, bars on one league-wide scale. */
function TeamCards({ teams, counting, ranks, season, scopeParams }: { teams: SixFactorTeam[]; counting: TeamCounting; ranks: Map<string, Map<string, number>>; season: string; scopeParams: string }) {
  const column = (key: string) => ALL_COLUMNS.find(entry => entry.key === key)!;
  const termKeys = CARD_TERMS.flatMap(group => group.terms);
  const scale = Math.max(1e-9, ...teams.flatMap(team => termKeys.map(key => Math.abs(column(key).value(team, counting) ?? 0))));
  const net = column("net");
  return <section className="teams-cards" aria-label="Team cards">
    {teams.map((team, index) => {
      const netValue = net.value(team, counting);
      return <article key={team.team_id} className="teams-card pvp-fade">
        <header className="teams-card-head">
          <span className="teams-rank-badge" data-top={index < 3 || undefined}>{index + 1}</span>
          <TeamLogo team={team.tricode} season={season} size={48} />
          <span className="teams-card-who">
            <Link href={`/teams/${team.team_id}?${scopeParams}`}>{team.name}</Link>
            <span>{team.wins}–{team.losses} · ORTG {formatValue(column("ortg").value(team, counting), "rating", counting)} · DRTG {formatValue(column("drtg").value(team, counting), "rating", counting)}</span>
          </span>
          <span className="teams-card-net" data-tone={tone(net, netValue)} title="Net rating">{formatValue(netValue, "signed", counting)}<small>Net · #{ranks.get("net")?.get(team.team_id)}</small></span>
        </header>
        <div className="teams-card-trend">
          <p className="teams-card-side-head"><span>Net · Last 10</span>{team.trend.length > 0 && <strong data-tone={tone(net, team.trend[team.trend.length - 1].net)}>{formatValue(team.trend[team.trend.length - 1].net, "signed", "per_100")}</strong>}</p>
          <NetTrend points={team.trend} label={team.name} />
        </div>
        {CARD_TERMS.map(group => {
          const total = column(group.total);
          const totalValue = total.value(team, counting);
          return <div key={group.side} className="teams-card-side">
            <p className="teams-card-side-head"><span>{group.side}</span><strong data-tone={tone(total, totalValue)}>{formatValue(totalValue, "signed", counting)}</strong><span className="teams-cell-rank">#{ranks.get(group.total)?.get(team.team_id)}</span></p>
            {group.terms.map(key => {
              const term = column(key), value = term.value(team, counting);
              return <div key={key} className="teams-card-term" title={term.title}>
                <span>{term.label}</span>
                <span className="teams-card-bar" data-tone={tone(term, value)} style={{ "--bar": `${Math.min(1, Math.abs(value ?? 0) / scale)}` } as CSSProperties}><span /></span>
                <strong data-tone={tone(term, value)}>{formatValue(value, "signed", counting)}</strong>
                <span className="teams-cell-rank">#{ranks.get(key)?.get(team.team_id)}</span>
              </div>;
            })}
          </div>;
        })}
      </article>;
    })}
  </section>;
}
