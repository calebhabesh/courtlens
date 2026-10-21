"use client";

import "./stats-explorer.css";
import "./player-career.css";
import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PercentileCell } from "./charts/percentile-cell";
import { TeamLogo, TeamLogoStack } from "./team-logo";
import { Icon } from "./ui/icon";
import { Badge } from "./ui/badge";
import { IconButton, Segmented } from "./ui/kit";
import { applyScopeChange } from "@/lib/scope-url";
import { normalizedColumn } from "@/lib/stats-query";
import {
  ORDERED_COUNTING_MODES,
  ORDERED_PRESETS,
  formatColumnValue,
  tableGroups,
  type CountingMode,
  type PresetId
} from "@/lib/stats-presets";
import { getPlayerCareer } from "@/lib/workbench-api";
import { getTeamStints, useTeamStints } from "@/lib/team-stints";
import { seasonAwardChips } from "@/lib/awards";
import type { MetricHint } from "@/lib/stats-glossary";
import { StatsTrendDialog, type TrendTarget } from "./stats-trend-dialog";
import type { PlayerCareerResponse, PlayerResearchItem, QuerySpec, WorkbenchCatalog } from "@/lib/types";

const PHASES = [{ id: "regular_season", label: "Regular" }, { id: "playoffs", label: "Playoffs" }] as const;

/**
 * Databallr's career view inside the player page: the Stats table with one row per season the
 * player appeared in (newest first), each percentile ranked against that season's Stats cohort,
 * and a Career row aggregated over the same seasons. Season-only metrics (DPM, tracking,
 * impact) have no career value, so that row leaves them blank.
 *
 * Every row arrives in one read of stored season cohorts (usually with the page) and carries
 * every column, so views and counting modes switch without another request.
 */
