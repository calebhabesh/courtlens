"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ContextBar } from "./context-bar";
import { PageHeader } from "./ui/panel";
import { Field } from "./ui/field";
import { Select } from "./ui/select";
import { Input } from "./ui/input";
import { SegmentedControl } from "./ui/segmented-control";
import { GatedNote } from "./ui/gated-note";
import { buildPreservedContextUrl } from "@/lib/query-url";
import Link from "next/link";
import { TeamStatisticsTable } from "./team-statistics-table";
import { TablePercentileLegend } from "./table-percentile-legend";
import { RankedBars } from "./charts";
import { StatTile } from "./ui/stat-tile";
import { TeamLogo } from "./team-logo";
import type { TeamResearchItem, WorkbenchCatalog } from "@/lib/types";

export type ExplorerViewMode = "table" | "cards" | "scatter";
export type TablePreset = "overview" | "four_factors_off" | "four_factors_def" | "all_ratings";
export type GroupingMode = "all" | "conference" | "division";

interface TeamExplorerViewProps {
  initialTeams: TeamResearchItem[];
  catalog?: WorkbenchCatalog;
  releaseId?: string;
  season: string;
  phase: string;
  beforeDate: string;
  orderNotice?: string;
  leagueAverages?: Record<string, number> | null;
}

