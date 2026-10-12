import { GatedNote } from "./ui/gated-note";
import { PageHeader } from "./ui/panel";
import "./stats-explorer.css";
import { redirect } from "next/navigation";
import { ContextBar } from "@/components/context-bar";
import { WorkbenchPlayerExplorer } from "@/components/workbench-player-explorer";
import { executeWorkbenchQuery, getDraftClasses, getMetricCatalog, getWorkbenchCatalog } from "@/lib/workbench-api";
import { metricHints, type MetricHint } from "@/lib/stats-glossary";
import { querySpecToLegacyQuery } from "@/lib/query-url";
import { resolveStatsQuery, normalizedColumn } from "@/lib/stats-query";
import { getPresetById, usesImpactManifest, type CountingMode } from "@/lib/stats-presets";
import { getWorkspace } from "@/lib/workspace-client";
import type { DraftClassesResponse, EstimatedPosition, PlayerResearchResponse, WorkbenchCatalog } from "@/lib/types";
import { PlayerDirectory } from "./player-directory";
import { StatsDraftClassSelect, StatsHelpRow, StatsPositionChips, StatsTeamSelect } from "./stats-page-controls";
import { DarkoSourceLink } from "./darko-source-link";

const ESTIMATED_POSITIONS: EstimatedPosition[] = ["PG", "SG", "SF", "PF", "C"];
import { Icon } from "./ui/icon";
import { readPublication } from "@/lib/original-content";
import Link from "next/link";
import { buildPreservedContextUrl } from "@/lib/query-url";

