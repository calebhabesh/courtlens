"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { COMPARE_PRESETS, CUSTOM_DEFAULT, isWholeCount, cardLabel, customMetricKeys, comparisonRows, formatCardValue, isPercentUnit, overallGroupStart, pillStrength, availabilityShare, type CompareCountingMode, type ComparePresetId, type PillStrength } from "@/lib/comparison-metrics";
import { comparisonFlags, leadingIdentity } from "./charts/semantics";
import { PercentileCell } from "./charts";
import { CompareCardExport } from "./compare-card-export";
import { ComparePlayerSlot, type CompareSelection } from "./compare-player-slot";
import { CompareEmptySlot } from "./compare-empty-slot";
import { PlayerSilhouette } from "./player-silhouette";
import { COMPARE_SUBTITLE, COUNTING_MODES, CountingMenu, countingParams } from "./compare-counting-menu";
import { CompareTrendTray } from "./compare-trend-tray";
import { duelParams, gridFromDuel, gridParams, type GridSelection } from "@/lib/compare-grid";
import { CompareGridView } from "./compare-grid-view";
import type { GridColumn } from "./compare-grid";
import { slotTeams } from "./compare-player-slot";
import { CompareMetricsDrawer } from "./compare-metrics-drawer";
import { CompareSeasonPicker } from "./compare-season-picker";
import { CompareSeasonHonors } from "./compare-season-honors";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { BrandMark } from "./brand";
import { accoladeGroups, type AccoladeGroups } from "@/lib/compare-accolades";
import { formatDate } from "@/lib/format-date";
import { PageHeader } from "./ui/panel";
import { GatedNote } from "./ui/gated-note";
import { Menu, MenuItem } from "./ui/menu";
import { ContextBar } from "./context-bar";
import { useWorkspace } from "@/lib/workspace-context";
import { saveInvestigation } from "@/lib/workbench-api";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import type { AnalyticsCatalog, ComparisonAvailability, ComparisonCareerResponse, MetricComparisonItem, MetricDefinition, PlayerBio, PlayerComparisonResponse, PlayerResearchItem, WorkbenchCatalog, WorkbenchQueryResponse } from "@/lib/types";
import { Button, IconButton, Segmented } from "./ui/kit";
export type { ComparePresetId } from "@/lib/comparison-metrics";


/** Owner trial, row 3, 22: league percentiles hidden to keep the slim card on one screen. */
const SHOW_PERCENTILES = false;

type Side = { season: string; before_date: string };
const PER_PLAYER_SEASONS = ["seasonA", "seasonB", "seasons"];

type Scope = { season: string; phase: string; before_date: string; window: string; release_id?: string };


/**
 * Player Comparison (alignment row 3): one slim duel card in Databallr's shape (22). Both players,
 * one row of presets and the span/counting menu, then mirrored one-line rows for the stats and the
 * accolades. Pills mark the leading side per metric, which also reads heavier; there is no verdict.
 */
