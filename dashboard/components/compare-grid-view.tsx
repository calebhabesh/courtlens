"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { COMPARE_PRESETS, CUSTOM_DEFAULT, customMetricKeys, type CompareCountingMode, type ComparePresetId } from "@/lib/comparison-metrics";
import { duelParams, gridParams, parseGrid, MAX_GRID_PLAYERS, type GridSelection } from "@/lib/compare-grid";
import { useWorkspace } from "@/lib/workspace-context";
import { completedSeasons } from "@/lib/compare-accolades";
import { saveInvestigation } from "@/lib/workbench-api";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import type { MetricDefinition, WorkbenchCatalog } from "@/lib/types";
import { CompareGrid, gridLines, type GridColumn } from "./compare-grid";
import { CompareGridExport } from "./compare-grid-export";
import { CompareMetricsDrawer } from "./compare-metrics-drawer";
import { COUNTING_MODES, CountingMenu, countingParams } from "./compare-counting-menu";
import { CompareTrendTray } from "./compare-trend-tray";
import { CompareSeasonPicker } from "./compare-season-picker";
import { COMPARE_SUBTITLE } from "./compare-counting-menu";
import type { CompareSelection } from "./compare-player-slot";
import { ContextBar } from "./context-bar";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { BrandMark } from "./brand";
import { GatedNote } from "./ui/gated-note";
import { PageHeader } from "./ui/panel";
import { Menu, MenuItem } from "./ui/menu";
import { Button, IconButton, Segmented } from "./ui/kit";

type Scope = { season: string; phase: string; before_date: string; window: string; release_id?: string };

/**
 * Player Comparison for three to five players (alignment row 3, 64): the duel's page shell and
 * console around a grid card, one column per player. Every change is a URL change; the server
 * reads each column under its own season.
 */
