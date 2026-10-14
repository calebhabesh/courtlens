"use client";

import "./stats-explorer.css";
import "./player-career.css";
import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PercentileCell } from "./charts/percentile-cell";
import { SlidingIndicator } from "./ui/sliding-indicator";
import { StatsChoicePills } from "./stats-choice-pills";
import { TeamLogoStack } from "./team-logo";
import { Icon } from "./ui/icon";
import { settleLimited } from "./stats-trend-dialog";
import { applyScopeChange } from "@/lib/scope-url";
import { normalizedColumn } from "@/lib/stats-query";
import {
  DARKO_COLUMNS,
  ORDERED_COUNTING_MODES,
  ORDERED_PRESETS,
  formatColumnValue,
  tableGroups,
  usesImpactManifest,
  type CountingMode,
  type PresetId
} from "@/lib/stats-presets";
import { executeWorkbenchQuery, getPlayerProfile, getPlayerSeasons } from "@/lib/workbench-api";
import type { PlayerProfileStint, PlayerResearchItem, QuerySpec, WorkbenchCatalog } from "@/lib/types";

/** Each season query computes that season's whole cohort server-side; a few run at a time. */
const SEASON_CONCURRENCY = 3;
const DARKO_KEYS = new Set(Object.keys(DARKO_COLUMNS));
const PHASES = [{ id: "regular_season", label: "Regular" }, { id: "playoffs", label: "Playoffs" }] as const;

type SeasonRow = { season: string; item: PlayerResearchItem | null; failed?: boolean };
type Loaded = { key: string; seasons: string[] | null; rows: Record<string, SeasonRow>; career?: PlayerResearchItem | null; careerFailed?: boolean };

/**
 * Databallr's career view inside the player page: the Stats table with one row per season the
 * player appeared in (newest first), each percentile ranked against that season's Stats cohort,
 * and a Career row aggregated over the same seasons. Season-only metrics (DPM, tracking,
 * impact) have no career value, so that row leaves them blank.
 */
