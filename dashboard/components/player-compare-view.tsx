"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { COMPARE_PRESETS, CUSTOM_DEFAULT, cardLabel, customMetricKeys, comparisonRows, formatCardValue, isPercentUnit, overallGroupStart, type CompareCountingMode, type ComparePresetId } from "@/lib/comparison-metrics";
import { comparisonFlags, leadingIdentity } from "./charts/semantics";
import { PercentileCell } from "./charts";
import { CompareCardExport } from "./compare-card-export";
import { ComparePlayerSlot, type CompareSelection } from "./compare-player-slot";
import { CompareMetricsDrawer } from "./compare-metrics-drawer";
import { PageHeader } from "./ui/panel";
import { Icon } from "./ui/icon";
import { GatedNote } from "./ui/gated-note";
import { Menu, MenuItem } from "./ui/menu";
import { ContextBar } from "./context-bar";
import { MultiPlayerLinesView } from "./multi-player-lines-view";
import { useWorkspace } from "@/lib/workspace-context";
import { saveInvestigation } from "@/lib/workbench-api";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import { scopeContextLine } from "@/lib/scope-labels";
import type { AnalyticsCatalog, MetricComparisonItem, MetricDefinition, PlayerBio, PlayerComparisonResponse, PlayerResearchItem, WorkbenchCatalog, WorkbenchQueryResponse } from "@/lib/types";
import { Button, IconButton, Segmented, Select } from "./ui/kit";
export type { ComparePresetId } from "@/lib/comparison-metrics";

type Scope = { season: string; phase: string; before_date: string; window: string; release_id?: string };

const MODES: { value: CompareCountingMode; label: string; rate?: boolean }[] = [
  { value: "per_game", label: "Per Game" }, { value: "per_75", label: "Per 75", rate: true },
  { value: "per_100", label: "Per 100", rate: true }, { value: "raw", label: "Totals" }
];

/**
 * Player Comparison (alignment row 3): one centred duel card in Databallr's shape. Portraits and
 * search, presets and counting mode, then mirrored rows with each value's league percentile and a
 * difference pill on the leading side. Pills are per-metric facts; there is no overall verdict.
 */
