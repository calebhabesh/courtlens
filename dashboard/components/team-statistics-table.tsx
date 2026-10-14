import Link from "next/link";
import { SortHeader } from "./table-ui";
import { TeamLogo } from "./team-logo";
import { PercentileCell } from "./charts/percentile-cell";
import type { TeamResearchItem } from "@/lib/types";
import type { TablePreset } from "./team-explorer-view";
import { ButtonLink } from "./ui/kit";

type Column = { key: string; label: string; group: string; value: (team: TeamResearchItem) => number | null; format: (value: number) => string };
const tenth = (value: number) => value.toFixed(1);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const column = (key: string, label: string, group: string, value: Column["value"], format = tenth): Column => ({ key, label, group, value, format });
const rating = (key: "off_rating" | "def_rating" | "net_rating" | "pace", label: string) => column(key, label, "Ratings", team => team.ratings?.[key] ?? null);
const factor = (key: keyof NonNullable<TeamResearchItem["four_factors"]>, label: string, defense = false) => column(key, label, defense ? "Defense" : "Offense", team => team.four_factors?.[key] ?? null, key.endsWith("ftr") ? value => value.toFixed(3) : percent);
const netMargin = (team: TeamResearchItem) => team.production.pts_per_game != null && team.allowance.pts_allowed_per_game != null ? team.production.pts_per_game - team.allowance.pts_allowed_per_game : null;
const PRESETS: Record<TablePreset, Column[]> = {
  overview: [
    column("ppg", "PPG", "Scoring", team => team.production.pts_per_game ?? null),
    column("opp_ppg", "Opp PPG", "Scoring", team => team.allowance.pts_allowed_per_game ?? null),
    column("net_margin", "Net Diff", "Scoring", netMargin),
    column("fg_pct", "FG%", "Shooting", team => team.production.fg_pct ?? null, percent),
    column("opp_fg_pct", "Opp FG%", "Shooting", team => team.allowance.fg_pct_allowed ?? null, percent),
    column("fg3_pct", "3P%", "Shooting", team => team.production.fg3_pct ?? null, percent),
    column("ft_pct", "FT%", "Shooting", team => team.production.ft_pct ?? null, percent),
    column("production_efg_pct", "eFG%", "Shooting", team => team.production.efg_pct ?? null, percent),
  ],
  four_factors_off: [rating("off_rating", "ORTG"), rating("pace", "Pace"), factor("efg_pct", "eFG% (40%)"), factor("tov_pct", "TOV% (25%)"), factor("oreb_pct", "ORB% (20%)"), factor("ftr", "FTR (15%)")],
  four_factors_def: [rating("def_rating", "DRTG"), factor("opp_efg_pct", "Opp eFG%", true), factor("opp_tov_pct", "Opp TOV%", true), factor("opp_oreb_pct", "Opp ORB%", true), factor("opp_ftr", "Opp FTR", true)],
  all_ratings: [rating("off_rating", "ORTG"), rating("def_rating", "DRTG"), rating("net_rating", "NET"), rating("pace", "Pace"), factor("efg_pct", "eFG%"), factor("opp_efg_pct", "Opp eFG%", true), factor("tov_pct", "TOV%"), factor("oreb_pct", "ORB%"), factor("ftr", "FTR")],
};
const SORTABLE = new Set(["ppg", "opp_ppg", "net_margin", "off_rating", "def_rating", "net_rating", "pace", "efg_pct", "tov_pct", "oreb_pct", "ftr", "opp_efg_pct"]);

export function TeamStatisticsTable({ teams, name, preset, sortField, sortDirection, onSort, link }: { teams: TeamResearchItem[]; name: string; preset: TablePreset; sortField: string; sortDirection: "asc" | "desc"; onSort: (field: string) => void; link: (path: string) => string }) {
  const columns = PRESETS[preset];
  const groups: { label: string; span: number }[] = [];
  for (const col of columns) {
    if (groups.at(-1)?.label === col.group) groups[groups.length - 1].span++; else groups.push({ label: col.group, span: 1 });
  }
  return <table className="data-table percentile-table team-statistics-table" aria-label={`${name} table`}>
    <caption className="sr-only">Source: published box scores · Sample: games shown beside each team · Percentiles compare league teams, including when grouped or searched.</caption>
    <thead>
      <tr className="table-column-groups"><th scope="colgroup" colSpan={2}>Teams</th><th scope="colgroup" colSpan={2}>Record</th>{groups.map((group, index) => <th key={index} scope="colgroup" colSpan={group.span}>{group.label}</th>)}<th scope="colgroup">Actions</th></tr>
      <tr><th scope="col" className="num">#</th><th scope="col">Franchise</th><SortHeader className="num" label="W-L" metric="wins" active={sortField === "wins"} direction={sortDirection} onSort={onSort} /><SortHeader className="num" label="Win%" metric="win_pct" active={sortField === "win_pct"} direction={sortDirection} onSort={onSort} />{columns.map(col => SORTABLE.has(col.key) ? <SortHeader key={col.key} className="num" label={col.label} metric={col.key} active={sortField === col.key} direction={sortDirection} onSort={onSort} /> : <th scope="col" key={col.key} className="num">{col.label}</th>)}<th scope="col">Actions</th></tr>
    </thead>
    <tbody>{teams.map((team, index) => {
      const cell = (key: string, value: string | null, label: string) => <PercentileCell compact value={value} percentile={team.table_percentiles?.[key] ?? null} qualified label={label} cohort={`${team.table_cohort_sample_sizes?.[key] ?? "Unknown"} league teams with known values`} />;
      return <tr key={team.team_id} data-team-id={team.team_id}>
        <td className="num">{index + 1}</td><th scope="row" className="team-table-identity"><div className="directory-identity"><TeamLogo team={team.tricode} size={20} /><div><Link href={link(`/teams/${team.team_id}`)}>{team.name}</Link><small>{team.games_played} games · {team.division ?? "Division unknown"}</small></div></div></th>
        <td className="num">{cell("wins", `${team.wins}-${team.losses}`, "Record by wins")}</td><td className="num">{cell("win_pct", team.win_pct == null ? null : team.win_pct.toFixed(3), "Win percentage")}</td>
        {columns.map(col => { const value = col.value(team); return <td key={col.key} className="num" data-metric={col.key}>{cell(col.key, value == null ? null : col.format(value), col.label)}</td>; })}
        <td><div className="table-actions-group"><ButtonLink size="lg" href={link(`/team-compare?teamA=${team.team_id}`)}>Compare</ButtonLink><ButtonLink size="lg" variant="primary" href={link(`/teams/${team.team_id}`)}>Profile</ButtonLink></div></td>
      </tr>;
    })}</tbody>
  </table>;
}