export function PlayerCareerTable({ playerId, catalog, season, phase, firstCoveredSeason, draftYear, initialCareer = null, awards = null, trendQuery = null, hints = {}, onPhaseChange, onSeasonOpen }: {
  playerId: string;
  catalog: WorkbenchCatalog;
  season: string;
  phase: string;
  /** The earliest season in CourtLens data, for the "Career since" label. */
  firstCoveredSeason: string | null;
  draftYear: number | null;
  /** Rows read with the page; when absent or for another scope, the table reads them itself. */
  initialCareer?: PlayerCareerResponse | null;
  /** Basketball-Reference season awards and All-Star seasons (regular-season table only). */
  awards?: { bySeason: Record<string, string[]>; allStarSeasons: string[]; source: string } | null;
  /** The page's Stats query: season cells open the Stats trend dialog with it, as on Stats. */
  trendQuery?: QuerySpec | null;
  hints?: Record<string, MetricHint>;
  /** Inside a dialog (Showcase): phase and season picks call these instead of changing the page URL. */
  onPhaseChange?: (phase: string) => void;
  onSeasonOpen?: (season: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [presetId, setPresetId] = useState<PresetId>("overview");
  const [countingMode, setCountingMode] = useState<CountingMode>("per_game");
  const [trendTarget, setTrendTarget] = useState<TrendTarget | null>(null);
  const { expanded, toggle } = useTeamStints();

  const preset = useMemo(() => {
    const base = ORDERED_PRESETS.find(p => p.id === presetId) ?? ORDERED_PRESETS[0];
    const columns = base.columns.map(column => normalizedColumn(column, countingMode));
    return { ...base, columns: columns.filter((column, index) => columns.findIndex(c => c.key === column.key) === index) };
  }, [presetId, countingMode]);
  const groups = useMemo(() => tableGroups(preset), [preset]);
  // A hairline opens each column group after the first (Profile | Impact | Counting …).
  const groupStarts = useMemo(() => new Set(groups.slice(1).map(group => group.start)), [groups]);
  const divider = (index: number) => groupStarts.has(index) ? "group-start" : "";
  // Awards are regular-season honours: the column shows on that phase when any season has one.
  const awardColumn = phase === "regular_season" && Boolean(awards && Object.keys(awards.bySeason).length);
  const span = preset.columns.length + 1 + (awardColumn ? 1 : 0);
  const requestKey = `${playerId}|${phase}|${catalog.release_id}`;
  const serverRows = initialCareer?.player_id === playerId && initialCareer.phase === phase
    && initialCareer.release_id === catalog.release_id ? initialCareer : null;
  // undefined while loading; null when the read failed.
  const [fetched, setFetched] = useState<{ key: string; data: PlayerCareerResponse | null } | null>(null);
  const needsFetch = serverRows === null;

  useEffect(() => {
    if (!needsFetch) return;
    let active = true;
    getPlayerCareer(playerId, { phase, releaseId: catalog.release_id })
      .then(data => { if (active) setFetched({ key: requestKey, data }); })
      .catch(() => { if (active) setFetched({ key: requestKey, data: null }); });
    return () => { active = false; };
    // requestKey covers every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, needsFetch]);

  const career = serverRows ?? (fetched?.key === requestKey ? fetched.data : undefined);
  const seasons = career === undefined ? null : career?.seasons.map(entry => entry.season) ?? [];
  const rows = useMemo(() => new Map((career?.seasons ?? []).map(entry => [entry.season, entry.item])), [career]);
  // Seasons per team, in the order the player first played for each (oldest first).
  const teamSeasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of [...(career?.seasons ?? [])].reverse()) {
      for (const team of new Set(entry.item?.teams ?? [])) counts.set(team, (counts.get(team) ?? 0) + 1);
    }
    return [...counts];
  }, [career]);
  const careerSince = Boolean(seasons?.length && firstCoveredSeason && seasons.at(-1) === firstCoveredSeason
    && (draftYear == null || draftYear < Number(firstCoveredSeason.slice(0, 4))));

  const scopeHref = (key: "season" | "phase", value: string) => {
    const params = applyScopeChange(searchParams?.toString() ?? "", key, value,
      { catalog, season, phase, releaseId: catalog.release_id });
    return `${pathname}?${params}`;
  };
  const openSeason = (value: string) => onSeasonOpen ? onSeasonOpen(value) : router.push(scopeHref("season", value), { scroll: false });

  // A split season opens one full row per team: the season's whole-season Stats scope with a
  // team filter, ranked against that season's league reference like the season row.
  const stintKey = (value: string) => `${requestKey}|${value}`;
  const toggleStints = (value: string, teams: string[]) => toggle(stintKey(value), () => getTeamStints({
    release_id: catalog.release_id, season: value, phase, window: { kind: "season" },
    before_date: catalog.stats_scopes?.find(scope => scope.season === value && scope.phase === phase)?.default_before_date ?? null
  }, playerId, teams, catalog.impact?.manifest_sha256));
  // Seasons stagger in when they first arrive; a view, counting mode or phase change settles the
  // body in place (DL Table / Loading).
  const bodySignature = [seasons?.join() ?? "loading", presetId, countingMode, phase].join("|");
  const rowsShown = Boolean(seasons?.length);
  const [bodyMotion, setBodyMotion] = useState({ signature: bodySignature, version: 0, first: rowsShown ? bodySignature : null });
  if (bodyMotion.signature !== bodySignature) {
    setBodyMotion({ signature: bodySignature, version: bodyMotion.version + 1, first: bodyMotion.first ?? (rowsShown ? bodySignature : null) });
  }
  const bodyMotionClass = !rowsShown ? "" : (bodyMotion.first ?? bodySignature) === bodySignature ? "motion-stagger"
    : bodyMotion.version % 2 ? "motion-settle-a" : "motion-settle-b";
  // Any split season widens the Year column for the logo group and the expand arrow.
  const hasSplits = Boolean(career?.seasons.some(entry => (entry.item?.teams?.length ?? 0) > 1));

  /** A season, team (split-season) or Career row cell; only season cells open the trend dialog. */
  const cell = (item: PlayerResearchItem | null, index: number, kind: "season" | "team" | "career" = "season") => {
    const career = kind === "career";
    const column = preset.columns[index];
    const value = item ? item.metrics[column.key] ?? (column.key === "gp" ? item.games_played : column.key === "min" ? item.total_minutes : null) : null;
    const group = groups.findIndex(g => index >= g.start && index < g.start + g.colSpan) % 2;
    const formatted = item && value != null ? formatColumnValue(column, item) : null;
    const shown = <PercentileCell variant="text" showPercentile={!career} value={formatted}
      percentile={career ? null : item?.table_percentiles?.[column.key] ?? null}
      qualified={item?.table_qualified === true && item?.impact_support?.[column.key]?.qualified !== false}
      label={column.label} cohort={`${item?.table_cohort_sample_sizes?.[column.key] ?? "Unknown"} valid league players that season`} />;
    return <td key={column.key} data-column={column.key} className={`stats-metric-cell stats-group-${group} ${column.num ? "num" : ""} ${divider(index)}`}>
      {/* Season cells open the Stats trend dialog for that stat, as on Stats; the Career row does not. */}
      {kind === "season" && item && trendQuery ? <button type="button" className="stats-cell-button" onClick={() => setTrendTarget({ player: item, columnKey: column.key })}
        aria-label={`${column.label} ${formatted ?? "unknown"} for ${item.player_name}. Open ${column.label} trend`}>{shown}</button> : shown}
    </td>;
  };

  return (
    <section className="stats-workspace player-career" aria-label="Career by season">
      <div className="player-career-controls">
        <Segmented label="Career table views" size="sm" tone="console" dense value={presetId}
          onChange={setPresetId} options={ORDERED_PRESETS.map(p => ({ value: p.id, label: p.label }))} />
      </div>
      <div className="stats-table-frame is-table">
        <div className="stats-controls-row">
          <Segmented label="Counting Mode" size="sm" deferChange
            options={ORDERED_COUNTING_MODES.map(mode => ({ value: mode.id, label: mode.label, title: mode.tooltip,
              disabled: catalog.stats_normalizations ? !catalog.stats_normalizations.includes(mode.id) : mode.gated }))}
            value={countingMode} onChange={setCountingMode} />
          <Segmented label="Phase" size="sm" deferChange
            options={PHASES.map(p => ({ value: p.id, label: p.label, title: `${p.label} games`,
              disabled: !catalog.stats_scopes?.some(scope => scope.phase === p.id) }))}
            value={phase} onChange={value => onPhaseChange ? onPhaseChange(value) : router.push(scopeHref("phase", value), { scroll: false })} />
        </div>
        <div className="table-wrapper stats-scroll-region player-career-scroll" role="region" aria-label="Career table scroll area" tabIndex={0}
          aria-busy={seasons === null}>
          <table className={`data-table dense-stats-table player-career-table ${awardColumn ? "has-awards" : ""} ${hasSplits ? "has-splits" : ""}`} aria-label="Career statistics by season"
            style={{ "--career-columns": preset.columns.length } as React.CSSProperties}>
            <colgroup>
              <col className="player-career-year-column" />
              {preset.columns.map(column => <col key={column.key} />)}
              {awardColumn && <col className="player-career-awards-column" />}
            </colgroup>
            <thead>
              <tr className="stats-header-tier-1">
                <th className="pinned-col pinned-col-year-group"><span className="sr-only">Season</span></th>
                {groups.map((group, index) => <th key={`${group.label}-${index}`} colSpan={group.colSpan} scope="colgroup" className={`stats-group-th ${index > 0 ? "group-start" : ""}`}>{group.label}</th>)}
                {awardColumn && <th scope="colgroup" className="stats-group-th group-start">Awards</th>}
              </tr>
              <tr className="stats-header-tier-2">
                <th scope="col" className="pinned-col pinned-col-year">Year</th>
                {preset.columns.map((column, index) => <th key={column.key} scope="col" data-column={column.key} className={`${column.num ? "num" : ""} ${divider(index)}`} title={column.tooltip ?? column.label}>{column.label}</th>)}
                {awardColumn && <th scope="col" className="group-start player-career-awards" title={`Season awards and voting finishes (${awards?.source})`}>Accolades</th>}
              </tr>
            </thead>
            <tbody className={bodyMotionClass}>
              {seasons === null && <tr><td colSpan={span} className="player-career-status">Loading seasons…</td></tr>}
              {career === null && <tr><td colSpan={span} className="player-career-status">
                Career table unavailable. Reload to retry.</td></tr>}
              {career && seasons?.length === 0 && <tr><td colSpan={span} className="player-career-status">
                No {phase === "playoffs" ? "playoff" : "regular-season"} games in CourtLens data.</td></tr>}
              {seasons?.map(value => {
                const item = rows.get(value) ?? null;
                const teams = item?.teams ?? [];
                const stints = expanded[stintKey(value)];
                const selected = value === season;
                return <Fragment key={value}>
                  <tr className={`player-career-row ${selected ? "row-selected" : ""}`} aria-current={selected ? "true" : undefined}
                    onClick={event => { if (!(event.target as HTMLElement).closest("a, button")) openSeason(value); }}>
                    <th scope="row" className="pinned-col pinned-col-year">
                      <span className="player-career-year">
                        <span className="player-career-logos"><TeamLogoStack teams={teams} size={24} /></span>
                        <a href={scopeHref("season", value)} onClick={event => { event.preventDefault(); openSeason(value); }}
                          title={`Show ${value}`}>{value}</a>
                        {awards?.allStarSeasons.includes(value) && phase === "regular_season" && <span className="player-career-star" title="All-Star"><Icon name="star" size={14} filled /><span className="sr-only">All-Star</span></span>}
                        {teams.length > 1 && <IconButton size="xs" className="player-career-expand-slot" expanded={Boolean(stints)}
                          icon="chevron-down" label={`${stints ? "Hide" : "Show"} ${value} team stints`}
                          onClick={() => toggleStints(value, teams)} />}
                      </span>
                    </th>
                    {preset.columns.map((_, index) => cell(item, index))}
                    {awardColumn && <td className="stats-metric-cell group-start player-career-awards">
                      <div className="player-career-awards-list">
                        {seasonAwardChips(awards?.bySeason[value]).map(chip => <Badge key={chip.code} variant={chip.win ? "accent" : "default"}
                          className="player-career-award" title={chip.description}>
                          <span aria-hidden="true">{chip.label}</span><span className="sr-only">{chip.description}</span>
                        </Badge>)}
                      </div>
                    </td>}
                  </tr>
                  {(stints === "loading" || stints === "failed") && <tr className="player-career-stint-status motion-enter">
                    <td colSpan={span}>{stints === "loading" ? "Loading team rows…" : "Team rows unavailable. Collapse and retry."}</td>
                  </tr>}
                  {Array.isArray(stints) && stints.map((stint, index) => {
                    const team = stint.teams?.[0] ?? "";
                    return <tr key={team} className="player-career-stint motion-enter" style={{ "--motion-index": index } as React.CSSProperties}>
                      <th scope="row" className="pinned-col pinned-col-year">
                        <span className="player-career-year">
                          <span className="player-career-logos"><TeamLogoStack teams={[team]} size={20} decorative /></span>
                          <span className="player-career-stint-team">{team}<span className="sr-only">, {value}</span></span>
                        </span>
                      </th>
                      {preset.columns.map((_, index) => cell(stint, index, "team"))}
                      {awardColumn && <td className="stats-metric-cell group-start player-career-awards" />}
                    </tr>;
                  })}
                </Fragment>;
              })}
            </tbody>
            {Boolean(seasons?.length) && <tfoot>
              <tr className="player-career-total">
                <th scope="row" className="pinned-col pinned-col-year">{careerSince ? <>Career since <span className="player-career-since">{firstCoveredSeason}</span></> : "Career"}</th>
                {preset.columns.map((_, index) => cell(career?.career ?? null, index, "career"))}
                {awardColumn && <td className="group-start player-career-awards" />}
              </tr>
            </tfoot>}
          </table>
        </div>
        {trendQuery && <StatsTrendDialog target={trendTarget} columns={preset.columns} querySpec={trendQuery} catalog={catalog}
          hints={hints} onClose={() => setTrendTarget(null)} />}
        {Boolean(seasons?.length) && <div className="player-career-totals">
          <span className="player-career-totals-label">Total = {seasons?.length} {seasons?.length === 1 ? "Season" : "Seasons"}</span>
          <ul aria-label="Seasons by team">{teamSeasons.map(([team, count]) => <li key={team} title={`${count} ${count === 1 ? "season" : "seasons"} with ${team}`}>
            <TeamLogo team={team} size={32} /><span className="sr-only">{team}</span><span>{count}</span>
          </li>)}</ul>
        </div>}
        <p className="player-career-footnote">
          Percentiles rank each season against that season&apos;s Stats cohort.
          {(seasons?.length ?? 0) < teamSeasons.reduce((sum, [, count]) => sum + count, 0) && " A season split between teams counts for each."}
          {careerSince && ` Seasons before ${firstCoveredSeason} aren't in CourtLens data.`}
        </p>
      </div>
    </section>
  );
}