export function TeamExplorerView({
  initialTeams, catalog, releaseId,
  season,
  phase,
  beforeDate,
  orderNotice,
  leagueAverages,
}: TeamExplorerViewProps) {
  const params = useSearchParams();
  const [viewMode, setViewMode] = useState<ExplorerViewMode>(() => params.get("view") === "cards" ? "cards" : params.get("view") === "scatter" ? "scatter" : "table");
  const [tablePreset, setTablePreset] = useState<TablePreset>(() => ["four_factors_off", "four_factors_def", "all_ratings"].includes(params.get("metrics") ?? "") ? params.get("metrics") as TablePreset : "overview");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>(() => params.get("group") === "conference" ? "conference" : params.get("group") === "division" ? "division" : "all");
  const [searchQuery, setSearchQuery] = useState(params.get("search") ?? "");
  const [sortField, setSortField] = useState<string>(params.get("sort") ?? "win_pct");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(params.get("direction") === "asc" ? "asc" : "desc");
  const [previousUrl,setPreviousUrl] = useState(params.toString());
  if(previousUrl !== params.toString()) {
    setPreviousUrl(params.toString());
    setViewMode(params.get("view") === "cards" ? "cards" : params.get("view") === "scatter" ? "scatter" : "table");
    setGroupingMode(params.get("group") === "conference" ? "conference" : params.get("group") === "division" ? "division" : "all");
    setTablePreset(["four_factors_off", "four_factors_def", "all_ratings"].includes(params.get("metrics") ?? "") ? params.get("metrics") as TablePreset : "overview");
    setSearchQuery(params.get("search") ?? "");setSortField(params.get("sort") ?? "win_pct");setSortDirection(params.get("direction") === "asc" ? "asc" : "desc");
  }
  function preference(key: string, value: string) {
    const next = new URLSearchParams(window.location.search); next.set(key, value);
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }
  const context = new URLSearchParams({ season, phase, beforeDate, ...(releaseId ? { releaseId } : {}) });
  const link = (path: string) => buildPreservedContextUrl(path, context);
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
          valA = a.win_pct ?? null;
          valB = b.win_pct ?? null;
          break;
        case "wins":
          valA = a.wins;
          valB = b.wins;
          break;
        case "ppg":
          valA = a.production?.pts_per_game ?? null;
          valB = b.production?.pts_per_game ?? null;
          break;
        case "opp_ppg":
          valA = a.allowance?.pts_allowed_per_game ?? null;
          valB = b.allowance?.pts_allowed_per_game ?? null;
          break;
        case "net_margin":
          valA = a.production?.pts_per_game != null && a.allowance?.pts_allowed_per_game != null ? a.production.pts_per_game - a.allowance.pts_allowed_per_game : null;
          valB = b.production?.pts_per_game != null && b.allowance?.pts_allowed_per_game != null ? b.production.pts_per_game - b.allowance.pts_allowed_per_game : null;
          break;
        case "off_rating":
          valA = a.ratings?.off_rating ?? null;
          valB = b.ratings?.off_rating ?? null;
          break;
        case "def_rating":
          valA = a.ratings?.def_rating ?? null;
          valB = b.ratings?.def_rating ?? null;
          break;
        case "net_rating":
          valA = a.ratings?.net_rating ?? null;
          valB = b.ratings?.net_rating ?? null;
          break;
        case "pace":
          valA = a.ratings?.pace ?? null;
          valB = b.ratings?.pace ?? null;
          break;
        case "efg_pct":
          valA = a.four_factors?.efg_pct ?? null;
          valB = b.four_factors?.efg_pct ?? null;
          break;
        case "tov_pct":
          valA = a.four_factors?.tov_pct ?? null;
          valB = b.four_factors?.tov_pct ?? null;
          break;
        case "oreb_pct":
          valA = a.four_factors?.oreb_pct ?? null;
          valB = b.four_factors?.oreb_pct ?? null;
          break;
        case "ftr":
          valA = a.four_factors?.ftr ?? null;
          valB = b.four_factors?.ftr ?? null;
          break;
        case "opp_efg_pct":
          valA = a.four_factors?.opp_efg_pct ?? null;
          valB = b.four_factors?.opp_efg_pct ?? null;
          break;
        default:
          valA = a.win_pct ?? null;
          valB = b.win_pct ?? null;
      }

      if (valA === null) return valB === null ? a.name.localeCompare(b.name) : 1;
      if (valB === null) return -1;
      if (valA === valB) {
        // Tiebreak by net margin then team name
        const netA = a.production?.pts_per_game != null && a.allowance?.pts_allowed_per_game != null ? a.production.pts_per_game - a.allowance.pts_allowed_per_game : null;
        const netB = b.production?.pts_per_game != null && b.allowance?.pts_allowed_per_game != null ? b.production.pts_per_game - b.allowance.pts_allowed_per_game : null;
        return (netA == null ? netB == null ? 0 : 1 : netB == null ? -1 : netB - netA) || a.name.localeCompare(b.name);
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "desc" ? valB - valA : valA - valB;
      }
      return 0;
    });
  }, [sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      const next = sortDirection === "desc" ? "asc" : "desc"; setSortDirection(next); preference("direction", next);
    } else {
      setSortField(field); preference("sort", field);
      // For defensive stats where lower is better, default to asc
      if (field === "def_rating" || field === "opp_ppg" || field === "tov_pct" || field === "opp_efg_pct") {
        setSortDirection("asc"); preference("direction", "asc");
      } else {
        setSortDirection("desc"); preference("direction", "desc");
      }
    }
  };

  // Grouped structure
  const groupedData = useMemo(() => {
    if (groupingMode === "all") {
      return [{ groupName: "All Teams", teams: sortTeams(filteredTeams) }];
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
      <PageHeader title="Team Stats & Cohorts" subtitle="Standings, scoring and Four Factors." actions={<Link href={link("/team-compare")} className="button">Compare Teams</Link>} />
      <ContextBar catalog={catalog} initialReleaseId={releaseId} initialSeason={season} initialPhase={phase} initialBeforeDate={beforeDate}
        detailRows={leagueAverages ? [{label:"League averages",value:Object.entries(leagueAverages).map(([key,value]) => `${key}: ${value}`).join(" · ")}] : []} showWindow={false} sampleNoun="teams" sampleSize={filteredTeams.length}
        filters={<>
          <Field label="Find" layout="inline"><Input type="search" aria-label="Search franchises" placeholder="Team or division" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); preference("search", e.target.value); }} /></Field>
          <Field label="Group" layout="inline"><Select aria-label="Group teams" value={groupingMode} onChange={e => {setGroupingMode(e.target.value as GroupingMode); preference("group", e.target.value);}}><option value="all">League</option><option value="conference">Conference</option><option value="division">Division</option></Select></Field>
          {viewMode === "table" && <Field label="Metrics" layout="inline"><Select aria-label="Team metric set" value={tablePreset} onChange={e => {setTablePreset(e.target.value as TablePreset); preference("metrics", e.target.value);}}><option value="overview">Standings & Scoring</option><option value="four_factors_off">Offensive Four Factors</option><option value="four_factors_def">Defensive Four Factors</option><option value="all_ratings">Ratings & Factors</option></Select></Field>}
        </>}
        modes={<SegmentedControl name="Team view" value={viewMode} onChange={value => {setViewMode(value); preference("view", value);}} options={[{value:"table",label:"Table"},{value:"cards",label:"Cards"},{value:"scatter",label:"Efficiency Plot"}]} />}
      />
      <section className="pc12-headline" aria-label="Headline result">
        <RankedBars title="Net rating leaders" source="CourtLens admitted team box scores · estimated possessions"
          sample={`${filteredTeams.length} teams · ${season} · ${phase.replaceAll("_", " ")}`} measure="points per 100 estimated possessions" tone="identity-b"
          note="Blue bars show net rating; the zero line separates scoring from allowance. Descriptive estimates, not a forecast."
          items={[...filteredTeams].filter(t => t.ratings?.net_rating != null).sort((a, b) => b.ratings!.net_rating! - a.ratings!.net_rating! || a.name.localeCompare(b.name)).slice(0, 5).map(t => ({
            key: t.team_id, name: t.name, label: <Link className="pc12-ranked-identity" href={link(`/teams/${t.team_id}`)}><TeamLogo team={t.team_id} size={20} />{t.name}</Link>,
            value: t.ratings!.net_rating!, formatted: `${t.ratings!.net_rating! > 0 ? "+" : ""}${t.ratings!.net_rating!.toFixed(1)}`,
            detail: `${t.games_played} games`,
          }))} />
      </section>
      <div className="pc12-kpis">
        <StatTile label="Teams in view" value={filteredTeams.length} />
        <StatTile label="League offense" value={leagueAverages?.off_rating?.toFixed(1)} footnote="Points per 100 estimated possessions" />
        <StatTile label="Teams without net rating" value={filteredTeams.filter(t => t.ratings?.net_rating == null).length} footnote="Unknown values are excluded from the chart" />
      </div>
      <GatedNote why={orderNotice || "Ties in record ordering do not establish official conference placement. Standings are presented by win percentage without tiebreaker resolution."}>Record order is descriptive; ties have no official placement.</GatedNote>
      {!filteredTeams.length && <GatedNote action={<button className="button" onClick={() => {setSearchQuery(""); preference("search", "");}}>Clear search</button>}>No teams match this search.</GatedNote>}
      {/* VIEW 1: TABLE VIEW */}
      {viewMode === "table" && (
        <div className="team-explorer-stack">
          <TablePercentileLegend teams />
          {groupedData.map((group) => (
            <div key={group.groupName} className="panel">
              <div className="panel-header team-explorer-panel-header">
                <h2 className="team-explorer-panel-title">
                  {group.groupName}
                </h2>
                <span className="badge font-mono text-xs">{group.teams.length} teams</span>
              </div>

              <div className="table-wrapper research-table-scroll" role="region" aria-label="Team statistics scroll area" tabIndex={0}>
                <TeamStatisticsTable teams={group.teams} name={group.groupName} preset={tablePreset}
                  sortField={sortField} sortDirection={sortDirection} onSort={handleSort} link={link} />
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
                              href={link(`/teams/${t.team_id}`)}
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
                          href={link(`/team-compare?teamA=${t.team_id}`)}
                          className="button button-small team-card-button"
                        >
                          Compare
                        </Link>
                        <Link
                          href={link(`/teams/${t.team_id}`)}
                          className="button button-small button-primary team-card-button"
                        >
                          Profile
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
            <GatedNote why="Lower defensive rating is placed higher; offensive rating increases to the right. Conference colors are descriptive. A known Pace sets bubble size; unknown Pace uses a fixed small marker. Focus a team for details and press Enter for its profile.">Offense and allowance per 100 estimated possessions.</GatedNote>
          </div>

          <div className="team-scatter-chart-wrap">
            <ul className="chart-legend chart-legend-inline">
              <li><span className="chart-key chart-key-a" aria-hidden="true" />Eastern conference</li>
              <li><span className="chart-key chart-key-b" aria-hidden="true" />Western conference</li>
            </ul>
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
                {/* eslint-disable-next-line no-restricted-syntax -- axis direction in SVG text, not an icon (D26) */}
                {"Offensive Rating (Points Scored / 100 Poss) →"}
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
                {/* eslint-disable-next-line no-restricted-syntax -- axis direction in SVG text, not an icon (D26) */}
                {"← Defensive Rating (Lower/Better Allowed / 100 Poss)"}
              </text>

              {/* Quadrant hints */}
              <text x="550" y="50" textAnchor="end" fill="var(--color-text-secondary)" fontSize="9" opacity="0.6">
                Higher offense / lower allowance
              </text>
              <text x="80" y="380" textAnchor="start" fill="var(--color-text-secondary)" fontSize="9" opacity="0.6">
                Lower offense / higher allowance
              </text>

              {/* Team Data Points */}
              {filteredTeams.map((t) => {
                const off = t.ratings?.off_rating;
                const def = t.ratings?.def_rating;
                const pace = t.ratings?.pace;
                if (off == null || def == null) return null;

                const cx = ((off - scatterBounds.minX) / (scatterBounds.maxX - scatterBounds.minX)) * 510 + 60;
                // Invert Y: lower def rating is placed closer to y=30
                const cy = ((def - scatterBounds.minY) / (scatterBounds.maxY - scatterBounds.minY)) * 370 + 30;
                const r = pace == null ? 5 : Math.max(5, Math.min(12, ((pace - 94) / 10) * 8 + 5));
                const isEast = t.conference === "Eastern";
                const isHovered = hoveredTeam?.team_id === t.team_id;

                return (
                  <a
                    key={t.team_id}
                    href={link(`/teams/${t.team_id}`)}
                    aria-label={`${t.name}: offensive rating ${off}, defensive rating ${def}, pace ${pace ?? "unknown"}`}
                    onFocus={() => setHoveredTeam(t)}
                    onBlur={() => setHoveredTeam(null)}
                    onMouseEnter={() => setHoveredTeam(t)}
                    onMouseLeave={() => setHoveredTeam(null)}
                    className="team-scatter-point"
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? r + 3 : r}
                      fill={isEast ? "var(--color-category-1)" : "var(--color-category-2)"}
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
                  </a>
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