export function PlayerCompareView({ comparison, bios = [null, null], cohort, metricDefinitions = [], workbenchCatalog, additionalPlayerIds = [], context, selector, error = null }: {
  comparison: PlayerComparisonResponse | null; bios?: [PlayerBio | null, PlayerBio | null]; catalog?: AnalyticsCatalog; cohort?: WorkbenchQueryResponse | null;
  metricDefinitions?: MetricDefinition[]; workbenchCatalog?: WorkbenchCatalog | null; additionalPlayerIds?: string[];
  context: Scope; selector?: ReactNode; error?: string | null;
}) {
  const router = useRouter(), params = useSearchParams();
  const { views } = useWorkspace();
  const [exporting, setExporting] = useState(false), [notice, setNotice] = useState(""), [editing, setEditing] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const preset = params.get("preset");
  const active: ComparePresetId = preset && Object.hasOwn(COMPARE_PRESETS, preset) ? preset as ComparePresetId : "overall";
  const requestedMode = params.get("countingMode");
  const mode: CompareCountingMode = requestedMode === "raw" || requestedMode === "per_75" || requestedMode === "per_100" ? requestedMode : "per_game";
  const rates = workbenchCatalog?.stats_normalizations ?? [];
  const custom = customMetricKeys(params.get("customMetrics"), metricDefinitions);
  const keys = active === "custom" ? custom : COMPARE_PRESETS[active].metrics;
  const rows = comparison ? comparisonRows(keys, mode, comparison, metricDefinitions, cohort) : [];
  const a = comparison?.player_a ?? null, b = comparison?.player_b ?? null;
  const cohortRow = (id?: string) => cohort?.items.find(row => row.player_id === id);
  const minutes = cohort?.table_cohort?.min_season_minutes ?? 500;
  const modeLabel = MODES.find(entry => entry.value === mode)?.label ?? "Per Game";

  function navigate(next: URLSearchParams, server: boolean) {
    if (server) router.push(`/compare?${next}`, { scroll: false });
    else window.history.pushState(null, "", `/compare?${next}`);
  }
  function change(values: Record<string, string>, server = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) next.set(key, value);
    navigate(next, server);
  }
  function pick(side: "a" | "b", selection: CompareSelection) {
    const other = side === "a" ? b?.id : a?.id;
    if (selection.id === other) { setNotice("Choose two different players."); return; }
    const next = new URLSearchParams(params.toString());
    next.set(side === "a" ? "playerA" : "playerB", selection.id); next.delete("players");
    navigate(next, true);
  }
  function swap() {
    if (!a || !b) return;
    const next = new URLSearchParams(params.toString());
    next.set("playerA", b.id); next.set("playerB", a.id);
    if (additionalPlayerIds.length) next.set("players", [b.id, a.id, ...additionalPlayerIds].join(",")); else next.delete("players");
    navigate(next, true);
  }
  function direction(metric: string) { return comparisonFlags(metricDefinitions.find(definition => definition.key === metric) ?? {}).direction; }
  const exportTitle = a && b ? `${a.name} vs ${b.name}` : "Player Comparison";
  const footnote = `${scopeContextLine(context.season, context.phase, context.before_date)} · ${COMPARE_PRESETS[active].label} · ${modeLabel}`;
  async function share() {
    if (!svgRef.current || !a || !b) return;
    setExporting(true);
    try { await exportSvgAsPng(svgRef.current, { title: exportTitle, subtitle: `${COMPARE_PRESETS[active].label} · ${modeLabel}`, context, evidenceId: context.release_id, filename: `courtlens-compare-${a.id}-vs-${b.id}`, inlineImages: true }); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Image export unavailable."); }
    finally { setExporting(false); }
  }

  return <div className="pvp" role="region" aria-label="Player Comparison Explorer">
    <PageHeader className="pvp-header" icon="swap" title="Player Comparison" subtitle="Compare stats between any two NBA players" />
    <div className="pvp-scope">
      <ContextBar catalog={workbenchCatalog ?? undefined} initialReleaseId={context.release_id} initialSeason={context.season} initialPhase={context.phase} initialBeforeDate={context.before_date} initialWindow={context.window}
        detailRows={[{ label: "Resolved comparison context", value: JSON.stringify(comparison?.context ?? context), mono: true },
          { label: "Percentile cohort", value: `${cohort?.table_cohort?.qualified_players ?? "Unknown"} league players with ${minutes}+ season minutes, same season and phase.` },
          { label: "Metric definitions", value: "Registered catalog directions; unavailable metrics stay unknown." }]} />
    </div>
    {a && b && <AssistantPageSelection route="/compare" playerIds={[a.id, b.id, ...additionalPlayerIds]} scope={context} label={`${a.name} / ${b.name}`} />}
    <div className="pvp-column">
      <div className="pvp-toolbar">
        <Button size="md" variant="primary" icon="sliders" onClick={() => setEditing(true)}>Edit Metrics</Button>
        <Button size="md" icon="download" disabled={exporting || !a || !b} onClick={() => void share()}>{exporting ? "Exporting…" : "Share Image"}</Button>
        <Menu renderTrigger={props => <IconButton {...props} size="md" variant="secondary" icon="more" label="More" />}>
          <MenuItem label="Export SVG" onClick={() => { if (svgRef.current && a && b) exportSvgFile(svgRef.current, `courtlens-compare-${a.id}-vs-${b.id}.svg`, { title: exportTitle, context, filename: "courtlens-compare" }); }} />
          <MenuItem label="Copy link" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => setNotice("Link copied.")).catch(() => setNotice("Clipboard unavailable.")); }} />
          <MenuItem label="Save investigation" onClick={() => { void saveInvestigation(exportTitle, { type: "player_comparison", ...Object.fromEntries(params), ...context, preset: active, customMetrics: custom }).then(() => setNotice("Investigation saved.")).catch(() => setNotice("Save unavailable.")); }} />
        </Menu>
      </div>

      <section className="pvp-card" aria-label="Comparison card">
        {a && b ? <div className="pvp-players">
          <ComparePlayerSlot key={`a-${a.id}`} side="a" player={a} bio={bios[0]} season={context.season} onPick={selection => pick("a", selection)} />
          <IconButton className="pvp-swap" size="md" variant="secondary" icon="swap" label="Swap players" onClick={swap} />
          <ComparePlayerSlot key={`b-${b.id}`} side="b" player={b} bio={bios[1]} season={context.season} onPick={selection => pick("b", selection)} />
        </div> : <>
          {/* Only when no pair resolves: silhouettes over the two-field picker. */}
          <div className="pvp-players pvp-players-empty" aria-hidden="true">
            <span className="pvp-photo pvp-photo-empty"><span className="pvp-silhouette"><Icon name="person" size={20} /></span></span>
            <span />
            <span className="pvp-photo pvp-photo-empty"><span className="pvp-silhouette"><Icon name="person" size={20} /></span></span>
          </div>
          {selector}
        </>}
        {error && <div role="alert"><GatedNote why={error}>Unable to compare.</GatedNote></div>}
        {a && b && <>
          <div className="pvp-modes">
            <div className="pvp-presets"><Segmented size="sm" label="Comparison Metric Presets" value={active} onChange={value => change({ preset: value })}
              options={Object.entries(COMPARE_PRESETS).map(([value, entry]) => ({ value: value as ComparePresetId, label: entry.label }))} /></div>
            <Select size="sm" aria-label="Counting mode" value={mode} onChange={event => change({ countingMode: event.target.value }, true)}>
              {MODES.map(entry => <option key={entry.value} value={entry.value} disabled={entry.rate && !rates.includes(entry.value)}>
                {entry.rate && !rates.includes(entry.value) ? `${entry.label} (needs possession data)` : entry.label}</option>)}
            </Select>
          </div>
          <table className="pvp-rows" aria-label="Descriptive comparison">
            <colgroup><col className="pvp-col-pill" /><col /><col className="pvp-col-label" /><col /><col className="pvp-col-pill" /></colgroup>
            <thead className="sr-only"><tr><th scope="col">{a.name} difference</th><th scope="col">{a.name}</th><th scope="col">Metric</th><th scope="col">{b.name}</th><th scope="col">{b.name} difference</th></tr></thead>
            <tbody>{rows.map(row => {
              const group = active === "overall" ? overallGroupStart(row.metric) : null;
              return <Fragment key={row.metric}>
                {group && <tr className="pvp-group"><th colSpan={5} scope="colgroup">{group}</th></tr>}
                <MetricRow row={row} direction={direction(row.metric)} names={[a.name, b.name]} definition={metricDefinitions.find(entry => entry.key === row.metric)}
                  percentiles={[cohortRow(a.id), cohortRow(b.id)]} minutes={minutes} />
              </Fragment>;
            })}</tbody>
          </table>
          {!rows.length && <GatedNote action={<Button size="md" onClick={() => change({ preset: "custom", customMetrics: CUSTOM_DEFAULT.join(",") })}>Reset metrics</Button>}>No custom metrics selected.</GatedNote>}
          <footer className="pvp-foot"><span>{workbenchCatalog?.source ?? "Published box scores"} · {a.games_played} / {b.games_played} GP · percentiles vs {minutes}+ minute players</span><span className="pvp-wordmark">CourtLens</span></footer>
        </>}
      </section>

      {notice && <p className="pvp-notice" role="status">{notice} {notice === "Investigation saved." && <Link href="/investigations">Open saved investigations</Link>}</p>}
      {a && b && <div className="pvp-notes">
        {active === "sixfactor" && <GatedNote why="These are descriptive box-score proxies, not six-factor RAPM coefficients or defensive impact.">Box-score factor proxies.</GatedNote>}
        <GatedNote why={<><p>{comparison?.no_forced_winner_notice}</p><p>Pills mark the leading side for each metric&apos;s declared direction (fewer turnovers and fouls lead); metrics without a direction get no pill. No composite score is calculated. Small numbers under values are league percentiles among {minutes}+ minute players.</p></>}>Descriptive differences under a shared scope.</GatedNote>
        <details className="pvp-trends" open={params.get("compareView") === "lines"}>
          <summary onClick={event => { event.preventDefault(); change({ compareView: params.get("compareView") === "lines" ? "table" : "lines" }); }}>Trend lines</summary>
          {params.get("compareView") === "lines" && <MultiPlayerLinesView playerIds={[a.id, b.id, ...additionalPlayerIds]} context={context} />}
        </details>
      </div>}
    </div>

    {a && b && <div className="pvp-export" aria-hidden="true">
      <CompareCardExport ref={svgRef} season={context.season} players={[a, b]} rows={rows} direction={direction} labels={new Map(metricDefinitions.map(entry => [entry.key, entry]))} title={`${exportTitle} · ${COMPARE_PRESETS[active].label}`} footnote={footnote} />
    </div>}
    <CompareMetricsDrawer open={editing} onClose={() => setEditing(false)} selected={custom} catalog={metricDefinitions} views={views}
      onChange={next => change({ preset: "custom", customMetrics: next.join(",") })} />
  </div>;
}

