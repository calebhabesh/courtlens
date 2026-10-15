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
import { CourtLensWordmark } from "./courtlens-wordmark";
import { BrandMark } from "./brand";
import { accoladeGroups, type AccoladeGroups } from "@/lib/compare-accolades";
import { formatDate } from "@/lib/format-date";
import { PageHeader } from "./ui/panel";
import { Icon } from "./ui/icon";
import { GatedNote } from "./ui/gated-note";
import { Menu, MenuItem } from "./ui/menu";
import { ContextBar } from "./context-bar";
import { MultiPlayerLinesView } from "./multi-player-lines-view";
import { useWorkspace } from "@/lib/workspace-context";
import { saveInvestigation } from "@/lib/workbench-api";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import type { AnalyticsCatalog, ComparisonCareerResponse, MetricComparisonItem, MetricDefinition, PlayerBio, PlayerComparisonResponse, PlayerResearchItem, WorkbenchCatalog, WorkbenchQueryResponse } from "@/lib/types";
import { Button, IconButton, Segmented, Select } from "./ui/kit";
export type { ComparePresetId } from "@/lib/comparison-metrics";

/** Owner trial, row 3, 22: league percentiles hidden to keep the slim card on one screen. */
const SHOW_PERCENTILES = false;

type Scope = { season: string; phase: string; before_date: string; window: string; release_id?: string };

const MODES: { value: CompareCountingMode; label: string; rate?: boolean }[] = [
  { value: "per_game", label: "Per Game" }, { value: "per_75", label: "Per 75", rate: true },
  { value: "per_100", label: "Per 100", rate: true }, { value: "raw", label: "Totals" }
];

/**
 * Player Comparison (alignment row 3): one slim duel card in Databallr's shape (22). Both players,
 * one row of presets and the span/counting menu, then mirrored one-line rows for the stats and the
 * accolades. Pills mark the leading side per metric, which also reads heavier; there is no verdict.
 */
