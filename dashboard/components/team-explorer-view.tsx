"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { SortHeader } from "./table-ui";
import { TeamLogo } from "./team-logo";
import type { TeamResearchItem } from "@/lib/types";

export type ExplorerViewMode = "table" | "cards" | "scatter";
export type TablePreset = "overview" | "four_factors_off" | "four_factors_def" | "all_ratings";
export type GroupingMode = "all" | "conference" | "division";

interface TeamExplorerViewProps {
  initialTeams: TeamResearchItem[];
  season: string;
  phase: string;
  beforeDate: string;
  orderNotice?: string;
  leagueAverages?: Record<string, number> | null;
}

export function TeamExplorerView({
  initialTeams,
  season,
  phase,
  beforeDate,
  orderNotice,
  leagueAverages,
}: TeamExplorerViewProps) {
  const [viewMode, setViewMode] = useState<ExplorerViewMode>("table");
  const [tablePreset, setTablePreset] = useState<TablePreset>("overview");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("win_pct");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [hoveredTeam, setHoveredTeam] = useState<TeamResearchItem | null>(null);

  // Filter teams by search
  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return initialTeams;
    const q = searchQuery.toLowerCase().trim();
    return initialTeams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tricode.toLowerCase().includes(q) ||
        (t.conference && t.conference.toLowerCase().includes(q)) ||
        (t.division && t.division.toLowerCase().includes(q))
    );
  }, [initialTeams, searchQuery]);

  // Sort helper
  const sortTeams = useCallback((teamsList: TeamResearchItem[]) => {
    return [...teamsList].sort((a, b) => {
      let valA: number | string | null = null;
      let valB: number | string | null = null;

      switch (sortField) {
        case "win_pct":
          valA = a.win_pct ?? -1;
          valB = b.win_pct ?? -1;
          break;
        case "wins":
          valA = a.wins;
          valB = b.wins;
          break;
        case "ppg":
          valA = a.production?.pts_per_game ?? -1;
          valB = b.production?.pts_per_game ?? -1;
          break;
        case "opp_ppg":
          valA = a.allowance?.pts_allowed_per_game ?? 999;
          valB = b.allowance?.pts_allowed_per_game ?? 999;
          break;
        case "net_margin":
          valA = (a.production?.pts_per_game ?? 0) - (a.allowance?.pts_allowed_per_game ?? 0);
          valB = (b.production?.pts_per_game ?? 0) - (b.allowance?.pts_allowed_per_game ?? 0);
          break;
        case "off_rating":
          valA = a.ratings?.off_rating ?? -1;
          valB = b.ratings?.off_rating ?? -1;
          break;
        case "def_rating":
          valA = a.ratings?.def_rating ?? 999;
          valB = b.ratings?.def_rating ?? 999;
          break;
        case "net_rating":
          valA = a.ratings?.net_rating ?? -999;
          valB = b.ratings?.net_rating ?? -999;
          break;
        case "pace":
          valA = a.ratings?.pace ?? -1;
          valB = b.ratings?.pace ?? -1;
          break;
        case "efg_pct":
          valA = a.four_factors?.efg_pct ?? -1;
          valB = b.four_factors?.efg_pct ?? -1;
          break;
        case "tov_pct":
          valA = a.four_factors?.tov_pct ?? 999;
          valB = b.four_factors?.tov_pct ?? 999;
          break;
        case "oreb_pct":
          valA = a.four_factors?.oreb_pct ?? -1;
          valB = b.four_factors?.oreb_pct ?? -1;
          break;
        case "ftr":
          valA = a.four_factors?.ftr ?? -1;
          valB = b.four_factors?.ftr ?? -1;
          break;
        case "opp_efg_pct":
          valA = a.four_factors?.opp_efg_pct ?? 999;
          valB = b.four_factors?.opp_efg_pct ?? 999;
          break;
        default:
          valA = a.win_pct ?? -1;
          valB = b.win_pct ?? -1;
      }

      if (valA === valB) {
        // Tiebreak by net margin then team name
        const netA = (a.production?.pts_per_game ?? 0) - (a.allowance?.pts_allowed_per_game ?? 0);
        const netB = (b.production?.pts_per_game ?? 0) - (b.allowance?.pts_allowed_per_game ?? 0);
        return netB - netA || a.name.localeCompare(b.name);
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "desc" ? valB - valA : valA - valB;
      }
      return 0;
    });
  }, [sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      // For defensive stats where lower is better, default to asc
      if (field === "def_rating" || field === "opp_ppg" || field === "tov_pct" || field === "opp_efg_pct") {
        setSortDirection("asc");
      } else {
        setSortDirection("desc");
      }
    }
  };

  // Grouped structure
  const groupedData = useMemo(() => {
    if (groupingMode === "all") {
      return [{ groupName: "All Teams (30)", teams: sortTeams(filteredTeams) }];
    }

    if (groupingMode === "conference") {
      const east = filteredTeams.filter((t) => t.conference === "Eastern");
      const west = filteredTeams.filter((t) => t.conference === "Western");
      return [
        { groupName: "Eastern Conference", teams: sortTeams(east) },
        { groupName: "Western Conference", teams: sortTeams(west) },
      ];
    }

    // division
    const divisions = ["Atlantic", "Central", "Southeast", "Northwest", "Pacific", "Southwest"];
    return divisions.map((div) => {
      const divTeams = filteredTeams.filter((t) => t.division === div);
      return {
        groupName: `${div} Division`,
        teams: sortTeams(divTeams),
      };
    });
  }, [filteredTeams, groupingMode, sortTeams]);

  // Scatter plot calculations
  const scatterBounds = useMemo(() => {
    const valid = initialTeams.filter((t) => t.ratings?.off_rating != null && t.ratings?.def_rating != null);
    if (valid.length === 0) return { minX: 105, maxX: 125, minY: 105, maxY: 125 };
    const xVals = valid.map((t) => t.ratings!.off_rating!);
    const yVals = valid.map((t) => t.ratings!.def_rating!);
    return {
      minX: Math.floor(Math.min(...xVals)) - 1,
      maxX: Math.ceil(Math.max(...xVals)) + 1,
      minY: Math.floor(Math.min(...yVals)) - 1,
      maxY: Math.ceil(Math.max(...yVals)) + 1,
    };
  }, [initialTeams]);

  return (
    <div className="team-explorer-container">
      {/* Top Controls Toolbar */}
      <div className="panel team-explorer-toolbar">
        <div className="team-explorer-controls-left">
          {/* View mode toggle */}
          <div className="button-group" role="group" aria-label="View mode">
            <button
              type="button"
              className={`button button-small ${viewMode === "table" ? "button-primary" : ""}`}
              onClick={() => setViewMode("table")}
            >
              Standings Table
            </button>
            <button
              type="button"
              className={`button button-small ${viewMode === "cards" ? "button-primary" : ""}`}
              onClick={() => setViewMode("cards")}
            >
              Franchise Cards
            </button>
            <button
              type="button"
              className={`button button-small ${viewMode === "scatter" ? "button-primary" : ""}`}
              onClick={() => setViewMode("scatter")}
            >
              Pace & Efficiency Plot
            </button>
          </div>

          {/* Grouping Mode Toggle */}
          <div className="button-group" role="group" aria-label="Grouping mode">
            <button
              type="button"
              className={`button button-small ${groupingMode === "all" ? "button-primary" : ""}`}
              onClick={() => setGroupingMode("all")}
            >
              League Overall
            </button>
            <button
              type="button"
              className={`button button-small ${groupingMode === "conference" ? "button-primary" : ""}`}
              onClick={() => setGroupingMode("conference")}
            >
              Conferences
            </button>
            <button
              type="button"
              className={`button button-small ${groupingMode === "division" ? "button-primary" : ""}`}
              onClick={() => setGroupingMode("division")}
            >
              Divisions
            </button>
          </div>
        </div>

        <div className="team-explorer-search-group">
          {/* Search box */}
          <input
            type="search"
            placeholder="Search franchise (e.g. BOS, Celtics)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field team-explorer-search-input"
          />

          <Link href="/team-compare" className="button button-small button-accent whitespace-nowrap">
            Compare Teams ⇄
          </Link>
        </div>
      </div>

      {/* Table Presets Tabs (when in Table View) */}
      {viewMode === "table" && (
        <div className="team-explorer-metric-presets">
          <span className="text-xs text-muted font-mono team-explorer-metric-label">
            METRIC SET:
          </span>
          <button
            type="button"
            className={`button button-small ${tablePreset === "overview" ? "button-primary" : ""}`}
            onClick={() => setTablePreset("overview")}
          >
            Standings & Scoring
          </button>
          <button
            type="button"
            className={`button button-small ${tablePreset === "four_factors_off" ? "button-primary" : ""}`}
            onClick={() => setTablePreset("four_factors_off")}
          >
            Offensive Four Factors
          </button>
          <button
            type="button"
            className={`button button-small ${tablePreset === "four_factors_def" ? "button-primary" : ""}`}
            onClick={() => setTablePreset("four_factors_def")}
          >
            Defensive Four Factors
          </button>
          <button
            type="button"
            className={`button button-small ${tablePreset === "all_ratings" ? "button-primary" : ""}`}
            onClick={() => setTablePreset("all_ratings")}
          >
            Ratings, Tempo & Factors
          </button>
        </div>
      )}

      {/* League Averages Bar */}
      {leagueAverages && (
        <div className="team-explorer-league-averages">
          <span className="text-muted font-mono font-semibold team-explorer-league-averages-label">
            LEAGUE AVERAGES:
          </span>
          <span className="font-mono">
            ORTG: <strong>{leagueAverages.off_rating?.toFixed(1) ?? "—"}</strong>
          </span>
          <span className="font-mono">
            DRTG: <strong>{leagueAverages.def_rating?.toFixed(1) ?? "—"}</strong>
          </span>
          <span className="font-mono">
            Pace: <strong>{leagueAverages.pace?.toFixed(1) ?? "—"}</strong>
          </span>
          <span className="font-mono">
            eFG%: <strong>{leagueAverages.efg_pct != null ? `${(leagueAverages.efg_pct * 100).toFixed(1)}%` : "—"}</strong>
          </span>
          <span className="font-mono">
            TOV%: <strong>{leagueAverages.tov_pct != null ? `${(leagueAverages.tov_pct * 100).toFixed(1)}%` : "—"}</strong>
          </span>
          <span className="font-mono">
            ORB%: <strong>{leagueAverages.oreb_pct != null ? `${(leagueAverages.oreb_pct * 100).toFixed(1)}%` : "—"}</strong>
          </span>
          <span className="font-mono">
            FTR: <strong>{leagueAverages.ftr?.toFixed(3) ?? "—"}</strong>
          </span>
        </div>
      )}

      {/* Official Placement Disclaimer Notice */}
      <div className="notice-box">
        <strong>Official standings notice:</strong>{" "}
        {orderNotice ||
          "Ties in record ordering do not establish official conference placement. Standings are presented by win percentage without tiebreaker resolution."}
      </div>

      {/* VIEW 1: TABLE VIEW */}
      {viewMode === "table" && (
        <div className="team-explorer-stack">
          {groupedData.map((group) => (
            <div key={group.groupName} className="panel">
              <div className="panel-header team-explorer-panel-header">
                <h2 className="team-explorer-panel-title">
                  {group.groupName}
                </h2>
                <span className="badge font-mono text-xs">{group.teams.length} teams</span>
              </div>

              <div className="table-wrapper research-table-scroll" role="region" aria-label="Team statistics scroll area" tabIndex={0}>
                <table className="data-table" aria-label={`${group.groupName} table`}>
                  <thead>
                    <tr>
                      <th className="team-col-num">#</th>
                      <th>Franchise</th>
                      <SortHeader className="num" label="W-L" metric="wins" active={sortField === "wins"} direction={sortDirection} onSort={handleSort} />
                      <SortHeader className="num" label="Win%" metric="win_pct" active={sortField === "win_pct"} direction={sortDirection} onSort={handleSort} />

                      {/* Overview Columns */}
                      {tablePreset === "overview" && (
                        <>
                          <SortHeader className="num" label="PPG" metric="ppg" active={sortField === "ppg"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="Opp PPG" metric="opp_ppg" active={sortField === "opp_ppg"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="Net Diff" metric="net_margin" active={sortField === "net_margin"} direction={sortDirection} onSort={handleSort} />
                          <th className="num">FG%</th>
                          <th className="num">Opp FG%</th>
                          <th className="num">3P%</th>
                          <th className="num">FT%</th>
                          <th className="num">eFG%</th>
                        </>
                      )}

                      {/* Offensive Four Factors Columns */}
                      {tablePreset === "four_factors_off" && (
                        <>
                          <SortHeader className="num" label="ORTG" metric="off_rating" active={sortField === "off_rating"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="Pace" metric="pace" active={sortField === "pace"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="eFG% (40%)" metric="efg_pct" active={sortField === "efg_pct"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="TOV% (25%)" metric="tov_pct" active={sortField === "tov_pct"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="ORB% (20%)" metric="oreb_pct" active={sortField === "oreb_pct"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="FTR (15%)" metric="ftr" active={sortField === "ftr"} direction={sortDirection} onSort={handleSort} />
                        </>
                      )}

                      {/* Defensive Four Factors Columns */}
                      {tablePreset === "four_factors_def" && (
                        <>
                          <SortHeader className="num" label="DRTG" metric="def_rating" active={sortField === "def_rating"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="Opp eFG%" metric="opp_efg_pct" active={sortField === "opp_efg_pct"} direction={sortDirection} onSort={handleSort} />
                          <th className="num">Opp TOV%</th>
                          <th className="num">Opp ORB%</th>
                          <th className="num">Opp FTR</th>
                        </>
                      )}

                      {/* All Ratings & Factors Columns */}
                      {tablePreset === "all_ratings" && (
                        <>
                          <SortHeader className="num" label="ORTG" metric="off_rating" active={sortField === "off_rating"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="DRTG" metric="def_rating" active={sortField === "def_rating"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="Net" metric="net_rating" active={sortField === "net_rating"} direction={sortDirection} onSort={handleSort} />
                          <SortHeader className="num" label="Pace" metric="pace" active={sortField === "pace"} direction={sortDirection} onSort={handleSort} />
                          <th className="num">Off eFG%</th>
                          <th className="num">Def eFG%</th>
                          <th className="num">Off TOV%</th>
                          <th className="num">Off ORB%</th>
                          <th className="num">Off FTR</th>
                        </>
                      )}

                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.teams.map((t, idx) => {
                      const ppg = t.production?.pts_per_game ?? null;
                      const oppPpg = t.allowance?.pts_allowed_per_game ?? null;
                      const netDiff = ppg !== null && oppPpg !== null ? (ppg - oppPpg).toFixed(1) : "—";
                      const netNum = ppg !== null && oppPpg !== null ? ppg - oppPpg : 0;
                      const netRating = t.ratings?.net_rating ?? null;

                      return (
                        <tr key={t.team_id}>
                          <td className="font-mono text-muted text-xs">{idx + 1}</td>
                          <td>
                            <div className="team-cell-identity">
                              <TeamLogo team={t.tricode} size={32} />
                              <Link
                                href={`/teams/${t.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                                className="font-semibold text-accent"
                              >
                                {t.name}
                              </Link>
                              {t.division && (
                                <span className="text-muted text-xs team-cell-division">
                                  ({t.division})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="num font-mono">
                            {t.wins}-{t.losses}
                          </td>
                          <td className="num font-mono font-semibold">
                            {t.win_pct !== null ? t.win_pct.toFixed(3) : "—"}
                          </td>

                          {/* Overview mode row data */}
                          {tablePreset === "overview" && (
                            <>
                              <td className="num font-mono">{ppg !== null ? ppg.toFixed(1) : "—"}</td>
                              <td className="num font-mono">{oppPpg !== null ? oppPpg.toFixed(1) : "—"}</td>
                              <td
                                className={`num font-mono font-semibold ${
                                  netNum > 0 ? "text-positive" : netNum < 0 ? "text-negative" : ""
                                }`}
                              >
                                {netNum > 0 ? `+${netDiff}` : netDiff}
                              </td>
                              <td className="num font-mono">
                                {t.production?.fg_pct != null ? `${(t.production.fg_pct * 100).toFixed(1)}%` : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.allowance?.fg_pct_allowed != null
                                  ? `${(t.allowance.fg_pct_allowed * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.production?.fg3_pct != null ? `${(t.production.fg3_pct * 100).toFixed(1)}%` : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.production?.ft_pct != null ? `${(t.production.ft_pct * 100).toFixed(1)}%` : "—"}
                              </td>
                              <td className="num font-mono font-semibold">
                                {t.production?.efg_pct != null ? `${(t.production.efg_pct * 100).toFixed(1)}%` : "—"}
                              </td>
                            </>
                          )}

                          {/* Four Factors Offense row data */}
                          {tablePreset === "four_factors_off" && (
                            <>
                              <td className="num font-mono font-bold text-accent">
                                {t.ratings?.off_rating?.toFixed(1) ?? "—"}
                              </td>
                              <td className="num font-mono">{t.ratings?.pace?.toFixed(1) ?? "—"}</td>
                              <td className="num font-mono font-semibold">
                                {t.four_factors?.efg_pct != null
                                  ? `${(t.four_factors.efg_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.tov_pct != null
                                  ? `${(t.four_factors.tov_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.oreb_pct != null
                                  ? `${(t.four_factors.oreb_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.ftr != null ? t.four_factors.ftr.toFixed(3) : "—"}
                              </td>
                            </>
                          )}

                          {/* Four Factors Defense row data */}
                          {tablePreset === "four_factors_def" && (
                            <>
                              <td className="num font-mono font-bold">
                                {t.ratings?.def_rating?.toFixed(1) ?? "—"}
                              </td>
                              <td className="num font-mono font-semibold">
                                {t.four_factors?.opp_efg_pct != null
                                  ? `${(t.four_factors.opp_efg_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.opp_tov_pct != null
                                  ? `${(t.four_factors.opp_tov_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.opp_oreb_pct != null
                                  ? `${(t.four_factors.opp_oreb_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.opp_ftr != null ? t.four_factors.opp_ftr.toFixed(3) : "—"}
                              </td>
                            </>
                          )}

                          {/* All Ratings & Factors row data */}
                          {tablePreset === "all_ratings" && (
                            <>
                              <td className="num font-mono text-accent">
                                {t.ratings?.off_rating?.toFixed(1) ?? "—"}
                              </td>
                              <td className="num font-mono">
                                {t.ratings?.def_rating?.toFixed(1) ?? "—"}
                              </td>
                              <td
                                className={`num font-mono font-bold ${
                                  (netRating ?? 0) > 0 ? "text-positive" : (netRating ?? 0) < 0 ? "text-negative" : ""
                                }`}
                              >
                                {netRating != null ? (netRating > 0 ? `+${netRating.toFixed(1)}` : netRating.toFixed(1)) : "—"}
                              </td>
                              <td className="num font-mono">{t.ratings?.pace?.toFixed(1) ?? "—"}</td>
                              <td className="num font-mono">
                                {t.four_factors?.efg_pct != null
                                  ? `${(t.four_factors.efg_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.opp_efg_pct != null
                                  ? `${(t.four_factors.opp_efg_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.tov_pct != null
                                  ? `${(t.four_factors.tov_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.oreb_pct != null
                                  ? `${(t.four_factors.oreb_pct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="num font-mono">
                                {t.four_factors?.ftr != null ? t.four_factors.ftr.toFixed(3) : "—"}
                              </td>
                            </>
                          )}

                          {/* Actions */}
                          <td className="text-right whitespace-nowrap">
                            <div className="table-actions-group">
                              <Link
                                href={`/team-compare?teamA=${t.team_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                                className="button button-small"
                                title={`Compare ${t.name}`}
                              >
                                Compare
                              </Link>
                              <Link
                                href={`/teams/${t.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                                className="button button-small button-primary"
                              >
                                Profile →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 2: CARDS GRID VIEW */}
      {viewMode === "cards" && (
        <div className="team-explorer-stack">
          {groupedData.map((group) => (
            <div key={group.groupName}>
              <h2 className="team-group-header">
                <span>{group.groupName}</span>
                <span className="badge font-mono text-xs">{group.teams.length} franchises</span>
              </h2>

              <div className="team-cards-grid">
                {group.teams.map((t) => {
                  const netRating = t.ratings?.net_rating ?? null;
                  return (
                    <div
                      key={t.team_id}
                      className="panel team-card-panel"
                    >
                      <div className="team-card-header">
                        <div>
                          <TeamLogo team={t.tricode} size={32} />
                          <h3 className="team-card-title">
                            <Link
                              href={`/teams/${t.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                              className="text-foreground hover:text-accent"
                            >
                              {t.name}
                            </Link>
                          </h3>
                          <span className="text-xs text-muted font-mono">
                            {t.conference} · {t.division}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-lg">
                            {t.wins}-{t.losses}
                          </span>
                          <div className="text-xs text-muted font-mono">
                            {t.win_pct != null ? t.win_pct.toFixed(3) : "—"}
                          </div>
                        </div>
                      </div>

                      {/* Ratings summary */}
                      <div className="team-card-ratings">
                        <div>
                          <div className="text-xs text-muted">ORTG</div>
                          <div className="font-mono font-semibold text-accent">
                            {t.ratings?.off_rating?.toFixed(1) ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">DRTG</div>
                          <div className="font-mono font-semibold">
                            {t.ratings?.def_rating?.toFixed(1) ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">NET</div>
                          <div
                            className={`font-mono font-bold ${
                              (netRating ?? 0) > 0 ? "text-positive" : (netRating ?? 0) < 0 ? "text-negative" : ""
                            }`}
                          >
                            {netRating != null ? (netRating > 0 ? `+${netRating.toFixed(1)}` : netRating.toFixed(1)) : "—"}
                          </div>
                        </div>
                      </div>

                      {/* Four Factors Snapshot */}
                      <div className="team-card-factors">
                        <div className="team-card-factor-row">
                          <span className="text-muted">eFG% (Off / Def):</span>
                          <span className="font-mono">
                            {t.four_factors?.efg_pct != null ? `${(t.four_factors.efg_pct * 100).toFixed(1)}%` : "—"} /{" "}
                            {t.four_factors?.opp_efg_pct != null ? `${(t.four_factors.opp_efg_pct * 100).toFixed(1)}%` : "—"}
                          </span>
                        </div>
                        <div className="team-card-factor-row">
                          <span className="text-muted">Turnover Ratio:</span>
                          <span className="font-mono">
                            {t.four_factors?.tov_pct != null ? `${(t.four_factors.tov_pct * 100).toFixed(1)}%` : "—"}
                          </span>
                        </div>
                        <div className="team-card-factor-row">
                          <span className="text-muted">Off Rebound %:</span>
                          <span className="font-mono">
                            {t.four_factors?.oreb_pct != null ? `${(t.four_factors.oreb_pct * 100).toFixed(1)}%` : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Card buttons */}
                      <div className="team-card-actions">
                        <Link
                          href={`/team-compare?teamA=${t.team_id}&season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                          className="button button-small team-card-button"
                        >
                          Compare
                        </Link>
                        <Link
                          href={`/teams/${t.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                          className="button button-small button-primary team-card-button"
                        >
                          Profile →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 3: PACE & EFFICIENCY SCATTER PLOT */}
      {viewMode === "scatter" && (
        <div className="panel team-scatter-panel">
          <div className="team-scatter-header">
            <h2 className="team-scatter-title">
              Pace & Efficiency Distribution ({season} {phase.replace("_", " ")})
            </h2>
            <p className="text-muted text-xs team-scatter-subtitle">
              X-axis shows Offensive Rating (points scored per 100 possessions); Y-axis shows Defensive Rating (points allowed per 100 possessions, inverted so up is better defense). Circle size corresponds to estimated Pace.
            </p>
          </div>

          <div className="team-scatter-chart-wrap">
            {/* SVG Plot */}
            <svg
              viewBox="0 0 600 450"
              className="team-scatter-svg"
              aria-label="Pace vs Efficiency Scatter Plot"
            >
              {/* Axes lines */}
              <line x1="60" y1="400" x2="570" y2="400" stroke="var(--color-hairline-strong)" strokeWidth="1.5" />
              <line x1="60" y1="30" x2="60" y2="400" stroke="var(--color-hairline-strong)" strokeWidth="1.5" />

              {/* Gridlines */}
              {[110, 115, 120].map((val) => {
                const normX = ((val - scatterBounds.minX) / (scatterBounds.maxX - scatterBounds.minX)) * 510 + 60;
                return (
                  <g key={`grid-x-${val}`}>
                    <line x1={normX} y1="30" x2={normX} y2="400" stroke="var(--color-hairline)" strokeDasharray="3 3" />
                    <text x={normX} y="418" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="10" fontFamily="var(--font-mono)">
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Inverted Y-axis ticks (Lower DRTG is higher on screen) */}
              {[110, 115, 120].map((val) => {
                // Inverted: min DRTG (best defense) at top (y=30), max DRTG at bottom (y=400)
                const normY = ((val - scatterBounds.minY) / (scatterBounds.maxY - scatterBounds.minY)) * 370 + 30;
                return (
                  <g key={`grid-y-${val}`}>
                    <line x1="60" y1={normY} x2="570" y2={normY} stroke="var(--color-hairline)" strokeDasharray="3 3" />
                    <text x="50" y={normY + 3} textAnchor="end" fill="var(--color-text-secondary)" fontSize="10" fontFamily="var(--font-mono)">
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Labels */}
              <text x="315" y="438" textAnchor="middle" fill="var(--color-text)" fontSize="11" fontWeight="600">
                Offensive Rating (Points Scored / 100 Poss) →
              </text>
              <text
                x="-215"
                y="20"
                textAnchor="middle"
                transform="rotate(-90)"
                fill="var(--color-text)"
                fontSize="11"
                fontWeight="600"
              >
                ← Defensive Rating (Lower/Better Allowed / 100 Poss)
              </text>

              {/* Quadrant hints */}
              <text x="550" y="50" textAnchor="end" fill="var(--color-text-secondary)" fontSize="9" opacity="0.6">
                Elite (Top Right)
              </text>
              <text x="80" y="380" textAnchor="start" fill="var(--color-text-secondary)" fontSize="9" opacity="0.6">
                Rebuilding (Bottom Left)
              </text>

              {/* Team Data Points */}
              {initialTeams.map((t) => {
                const off = t.ratings?.off_rating;
                const def = t.ratings?.def_rating;
                const pace = t.ratings?.pace ?? 98;
                if (off == null || def == null) return null;

                const cx = ((off - scatterBounds.minX) / (scatterBounds.maxX - scatterBounds.minX)) * 510 + 60;
                // Invert Y: lower def rating is placed closer to y=30
                const cy = ((def - scatterBounds.minY) / (scatterBounds.maxY - scatterBounds.minY)) * 370 + 30;
                const r = Math.max(5, Math.min(12, ((pace - 94) / 10) * 8 + 5));
                const isEast = t.conference === "Eastern";
                const isHovered = hoveredTeam?.team_id === t.team_id;

                return (
                  <g
                    key={t.team_id}
                    onMouseEnter={() => setHoveredTeam(t)}
                    onMouseLeave={() => setHoveredTeam(null)}
                    className="team-scatter-point"
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? r + 3 : r}
                      fill={isEast ? "var(--color-accent)" : "var(--color-positive)"}
                      opacity={isHovered ? 1 : 0.8}
                      stroke="var(--background)"
                      strokeWidth="1.5"
                    />
                    <text
                      x={cx}
                      y={cy - r - 3}
                      textAnchor="middle"
                      fill={isHovered ? "var(--color-text)" : "var(--color-text-secondary)"}
                      fontSize={isHovered ? "11" : "9"}
                      fontWeight={isHovered ? "bold" : "normal"}
                      fontFamily="var(--font-mono)"
                    >
                      {t.tricode}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Card */}
            {hoveredTeam && (
              <div className="team-scatter-tooltip">
                <div className="team-scatter-tooltip-header">
                  <strong className="text-accent">{hoveredTeam.name}</strong>
                  <span className="font-mono text-xs">{hoveredTeam.wins}-{hoveredTeam.losses}</span>
                </div>
                <div className="font-mono text-xs text-muted team-scatter-tooltip-conf">
                  {hoveredTeam.conference} Conference
                </div>
                <div className="team-scatter-tooltip-grid">
                  <div>ORTG: <strong>{hoveredTeam.ratings?.off_rating?.toFixed(1) ?? "—"}</strong></div>
                  <div>DRTG: <strong>{hoveredTeam.ratings?.def_rating?.toFixed(1) ?? "—"}</strong></div>
                  <div>NET: <strong>{hoveredTeam.ratings?.net_rating?.toFixed(1) ?? "—"}</strong></div>
                  <div>Pace: <strong>{hoveredTeam.ratings?.pace?.toFixed(1) ?? "—"}</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