function MetricRow({ row, direction, names, definition, percentiles, minutes }: {
  row: MetricComparisonItem; direction: ReturnType<typeof comparisonFlags>["direction"]; names: [string, string];
  definition?: MetricDefinition; percentiles: [PlayerResearchItem | undefined, PlayerResearchItem | undefined]; minutes: number;
}) {
  const a = typeof row.value_a === "number" ? row.value_a : null, b = typeof row.value_b === "number" ? row.value_b : null;
  const leader = leadingIdentity(a, b, direction);
  const gap = a != null && b != null ? Math.abs(a - b) * (isPercentUnit(row.unit) ? 100 : 1) : null;
  const label = cardLabel(row.metric, definition);
  const pill = (side: "a" | "b") => leader === side && gap != null
    ? <span className="pvp-pill" data-identity={side} title={`${names[side === "a" ? 0 : 1]}: ${gap.toFixed(1)}${isPercentUnit(row.unit) ? " percentage points" : ""} ${direction === "low" ? "fewer" : "more"} ${label.toLowerCase()}`}>+{gap.toFixed(row.metric === "gp" ? 0 : 1)}</span>
    : null;
  const cell = (side: "a" | "b") => {
    const value = side === "a" ? row.value_a : row.value_b;
    const player = side === "a" ? percentiles[0] : percentiles[1];
    return <td className="pvp-value" title={`n=${side === "a" ? row.n_a : row.n_b}`}>
      <PercentileCell variant="text" value={value == null ? null : formatCardValue(value, row.unit, row.metric)} percentile={player?.table_percentiles?.[row.metric] ?? null}
        qualified={player?.table_qualified === true} label={`${names[side === "a" ? 0 : 1]} ${label}`}
        cohort={`${player?.table_cohort_sample_sizes?.[row.metric] ?? "Unknown"} valid league players; ${minutes}+ season minutes`} />
    </td>;
  };
  return <tr>
    <td className="pvp-pill-cell">{pill("a")}</td>
    {cell("a")}
    <th scope="row" className="pvp-label" title={definition?.display_name ?? row.display_name}>{label}</th>
    {cell("b")}
    <td className="pvp-pill-cell">{pill("b")}</td>
  </tr>;
}