export function PlayerCompareView({ comparison, bios = [null, null], career = null, span = "season", cohort, metricDefinitions = [], workbenchCatalog, additionalPlayerIds = [], context, selector, error = null }: {
  comparison: PlayerComparisonResponse | null; bios?: [PlayerBio | null, PlayerBio | null]; catalog?: AnalyticsCatalog; cohort?: WorkbenchQueryResponse | null;
  /** Both careers through the cutoff; present when ``span`` is career. */
  career?: ComparisonCareerResponse | null; span?: "season" | "career";
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
  const careerItems = career ? [career.player_a.item, career.player_b.item].filter((item): item is PlayerResearchItem => item != null) : [];
  const careerView = span === "career";
  // Careers offer per game and totals only; possession rates need season exposure.
  const careerMode: CompareCountingMode = mode === "raw" ? "raw" : "per_game";
  const rows = comparison ? careerView ? comparisonRows(keys, careerMode, comparison, metricDefinitions, { items: careerItems }, true) : comparisonRows(keys, mode, comparison, metricDefinitions, cohort) : [];
  const a = comparison?.player_a ?? null, b = comparison?.player_b ?? null;
  // Career rows carry no league percentile: each season ranks against its own league.
  const cohortRow = (id?: string) => careerView ? undefined : cohort?.items.find(row => row.player_id === id);
  const minutes = cohort?.table_cohort?.min_season_minutes ?? 500;
  const modeLabel = MODES.find(entry => entry.value === mode)?.label ?? "Per Game";
  const trends = params.get("compareView") === "lines";
  const accolades = accoladeGroups(bios, [a?.championships, b?.championships], context.season, context.before_date);

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
  const spanLabel = careerView ? `Career through ${context.season}` : context.season;
  async function share() {
    if (!svgRef.current || !a || !b) return;
    setExporting(true);
    try { await exportSvgAsPng(svgRef.current, { title: exportTitle, subtitle: `${spanLabel} · ${COMPARE_PRESETS[active].label} · ${modeLabel}`, context, evidenceId: context.release_id, filename: `courtlens-compare-${a.id}-vs-${b.id}`, inlineImages: true }); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Image export unavailable."); }
    finally { setExporting(false); }
  }
  const careerOf = (side: "a" | "b") => career ? side === "a" ? career.player_a : career.player_b : null;

  return <div className="pvp" role="region" aria-label="Player Comparison Explorer">
    <PageHeader className="pvp-header" icon="swap" title="Player Comparison" subtitle="Compare stats between any two NBA players" />
    <div className="pvp-scope">
      <ContextBar catalog={workbenchCatalog ?? undefined} initialReleaseId={context.release_id} initialSeason={context.season} initialPhase={context.phase} initialBeforeDate={context.before_date} initialWindow={context.window}
        modes={<div className="pvp-actions">
          <Button size="sm" variant="primary" icon="sliders" onClick={() => setEditing(true)}>Edit Metrics</Button>
          <Button size="sm" icon="download" disabled={exporting || !a || !b} onClick={() => void share()}>{exporting ? "Exporting…" : "Share Image"}</Button>
          <Menu renderTrigger={props => <IconButton {...props} size="sm" variant="secondary" icon="more" label="More" />}>
            <MenuItem label="Export SVG" onClick={() => { if (svgRef.current && a && b) exportSvgFile(svgRef.current, `courtlens-compare-${a.id}-vs-${b.id}.svg`, { title: exportTitle, context, filename: "courtlens-compare" }); }} />
            <MenuItem label="Copy link" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => setNotice("Link copied.")).catch(() => setNotice("Clipboard unavailable.")); }} />
            <MenuItem label="Save investigation" onClick={() => { void saveInvestigation(exportTitle, { type: "player_comparison", ...Object.fromEntries(params), ...context, preset: active, customMetrics: custom }).then(() => setNotice("Investigation saved.")).catch(() => setNotice("Save unavailable.")); }} />
          </Menu>
        </div>}
        detailRows={[{ label: "Source", value: `${workbenchCatalog?.source ?? "Published box scores"}${a && b ? ` · ${a.games_played} / ${b.games_played} GP` : ""}` },
          { label: "Career", value: "Every observed season up to the compared one, with games before the cutoff only; no league percentiles." },
          { label: "Accolades", value: "Basketball-Reference season awards, counted once announced before the cutoff; titles from admitted playoff box scores." },
          { label: "Resolved comparison context", value: JSON.stringify(comparison?.context ?? context), mono: true },
          { label: "Percentile cohort", value: `${cohort?.table_cohort?.qualified_players ?? "Unknown"} league players with ${minutes}+ season minutes, same season and phase.` },
          { label: "Metric definitions", value: "Registered catalog directions; unavailable metrics stay unknown." }]} />
    </div>
    {a && b && <AssistantPageSelection route="/compare" playerIds={[a.id, b.id, ...additionalPlayerIds]} scope={context} label={`${a.name} / ${b.name}`} />}
    <div className="pvp-column" data-paired={(a && b) || undefined}>
      <div className="pvp-stack">
      <section className="pvp-card" aria-label="Comparison card">
        {a && b ? <>
          <div className="pvp-players">
            <ComparePlayerSlot key={`a-${a.id}`} side="a" player={a} bio={bios[0]} season={context.season} onPick={selection => pick("a", selection)}
              games={careerView ? careerOf("a")?.item?.games_played : undefined} />
            <IconButton className="pvp-swap" size="sm" variant="secondary" icon="swap" label="Swap players" onClick={swap} />
            <ComparePlayerSlot key={`b-${b.id}`} side="b" player={b} bio={bios[1]} season={context.season} onPick={selection => pick("b", selection)}
              games={careerView ? careerOf("b")?.item?.games_played : undefined} />
          </div>
          <div className="pvp-controls">
            <div className="pvp-presets"><Segmented size="sm" label="Comparison Metric Presets" value={active} onChange={value => change({ preset: value })}
              options={Object.entries(COMPARE_PRESETS).map(([value, entry]) => ({ value: value as ComparePresetId, label: entry.label }))} /></div>
            {/* Season or career and the counting mode share one menu (21, 22): season values stay bare. */}
            <Select size="sm" aria-label="Counting mode" value={careerView ? `career:${careerMode}` : mode}
              onChange={event => { const [first, second] = event.target.value.split(":"); change(second ? { span: "career", countingMode: second } : { span: "season", countingMode: first }, true); }}>
              <optgroup label={context.season}>
                {MODES.map(entry => <option key={entry.value} value={entry.value} disabled={entry.rate && !rates.includes(entry.value)}>
                  {entry.rate && !rates.includes(entry.value) ? `${entry.label} (needs possession data)` : entry.label}</option>)}
              </optgroup>
              <optgroup label={`Career through ${context.season}`}>
                <option value="career:per_game">Career · Per Game</option>
                <option value="career:raw">Career · Totals</option>
              </optgroup>
            </Select>
          </div>
        </> : <>
          {/* Only when no pair resolves: silhouettes over the two-field picker. */}
          <div className="pvp-players-empty" aria-hidden="true">
            <span className="pvp-photo pvp-photo-empty"><span className="pvp-silhouette"><Icon name="person" size={20} /></span></span>
            <span className="pvp-photo pvp-photo-empty"><span className="pvp-silhouette"><Icon name="person" size={20} /></span></span>
          </div>
          {selector}
        </>}
        {error && <div role="alert"><GatedNote why={error}>Unable to compare.</GatedNote></div>}
        {a && b && <>
          <div className="pvp-body">
            <table key={`${a.id}-${b.id}-${active}-${mode}-${span}`} className="pvp-rows pvp-fade" aria-label="Descriptive comparison">
              <caption className="sr-only">{careerView ? `Career through ${context.season}` : `${context.season} ${context.phase === "playoffs" ? "Playoffs" : "Season"}`}</caption>
              <Columns names={[a.name, b.name]} />
              <tbody>{rows.map(row => {
                const group = active === "overall" ? overallGroupStart(row.metric) : null;
                return <Fragment key={row.metric}>
                  {group && <tr className="pvp-group"><th colSpan={5} scope="colgroup">{group}</th></tr>}
                  <MetricRow row={row} direction={direction(row.metric)} names={[a.name, b.name]} definition={metricDefinitions.find(entry => entry.key === row.metric)}
                    percentiles={[cohortRow(a.id), cohortRow(b.id)]} minutes={minutes} />
                </Fragment>;
              })}
              {careerView && <PlainRow label="Seasons" title={`Observed seasons through ${context.season}`} a={careerOf("a")?.seasons.length ?? null} b={careerOf("b")?.seasons.length ?? null} names={[a.name, b.name]} />}
              </tbody>
            </table>
            <table key={`${a.id}-${b.id}-accolades`} className="pvp-rows pvp-fade" aria-label="Accolades">
              <caption className="sr-only">{`Accolades through ${formatDate(context.before_date)}`}</caption>
              <Columns names={[a.name, b.name]} />
              <tbody><AccoladeRows groups={accolades} season={context.season} names={[a.name, b.name]} /></tbody>
            </table>
          </div>
          {!rows.length && <GatedNote action={<Button size="md" onClick={() => change({ preset: "custom", customMetrics: CUSTOM_DEFAULT.join(",") })}>Reset metrics</Button>}>No custom metrics selected.</GatedNote>}
          <footer className="pvp-foot"><BrandMark size={22} framed={false} /><CourtLensWordmark height={18} /></footer>
        </>}
      </section>

        {a && b && <div className="pvp-tray" data-open={trends || undefined}>
          <div className="pvp-tray-tab">
            <Button size="sm" variant="ghost" icon="chart-line" iconAfter={trends ? "chevron-up" : "chevron-down"} aria-expanded={trends} aria-controls="pvp-trend-drawer"
              onClick={() => change({ compareView: trends ? "table" : "lines" })}>Trend lines</Button>
          </div>
          {trends && <div className="pvp-tray-body" id="pvp-trend-drawer">
            <MultiPlayerLinesView variant="embedded" playerIds={[a.id, b.id, ...additionalPlayerIds]} context={context} />
          </div>}
        </div>}
      </div>
      {notice && <p className="pvp-notice" role="status">{notice} {notice === "Investigation saved." && <Link href="/investigations">Open saved investigations</Link>}</p>}
      {a && b && active === "sixfactor" && <GatedNote why="These are descriptive box-score proxies, not six-factor RAPM coefficients or defensive impact.">Box-score factor proxies.</GatedNote>}
    </div>

    {a && b && <div className="pvp-export" aria-hidden="true">
      <CompareCardExport ref={svgRef} season={context.season} players={[a, b]} rows={rows} accolades={[...accolades.career, ...accolades.season]} direction={direction} labels={new Map(metricDefinitions.map(entry => [entry.key, entry]))} title={`${exportTitle} · ${spanLabel} · ${COMPARE_PRESETS[active].label}`} />
    </div>}
    <CompareMetricsDrawer open={editing} onClose={() => setEditing(false)} selected={custom} catalog={metricDefinitions} views={views}
      onChange={next => change({ preset: "custom", customMetrics: next.join(",") })} />
  </div>;
}