export async function StatsWorkspace({ params: rawParams, basePath = "/stats", title = "Stats" }: {
  params: Record<string, string | string[] | undefined>;
  basePath?: string;
  title?: string;
}) {
  const params = Object.fromEntries(Object.entries(rawParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const directory = basePath === "/players";
  // Independent reads run together; every sort or filter re-renders this page.
  const [catalogResult, workspaceResult] = await Promise.allSettled([
    getWorkbenchCatalog(String(params.releaseId || params.release_id || "") || undefined),
    getWorkspace()
  ]);
  if (catalogResult.status === "rejected") {
    return <div className="workbench-content"><GatedNote tone="warning">Stats catalog unavailable. Try again.</GatedNote></div>;
  }
  const catalog: WorkbenchCatalog = catalogResult.value;
  const workspace = workspaceResult.status === "fulfilled" ? workspaceResult.value : undefined;
  // A favorites request must never silently become an unfiltered query.
  if (!workspace && params.favorites === "1") return <div role="alert">Favorites unavailable. Try again.</div>;
  const countingMode = (directory ? "per_game" : params.countingMode || params.counting_mode || workspace?.preferences.counting_mode || "per_game") as CountingMode;
  const presetId = params.viewId || params.view_id || params.preset || workspace?.preferences.default_view_id || "overview";
  const preset = getPresetById(presetId, workspace?.views);
  const querySpec = resolveStatsQuery(params, catalog, countingMode, !directory && preset.id === "overview" ? "dpm" : "pts");
  if (directory && !params.sortMetric && !params.sort_metric && !params.sort) querySpec.sort = [{ field: "player_name", direction: "asc" }];
  querySpec.view_state = { ...querySpec.view_state, view_id: directory ? "directory" : presetId,
    columns: directory ? ["gp", "min_per_game", "pts_per_game", "reb_per_game", "ast_per_game", "ts_pct"] : preset.columns.map(column => normalizedColumn(column, countingMode).key) };
  if (!directory && preset.columns.some(column => usesImpactManifest(normalizedColumn(column, countingMode).key)) && catalog.impact?.manifest_sha256) {
    querySpec.impact_manifest_sha256 = querySpec.impact_manifest_sha256 || catalog.impact.manifest_sha256;
  }
  if (!directory && (preset.columns.some(column => ["dpm", "o_dpm", "d_dpm"].includes(column.key)) ||
      querySpec.sort?.some(sort => ["dpm", "o_dpm", "d_dpm"].includes(sort.field))) && catalog.darko?.manifest_sha256) {
    querySpec.darko_manifest_sha256 = querySpec.darko_manifest_sha256 || catalog.darko.manifest_sha256;
  }
  const researchQuery = querySpecToLegacyQuery(querySpec);
  // Bind inferred defaults into the URL so navigation, reload and cursors share one scope.
  const required: [string, string, string | null | undefined][] = [
    ["releaseId", "release_id", querySpec.release_id], ["season", "season", querySpec.season],
    ["phase", "phase", querySpec.phase], ["beforeDate", "before_date", querySpec.before_date],
    ["window", "window", querySpec.window?.kind], ["countingMode", "counting_mode", countingMode]
  ];
  if (querySpec.darko_manifest_sha256) required.push(["darkoManifest", "darko_manifest_sha256", querySpec.darko_manifest_sha256]);
  if (required.some(([camel, snake]) => !params[camel] && !params[snake])) {
    const canonical = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const entry of Array.isArray(value) ? value : value ? [value] : []) canonical.append(key, entry);
    }
    for (const [camel, snake, value] of required) {
      if (!canonical.get(camel) && !canonical.get(snake) && value) canonical.set(camel, value);
    }
    redirect(`${basePath}?${canonical}`);
  }


  const positions = String(params.positions ?? "").split(",").filter((value): value is EstimatedPosition => ESTIMATED_POSITIONS.includes(value as EstimatedPosition));
  const draftYear = Number(params.draftYear) || null;
  // Draft classes and header hints load beside the table query; either failing only hides
  // the Draft Class menu or the header hover text.
  const extras = directory ? null : Promise.allSettled([getDraftClasses(), getMetricCatalog()]);

  let researchData: PlayerResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    if (!catalog.stats_normalizations?.includes(countingMode)) throw new Error(`Counting mode ${countingMode} is unavailable for these Stats queries.`);
    if (!catalog.stats_scopes?.some((scope) => scope.season === querySpec.season && scope.phase === querySpec.phase)) throw new Error(`No observed Stats coverage for ${querySpec.season} / ${querySpec.phase}.`);
    const result = await executeWorkbenchQuery(querySpec, {
      table_percentiles: true,
      player_ids: params.favorites === "1" ? workspace?.favorites ?? [] : null,
      positions: positions.length ? positions : null,
      draft_year: draftYear
    });
    researchData = {
      ...result,
      query: researchQuery,
      context: {
        release_id: String(result.context.release_id), season: querySpec.season, phase: querySpec.phase,
        before_date: researchQuery.before_date, window: researchQuery.window,
        last_included_date: null, warnings: result.warnings
      }
    };
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load player stats from workbench";
  }
  let draftClasses: DraftClassesResponse["classes"] = [];
  let hints: Record<string, MetricHint> = {};
  if (extras) {
    const [classes, metrics] = await extras;
    if (classes.status === "fulfilled") draftClasses = classes.value.classes;
    if (metrics.status === "fulfilled") hints = metricHints(metrics.value.metrics);
  }

  return (
    <section className="stats-workspace">
      <div className="workbench-content">
        <PageHeader icon="chart-column" title={directory ? title : "NBA Player Statistics"} subtitle={directory ? "Find a player, open a profile or browse season production." : undefined} actions={directory ? <Link className="button" href={buildPreservedContextUrl("/stats", new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")))}>Explore all stats</Link> : undefined} />
        {!directory && <WhatsNewLine />}
        {!directory && <StatsHelpRow />}

        {!directory && <ContextBar
          catalog={catalog}
          sampleNoun="eligible players"
          initialReleaseId={querySpec.release_id ?? undefined}
          initialSeason={researchQuery.season}
          initialPhase={researchQuery.phase}
          initialBeforeDate={researchQuery.before_date}
          initialWindow={researchQuery.window}
          lastIncludedDate={researchData?.context?.last_included_date}
          steppedScope
          detailRows={researchData?.darko ? [
            { label: "DARKO source", value: <DarkoSourceLink>{researchData.darko.source}</DarkoSourceLink> },
            { label: "DARKO ratings through", value: researchData.darko.data_date ?? "Unavailable in this scope" },
            { label: "DARKO requested date", value: researchData.darko.as_of ?? "Unknown" },
            { label: "DARKO observed at", value: researchData.darko.observed_at ?? "Unknown" },
            { label: "DARKO bundle", value: researchData.darko.manifest_sha256, mono: true },
            { label: "DARKO raw snapshot", value: researchData.darko.raw_sha256 ?? "Unknown", mono: true },
            { label: "DARKO interpretation", value: researchData.darko.limitations.join(" ") }
          ] : []}
          filters={<><StatsTeamSelect /><StatsPositionChips /><StatsDraftClassSelect classes={draftClasses} /></>}
        />}

        {loadError && (
          <GatedNote tone="warning" action={<a href={`${basePath}?${new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"))}`} className="ui-button ui-button-secondary ui-button-sm">Retry</a>}>
            {loadError}
          </GatedNote>
        )}

        {researchData && directory && <PlayerDirectory catalog={catalog} data={researchData} />}
        {researchData && !directory && (
          <WorkbenchPlayerExplorer
            key={JSON.stringify({ querySpec, favorites: params.favorites, positions: params.positions, draftYear })}
            querySpec={querySpec}
            countingMode={countingMode}
            catalog={catalog}
            data={researchData}
            currentSortMetric={researchQuery.sort_metric}
            currentSortDirection={researchQuery.sort_direction}
            metricHints={hints}
          />
        )}
      </div>
    </section>
  );
}

/** Databallr's "What's New" line: the latest patch note's date and title, linking to the notes. */
async function WhatsNewLine() {
  let note = "";
  try {
    const source = await readPublication("patch-notes");
    const heading = source.match(/^# (?:Patch notes: )?(.+)$/m)?.[1] ?? "";
    const date = source.match(/^(\d{4}-\d{2}-\d{2}) ·/m)?.[1];
    const when = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
    note = [when, heading.charAt(0).toUpperCase() + heading.slice(1)].filter(Boolean).join(": ");
  } catch {
    // The link alone still leads to the notes.
  }
  return <p className="stats-whats-new">
    <Link href="/whats-new"><Icon name="sparkles" size={14} />What&apos;s New</Link>
    {note && <span className="stats-whats-new-note">· {note}</span>}
  </p>;
}