export function PlayerCareerTable({ playerId, catalog, season, phase, firstCoveredSeason, draftYear }: {
  playerId: string;
  catalog: WorkbenchCatalog;
  season: string;
  phase: string;
  /** The earliest season in CourtLens data, for the "Career since" label. */
  firstCoveredSeason: string | null;
  draftYear: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [presetId, setPresetId] = useState<PresetId>("overview");
  const [countingMode, setCountingMode] = useState<CountingMode>("per_game");
  const [expanded, setExpanded] = useState<Record<string, PlayerProfileStint[] | "loading" | "failed">>({});

  const preset = useMemo(() => {
    const base = ORDERED_PRESETS.find(p => p.id === presetId) ?? ORDERED_PRESETS[0];
    const columns = base.columns.map(column => normalizedColumn(column, countingMode));
    return { ...base, columns: columns.filter((column, index) => columns.findIndex(c => c.key === column.key) === index) };
  }, [presetId, countingMode]);
  const groups = useMemo(() => tableGroups(preset), [preset]);
  const columnKeys = preset.columns.map(column => column.key);
  const requestKey = JSON.stringify({ playerId, phase, columnKeys, release: catalog.release_id });
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    const keys = JSON.parse(requestKey).columnKeys as string[];
    const scopeFor = (value: string) => catalog.stats_scopes?.find(scope => scope.season === value && scope.phase === phase);
    const spec = (value: string, seasons?: string[]): QuerySpec => ({
      release_id: catalog.release_id, season: value, phase, before_date: scopeFor(value)?.default_before_date ?? null,
      window: { kind: "season" }, view_state: { columns: keys },
      ...(seasons ? { season_scope: { seasons, aggregate_multi_season: true } } : {}),
      ...(keys.some(usesImpactManifest) && catalog.impact?.manifest_sha256 ? { impact_manifest_sha256: catalog.impact.manifest_sha256 } : {}),
      ...(!seasons && keys.some(key => DARKO_KEYS.has(key)) && catalog.darko?.manifest_sha256 ? { darko_manifest_sha256: catalog.darko.manifest_sha256 } : {}),
      sort: [{ field: "gp", direction: "desc" }], page: { limit: 1 }
    });
    const update = (change: (current: Loaded) => Loaded) => {
      if (active) setLoaded(current => change(current?.key === requestKey ? current : { key: requestKey, seasons: null, rows: {} }));
    };
    getPlayerSeasons([playerId], phase, catalog.release_id).then(response => {
      // Only seasons with observed games, newest first; covered seasons only.
      const covered = new Set(catalog.stats_scopes?.filter(scope => scope.phase === phase).map(scope => scope.season));
      const seasons = (response.seasons[playerId] ?? []).filter(value => covered.has(value)).sort().reverse();
      update(current => ({ ...current, seasons }));
      // The career aggregate is the slowest query; it runs beside the season rows, not after.
      if (seasons.length > 0) {
        executeWorkbenchQuery(spec(seasons[0], [...seasons].reverse()), { player_ids: [playerId] })
          .then(result => update(current => ({ ...current, career: result.items[0] ?? null })))
          .catch(() => update(current => ({ ...current, careerFailed: true })));
      }
      void settleLimited(seasons, SEASON_CONCURRENCY, async value => {
        const result = await executeWorkbenchQuery(spec(value), { player_ids: [playerId], table_percentiles: true });
        update(current => ({ ...current, rows: { ...current.rows, [value]: { season: value, item: result.items[0] ?? null } } }));
      }).then(settled => {
        settled.forEach((entry, index) => {
          if (entry.status === "rejected") update(current => ({ ...current, rows: { ...current.rows, [seasons[index]]: { season: seasons[index], item: null, failed: true } } }));
        });
      });
    }).catch(() => update(current => ({ ...current, seasons: [] })));
    return () => { active = false; };
    // requestKey covers every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const current = loaded?.key === requestKey ? loaded : null;
  const seasons = current?.seasons ?? null;
  const careerSince = Boolean(seasons?.length && firstCoveredSeason && seasons.at(-1) === firstCoveredSeason
    && (draftYear == null || draftYear < Number(firstCoveredSeason.slice(0, 4))));

  const scopeHref = (key: "season" | "phase", value: string) => {
    const params = applyScopeChange(searchParams?.toString() ?? "", key, value,
      { catalog, season, phase, releaseId: catalog.release_id });
    return `${pathname}?${params}`;
  };
  const openSeason = (value: string) => router.push(scopeHref("season", value), { scroll: false });

  const toggleStints = (value: string) => {
    if (expanded[value]) { setExpanded(state => Object.fromEntries(Object.entries(state).filter(([key]) => key !== value))); return; }
    setExpanded(state => ({ ...state, [value]: "loading" }));
    const before = catalog.stats_scopes?.find(scope => scope.season === value && scope.phase === phase)?.default_before_date;
    getPlayerProfile(playerId, { season: value, phase, beforeDate: before, releaseId: catalog.release_id })
      .then(profile => setExpanded(state => ({ ...state, [value]: profile.stints ?? [] })))
      .catch(() => setExpanded(state => ({ ...state, [value]: "failed" })));
  };

  const cell = (item: PlayerResearchItem | null, index: number, career = false) => {
    const column = preset.columns[index];
    const value = item ? item.metrics[column.key] ?? (column.key === "gp" ? item.games_played : column.key === "min" ? item.total_minutes : null) : null;
    const group = groups.findIndex(g => index >= g.start && index < g.start + g.colSpan) % 2;
    return <td key={column.key} data-column={column.key} className={`stats-metric-cell stats-group-${group} ${column.num ? "num" : ""}`}>
      <PercentileCell variant="text" showPercentile={!career} value={item && value != null ? formatColumnValue(column, item) : null}
        percentile={career ? null : item?.table_percentiles?.[column.key] ?? null}
        qualified={item?.table_qualified === true && item?.impact_support?.[column.key]?.qualified !== false}
        label={column.label} cohort={`${item?.table_cohort_sample_sizes?.[column.key] ?? "Unknown"} valid league players that season`} />
    </td>;
  };

  return (
    <section className="stats-workspace player-career" aria-label="Career by season">
      <div className="player-career-controls">
        <div className="stats-preset-tabs" role="tablist" aria-label="Career table views">
          {ORDERED_PRESETS.map(p => <button key={p.id} type="button" role="tab" aria-selected={p.id === presetId}
            className={`stats-preset-tab ${p.id === presetId ? "active" : ""}`} onClick={() => setPresetId(p.id)}>
            {p.id === presetId && <SlidingIndicator layoutId="career-preset-indicator" className="stats-preset-indicator" />}
            <span>{p.label}</span>
          </button>)}
        </div>
      </div>
      <div className="stats-table-frame is-table">
        <div className="stats-controls-row">
          <StatsChoicePills label="Counting Mode" className="stats-counting-modes" indicatorId="career-counting-indicator"
            options={ORDERED_COUNTING_MODES.map(mode => ({ id: mode.id, label: mode.label, title: mode.tooltip,
              disabled: catalog.stats_normalizations ? !catalog.stats_normalizations.includes(mode.id) : mode.gated }))}
            value={countingMode} onSelect={setCountingMode} />
          <StatsChoicePills label="Phase" className="stats-counting-modes player-career-phase" indicatorId="career-phase-indicator"
            options={PHASES.map(p => ({ id: p.id, label: p.label, title: `${p.label} games`,
              disabled: !catalog.stats_scopes?.some(scope => scope.phase === p.id) }))}
            value={phase} onSelect={value => router.push(scopeHref("phase", value), { scroll: false })} />
        </div>
        <div className="table-wrapper stats-scroll-region player-career-scroll" role="region" aria-label="Career table scroll area" tabIndex={0}
          aria-busy={!seasons || seasons.some(value => !current?.rows[value])}>
          <table className="data-table dense-stats-table player-career-table" aria-label="Career statistics by season"
            style={{ "--career-columns": preset.columns.length } as React.CSSProperties}>
            <thead>
              <tr className="stats-header-tier-1">
                <th className="pinned-col pinned-col-year-group"><span className="sr-only">Season</span></th>
                {groups.map((group, index) => <th key={`${group.label}-${index}`} colSpan={group.colSpan} scope="colgroup" className="stats-group-th">{group.label}</th>)}
              </tr>
              <tr className="stats-header-tier-2">
                <th scope="col" className="pinned-col pinned-col-year">Year</th>
                {preset.columns.map(column => <th key={column.key} scope="col" data-column={column.key} className={column.num ? "num" : ""} title={column.tooltip ?? column.label}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {seasons === null && <tr><td colSpan={preset.columns.length + 1} className="player-career-status">Loading seasons…</td></tr>}
              {seasons?.length === 0 && <tr><td colSpan={preset.columns.length + 1} className="player-career-status">
                No {phase === "playoffs" ? "playoff" : "regular-season"} games in CourtLens data.</td></tr>}
              {seasons?.map(value => {
                const row = current?.rows[value];
                const teams = row?.item?.teams ?? [];
                const stints = expanded[value];
                const selected = value === season;
                return <Fragment key={value}>
                  <tr className={`player-career-row ${selected ? "row-selected" : ""}`} aria-current={selected ? "true" : undefined}
                    onClick={event => { if (!(event.target as HTMLElement).closest("a, button")) openSeason(value); }}>
                    <th scope="row" className="pinned-col pinned-col-year">
                      <span className="player-career-year">
                        <TeamLogoStack teams={teams} size={20} />
                        <a href={scopeHref("season", value)} onClick={event => { event.preventDefault(); openSeason(value); }}
                          title={`Show ${value}`}>{value}</a>
                        {teams.length > 1 && <button type="button" className="player-career-expand" aria-expanded={Boolean(stints)}
                          aria-label={`${stints ? "Hide" : "Show"} ${value} team stints`} onClick={() => toggleStints(value)}>
                          <Icon name={stints ? "chevron-up" : "chevron-down"} size={14} /></button>}
                      </span>
                    </th>
                    {row?.failed
                      ? <td colSpan={preset.columns.length} className="player-career-status">Season unavailable. Reload to retry.</td>
                      : row ? preset.columns.map((_, index) => cell(row.item, index))
                      : preset.columns.map(column => <td key={column.key} className="stats-metric-cell"><span className="player-career-pending" aria-hidden="true" /></td>)}
                  </tr>
                  {stints && <tr className="player-career-stints">
                    <td colSpan={preset.columns.length + 1}>
                      {stints === "loading" ? "Loading team stints…" : stints === "failed" ? "Team stints unavailable." :
                        <ul aria-label={`${value} team stints`}>{stints.map(stint => <li key={stint.team_id}>
                          <TeamLogoStack teams={[stint.team_tricode]} size={16} /><strong>{stint.team_tricode}</strong>
                          <span>{stint.games_played} GP</span>
                          <span>{formatOne(stint.metrics.min_per_game)} MPG</span>
                          <span>{formatOne(stint.metrics.pts_per_game)} PTS</span>
                          <span>{formatOne(stint.metrics.reb_total_per_game)} REB</span>
                          <span>{formatOne(stint.metrics.ast_per_game)} AST</span>
                          <span>{formatPct(stint.metrics.ts_pct)} TS%</span>
                        </li>)}</ul>}
                    </td>
                  </tr>}
                </Fragment>;
              })}
            </tbody>
            {Boolean(seasons?.length) && <tfoot>
              <tr className="player-career-total">
                <th scope="row" className="pinned-col pinned-col-year">{careerSince ? `Career since ${firstCoveredSeason}` : "Career"}</th>
                {current?.careerFailed
                  ? <td colSpan={preset.columns.length} className="player-career-status">Career totals unavailable.</td>
                  : current?.career !== undefined
                  ? preset.columns.map((_, index) => cell(current.career ?? null, index, true))
                  : preset.columns.map(column => <td key={column.key} className="stats-metric-cell"><span className="player-career-pending" aria-hidden="true" /></td>)}
              </tr>
            </tfoot>}
          </table>
        </div>
        <p className="player-career-footnote">
          {seasons?.length ? `${seasons.length} ${seasons.length === 1 ? "season" : "seasons"}. ` : ""}
          Percentiles rank each season against that season&apos;s Stats cohort.
          {careerSince && ` Seasons before ${firstCoveredSeason} aren't in CourtLens data.`}
        </p>
      </div>
    </section>
  );
}

function formatOne(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(1);
}

function formatPct(value: number | null | undefined): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}