export function CompareGridView({ columns, span, context, workbenchCatalog, metricDefinitions = [], error = null, toDuel }: {
  columns: GridColumn[]; span: "season" | "career"; context: Scope; workbenchCatalog?: WorkbenchCatalog | null;
  metricDefinitions?: MetricDefinition[]; error?: string | null;
  /** Returning to two players or fewer; the duel opened this grid itself and can take it back
      without a server read (74). Otherwise the page navigates. */
  toDuel?: (selection: GridSelection) => void;
}) {
  const router = useRouter(), params = useSearchParams();
  const { views } = useWorkspace();
  // The open "Add Player" tile can be closed and reopened from the toolbar (67).
  const [adding, setAdding] = useState(true);
  const canAdd = columns.length < MAX_GRID_PLAYERS;
  const [editing, setEditing] = useState(false), [exporting, setExporting] = useState(false), [notice, setNotice] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const preset = params.get("preset");
  const active: ComparePresetId = preset && Object.hasOwn(COMPARE_PRESETS, preset) ? preset as ComparePresetId : "overall";
  const requestedMode = params.get("countingMode");
  const mode: CompareCountingMode = requestedMode === "raw" || requestedMode === "per_75" || requestedMode === "per_100" ? requestedMode : "per_game";
  const career = span === "career";
  // Careers offer per game and totals only; possession rates need season exposure.
  const shownMode: CompareCountingMode = career ? mode === "raw" ? "raw" : "per_game" : mode;
  const custom = customMetricKeys(params.get("customMetrics"), metricDefinitions);
  const keys = active === "custom" ? custom : COMPARE_PRESETS[active].metrics;
  // A finished season shows its awards once the cutoff covers its whole regular season (75).
  const ends = completedSeasons(workbenchCatalog?.stats_scopes);
  const lines = gridLines({ columns, keys, mode: shownMode, overall: active === "overall", career, definitions: metricDefinitions, ends });
  const ids = columns.map(column => column.player.player_id);
  const seasons = [...new Set(columns.map(column => column.season))];
  const seasonLabel = seasons.length === 1 ? seasons[0] : seasons.length === 2 ? seasons.join(" / ") : "each player's season";
  const spanLabel = career ? `Career through ${seasonLabel}` : seasonLabel;
  const modeLabel = COUNTING_MODES.find(entry => entry.value === shownMode)?.label ?? "Per Game";
  const title = columns.length ? columns.map(column => column.player.name).join(" vs ") : "Player Comparison";

  function navigate(next: URLSearchParams) { router.push(`/compare?${next}`, { scroll: false }); }
  function change(values: Record<string, string>, server = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) next.set(key, value);
    if (server) navigate(next); else window.history.pushState(null, "", `/compare?${next}`);
  }
  /** The URL's columns, edited and written back; the scope, preset and mode stay. */
  function edit(update: (selection: GridSelection) => GridSelection | null) {
    const current = parseGrid(params);
    const selection = update({ ids: [...current.ids], seasons: [...current.seasons] });
    if (!selection) return;
    setNotice("");
    if (!selection.ids.length) { clearPlayers(); return; }
    // One rule for every count (72): two or fewer players are the duel card, three or more the grid.
    if (selection.ids.length <= 2) { if (toDuel) toDuel(selection); else navigate(duelParams(params, selection)); return; }
    navigate(gridParams(params, selection));
  }
  function add(selection: CompareSelection) {
    edit(current => {
      if (current.ids.includes(selection.id)) { setNotice(`${selection.name} is already compared.`); return null; }
      if (current.ids.length >= MAX_GRID_PLAYERS) return null;
      return { ids: [...current.ids, selection.id], seasons: [...current.seasons, null] };
    });
  }
  function replace(index: number, selection: CompareSelection) {
    edit(current => {
      if (current.ids.includes(selection.id)) { setNotice(`${selection.name} is already compared.`); return null; }
      current.ids[index] = selection.id; current.seasons[index] = null;
      return current;
    });
  }
  function remove(index: number) {
    edit(current => ({ ids: current.ids.filter((_, at) => at !== index), seasons: current.seasons.filter((_, at) => at !== index) }));
  }
  function chooseSeason(index: number, season: string) {
    edit(current => { current.seasons[index] = season === context.season ? null : season; return current; });
  }
  /** Closing the open tile with two players leaves exactly a duel, so the card becomes one. */
  function closeAdd() {
    if (columns.length <= 2) { if (toDuel) toDuel(parseGrid(params)); else navigate(duelParams(params, parseGrid(params))); }
    else setAdding(false);
  }
  function clearPlayers() {
    const next = new URLSearchParams(params.toString());
    for (const key of ["layout", "players", "seasons", "playerA", "playerB", "seasonA", "seasonB"]) next.delete(key);
    next.set("empty", "1");
    navigate(next);
  }
  async function share() {
    if (!svgRef.current || !columns.length) return;
    setExporting(true);
    try { await exportSvgAsPng(svgRef.current, { title, subtitle: `${spanLabel} · ${COMPARE_PRESETS[active].label} · ${modeLabel}`, context, evidenceId: context.release_id, filename: `courtlens-compare-${ids.join("-")}`, inlineImages: true }); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Image export unavailable."); }
    finally { setExporting(false); }
  }

  const controls = <div className="pvp-controls pvp-grid-toolbar">
    <div className="pvp-presets"><Segmented size="sm" dense label="Comparison Metric Presets" value={active} onChange={value => change({ preset: value })}
      options={Object.entries(COMPARE_PRESETS).map(([value, entry]) => ({ value: value as ComparePresetId, label: entry.label }))} /></div>
    <CountingMenu value={career ? `career:${shownMode === "raw" ? "raw" : "per_game"}` : shownMode} season={seasonLabel} rates={workbenchCatalog?.stats_normalizations ?? []}
      onChange={value => change(countingParams(value), true)} />
    <div className="pvp-grid-actions">
      {canAdd && !adding && <IconButton size="sm" variant="ghost" icon="plus" label="Add Player" onClick={() => setAdding(true)} />}
      {/* A word and the remove ×, so clearing reads at a glance (77). */}
      <Button size="sm" variant="ghost" icon="close" aria-label="Clear players" title="Clear all players" onClick={clearPlayers}>Clear</Button>
    </div>
  </div>;

  return <div className="pvp pvp-grid-page" role="region" aria-label="Player Comparison Explorer">
    <PageHeader className="pvp-header" icon="swap" title="Player Comparison" subtitle={COMPARE_SUBTITLE} />
    <div className="pvp-scope">
      <ContextBar catalog={workbenchCatalog ?? undefined} initialReleaseId={context.release_id} initialSeason={context.season} initialPhase={context.phase} initialBeforeDate={context.before_date} initialWindow={context.window}
        // The console's Season is a global override: it resets every player's own season (42).
        clearOnSeasonChange={["seasons", "seasonA", "seasonB"]}
        renderSeason={columns.length ? picker => <CompareSeasonPicker {...picker} marks={columns.map(column => ({ id: column.player.player_id, name: column.player.name, played: column.played ?? [] }))} /> : undefined}
        modes={<div className="pvp-actions">
          <Button size="sm" variant="primary" icon="sliders" disabled={!columns.length} onClick={() => setEditing(true)}>Edit Metrics</Button>
          <Button size="sm" icon="download" disabled={exporting || !columns.length} onClick={() => void share()}>{exporting ? "Exporting…" : "Share Image"}</Button>
          <Menu renderTrigger={props => <IconButton {...props} size="sm" variant="secondary" icon="more" label="More" disabled={!columns.length} />}>
            <MenuItem label="Export SVG" onClick={() => { if (svgRef.current) exportSvgFile(svgRef.current, `courtlens-compare-${ids.join("-")}.svg`, { title, context, filename: "courtlens-compare" }); }} />
            <MenuItem label="Copy link" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => setNotice("Link copied.")).catch(() => setNotice("Clipboard unavailable.")); }} />
            <MenuItem label="Save investigation" onClick={() => { void saveInvestigation(title, { type: "player_comparison", ...Object.fromEntries(params), ...context, preset: active, customMetrics: custom }).then(() => setNotice("Investigation saved.")).catch(() => setNotice("Save unavailable.")); }} />
          </Menu>
        </div>}
        detailRows={[{ label: "Source", value: `${workbenchCatalog?.source ?? "Published box scores"} · ${columns.map(column => `${column.player.item?.games_played ?? 0} GP`).join(" / ")}` },
          { label: "Best values", value: "Each row's best value reads heavier; unknown values never lead, and a row where every value ties has none. There is no overall winner." },
          { label: "Availability", value: "Games played out of the teams' games over the same span, before the cutoff. Without a roster feed a traded season's split is estimated; a mid-season signing counts earlier team games as missed." },
          { label: "Career", value: "Every observed season up to each player's compared one, with games before the cutoff only." },
          { label: "Accolades", value: "Basketball-Reference season awards, counted once announced before the cutoff, or once the cutoff covers that season's whole regular season; titles from admitted playoff box scores." },
          { label: "Resolved comparison context", value: JSON.stringify(context), mono: true }]} />
    </div>
    {columns.length > 0 && <AssistantPageSelection route="/compare" playerIds={ids} scope={context} label={columns.map(column => column.player.name).join(" / ")} />}
    <div className="pvp-column pvp-grid-column" data-columns={columns.length + (canAdd && adding ? 1 : 0)}>
      <div className="pvp-stack">
        <CompareGrid ends={ends} columns={columns} lines={lines} controls={controls} career={career} adding={adding} onCloseAdd={closeAdd} onReplace={replace} onRemove={remove} onAdd={add} onSeason={chooseSeason}
          footer={<>
            {error && <div role="alert"><GatedNote why={error}>Unable to compare.</GatedNote></div>}
            {!lines.metrics.length && <GatedNote action={<Button size="md" onClick={() => change({ preset: "custom", customMetrics: CUSTOM_DEFAULT.join(",") })}>Reset metrics</Button>}>No custom metrics selected.</GatedNote>}
            <footer className="pvp-foot"><BrandMark size={22} framed={false} /><CourtLensWordmark height={18} /></footer>
          </>} />
        {columns.length > 0 && <CompareTrendTray playerIds={ids} context={context} />}
      </div>
      {notice && <p className="pvp-notice" role="status">{notice} {notice === "Investigation saved." && <Link href="/investigations">Open saved investigations</Link>}</p>}
      {active === "sixfactor" && <GatedNote why="These are descriptive box-score proxies, not six-factor RAPM coefficients or defensive impact.">Box-score factor proxies.</GatedNote>}
    </div>
    {columns.length > 0 && <div className="pvp-export" aria-hidden="true">
      <CompareGridExport ref={svgRef} columns={columns} lines={lines} title={`${title} · ${spanLabel} · ${COMPARE_PRESETS[active].label}`} />
    </div>}
    <CompareMetricsDrawer open={editing} onClose={() => setEditing(false)} selected={custom} catalog={metricDefinitions} views={views}
      onChange={next => change({ preset: "custom", customMetrics: next.join(",") })} />
  </div>;
}
