import Link from "next/link";
import { TeamLogo } from "./team-logo";
import { BackButton, NavLabel } from "./ui/back-button";
import { Icon } from "./ui/icon";
import { PageHeader } from "./ui/panel";
import { ButtonLink, ButtonSummary } from "./ui/kit";
import { formatDate } from "@/lib/format-date";
import { ALL_COLUMNS, TEAM_VIEWS, columnRanks, formatValue, standingGroup, type SixFactorTeam, type SixFactorsResponse, type TeamColumnGroup } from "@/lib/team-six-factors";
import { NetTrend } from "./team-trend";
import { RosterAllocationView, type RosterAllocationViewProps } from "./roster-allocation-view";
import type { TeamPeersResponse, TeamScheduleGameItem } from "@/lib/types";

const column = (key: string) => ALL_COLUMNS.find(entry => entry.key === key)!;
const tone = (key: string, value: number | null) => !column(key).signed || value == null || Math.abs(value) < 0.05 ? undefined : value > 0 ? "up" : "down";
const RECENT_GAMES = 10;
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const ranksOf = (teams: SixFactorTeam[]) => new Map(ALL_COLUMNS.map(entry => [entry.key, columnRanks(teams, entry, "per_100")]));

/** Rows of whole teams (a team, its home or away split) over column groups, each value with its #rank. */
function TeamRowsGrid({ label, groups, lead, rows, className }: {
  label: string; groups: TeamColumnGroup[]; lead: string; className: string;
  rows: { label: string; team: SixFactorTeam; ranks: Map<string, Map<string, number>> }[];
}) {
  return <div className="player-ref-grid-frame">
    <div className="player-ref-grid-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className={`player-ref-grid ${className}`}>
        <colgroup><col className="player-ref-grid-lead-column" />{groups.flatMap(group => group.columns).map(entry => <col key={entry.key} />)}</colgroup>
        <thead>
          <tr className="player-ref-grid-tier-1">
            <th scope="colgroup" className="player-ref-grid-lead">{lead}</th>
            {groups.map(group => <th key={group.label} scope="colgroup" colSpan={group.columns.length} className="group-start">{group.label}</th>)}
          </tr>
          <tr className="player-ref-grid-tier-2">
            <td className="player-ref-grid-lead" />
            {groups.flatMap((group, index) => group.columns.map((entry, position) =>
              <th key={entry.key} scope="col" title={entry.title} className={index > 0 && position === 0 ? "group-start" : undefined}>{entry.label}</th>))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.label}>
            <th scope="row" className="player-ref-grid-lead">{row.label}</th>
            {groups.flatMap((group, index) => group.columns.map((entry, position) => {
              const value = entry.value(row.team, "per_100");
              return <td key={entry.key} className={index > 0 && position === 0 ? "group-start" : undefined} data-tone={tone(entry.key, value)}>
                <span className="team-factor-value">{entry.display ? entry.display(row.team) : formatValue(value, entry.format, "per_100")}</span>
                {!entry.unranked && <small>#{row.ranks.get(entry.key)?.get(row.team.team_id) ?? "—"}</small>}
              </td>;
            }))}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

/** Standing, schedule strength and luck: the Teams page's Standings view for one team. */
export function TeamStandingSection({ data, team }: { data: SixFactorsResponse; team: SixFactorTeam }) {
  return <section className="player-open-section player-glass team-profile-section" aria-label="Standing">
    <header className="player-open-heading"><h2><Icon name="trophy" size={20} />Standing</h2>
      <span>Seed and GB within the {standingGroup(team)?.label ?? "league"} · other #ranks of {data.teams.length}</span></header>
    <TeamRowsGrid label="Standing table" groups={TEAM_VIEWS.standings} lead="Team" className="team-standing-grid" rows={[{ label: team.tricode, team, ranks: ranksOf(data.teams) }]} />
    <p className="player-reference-note">Seed orders the conference (before 1970-71, the division) by win percentage, ties by net rating, not the NBA&apos;s tiebreakers. Adj Net = Net + SOS, where SOS is the average schedule-adjusted net rating of the opponents faced. xW is the record the point margin predicts; Luck = wins − xW.</p>
  </section>;
}

const VENUE_GROUPS: TeamColumnGroup[] = [
  { label: "Ratings", columns: ["ortg", "drtg", "net"].map(key => column(key)) },
  { label: "Offense", columns: ["off", "o_ts", "o_tov", "o_orb"].map(key => column(key)) },
  { label: "Defense", columns: ["def", "d_ts", "d_tov", "d_drb"].map(key => column(key)) },
];

/** Home and away six factors, each against the league average over every game. */
export function TeamVenueSection({ all, home, away, team }: { all: SixFactorsResponse; home: SixFactorsResponse | null; away: SixFactorsResponse | null; team: SixFactorTeam }) {
  const find = (data: SixFactorsResponse | null) => data?.teams.find(entry => entry.team_id === team.team_id);
  const rows = [{ label: "All", data: all, team }, { label: "Home", data: home, team: find(home) }, { label: "Away", data: away, team: find(away) }]
    .filter((row): row is { label: string; data: SixFactorsResponse; team: SixFactorTeam } => row.data != null && row.team != null)
    .map(row => ({ label: `${row.label} · ${row.team.wins}–${row.team.losses}`, team: row.team, ranks: ranksOf(row.data.teams) }));
  if (rows.length < 2) return null;
  return <section className="player-open-section player-glass team-profile-section" aria-label="Home and away">
    <header className="player-open-heading"><h2><Icon name="home" size={20} />Home and Away</h2>
      <span>Per 100 against the league average over every game · #rank among teams at that venue</span></header>
    <TeamRowsGrid label="Home and away table" groups={VENUE_GROUPS} lead="Games" className="team-venue-grid" rows={rows} />
  </section>;
}

/** Net rating over the latest ten games, after each game. */
export function TeamTrendSection({ team }: { team: SixFactorTeam }) {
  const last = team.trend[team.trend.length - 1];
  return <section className="player-open-section player-glass team-profile-section" aria-label="Net rating trend">
    <header className="player-open-heading"><h2><Icon name="trend" size={20} />Net Rating Trend</h2>
      <span>{last ? `Ten-game net rating · latest ${formatValue(last.net, "signed", "per_100")} · rule at league average` : "Ten-game net rating"}</span></header>
    <NetTrend points={team.trend} variant="full" label={team.name} />
  </section>;
}

/** Databallr's team header (its Contracts page): the season's logo, the full era name, the record. */
export function TeamProfileHeader({ name, tricode, season, phaseLabel, team, netRank, compareHref, teamsHref }: {
  name: string; tricode: string; season: string; phaseLabel: string; team: SixFactorTeam | null; netRank?: number; compareHref: string; teamsHref: string;
}) {
  const group = team ? standingGroup(team) : null;
  const seed = team?.seed && group ? ` · ${ordinal(team.seed)} in the ${group.short}` : "";
  const record = team ? ` · ${team.wins}–${team.losses}${seed} · Net ${formatValue(team.net, "signed", "per_100")}${netRank ? ` (#${netRank})` : ""}` : "";
  return <div className="team-profile-top">
    <BackButton parent={{ href: teamsHref, label: "Teams" }} />
    <NavLabel label={name} />
    <div className="team-profile-head">
      <TeamLogo team={tricode} season={season} size={72} />
      <PageHeader className="team-profile-title" title={name} subtitle={`${season} ${phaseLabel}${record}`} actions={
        <ButtonLink size="sm" href={compareHref} icon="swap">Compare Team</ButtonLink>
      } />
    </div>
  </div>;
}

const FACTOR_GROUPS: { label: string; columns: [string, string][] }[] = [
  { label: "Rating", columns: [["rating", "Per 100"]] },
  { label: "Six Factors", columns: [["total", "Total"], ["ts", "Shooting"], ["tov", "Turnovers"], ["reb", "Rebounds"]] },
  { label: "Rates", columns: [["r_ts", "TS%"], ["r_tov", "TOV/100"], ["r_reb", "REB%"], ["r_ftr", "FTr"], ["r_3p", "3P%"]] },
];
const FACTOR_ROWS: { side: string; keys: Record<string, string> }[] = [
  { side: "Offense", keys: { rating: "ortg", total: "off", ts: "o_ts", tov: "o_tov", reb: "o_orb", r_ts: "ts_pct", r_tov: "tov_per_100", r_reb: "orb_pct", r_ftr: "ftr", r_3p: "fg3_pct" } },
  { side: "Defense", keys: { rating: "drtg", total: "def", ts: "d_ts", tov: "d_tov", reb: "d_drb", r_ts: "opp_ts_pct", r_tov: "opp_tov_per_100", r_reb: "drb_pct", r_ftr: "opp_ftr", r_3p: "opp_fg3_pct" } },
];

/** The team's six factors with league ranks: one row per end, in the reference-grid look. */
export function TeamSixFactorsSection({ data, team }: { data: SixFactorsResponse; team: SixFactorTeam }) {
  const ranks = new Map(ALL_COLUMNS.map(entry => [entry.key, columnRanks(data.teams, entry, "per_100")]));
  return <section className="player-open-section player-glass team-profile-section" aria-label="Six factors">
    <header className="player-open-heading"><h2><Icon name="chart-column" size={20} />Six Factors</h2>
      <span>Points per 100 against league average · #rank of {data.teams.length}</span></header>
    <div className="player-ref-grid-frame">
      <div className="player-ref-grid-scroll" role="region" aria-label="Six factors table" tabIndex={0}>
        <table className="player-ref-grid team-factors-grid">
          <colgroup><col className="player-ref-grid-lead-column" />{FACTOR_GROUPS.flatMap(group => group.columns).map(([key]) => <col key={key} />)}</colgroup>
          <thead>
            <tr className="player-ref-grid-tier-1">
              <th scope="colgroup" className="player-ref-grid-lead">Side</th>
              {FACTOR_GROUPS.map(group => <th key={group.label} scope="colgroup" colSpan={group.columns.length} className="group-start">{group.label}</th>)}
            </tr>
            <tr className="player-ref-grid-tier-2">
              <td className="player-ref-grid-lead" />
              {FACTOR_GROUPS.flatMap((group, index) => group.columns.map(([key, label], position) =>
                <th key={key} scope="col" className={index > 0 && position === 0 ? "group-start" : undefined}>{label}</th>))}
            </tr>
          </thead>
          <tbody>
            {FACTOR_ROWS.map(row => <tr key={row.side}>
              <th scope="row" className="player-ref-grid-lead">{row.side}</th>
              {FACTOR_GROUPS.flatMap((group, index) => group.columns.map(([slot], position) => {
                const key = row.keys[slot];
                const spec = column(key);
                const value = spec.value(team, "per_100");
                return <td key={slot} className={index > 0 && position === 0 ? "group-start" : undefined} data-tone={tone(key, value)}>
                  <span className="team-factor-value">{formatValue(value, spec.format, "per_100")}</span>
                  <small>#{ranks.get(key)?.get(team.team_id) ?? "—"}</small>
                </td>;
              }))}
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
    <p className="player-reference-note">Each end&apos;s shooting, turnover and rebound terms add up to its total; positive is better on both ends. Defensive rates are the opponents&apos;, except REB%, which is the team&apos;s own defensive rebounding.</p>
  </section>;
}

/** Results, most recent first; earlier games fold under a disclosure. */
export function TeamGameLogSection({ games, season, scopeParams, empty = "No games in this scope." }: { games: TeamScheduleGameItem[]; season: string; scopeParams: string; /** Why there are no games. */ empty?: string }) {
  const ordered = [...games].sort((a, b) => b.game_date.localeCompare(a.game_date) || b.game_id.localeCompare(a.game_id));
  const table = (rows: TeamScheduleGameItem[], label: string) => <div className="player-ref-grid-frame">
    <div className="player-ref-grid-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="player-ref-grid team-games-grid">
        <colgroup><col className="player-ref-grid-lead-column" /><col className="team-games-opponent" /><col /><col /><col /></colgroup>
        <thead><tr className="player-ref-grid-tier-2">
          <th scope="col" className="player-ref-grid-lead">Date</th><th scope="col" className="group-start">Opponent</th><th scope="col">Result</th><th scope="col">Score</th><th scope="col">+/-</th>
        </tr></thead>
        <tbody>{rows.map(game => {
          const known = game.team_points != null && game.opponent_points != null;
          return <tr key={game.game_id}>
            <th scope="row" className="player-ref-grid-lead">{formatDate(game.game_date)}</th>
            <td className="group-start"><span className="team-games-opponent-cell">{game.side === "away" ? "@" : "vs"}<TeamLogo team={game.opponent_tricode} season={season} size={18} />
              {game.opponent_id ? <Link href={`/teams/${game.opponent_id}?${scopeParams}`}>{game.opponent_tricode}</Link> : game.opponent_tricode}</span></td>
            <td data-tone={game.is_win == null ? undefined : game.is_win ? "up" : "down"}>{game.is_win == null ? "—" : game.is_win ? "W" : "L"}</td>
            <td>{known ? `${game.team_points}–${game.opponent_points}` : "—"}</td>
            <td data-tone={game.differential == null || game.differential === 0 ? undefined : game.differential > 0 ? "up" : "down"}>{game.differential == null ? "—" : formatValue(game.differential, "signed", "totals")}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
  return <section className="player-open-section player-glass team-profile-section" aria-label="Game log">
    <header className="player-open-heading"><h2><Icon name="calendar" size={20} />Game Log</h2><span>{games.length} games · most recent first</span></header>
    {ordered.length ? table(ordered.slice(0, RECENT_GAMES), "Recent games table") : <p className="player-open-empty">{empty}</p>}
    {ordered.length > RECENT_GAMES && <details><ButtonSummary size="sm" variant="text" iconAfter="chevron-down">Earlier Games · {ordered.length - RECENT_GAMES}</ButtonSummary>{table(ordered.slice(RECENT_GAMES), "Earlier games table")}</details>}
  </section>;
}

/** The depth chart (moved from Roster Shapes in alignment row 12): minutes by position for this scope. */
export function TeamDepthSection({ catalog, teamId, scope }: Omit<RosterAllocationViewProps, "embedded">) {
  return <section id="depth-chart" className="player-open-section player-glass team-profile-section" aria-label="Depth chart">
    <header className="player-open-heading"><h2><Icon name="shapes" size={20} />Depth Chart</h2><span>Observed minutes by position · drag players to project</span></header>
    <RosterAllocationView catalog={catalog} teamId={teamId} scope={scope} embedded />
  </section>;
}

/** Teams with the nearest statistical profile in the same scope. */
export function TeamPeersSection({ peers, season, scopeParams }: { peers: TeamPeersResponse; season: string; scopeParams: string }) {
  if (!peers.peers.length) return null;
  return <section className="player-open-section player-glass team-profile-section" aria-label="Similar teams">
    <header className="player-open-heading"><h2><Icon name="users" size={20} />Similar Teams</h2><span>Nearest statistical profiles this season</span></header>
    <ol className="team-peers">
      {peers.peers.map(peer => <li key={peer.team_id}>
        <Link href={`/teams/${peer.team_id}?${scopeParams}`} className="team-peer" title={`${peer.name}: similarity ${(peer.similarity_score * 100).toFixed(1)}%, distance ${peer.distance.toFixed(3)}`}>
          <TeamLogo team={peer.tricode} season={season} size={32} />
          <span><strong>{peer.name}</strong><small>{(peer.similarity_score * 100).toFixed(1)}% similar</small></span>
        </Link>
      </li>)}
    </ol>
  </section>;
}