export function PlayerCompareView({ comparison: served, bios: servedBios = [null, null], career: servedCareer = null, sides: servedSides = null, played: servedPlayed = null, span = "season", cohort, metricDefinitions = [], workbenchCatalog, additionalPlayerIds = [], context, selector, pending = null, error = null }: {
  comparison: PlayerComparisonResponse | null; bios?: [PlayerBio | null, PlayerBio | null]; catalog?: AnalyticsCatalog; cohort?: WorkbenchQueryResponse | null;
  /** Both careers through the cutoff; present when ``span`` is career. */
  career?: ComparisonCareerResponse | null; span?: "season" | "career";
  /** Each player's season and cutoff; they differ when one player is compared in another season. */
  sides?: { a: Side; b: Side } | null;
  /** Seasons each player has games in, this phase. */
  played?: { a: string[]; b: string[] } | null;
  metricDefinitions?: MetricDefinition[]; workbenchCatalog?: WorkbenchCatalog | null; additionalPlayerIds?: string[];
  context: Scope; selector?: ReactNode; error?: string | null;
  /** Before a pair resolves: the player already chosen for each side, if any (24). */
  pending?: { a: CompareSelection | null; b: CompareSelection | null } | null;
}) {
  const router = useRouter(), params = useSearchParams();
  // Swap is instant (29): the card holds both sides, so it mirrors them while the URL changes,
  // and later server reads arrive already in the URL's order.
  const flipped = served != null && params.get("playerA") === served.player_b.id && params.get("playerB") === served.player_a.id;
  const comparison = served && flipped ? mirror(served) : served;
  const bios: [PlayerBio | null, PlayerBio | null] = flipped ? [servedBios[1], servedBios[0]] : servedBios;
  const career = servedCareer && flipped ? { ...servedCareer, player_a: servedCareer.player_b, player_b: servedCareer.player_a } : servedCareer;
  const sides = servedSides && flipped ? { a: servedSides.b, b: servedSides.a } : servedSides;
  const played = servedPlayed && flipped ? { a: servedPlayed.b, b: servedPlayed.a } : servedPlayed;
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
  const modeLabel = COUNTING_MODES.find(entry => entry.value === mode)?.label ?? "Per Game";
  const seasonOf = (side: "a" | "b") => sides?.[side].season ?? context.season;
  const cutoffOf = (side: "a" | "b") => sides?.[side].before_date ?? context.before_date;
  const accolades = accoladeGroups(bios, [a?.championships, b?.championships], [seasonOf("a"), seasonOf("b")], [cutoffOf("a"), cutoffOf("b")]);
  /** Compare one player in another season; the page season clears that player's override. */
  function chooseSeason(side: "a" | "b", season: string) {
    const next = new URLSearchParams(params.toString());
    const key = side === "a" ? "seasonA" : "seasonB";
    if (season === context.season) next.delete(key); else next.set(key, season);
    navigate(next, true);
  }

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
  /** Fill one open side; the other side's choice (if any) stays, and a full pair loads (24). */
  function pickPending(side: "a" | "b", selection: CompareSelection) {
    const other = side === "a" ? pending?.b : pending?.a;
    if (selection.id === other?.id) { setNotice("Choose two different players."); return; }
    const next = new URLSearchParams(params.toString());
    next.set(side === "a" ? "playerA" : "playerB", selection.id); next.delete("players"); next.delete("empty");
    setNotice("");
    navigate(next, true);
  }
  /** Clear players (24): both sides return to open slots; the scope, preset and mode stay. */
  function clearPlayers() {
    const next = new URLSearchParams(params.toString());
    for (const key of ["playerA", "playerB", "players", "seasonA", "seasonB"]) next.delete(key);
    // Without the marker the page would open on its default pair again.
    next.set("empty", "1");
    setNotice("");
    navigate(next, true);
  }
  /** A third player turns the duel into the grid (64): this pair, then an open slot. The pair's
      data is already here, so the grid opens at once without a server read (74). */
  function addPlayer() {
    if (!a || !b) return;
    navigate(gridParams(params, gridFromDuel(params, a.id, b.id, additionalPlayerIds)), false);
  }
  /** Back from that grid: the same pair is still on screen, anything else is a new read. */
  function backToDuel(selection: GridSelection) {
    const next = duelParams(params, selection);
    const samePair = a && b && selection.ids.length === 2 && selection.ids.every(id => id === a.id || id === b.id);
    navigate(next, !samePair);
  }
  function swap() {
    if (!a || !b) return;
    const next = new URLSearchParams(params.toString());
    next.set("playerA", b.id); next.set("playerB", a.id);
    const seasonA = params.get("seasonA"), seasonB = params.get("seasonB");
    if (seasonB) next.set("seasonA", seasonB); else next.delete("seasonA");
    if (seasonA) next.set("seasonB", seasonA); else next.delete("seasonB");
    if (additionalPlayerIds.length) next.set("players", [b.id, a.id, ...additionalPlayerIds].join(",")); else next.delete("players");
    navigate(next, false);
  }
  function direction(metric: string) { return comparisonFlags(metricDefinitions.find(definition => definition.key === metric) ?? {}).direction; }
  const exportTitle = a && b ? `${a.name} vs ${b.name}` : "Player Comparison";
  // Each player's own season when they differ (38): "2025-26 / 2016-17".
  const seasonLabel = seasonOf("a") === seasonOf("b") ? seasonOf("a") : `${seasonOf("a")} / ${seasonOf("b")}`;
  const spanLabel = careerView ? `Career through ${seasonLabel}` : seasonLabel;
  // A player compared in a season before their first game has nothing to measure yet: their
  // zero seasons and accolades are true, but neither side is marked as leading.
  const debuted = (side: "a" | "b") => !played || played[side].some(season => season <= seasonOf(side));
  const oneSided = !debuted("a") || !debuted("b");
  async function share() {
    if (!svgRef.current || !a || !b) return;
    setExporting(true);
    try { await exportSvgAsPng(svgRef.current, { title: exportTitle, subtitle: `${spanLabel} · ${COMPARE_PRESETS[active].label} · ${modeLabel}`, context, evidenceId: context.release_id, filename: `courtlens-compare-${a.id}-vs-${b.id}`, inlineImages: true }); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Image export unavailable."); }
    finally { setExporting(false); }
  }
  const careerOf = (side: "a" | "b") => career ? side === "a" ? career.player_a : career.player_b : null;
  // Avail % (26): season-to-date games over the teams' games, or the same through the career.
  const availabilityOf = (side: "a" | "b"): ComparisonAvailability | null => careerView ? careerOf(side)?.availability ?? null : (side === "a" ? a : b)?.availability ?? null;
  const availabilityRow = active === "overall" ? availabilityLine(availabilityOf("a"), availabilityOf("b"), oneSided) : null;

  // The URL asks for the grid while this page still holds the duel's pair: the duel opened the
  // grid itself (Add Player), so it draws it from the data it already has.
  if (params.get("layout") === "grid" && a && b) {
    const column = (side: "a" | "b"): GridColumn => {
      const player = side === "a" ? a : b, own = careerOf(side);
      return { player: { player_id: player.id, name: player.name, teams_chronological: slotTeams(player), championships: player.championships ?? null,
        item: careerView ? own?.item ?? null : cohort?.items.find(row => row.player_id === player.id) ?? null,
        seasons: careerView ? own?.seasons ?? [] : null,
        availability: careerView ? own?.availability ?? null : player.availability ?? null },
        season: seasonOf(side), beforeDate: cutoffOf(side), bio: side === "a" ? bios[0] : bios[1], played: played ? played[side] : null };
    };
    return <CompareGridView columns={[column("a"), column("b")]} span={span} context={context} workbenchCatalog={workbenchCatalog} metricDefinitions={metricDefinitions} error={error} toDuel={backToDuel} />;
  }

  return <div className="pvp" role="region" aria-label="Player Comparison Explorer">
    <PageHeader className="pvp-header" icon="swap" title="Player Comparison" subtitle={COMPARE_SUBTITLE} />
    <div className="pvp-scope">
      <ContextBar catalog={workbenchCatalog ?? undefined} initialReleaseId={context.release_id} initialSeason={context.season} initialPhase={context.phase} initialBeforeDate={context.before_date} initialWindow={context.window}
        renderSeason={played && a && b ? picker => <CompareSeasonPicker {...picker} marks={[
          { id: a.id, name: a.name, portraitUrl: a.portrait_url, played: played.a, identity: "a" },
          { id: b.id, name: b.name, portraitUrl: b.portrait_url, played: played.b, identity: "b" }]} /> : undefined}
        // The console's Season is a global override: it resets both players' own seasons (42).
        clearOnSeasonChange={PER_PLAYER_SEASONS}
        modes={<div className="pvp-actions">
          <Button size="sm" variant="primary" icon="sliders" disabled={!a || !b} onClick={() => setEditing(true)}>Edit Metrics</Button>
          <Button size="sm" icon="download" disabled={exporting || !a || !b} onClick={() => void share()}>{exporting ? "Exporting…" : "Share Image"}</Button>
          <Menu renderTrigger={props => <IconButton {...props} size="sm" variant="secondary" icon="more" label="More" disabled={!a || !b} />}>
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
            <ComparePlayerSlot key={`a-${a.id}-${seasonOf("a")}`} side="a" player={a} excludedIds={[a.id, b.id]} bio={bios[0]} season={seasonOf("a")} beforeDate={cutoffOf("a")} playedSeasons={played?.a ?? null}
              onSeason={season => chooseSeason("a", season)} onPick={selection => pick("a", selection)}
              games={careerView ? careerOf("a")?.item?.games_played : undefined} />
            <div className="pvp-pair-actions">
              <IconButton size="sm" variant="secondary" icon="swap" label="Swap players" onClick={swap} />
              <IconButton size="sm" variant="ghost" icon="plus" label="Add Player" onClick={addPlayer} />
              <IconButton size="sm" variant="ghost" icon="user-clear" label="Clear players" onClick={clearPlayers} />
            </div>
            <ComparePlayerSlot key={`b-${b.id}-${seasonOf("b")}`} side="b" player={b} excludedIds={[a.id, b.id]} bio={bios[1]} season={seasonOf("b")} beforeDate={cutoffOf("b")} playedSeasons={played?.b ?? null}
              onSeason={season => chooseSeason("b", season)} onPick={selection => pick("b", selection)}
              games={careerView ? careerOf("b")?.item?.games_played : undefined} />
          </div>
          <div className="pvp-controls">
            <div className="pvp-presets"><Segmented size="sm" dense label="Comparison Metric Presets" value={active} onChange={value => change({ preset: value })}
              options={Object.entries(COMPARE_PRESETS).map(([value, entry]) => ({ value: value as ComparePresetId, label: entry.label }))} /></div>
            {/* Season or career and the counting mode share one menu (21, 22): season values stay bare. */}
            <CountingMenu value={careerView ? `career:${careerMode}` : mode} season={seasonLabel} rates={rates}
              onChange={value => change(countingParams(value), true)} />
          </div>
        </> : pending ? <div className="pvp-players">
          {/* No pair yet (24): an open slot per side, each a plus that searches in place. */}
          <CompareEmptySlot side="a" selection={pending.a} excludedIds={pending.b ? [pending.b.id] : []} onPick={selection => pickPending("a", selection)} />
          <span className="pvp-pair-actions" aria-hidden="true" />
          <CompareEmptySlot side="b" selection={pending.b} excludedIds={pending.a ? [pending.a.id] : []} onPick={selection => pickPending("b", selection)} />
        </div> : <>
          {/* Legacy snapshots keep their two-field picker. */}
          <div className="pvp-players-empty" aria-hidden="true">
            <span className="pvp-photo pvp-photo-empty"><PlayerSilhouette className="pvp-portrait" /></span>
            <span className="pvp-photo pvp-photo-empty"><PlayerSilhouette className="pvp-portrait" /></span>
          </div>
          {selector}
        </>}
        {error && <div role="alert"><GatedNote why={error}>Unable to compare.</GatedNote></div>}
        {a && b && <>
          <div className="pvp-body">
            <table key={`${a.id}-${b.id}-${active}-${mode}-${span}`} className="pvp-rows pvp-fade" aria-label="Descriptive comparison">
              <caption className="sr-only">{careerView ? spanLabel : `${seasonLabel} ${context.phase === "playoffs" ? "Playoffs" : "Season"}`}</caption>
              <Columns names={[a.name, b.name]} />
              <tbody>{rows.map(row => {
                const group = active === "overall" ? overallGroupStart(row.metric) : null;
                return <Fragment key={row.metric}>
                  {group && <tr className="pvp-group"><th colSpan={5} scope="colgroup">{group}</th></tr>}
                  <MetricRow row={row} direction={direction(row.metric)} names={[a.name, b.name]} definition={metricDefinitions.find(entry => entry.key === row.metric)}
                    percentiles={[cohortRow(a.id), cohortRow(b.id)]} minutes={minutes} />
                </Fragment>;
              })}
              {availabilityRow && <PlainRow label="Avail %" {...availabilityRow} names={[a.name, b.name]} />}
              {careerView && <PlainRow label="Seasons" title={`Observed seasons through ${seasonLabel}`} quiet={oneSided} a={careerOf("a")?.seasons.length ?? null} b={careerOf("b")?.seasons.length ?? null} names={[a.name, b.name]} />}
              </tbody>
            </table>
            <table key={`${a.id}-${b.id}-accolades`} className="pvp-rows pvp-fade" aria-label="Accolades">
              <caption className="sr-only">{`Accolades through ${formatDate(context.before_date)}`}</caption>
              <Columns names={[a.name, b.name]} />
              <tbody><AccoladeRows groups={accolades} names={[a.name, b.name]} quiet={oneSided} /></tbody>
            </table>
          </div>
          <CompareSeasonHonors honors={accolades.season} names={[a.name, b.name]} />
          {!rows.length && <GatedNote action={<Button size="md" onClick={() => change({ preset: "custom", customMetrics: CUSTOM_DEFAULT.join(",") })}>Reset metrics</Button>}>No custom metrics selected.</GatedNote>}
          <footer className="pvp-foot"><BrandMark size={22} framed={false} /><CourtLensWordmark height={18} /></footer>
        </>}
      </section>

        {a && b && <CompareTrendTray playerIds={[a.id, b.id, ...additionalPlayerIds]} context={context} />}
      </div>
      {notice && <p className="pvp-notice" role="status">{notice} {notice === "Investigation saved." && <Link href="/investigations">Open saved investigations</Link>}</p>}
      {a && b && active === "sixfactor" && <GatedNote why="These are descriptive box-score proxies, not six-factor RAPM coefficients or defensive impact.">Box-score factor proxies.</GatedNote>}
    </div>

    {a && b && <div className="pvp-export" aria-hidden="true">
      <CompareCardExport ref={svgRef} season={context.season} seasons={[seasonOf("a"), seasonOf("b")]} players={[a, b]} rows={rows} availability={availabilityRow}
      percentiles={careerView ? undefined : metric => [cohortRow(a.id), cohortRow(b.id)].map(row => row?.table_qualified ? row.table_percentiles?.[metric] ?? null : null) as [number | null, number | null]} accolades={accolades.career} honors={accolades.season} direction={direction} labels={new Map(metricDefinitions.map(entry => [entry.key, entry]))} title={`${exportTitle} · ${spanLabel} · ${COMPARE_PRESETS[active].label}`} />
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
  const precision = isWholeCount(row.metric) ? 0 : 1;
  const gap = a != null && b != null ? Math.abs(a - b) * (isPercentUnit(row.unit) ? 100 : 1) : null;
  // A gap that rounds to nothing on the card is shown as a tie: no pill, no emphasis.
  const leader = gap != null && Number(gap.toFixed(precision)) > 0 ? leadingIdentity(a, b, direction) : null;
  const label = cardLabel(row.metric, definition);
  const ranked = (player?: PlayerResearchItem) => player?.table_qualified ? player.table_percentiles?.[row.metric] ?? null : null;
  const strength = a != null && b != null ? pillStrength(a, b, [ranked(percentiles[0]), ranked(percentiles[1])], row.unit) : 1;
  const pill = (side: "a" | "b") => leader === side && gap != null
    ? <Pill side={side} strength={strength} title={`${names[side === "a" ? 0 : 1]}: ${gap.toFixed(1)}${isPercentUnit(row.unit) ? " percentage points" : ""} ${direction === "low" ? "fewer" : "more"} ${label.toLowerCase()}`}>+{gap.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })}</Pill>
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

type PlainLine = { title: string; a: number | null; b: number | null; quiet?: boolean; digits?: number; titles?: [string, string]; unit?: string };

/**
 * A row outside the metric catalog (career seasons, Avail %); higher leads, unknown stays "—",
 * and a gap that rounds to nothing at ``digits`` is a tie.
 */
function PlainRow({ label, title, a, b, names, quiet = false, digits = 0, titles, unit = "" }: PlainLine & { label: string; names: [string, string] }) {
  const gap = a != null && b != null ? Number(Math.abs(a - b).toFixed(digits)) : 0;
  const leader = !quiet && a != null && b != null && gap > 0 ? (a > b ? "a" : "b") : null;
  const shown = (value: number | null) => value == null ? "—" : value.toFixed(digits);
  const pill = (side: "a" | "b") => leader === side && a != null && b != null
    ? <Pill side={side} strength={pillStrength(a, b)} title={`${names[side === "a" ? 0 : 1]}: ${gap.toFixed(digits)}${unit} more`}>+{gap.toFixed(digits)}</Pill> : null;
  return <tr>
    <td className="pvp-pill-cell">{pill("a")}</td>
    <td className="pvp-value pvp-plain" data-leading={leader === "a" || undefined} title={titles?.[0]}>{shown(a)}</td>
    <th scope="row" className="pvp-label" title={title}>{label}</th>
    <td className="pvp-value pvp-plain" data-leading={leader === "b" || undefined} title={titles?.[1]}>{shown(b)}</td>
    <td className="pvp-pill-cell">{pill("b")}</td>
  </tr>;
}

/** Avail % as a plain row: one decimal like TS%, the games behind it on hover. */
function availabilityLine(a: ComparisonAvailability | null, b: ComparisonAvailability | null, quiet: boolean): PlainLine | null {
  if (!a && !b) return null;
  const share = (entry: ComparisonAvailability | null) => { const value = availabilityShare(entry); return value == null ? null : value * 100; };
  const games = (entry: ComparisonAvailability | null) => entry ? `${entry.games} of ${entry.team_games} team games` : "Unknown";
  return { title: "Games played out of the teams' games over the same span, before the cutoff", a: share(a), b: share(b), quiet, digits: 1, titles: [games(a), games(b)], unit: " percentage points" };
}

/** The leading side's gap; its fill deepens with how decisive the lead is (25). */
function Pill({ side, strength, title, children }: { side: "a" | "b"; strength: PillStrength; title: string; children: ReactNode }) {
  return <span className="pvp-pill" data-identity={side} data-strength={strength} title={title}>{children}</span>;
}

/** Career accolade counts through the cutoff; season honors use their own badge strips. */
function AccoladeRows({ groups, names, quiet = false }: { groups: AccoladeGroups; names: [string, string]; quiet?: boolean }) {
  if (!groups.career.length) return <tr className="pvp-pending"><td colSpan={5}>No accolades on record for either player.</td></tr>;
  const row = (counted: AccoladeGroups["career"][number]) => {
    const entry = quiet ? { ...counted, leader: null } : counted;
    const gap = entry.a != null && entry.b != null ? Math.abs(entry.a - entry.b) : null;
    const pill = (side: "a" | "b") => entry.leader === side && gap && entry.a != null && entry.b != null
      ? <Pill side={side} strength={pillStrength(entry.a, entry.b)} title={`${names[side === "a" ? 0 : 1]}: ${gap} more`}>+{gap}</Pill> : null;
    const value = (side: "a" | "b") => <td className="pvp-value pvp-plain" data-leading={entry.leader === side || undefined}>{entry.shown[side === "a" ? 0 : 1]}</td>;
    return <tr key={entry.key}>
      <td className="pvp-pill-cell">{pill("a")}</td>{value("a")}
      <th scope="row" className="pvp-label" title={entry.title}>{entry.label}</th>
      {value("b")}<td className="pvp-pill-cell">{pill("b")}</td>
    </tr>;
  };
  return <>
    {groups.career.length > 0 && <tr className="pvp-group"><th colSpan={5} scope="colgroup">Accolades</th></tr>}
    {groups.career.map(row)}
  </>;
}

/** The same comparison seen from the other side: players, values, samples and gaps swapped. */
function mirror(comparison: PlayerComparisonResponse): PlayerComparisonResponse {
  return { ...comparison, player_a: comparison.player_b, player_b: comparison.player_a,
    aligned_metrics: comparison.aligned_metrics.map(row => ({ ...row, value_a: row.value_b, value_b: row.value_a, n_a: row.n_b, n_b: row.n_a,
      diff: typeof row.diff === "number" ? -row.diff : row.diff })) };
}
