import { GatedNote } from "./ui/gated-note";
import { PageHeader } from "./ui/panel";
import "./stats-explorer.css";
import { redirect } from "next/navigation";
import { ContextBar } from "@/components/context-bar";
import { WorkbenchPlayerExplorer } from "@/components/workbench-player-explorer";
import { executeWorkbenchQuery, getWorkbenchCatalog } from "@/lib/workbench-api";
import { querySpecToLegacyQuery } from "@/lib/query-url";
import { resolveStatsQuery, normalizedColumn } from "@/lib/stats-query";
import { getPresetById, IMPACT_COLUMNS, type CountingMode } from "@/lib/stats-presets";
import { getWorkspace } from "@/lib/workspace-client";
import type { PlayerResearchResponse, WorkbenchCatalog } from "@/lib/types";

export async function StatsWorkspace({ params: rawParams, basePath = "/stats", title = "Stats" }: {
  params: Record<string, string | string[] | undefined>;
  basePath?: string;
  title?: string;
}) {
  const params = Object.fromEntries(Object.entries(rawParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  let catalog: WorkbenchCatalog;
  try {
    catalog = await getWorkbenchCatalog(String(params.releaseId || params.release_id || "") || undefined);
  } catch {
    return <div className="workbench-content"><GatedNote tone="warning">Stats catalog unavailable. Try again.</GatedNote></div>;
  }
  let workspace;
  try { workspace = await getWorkspace(); } catch {
    // A favorites request must never silently become an unfiltered query.
    if (params.favorites === "1") return <div role="alert">Favorites unavailable. Try again.</div>;
  }
  const countingMode = (params.countingMode || params.counting_mode || workspace?.preferences.counting_mode || "per_game") as CountingMode;
  const querySpec = resolveStatsQuery(params, catalog, countingMode);
  const presetId = params.viewId || params.view_id || params.preset || workspace?.preferences.default_view_id || "overview";
  const preset = getPresetById(presetId, workspace?.views);
  querySpec.view_state = { ...querySpec.view_state, view_id: presetId,
    columns: preset.columns.map(column => normalizedColumn(column, countingMode).key) };
  if (preset.columns.some(column => column.key in IMPACT_COLUMNS) && catalog.impact?.manifest_sha256) {
    querySpec.impact_manifest_sha256 = querySpec.impact_manifest_sha256 || catalog.impact.manifest_sha256;
  }
  const researchQuery = querySpecToLegacyQuery(querySpec);
  // Bind inferred defaults into the URL so navigation, reload and cursors share one scope.
  const required: [string, string, string | null | undefined][] = [
    ["releaseId", "release_id", querySpec.release_id], ["season", "season", querySpec.season],
    ["phase", "phase", querySpec.phase], ["beforeDate", "before_date", querySpec.before_date],
    ["window", "window", querySpec.window?.kind], ["countingMode", "counting_mode", countingMode]
  ];
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


  let researchData: PlayerResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    if (!catalog.stats_normalizations?.includes(countingMode)) throw new Error(`Counting mode ${countingMode} is unavailable for these Stats queries.`);
    if (!catalog.stats_scopes?.some((scope) => scope.season === querySpec.season && scope.phase === querySpec.phase)) throw new Error(`No observed Stats coverage for ${querySpec.season} / ${querySpec.phase}.`);
    const result = await executeWorkbenchQuery(querySpec, {
      player_ids: params.favorites === "1" ? workspace?.favorites ?? [] : null
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

  return (
    <section className="stats-workspace">
      <div className="workbench-content">
        <PageHeader icon="chart-column" title={title} subtitle="NBA player statistics. Explore production, shooting and efficiency within your selected scope." />

        <ContextBar
          catalog={catalog}
          sampleNoun="eligible players"
          initialReleaseId={querySpec.release_id ?? undefined}
          initialSeason={researchQuery.season}
          initialPhase={researchQuery.phase}
          initialBeforeDate={researchQuery.before_date}
          initialWindow={researchQuery.window}
          sampleSize={researchData?.total_eligible_players}
          lastIncludedDate={researchData?.context?.last_included_date}
        />

        {loadError && (
          <GatedNote tone="warning" action={<a href={`${basePath}?${new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"))}`} className="ui-button ui-button-secondary ui-button-sm">Retry</a>}>
            {loadError}
          </GatedNote>
        )}

        {researchData && (
          <WorkbenchPlayerExplorer
            key={JSON.stringify({ querySpec, favorites: params.favorites })}
            querySpec={querySpec}
            countingMode={countingMode}
            catalog={catalog}
            data={researchData}
            currentSortMetric={researchQuery.sort_metric}
            currentSortDirection={researchQuery.sort_direction}
          />
        )}
      </div>
    </section>
  );
}
