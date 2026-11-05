"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChartData, ChartFrame } from "./charts/chart-frame";
import { EntityField } from "./entity-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { SortHeader } from "./table-ui";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Icon, type IconName } from "./ui/icon";
import { PlayerIdentity } from "./ui/identity";
import { Button, ButtonLink, Segmented, Select } from "./ui/kit";
import { ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import {
  FACTORS, NODE_LABELS, UNKNOWN, factorMeta, getImpactTree, getSixFactorPage, intervalDomain, intervalText, signTone, signed, sortPlayers, unknownReason,
  type FactorKey, type ImpactNode, type ImpactTreeData, type NodeKey, type Reconstruction, type SixFactorPage, type SixFactorPhase, type SixFactorPlayer, type SortKey,
} from "@/lib/six-factor-research";

const PAGE = 25;
const r2 = (value: number | null | undefined) => value == null ? "—" : value.toFixed(3);
const phaseLabel = (phase: SixFactorPhase) => phase === "playoffs" ? "Playoffs" : "Regular Season";
const lastName = (name: string) => name.trim().split(/\s+/).slice(1).join(" ") || name;

function Section({ id, icon, title, aside, children }: { id?: string; icon: IconName; title: string; aside?: ReactNode; children: ReactNode }) {
  return <section id={id} className="player-open-section player-glass sf-section" aria-label={title}>
    <div className="player-open-heading"><h2 className="sf-heading"><Icon name={icon} size={20} />{title}</h2>{aside}</div>
    {children}
  </section>;
}

function Signed({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  const tone = signTone(value);
  return <span className="sf-signed" data-tone={tone}>{signed(value, digits)}</span>;
}

/** An 80% interval on a shared axis, with zero marked. Absent when the interval is unknown. */
function IntervalMark({ node, domain }: { node: ImpactNode; domain: [number, number] }) {
  const width = 160, height = 16;
  const x = (value: number) => (Math.max(domain[0], Math.min(domain[1], value)) - domain[0]) / (domain[1] - domain[0]) * width;
  return <svg className="sf-range" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <line className="sf-range-track" x1={0} x2={width} y1={8} y2={8} />
    <line className="sf-range-zero" x1={x(0)} x2={x(0)} y1={2} y2={14} />
    {node.low != null && node.high != null && <line className="sf-range-span" x1={x(node.low)} x2={x(node.high)} y1={8} y2={8} />}
    {node.value != null && <circle className="sf-range-dot" cx={x(node.value)} cy={8} r={3} />}
  </svg>;
}

function FrameworkGrid({ reconstruction }: { reconstruction: Reconstruction | null }) {
  return <div className="sf-framework">
    <span aria-hidden="true" />
    {["Shooting", "Turnovers", "Rebounding"].map(family => <h3 key={family} className="sf-framework-family">{family}</h3>)}
    {(["offense", "defense"] as const).map(side => <div key={side} className="sf-framework-row">
      <h3 className="sf-framework-side">{side === "offense" ? "Offense" : "Defense"}</h3>
      {FACTORS.filter(factor => factor.side === side).map(factor => <article key={factor.key} className="sf-framework-cell">
        <p className="sf-framework-code">{factor.short}<span>{factor.family}</span></p>
        <p className="sf-framework-name">{factor.label}</p>
        <p className="sf-note">{factor.help}.</p>
        <p className="sf-framework-weight">{reconstruction ? <>Weight <strong>{reconstruction.weights[factor.key].toFixed(2)}</strong> RAPM points per point</> : "Weight unknown"}</p>
      </article>)}
    </div>)}
  </div>;
}

function HowItWorks({ season, reconstruction, page }: { season: string; reconstruction: Reconstruction | null; page: SixFactorPage }) {
  return <ol className="sf-steps">
    <li><h3>Stints</h3><p>Public play-by-play is rebuilt into stints: who was on the floor and what happened. {page.coverage ? `${page.coverage.admitted_games.toLocaleString("en-US")} of ${page.coverage.scheduled_games.toLocaleString("en-US")} games were admitted for ${season}.` : ""}</p></li>
    <li><h3>Seven ridge regressions</h3><p>RAPM and each factor come from the same lineup design, adjusting for teammates and opponents. ORAPM plus DRAPM equals RAPM exactly.</p></li>
    <li><h3>Resample games</h3><p>{page.intervals_available ? "Games are drawn with replacement 200 times and each fit repeated. The 10th and 90th percentiles form the 80% interval on every number." : "No resampling is registered for playoff fits, so these intervals are unknown."}</p></li>
    <li><h3>Check against RAPM</h3><p>{reconstruction ? <>A second regression of RAPM on the six factors gives the weights. Across {reconstruction.seasons} seasons it reaches R² {r2(reconstruction.range_in_sample[0])} to {r2(reconstruction.range_in_sample[1])}, and {r2(reconstruction.range_cross_validated[0])} to {r2(reconstruction.range_cross_validated[1])} on held-out players.</> : "The second regression is registered for regular seasons only."}</p></li>
  </ol>;
}

function FactorLeaders({ factor, players, season, onFactor, treeHref }: { factor: FactorKey; players: SixFactorPlayer[]; season: string; onFactor: (key: FactorKey) => void; treeHref: (id: string) => string }) {
  const meta = factorMeta(factor);
  const rows = useMemo(() => sortPlayers(players, factor, "desc").filter(p => p.metrics[factor].value != null).slice(0, 10), [players, factor]);
  const domain = useMemo(() => intervalDomain(rows.map(p => p.metrics[factor])), [rows, factor]);
  return <div className="sf-factor">
    <Segmented size="md" label="Factor" value={factor} onChange={value => onFactor(value as FactorKey)}
      options={FACTORS.map(item => ({ value: item.key, label: item.short, title: item.label }))} />
    <p className="sf-factor-help"><strong>{meta.label}.</strong> {meta.help}, in percentage points. Positive helps the team.</p>
    <ul className="sf-leaders" aria-label={`${meta.label}, ten largest estimates with 80% intervals`}>
      {rows.map(player => <li key={player.player_id}>
        <PlayerIdentity playerId={player.player_id} name={player.player_name} team={player.team} era={seasonEra(season, player.team)} size="sm" href={treeHref(player.player_id)} />
        <Signed value={player.metrics[factor].value} />
        <span className="sf-interval">{intervalText(player.metrics[factor])}</span>
        <IntervalMark node={player.metrics[factor]} domain={domain} />
      </li>)}
    </ul>
    <p className="sf-note">Order follows the estimates. Where intervals overlap, the data does not separate those players.</p>
  </div>;
}

function CompositeScatter({ players, season, highlighted }: { players: SixFactorPlayer[]; season: string; highlighted: Map<string, string> }) {
  const points = players.filter(p => p.composites.net_efficiency != null && p.composites.possession_control != null);
  if (!points.length) return <GatedNote>Composites need the season&apos;s regression weights and all six factors, so they are unknown here.</GatedNote>;
  const xs = points.map(p => p.composites.possession_control!), ys = points.map(p => p.composites.net_efficiency!);
  const low = Math.floor(Math.min(...xs, ...ys)), high = Math.ceil(Math.max(...xs, ...ys));
  const left = 44, right = 620, top = 12, bottom = 396;
  const x = (value: number) => left + (value - low) / (high - low) * (right - left);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const ticks = Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(value => value % 2 === 0);
  return <ChartFrame title={`Net Efficiency vs Possession Control, ${season}`} source="CourtLens model · public play-by-play stints" sample={`${points.length} players with all six factors`}
    note="Each axis weights factors by the season's regression. No interval is served for a sum of factors, so dots stand alone: nearby dots are not separated.">
    <ChartData fingerprint={`${season}-${points.length}`}>
      <svg className="sf-scatter chart-graphic" viewBox="0 0 640 440" role="img" aria-label={`Scatter of ${points.length} players: Possession Control across, Net Efficiency up. Labelled: ${[...highlighted.values()].join(", ")}.`}>
        {ticks.map(value => <g key={value}>
          <line className={value === 0 ? "sf-scatter-axis" : "sf-scatter-grid"} x1={left} x2={right} y1={y(value)} y2={y(value)} />
          <line className={value === 0 ? "sf-scatter-axis" : "sf-scatter-grid"} x1={x(value)} x2={x(value)} y1={top} y2={bottom} />
          <text x={left - 8} y={y(value) + 4} textAnchor="end">{signed(value, 0)}</text>
          <text x={x(value)} y={bottom + 18} textAnchor="middle">{signed(value, 0)}</text>
        </g>)}
        <line className="sf-scatter-even" x1={x(Math.max(low, -high))} y1={y(-Math.max(low, -high))} x2={x(Math.min(high, -low))} y2={y(-Math.min(high, -low))} />
        <text x={(left + right) / 2} y={bottom + 40} textAnchor="middle">Possession Control, RAPM points</text>
        <text transform={`translate(12 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">Net Efficiency, RAPM points</text>
        {points.map(p => <circle key={p.player_id} className="sf-scatter-dot" data-highlight={highlighted.has(p.player_id) || undefined} cx={x(p.composites.possession_control!)} cy={y(p.composites.net_efficiency!)} r={highlighted.has(p.player_id) ? 5 : 3}>
          <title>{`${p.player_name}: Net Efficiency ${signed(p.composites.net_efficiency)}, Possession Control ${signed(p.composites.possession_control)}`}</title>
        </circle>)}
        {points.filter(p => highlighted.has(p.player_id)).map(p => <text key={p.player_id} className="sf-scatter-label" x={x(p.composites.possession_control!) + 8} y={y(p.composites.net_efficiency!) - 8}>{highlighted.get(p.player_id)}</text>)}
      </svg>
    </ChartData>
  </ChartFrame>;
}

function ArchetypeCards({ page, byId, treeHref }: { page: SixFactorPage; byId: Map<string, SixFactorPlayer>; treeHref: (id: string) => string }) {
  if (!page.archetypes.length) return <GatedNote>Archetypes use the season&apos;s regression weights, which are registered for regular seasons only.</GatedNote>;
  return <>
    <div className="sf-cards">{page.archetypes.map(card => {
      const player = byId.get(card.player_id);
      if (!player) return null;
      return <article key={card.key} className="sf-card">
        <h3>{card.label}</h3>
        <PlayerIdentity playerId={player.player_id} name={player.player_name} team={player.team} era={seasonEra(page.season, player.team)} size="lg" href={treeHref(player.player_id)} />
        <dl className="sf-card-values">
          {card.factors.map(key => <div key={key}><dt title={factorMeta(key).label}>{factorMeta(key).short}</dt><dd><Signed value={player.metrics[key].value} /><span className="sf-interval">{intervalText(player.metrics[key], 1)}</span></dd></div>)}
          <div><dt title="Total impact">RAPM</dt><dd><Signed value={player.metrics.rapm.value} /><span className="sf-interval">{intervalText(player.metrics.rapm, 1)}</span></dd></div>
        </dl>
        <p className="sf-note">{card.rule}.</p>
      </article>;
    })}</div>
    <p className="sf-note">Picked by these fixed rules from {page.season}&apos;s players with all nine values, one card per player. The largest estimate is how a card is filled, not a claim that this player is the best at it.</p>
  </>;
}

function Caveats({ page }: { page: SixFactorPage }) {
  const fit = page.reconstruction;
  return <ul className="sf-caveats">
    <li><strong>Descriptive, not causal.</strong> These are ridge estimates under lineup confounding. Players who share most of their minutes are hard to pull apart.</li>
    <li><strong>Intervals are a lower bound on uncertainty.</strong> They show how far a number moves when games are resampled at a fixed penalty, not a confidence interval for true impact.</li>
    <li><strong>Overlap means no verdict.</strong> The page never calls one player better when their intervals overlap. About two thirds of qualified players have a RAPM interval that includes zero.</li>
    <li><strong>The factors do not add up to RAPM.</strong> Each factor is its own regression, in percentage points. {fit ? <>Weighted, they reconstruct {page.season} RAPM with R² {r2(fit.in_sample.value)} in-sample and {r2(fit.cross_validated.value)} on held-out players, across {fit.players} players. CourtLens measures {r2(fit.range_in_sample[0])} to {r2(fit.range_in_sample[1])} across {fit.seasons} seasons, not the commonly quoted 0.985.</> : "No reconstruction is registered for this phase, so its R² is unknown."}</li>
    <li><strong>Net Efficiency and Possession Control have no interval.</strong> The bundle keeps no replicates to combine, so they are unknown rather than estimated.</li>
    {!page.intervals_available && <li><strong>Playoff intervals are unknown.</strong> The interval protocol covers regular-season fits only.</li>}
    <li><strong>Credit.</strong> Page design and method reference: <a href="https://databallr.com" rel="noreferrer">Databallr</a>&apos;s Six Factor RAPM and its decomposition mock-up. Every value here is CourtLens&apos;s own fit on public play-by-play. Factors after Dean Oliver&apos;s Four Factors; regularized adjusted plus-minus after Rosenbaum (2004) and Sill (2010).</li>
  </ul>;
}

const GROUPS: { label: string; columns: { key: SortKey; label: string; title: string }[] }[] = [
  { label: "Total", columns: [{ key: "rapm", label: "RAPM", title: "1Y RAPM, points per 100 counted controls" }] },
  { label: "Offense", columns: [{ key: "orapm", label: "ORAPM", title: "Offensive RAPM" }, ...FACTORS.filter(f => f.side === "offense").map(f => ({ key: f.key as SortKey, label: f.short, title: `${f.label}, percentage points` }))] },
  { label: "Defense", columns: [{ key: "drapm", label: "DRAPM", title: "Defensive RAPM, favorable sign" }, ...FACTORS.filter(f => f.side === "defense").map(f => ({ key: f.key as SortKey, label: f.short, title: `${f.label}, percentage points` }))] },
  { label: "Weighted Sums", columns: [{ key: "net_efficiency", label: "Net Eff", title: "Net Efficiency in RAPM points. No interval served" }, { key: "possession_control", label: "Poss Ctrl", title: "Possession Control in RAPM points. No interval served" }] },
  { label: "Sample", columns: [{ key: "games", label: "GP", title: "Games in the fit" }, { key: "minutes", label: "MIN", title: "Minutes in the fit" }] },
];

function RatingsTable({ page, treeHref }: { page: SixFactorPage; treeHref: (id: string) => string }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "rapm", direction: "desc" });
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => sortPlayers(page.players, sort.key, sort.direction), [page.players, sort]);
  const shown = expanded ? sorted : sorted.slice(0, PAGE);
  const onSort = (key: string) => setSort(current => current.key === key ? { key: current.key, direction: current.direction === "desc" ? "asc" : "desc" } : { key: key as SortKey, direction: "desc" });
  const cell = (player: SixFactorPlayer, key: SortKey, start: boolean) => {
    const className = start ? "group-start" : undefined;
    if (key === "games") return <td key={key} className={className}>{player.games ?? "—"}</td>;
    if (key === "minutes") return <td key={key} className={className}>{player.minutes == null ? "—" : Math.round(player.minutes).toLocaleString("en-US")}</td>;
    if (key === "net_efficiency" || key === "possession_control") return <td key={key} className={className}><Signed value={player.composites[key]} /></td>;
    const node = player.metrics[key];
    return <td key={key} className={className} title={unknownReason(node.status) ?? undefined}>
      <Signed value={node.value} />
      {node.value != null && <span className="sf-interval sf-interval-cell">{node.low == null ? "interval unknown" : intervalText(node, 1)}</span>}
    </td>;
  };
  return <div className="sf-table">
    <div className="player-ref-grid-frame"><div className="player-ref-grid-scroll" role="region" aria-label="Six-factor ratings with intervals" tabIndex={0}>
      <table className="player-ref-grid sf-grid">
        <thead>
          <tr className="player-ref-grid-tier-1"><th className="player-ref-grid-lead" rowSpan={2} scope="col">Player</th>{GROUPS.map(group => <th key={group.label} colSpan={group.columns.length} scope="colgroup">{group.label}</th>)}<th rowSpan={2} scope="col"><span className="sr-only">Impact Tree</span></th></tr>
          <tr className="player-ref-grid-tier-2">{GROUPS.flatMap(group => group.columns.map((column, i) => <SortHeader key={column.key} label={column.label} metric={column.key} description={column.title} active={sort.key === column.key} direction={sort.direction} onSort={onSort} className={i === 0 ? "group-start" : undefined} />))}</tr>
        </thead>
        <tbody>{shown.map(player => <tr key={player.player_id}>
          <th scope="row" className="player-ref-grid-lead"><PlayerIdentity playerId={player.player_id} name={player.player_name} team={player.team} era={seasonEra(page.season, player.team)} size="sm" href={`/players/${player.player_id}?season=${page.season}`} /></th>
          {GROUPS.flatMap(group => group.columns.map((column, i) => cell(player, column.key, i === 0)))}
          <td><ButtonLink size="sm" variant="ghost" href={treeHref(player.player_id)} aria-label={`Open ${player.player_name}'s Impact Tree`}>Tree</ButtonLink></td>
        </tr>)}</tbody>
      </table>
    </div></div>
    <div className="sf-table-foot">
      {sorted.length > PAGE && !expanded && <Button size="sm" onClick={() => setExpanded(true)}>Show all {sorted.length}</Button>}
      <p className="sf-note">RAPM in points per 100 counted controls, factors in percentage points, each with its 80% interval. Unknown values sort last and are never zero. {page.fit_players - page.players.length} more players in the fit qualify for no value; find them in the Impact Tree.</p>
    </div>
  </div>;
}

function TreeNode({ nodeKey, node, domain, unit }: { nodeKey: NodeKey; node: ImpactNode; domain: [number, number]; unit: string }) {
  const meta = NODE_LABELS[nodeKey];
  const reason = unknownReason(node.status);
  return <div className="sf-node" data-node={nodeKey} data-status={node.status} data-value={node.value ?? undefined} data-low={node.low ?? undefined} data-high={node.high ?? undefined} title={node.replicates != null && node.replicates < 200 ? `The player appears in ${node.replicates} of 200 replicates` : undefined}>
    <p className="sf-node-code">{meta.short}<span>{meta.label}</span></p>
    {node.value == null ? <p className="sf-node-unknown">{UNKNOWN}</p> : <p className="sf-node-value"><Signed value={node.value} /><span className="sf-node-unit">{unit}</span></p>}
    <IntervalMark node={node} domain={domain} />
    <p className="sf-node-interval">{node.low == null || node.high == null ? "80% interval unknown" : `80%: ${intervalText(node)}`}</p>
    {reason && <p className="sf-note">{reason}</p>}
  </div>;
}

export function ImpactTree({ tree, reconstruction }: { tree: ImpactTreeData; reconstruction: Reconstruction | null }) {
  const unit = "pts", factorUnit = "pct pts";
  const ratingDomain = intervalDomain([tree.metrics.rapm, tree.metrics.orapm, tree.metrics.drapm]);
  const factorDomain = intervalDomain(FACTORS.map(factor => tree.metrics[factor.key]));
  const branch = (rating: "orapm" | "drapm", side: "offense" | "defense") => <li>
    <TreeNode nodeKey={rating} node={tree.metrics[rating]} domain={ratingDomain} unit={unit} />
    <ul>{FACTORS.filter(factor => factor.side === side).map(factor => <li key={factor.key}><TreeNode nodeKey={factor.key} node={tree.metrics[factor.key]} domain={factorDomain} unit={factorUnit} /></li>)}</ul>
  </li>;
  const { reconstructed_rapm: rebuilt, net_efficiency: efficiency, possession_control: possession } = tree.composites;
  return <div className="sf-tree-wrap">
    <ul className="sf-tree" aria-label={`${tree.player_name} Impact Tree, ${tree.season}`}><li>
      <TreeNode nodeKey="rapm" node={tree.metrics.rapm} domain={ratingDomain} unit={unit} />
      <ul>{branch("orapm", "offense")}{branch("drapm", "defense")}</ul>
    </li></ul>
    <div className="sf-tree-notes" data-testid="tree-reconstruction">
      {rebuilt != null && tree.metrics.rapm.value != null
        ? <p>The six factors, weighted by the {tree.season} regression, rebuild this RAPM as <strong>{signed(rebuilt)}</strong> against <strong>{signed(tree.metrics.rapm.value)}</strong> served: Net Efficiency {signed(efficiency)}, Possession Control {signed(possession)}.</p>
        : <p>Rebuilding RAPM from the factors is unknown here: it needs {reconstruction ? "RAPM and all six factors for this player" : "regression weights, which are registered for regular seasons only"}.</p>}
      <p className="sf-note">ORAPM plus DRAPM equals RAPM exactly. Each factor is a separate estimate, so the third level does not sum to the second.{reconstruction ? ` Across ${reconstruction.players} ${tree.season} players the weighted factors explain R² ${r2(reconstruction.in_sample.value)} of RAPM.` : ""}</p>
    </div>
  </div>;
}

function TreeSection({ page, playerId, onPlayer }: { page: SixFactorPage; playerId: string; onPlayer: (id: string | null) => void }) {
  const { data, error, loading, retry } = useFeed([playerId, page.season, page.phase], signal => getImpactTree(playerId, page.season, page.phase, signal));
  return <Section id="impact-tree" icon="split" title="Impact Tree" aside={<span>Any player, {page.season} · {phaseLabel(page.phase)}</span>}>
    <div className="sf-tree-picker"><EntityField label="Player" value={playerId} season={page.season} phase={page.phase} initialName={data?.player_name} onChange={value => onPlayer(value || null)} /></div>
    {error && <FeedFailure error={error} retry={retry} what="Impact Tree" />}
    {loading && <FeedSkeleton label="Loading Impact Tree" />}
    {data && <>
      <PlayerIdentity playerId={data.player_id} name={data.player_name} team={data.team} era={seasonEra(page.season, data.team)} size="lg" href={`/players/${data.player_id}?season=${page.season}`}
        subtitle={data.in_fit ? <>{data.games ?? "—"} GP · {data.minutes == null ? "—" : Math.round(data.minutes).toLocaleString("en-US")} MIN</> : `Not in the ${page.season} fit`} />
      {!data.in_fit && <GatedNote>This player has no stints in the {page.season} {phaseLabel(page.phase).toLowerCase()} fit, so every number is unknown, not zero.{data.rated_seasons.length > 0 ? ` RAPM is served for ${data.rated_seasons.join(", ")}.` : ""}</GatedNote>}
      <ImpactTree tree={data} reconstruction={page.reconstruction} />
    </>}
  </Section>;
}

/** Research → Six-Factor RAPM (R02). Layout after Databallr's explainer; every value is CourtLens's own. */
export function SixFactorResearch() {
  const { get, set } = useUrlState();
  const pathname = usePathname();
  const season = get("season") ?? "2025-26";
  const phase: SixFactorPhase = get("phase") === "playoffs" ? "playoffs" : "regular_season";
  const factor = (FACTORS.find(item => item.key === get("factor"))?.key ?? "o_ts") as FactorKey;
  const { data: answer, error, loading, retry } = useFeed([season, phase], signal => getSixFactorPage(season, phase, signal));
  const data = answer?.status === "available" ? answer : null;
  const players = useMemo(() => data?.players ?? [], [data]);
  const byId = useMemo(() => new Map(players.map(player => [player.player_id, player])), [players]);
  const leader = useMemo(() => sortPlayers(players, "rapm", "desc")[0], [players]);
  const playerId = get("player") ?? leader?.player_id ?? "";
  const treeHref = (id: string) => {
    const next = new URLSearchParams({ ...(get("season") ? { season } : {}), ...(phase === "playoffs" ? { phase } : {}), ...(get("factor") ? { factor } : {}), player: id });
    return `${pathname}?${next}#impact-tree`;
  };
  const scopes = answer?.scopes ?? [{ season, phase }];
  const seasons = [...new Set(scopes.map(scope => scope.season))];
  if (!seasons.includes(season)) seasons.unshift(season);
  const phases = scopes.filter(scope => scope.season === season).map(scope => scope.phase);
  const highlighted = useMemo(() => {
    const labels = new Map((data?.archetypes ?? []).map(card => [card.player_id, lastName(byId.get(card.player_id)?.player_name ?? "")]));
    const chosen = byId.get(playerId);
    if (chosen) labels.set(chosen.player_id, lastName(chosen.player_name));
    return labels;
  }, [data, byId, playerId]);
  const statsHref = `/stats?${new URLSearchParams({ season, phase, viewId: "sixfactor", sortMetric: "rapm" })}`;
  return <>
    <FilterBar label="Six-Factor filters" summary={`${season} · ${phaseLabel(phase)}`}
      scope={<>
        <Field label="Season" layout="inline"><Select aria-label="Season" value={season} onChange={event => {
          const next = event.target.value;
          set({ season: next, phase: phase === "playoffs" && scopes.some(scope => scope.season === next && scope.phase === "playoffs") ? "playoffs" : null });
        }}>{seasons.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>
        <Field label="Phase" layout="inline"><Select aria-label="Phase" value={phase} onChange={event => set({ phase: event.target.value === "playoffs" ? "playoffs" : null })}>{(phases.length ? phases : [phase]).map(value => <option key={value} value={value}>{phaseLabel(value)}</option>)}</Select></Field>
      </>}
      count={data && <CountChip>{data.players.length.toLocaleString("en-US")} rated</CountChip>}
      details={data && <DataDetailsButton rows={[
        { label: "Serving version", value: data.provenance.version, mono: true },
        { label: "Manifest SHA-256", value: data.provenance.manifest_sha256, mono: true },
        { label: "1Y fit SHA-256", value: `${data.provenance.artifact_sha256} · games through ${data.provenance.last_included_date}`, mono: true },
        { label: "Intervals", value: data.provenance.interval_sha256 ? `${data.provenance.interval_registration} · ${data.provenance.interval_sha256}` : "None served for this fit", mono: true },
        { label: "Reconstruction", value: data.reconstruction ? `${data.reconstruction.registration} · ${data.reconstruction.registration_sha256}` : "None registered for this phase", mono: true },
      ]} />} />
    {error && <FeedFailure error={error} retry={retry} what="Six-Factor RAPM" />}
    {loading && <FeedSkeleton label="Loading six-factor ratings" />}
    {answer?.status === "unavailable" && <GatedNote>No one-year fit is served for {season} {phaseLabel(phase).toLowerCase()}. RAPM is sealed after a season ends, and history starts in 2014-15. Pick a season above.</GatedNote>}
    {data && <ResearchLayout className="sf-page" findings={<>
      <StatTile label="Six Factors to RAPM" value={data.reconstruction ? `R² ${r2(data.reconstruction.in_sample.value)}` : null} footnote={data.reconstruction ? `${r2(data.reconstruction.cross_validated.value)} on held-out players` : "Not registered for this phase"} />
      <StatTile label="Rated Players" value={data.players.length.toLocaleString("en-US")} footnote={`Of ${data.fit_players.toLocaleString("en-US")} in the fit`} />
      <StatTile label="Admitted Games" value={data.coverage ? `${data.coverage.admitted_games.toLocaleString("en-US")} / ${data.coverage.scheduled_games.toLocaleString("en-US")}` : null} footnote="Scheduled games in this scope" />
      <StatTile label="Fit Through" value={formatDate(data.provenance.last_included_date)} footnote={data.intervals_available ? "200 game-bootstrap replicates" : "No intervals for this phase"} />
    </>}>
      {!data.intervals_available && <GatedNote>Playoff fits have values but no registered intervals or regression weights, so their intervals, composites and archetypes show as unknown.</GatedNote>}
      <Section icon="table" title="The Framework"><FrameworkGrid reconstruction={data.reconstruction} /></Section>
      <Section icon="list-ordered" title="How It Works"><HowItWorks season={season} reconstruction={data.reconstruction} page={data} /></Section>
      <Section icon="chart-column" title="The Six Factors"><FactorLeaders factor={factor} players={players} season={season} treeHref={treeHref} onFactor={key => set({ factor: key === "o_ts" ? null : key })} /></Section>
      <Section icon="scatter" title="Net Efficiency vs Possession Control">
        <p className="sf-lead">Net Efficiency is the weighted shooting factors on both ends. Possession Control is the weighted turnover and rebounding factors. Above the dashed line, the two add to a positive rebuilt RAPM.</p>
        <CompositeScatter players={players} season={season} highlighted={highlighted} />
      </Section>
      <Section icon="users" title="Player Archetypes"><ArchetypeCards page={data} byId={byId} treeHref={treeHref} /></Section>
      <Section icon="info" title="Caveats"><Caveats page={data} /></Section>
      <Section icon="sort-az" title="All Ratings" aside={<ButtonLink size="sm" variant="text" href={statsHref}>All players in Stats</ButtonLink>}><RatingsTable page={data} treeHref={treeHref} /></Section>
      {playerId && <TreeSection page={data} playerId={playerId} onPlayer={id => set({ player: id })} />}
    </ResearchLayout>}
  </>;
}
