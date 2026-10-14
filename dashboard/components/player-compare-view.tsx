"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { COMPARE_PRESETS, CUSTOM_DEFAULT, customMetricKeys, comparisonRows, formatComparisonValue, type CompareCountingMode, type ComparePresetId } from "@/lib/comparison-metrics";
import { comparisonFlags, leadingIdentity, toneColor } from "./charts/semantics";
import { DeltaChip } from "./charts";
import { CompareIdentityCard } from "./compare-identity-card";
import { CompareLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { GatedNote } from "./ui/gated-note";
import { Menu, MenuItem } from "./ui/menu";
import { ContextBar } from "./context-bar";
import { MultiPlayerLinesView } from "./multi-player-lines-view";
import { useWorkspace } from "@/lib/workspace-context";
import { saveInvestigation } from "@/lib/workbench-api";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import { scopeContextLine } from "@/lib/scope-labels";
import type { AnalyticsCatalog, MetricDefinition, PlayerComparisonResponse, WorkbenchCatalog, WorkbenchQueryResponse } from "@/lib/types";
import { Button, MenuTrigger, Segmented } from "./ui/kit";
export type { ComparePresetId } from "@/lib/comparison-metrics";

export function PlayerCompareView({ comparison, cohort, metricDefinitions = [], workbenchCatalog, selector, additionalPlayerIds = [], context }: {
  comparison: PlayerComparisonResponse; catalog?: AnalyticsCatalog; cohort?: WorkbenchQueryResponse | null;
  metricDefinitions?: MetricDefinition[]; workbenchCatalog?: WorkbenchCatalog | null; selector?: ReactNode; additionalPlayerIds?: string[];
  context: { season: string; phase: string; before_date: string; window: string; release_id?: string };
}) {
  const router = useRouter(), params = useSearchParams();
  const { views } = useWorkspace();
  const [exporting, setExporting] = useState(false), [notice, setNotice] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const preset = params.get("preset");
  const active: ComparePresetId = preset && Object.hasOwn(COMPARE_PRESETS, preset) ? preset as ComparePresetId : "overall";
  const requestedMode = params.get("countingMode");
  const mode: CompareCountingMode = requestedMode === "raw" || requestedMode === "per_75" || requestedMode === "per_100" ? requestedMode : "per_game";
  const custom = customMetricKeys(params.get("customMetrics"), metricDefinitions);
  const keys = active === "custom" ? custom : COMPARE_PRESETS[active].metrics;
  const rows = comparisonRows(keys, mode, comparison, metricDefinitions, cohort);
  const { player_a: a, player_b: b } = comparison;
  const names: [string, string] = [a.name, b.name];
  const lines = params.get("compareView") === "lines";
  function change(key: string, value: string, server = false) {
    const next = new URLSearchParams(params.toString()); next.set(key, value);
    if (server) router.push(`/compare?${next}`, { scroll: false });
    else window.history.pushState(null, "", `/compare?${next}`);
  }
  function direction(metric: string) { return comparisonFlags(metricDefinitions.find(definition => definition.key === metric) ?? {}).direction; }
  async function share() {
    if (!svgRef.current) return;
    setExporting(true);
    try { await exportSvgAsPng(svgRef.current, { title: `${a.name} vs ${b.name}`, subtitle: `${COMPARE_PRESETS[active].label} · ${mode === "raw" ? "Totals" : mode.replaceAll("_", " ")}`, context, evidenceId: context.release_id, filename: `courtlens-compare-${a.id}-vs-${b.id}` }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Image export unavailable."); }
    finally { setExporting(false); }
  }
  return <div className="player-compare-container" role="region" aria-label="Player Comparison Explorer">
    <PageHeader title="Player Comparison" subtitle={`Source: ${workbenchCatalog?.source ?? "published box scores"} · ${a.games_played} / ${b.games_played} GP`} actions={<>
      <Button size="lg" icon="download" disabled={exporting} onClick={() => void share()}>{exporting ? "Exporting…" : "Share image"}</Button>
      <Menu renderTrigger={props => <MenuTrigger {...props} size="lg">More</MenuTrigger>}><MenuItem label="Export SVG" onClick={() => {if (svgRef.current) exportSvgFile(svgRef.current, `courtlens-compare-${a.id}-vs-${b.id}.svg`, {title:`${a.name} vs ${b.name}`,context,filename:"courtlens-compare"});}} />
        <MenuItem label="Copy link" onClick={() => {void navigator.clipboard.writeText(window.location.href).then(() => setNotice("Link copied.")).catch(() => setNotice("Clipboard unavailable."));}} />
        <MenuItem label="Save investigation" onClick={() => {void saveInvestigation(`${a.name} vs ${b.name}`, {type:"player_comparison", ...Object.fromEntries(params), ...context, preset:active, customMetrics:custom}).then(() => setNotice("Investigation saved.")).catch(() => setNotice("Save unavailable."));}} />
      </Menu>
    </>} />
    <ContextBar catalog={workbenchCatalog ?? undefined} initialReleaseId={context.release_id} initialSeason={context.season} initialPhase={context.phase} initialBeforeDate={context.before_date} initialWindow={context.window}
      detailRows={[{label:"Resolved comparison context",value:JSON.stringify(comparison.context),mono:true},{label:"Metric definitions",value:"Registered catalog directions; unavailable metrics stay unknown."}]}/>
    <AssistantPageSelection route="/compare" playerIds={[a.id,b.id,...additionalPlayerIds]} scope={context} label={`${a.name} / ${b.name}`} />
    <CompareLayout sidePanels={false} className="pc04-compare" sides={[<CompareIdentityCard key="a" player={a} side="a" />,<CompareIdentityCard key="b" player={b} side="b" />]}>
      {selector}
      <div className="pc04-modes">
        <Segmented size="md" label="Comparison Metric Presets" value={active} onChange={value => change("preset",value)} options={Object.entries(COMPARE_PRESETS).map(([value,preset]) => ({value:value as ComparePresetId,label:preset.label}))}/>
        <Segmented size="md" label="Counting mode" value={mode} onChange={value => change("countingMode",value,true)} options={[{value:"per_game",label:"Per Game"},{value:"per_75",label:"Per 75",disabled:!workbenchCatalog?.stats_normalizations?.includes("per_75")},{value:"per_100",label:"Per 100",disabled:!workbenchCatalog?.stats_normalizations?.includes("per_100")},{value:"raw",label:"Totals"}]}/>
      </div>
      {!workbenchCatalog?.stats_normalizations?.includes("per_75") && <GatedNote why="Per 75 and Per 100 require compatible actual on-court possession exposure. No box-score estimate replaces it.">Possession rates unavailable in this release.</GatedNote>}
      {active === "sixfactor" && <GatedNote why="These are descriptive box-score proxies, not six-factor RAPM coefficients or defensive impact.">Box-score factor proxies.</GatedNote>}
      {active === "custom" && <details className="pc04-custom" open><summary>Choose metrics · {custom.length} / 25</summary>
        <label>Saved view <select aria-label="Personal custom view" value="" onChange={event => {const view=views.find(view=>view.id===event.target.value);if(view)change("customMetrics",view.columns.slice(0,25).join(","));}}><option value="">Choose a saved view</option>{views.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
        <div className="pc04-custom-grid">{metricDefinitions.map(metric=><label key={metric.key}><input type="checkbox" checked={custom.includes(metric.key)} disabled={!custom.includes(metric.key) && custom.length >= 25} onChange={event => change("customMetrics", (event.target.checked ? [...custom,metric.key] : custom.filter(key=>key!==metric.key)).join(","))}/>{metric.display_name}</label>)}</div>
        <Button size="lg" onClick={()=>change("customMetrics",CUSTOM_DEFAULT.join(","))}>Reset metrics</Button>
      </details>}
      <p className="pc04-legend"><span className="text-player-a">A · {a.name}</span><span className="text-player-b">B · {b.name}</span><span>Chip = per-metric difference · fewer for lower-is-better</span></p>
      <div className="pc04-table-wrap"><table className="pc04-metric-table" aria-label="Descriptive comparison"><thead><tr><th scope="col">{a.name}</th><th scope="col">Metric · difference</th><th scope="col">{b.name}</th></tr></thead><tbody>{rows.map(row => {
        const valueA = typeof row.value_a === "number" ? row.value_a : null, valueB = typeof row.value_b === "number" ? row.value_b : null;
        const percentage = ["percentage","%","ratio","ratio difference"].includes(row.unit);
        const leader = leadingIdentity(valueA,valueB,direction(row.metric));
        return <tr key={row.metric}><td className="num" data-leading={leader === "a" || undefined}>{formatComparisonValue(row.value_a,row.unit)}</td>
          <th scope="row"><span>{row.display_name}</span><DeltaChip a={percentage && valueA != null ? valueA*100 : valueA} b={percentage && valueB != null ? valueB*100 : valueB} names={names} direction={direction(row.metric)} unit={percentage ? "pp" : row.unit}/><small>n={row.n_a} / {row.n_b}</small></th>
          <td className="num" data-leading={leader === "b" || undefined}>{formatComparisonValue(row.value_b,row.unit)}</td></tr>;
      })}</tbody></table></div>
      {!rows.length && <GatedNote action={<Button size="lg" onClick={()=>change("customMetrics",CUSTOM_DEFAULT.join(","))}>Reset metrics</Button>}>No custom metrics selected.</GatedNote>}
      <p className="chart-provenance">Source: {workbenchCatalog?.source ?? "published box scores"} · {a.games_played} / {b.games_played} GP · {scopeContextLine(context.season,context.phase,context.before_date)} · Missing values: —</p>
      {notice && <p role="status">{notice} {notice === "Investigation saved." && <Link href="/investigations">Open saved investigations</Link>}</p>}
      <details className="fo11-export-chart"><summary>Export chart preview</summary><svg ref={svgRef} className="compare-bar-svg" role="img" aria-label={`Comparative metric bars for ${a.name} versus ${b.name}`} viewBox={`0 0 800 ${Math.max(180,rows.length*56+100)}`}>
        <title>{`${a.name} vs ${b.name} · ${COMPARE_PRESETS[active].label}`}</title>
        <text x="24" y="28" fill="var(--color-identity-a)">{a.name}</text><text x="776" y="28" textAnchor="end" fill="var(--color-identity-b)">{b.name}</text>
        {rows.map((row,i) => {const va=typeof row.value_a === "number" ? row.value_a : null,vb=typeof row.value_b === "number" ? row.value_b : null;const scale=Math.max(Math.abs(va??0),Math.abs(vb??0),1);const leader=leadingIdentity(va,vb,direction(row.metric));return <g key={row.metric} transform={`translate(0,${i*56+60})`}>
          <text x="400" y="0" textAnchor="middle" fill="var(--color-text)" fontSize="12">{row.display_name}</text>
          {va != null && <rect x={350-Math.abs(va)/scale*280} y="12" width={Math.abs(va)/scale*280} height="8" fill={toneColor("identity-a")}/>}{vb != null && <rect x="450" y="12" width={Math.abs(vb)/scale*280} height="8" fill={toneColor("identity-b")}/>}
          <text x="24" y="20" fill="var(--color-identity-a)" fontSize="12">{formatComparisonValue(row.value_a,row.unit)}</text><text x="776" y="20" textAnchor="end" fill="var(--color-identity-b)" fontSize="12">{formatComparisonValue(row.value_b,row.unit)}</text>
          <text x="400" y="20" textAnchor="middle" fill={leader ? toneColor(`identity-${leader}`) : "var(--color-text-secondary)"} fontSize="12">{row.diff == null ? "—" : `${Math.abs(row.diff*(row.unit === "percentage" || row.unit === "ratio" ? 100 : 1)).toFixed(1)}${direction(row.metric)==="low" ? " fewer" : ""}`}</text>
        </g>;})}<text x="24" y={rows.length*56+85} fill="var(--color-text-secondary)" fontSize="12">{`Source: ${workbenchCatalog?.source ?? "published boxes"} · ${a.games_played}/${b.games_played} GP · ${context.season}`}</text>
      </svg></details>
      <details open={lines}><summary onClick={event=>{event.preventDefault();change("compareView",lines ? "table" : "lines");}}>Trend lines</summary>{lines && <MultiPlayerLinesView playerIds={[a.id,b.id,...additionalPlayerIds]} context={context}/>}</details>
      <GatedNote why={<><p>{comparison.no_forced_winner_notice}</p><p>Identity colors apply to each declared metric direction; neutral chips mean ties, missing values or no declared direction. No composite score is calculated. Image bars show magnitude; signed values remain visible.</p></>}>Descriptive differences under a shared scope.</GatedNote>
    </CompareLayout>
  </div>;
}