/** Fixed mirrored columns (pill · value · label · value · pill) with the player names for readers. */
function Columns({ names }: { names: [string, string] }) {
  return <>
    <colgroup><col className="pvp-col-pill" /><col /><col className="pvp-col-label" /><col /><col className="pvp-col-pill" /></colgroup>
    <thead className="sr-only"><tr><th scope="col">{names[0]} difference</th><th scope="col">{names[0]}</th><th scope="col">Metric</th><th scope="col">{names[1]}</th><th scope="col">{names[1]} difference</th></tr></thead>
  </>;
}

function MetricRow({ row, direction, names, definition, percentiles, minutes }: {
  row: MetricComparisonItem; direction: ReturnType<typeof comparisonFlags>["direction"]; names: [string, string];
  definition?: MetricDefinition; percentiles: [PlayerResearchItem | undefined, PlayerResearchItem | undefined]; minutes: number;
}) {
  const a = typeof row.value_a === "number" ? row.value_a : null, b = typeof row.value_b === "number" ? row.value_b : null;
  const precision = row.metric === "gp" ? 0 : 1;
  const gap = a != null && b != null ? Math.abs(a - b) * (isPercentUnit(row.unit) ? 100 : 1) : null;
  // A gap that rounds to nothing on the card is shown as a tie: no pill, no emphasis.
  const leader = gap != null && Number(gap.toFixed(precision)) > 0 ? leadingIdentity(a, b, direction) : null;
  const label = cardLabel(row.metric, definition);
  const pill = (side: "a" | "b") => leader === side && gap != null
    ? <span className="pvp-pill" data-identity={side} title={`${names[side === "a" ? 0 : 1]}: ${gap.toFixed(1)}${isPercentUnit(row.unit) ? " percentage points" : ""} ${direction === "low" ? "fewer" : "more"} ${label.toLowerCase()}`}>+{gap.toFixed(precision)}</span>
    : null;
  const cell = (side: "a" | "b") => {
    const value = side === "a" ? row.value_a : row.value_b;
    const player = side === "a" ? percentiles[0] : percentiles[1];
    return <td className="pvp-value" data-leading={leader === side || undefined} title={`n=${side === "a" ? row.n_a : row.n_b}`}>
      <PercentileCell variant="text" showPercentile={SHOW_PERCENTILES} value={value == null ? null : formatCardValue(value, row.unit, row.metric)} percentile={player?.table_percentiles?.[row.metric] ?? null}
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

/** A count row outside the metric catalog (career seasons); higher leads, unknown stays "—". */
function PlainRow({ label, title, a, b, names }: { label: string; title: string; a: number | null; b: number | null; names: [string, string] }) {
  const leader = a != null && b != null && a !== b ? (a > b ? "a" : "b") : null;
  const pill = (side: "a" | "b") => leader === side && a != null && b != null
    ? <span className="pvp-pill" data-identity={side} title={`${names[side === "a" ? 0 : 1]}: ${Math.abs(a - b)} more`}>+{Math.abs(a - b)}</span> : null;
  return <tr>
    <td className="pvp-pill-cell">{pill("a")}</td>
    <td className="pvp-value pvp-plain" data-leading={leader === "a" || undefined}>{a ?? "—"}</td>
    <th scope="row" className="pvp-label" title={title}>{label}</th>
    <td className="pvp-value pvp-plain" data-leading={leader === "b" || undefined}>{b ?? "—"}</td>
    <td className="pvp-pill-cell">{pill("b")}</td>
  </tr>;
}

/** Accolades through the cutoff, then the compared season's honours once announced (row 3, 9). */
function AccoladeRows({ groups, season, names }: { groups: AccoladeGroups; season: string; names: [string, string] }) {
  if (!groups.career.length && !groups.season.length) return <tr className="pvp-pending"><td colSpan={5}>No accolades on record for either player.</td></tr>;
  const row = (entry: AccoladeGroups["career"][number], pills: boolean) => {
    const gap = entry.a != null && entry.b != null ? Math.abs(entry.a - entry.b) : null;
    const pill = (side: "a" | "b") => pills && entry.leader === side && gap
      ? <span className="pvp-pill" data-identity={side} title={`${names[side === "a" ? 0 : 1]}: ${gap} more`}>+{gap}</span> : null;
    const value = (side: "a" | "b") => <td className="pvp-value pvp-plain" data-leading={entry.leader === side || undefined}>{entry.shown[side === "a" ? 0 : 1]}</td>;
    return <tr key={entry.key}>
      <td className="pvp-pill-cell">{pill("a")}</td>{value("a")}
      <th scope="row" className="pvp-label" title={entry.title}>{entry.label}</th>
      {value("b")}<td className="pvp-pill-cell">{pill("b")}</td>
    </tr>;
  };
  return <>
    {groups.career.length > 0 && <tr className="pvp-group"><th colSpan={5} scope="colgroup">Accolades</th></tr>}
    {groups.career.map(entry => row(entry, true))}
    {(groups.season.length > 0 || groups.seasonPending) && <tr className="pvp-group"><th colSpan={5} scope="colgroup">{season} Honors</th></tr>}
    {groups.season.map(entry => row(entry, false))}
    {groups.seasonPending && <tr className="pvp-pending"><td colSpan={5}>{season} awards are announced after this cutoff.</td></tr>}
  </>;
}
