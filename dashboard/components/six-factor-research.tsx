"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChartData, ChartFrame } from "./charts/chart-frame";
import { EntityField } from "./entity-picker";
import {
  FeatureList, FormulaLine, Glossary, MethodBlock, MethodSteps, RankedList, ReadingGuide, ResearchCallout, ResearchCard, ResearchCards,
  ResearchDisclosure, ResearchIntro, ResearchProse, ResearchSection, ResearchTabPanel, SignalValue, type GlossaryGroup,
} from "./research/research-page";
import { ResearchTable, type ResearchColumn, type ResearchView } from "./research/research-table";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { Icon, type IconName } from "./ui/icon";
import { PlayerIdentity } from "./ui/identity";
import { Button, ButtonLink, IconButtonLink, Select } from "./ui/kit";
import { formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import { signed } from "@/lib/research-values";
import {
  FACTORS, FACTOR_COPY, NODE_LABELS, UNKNOWN, factorMeta, getImpactTree, getSixFactorPage, intervalDomain, intervalText, sortPlayers, unknownReason,
  type FactorKey, type ImpactNode, type ImpactTreeData, type NodeKey, type Reconstruction, type SixFactorPage, type SixFactorPhase, type SixFactorPlayer,
} from "@/lib/six-factor-research";

const r2 = (value: number | null | undefined) => value == null ? "—" : value.toFixed(3);
const phaseLabel = (phase: SixFactorPhase) => phase === "playoffs" ? "Playoffs" : "Regular Season";
const lastName = (name: string) => name.trim().split(/\s+/).slice(1).join(" ") || name;
const count = (value: number) => value.toLocaleString("en-US");
const FAMILIES: { name: "Shooting" | "Turnovers" | "Rebounding"; icon: IconName }[] = [{ name: "Shooting", icon: "target" }, { name: "Turnovers", icon: "zap" }, { name: "Rebounding", icon: "chart" }];
const SIDES = [{ side: "offense", label: "Offense", icon: "trend", tone: "a" }, { side: "defense", label: "Defense", icon: "shield", tone: "b" }] as const;

/** A node's value coloured by the interval rule, its exact numbers on the element. */
function NodeValue({ node, digits = 2, className }: { node: ImpactNode; digits?: number; className?: string }) {
  return <SignalValue value={node.value} low={node.low} high={node.high} digits={digits} className={className} />;
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

/** Databallr's 3 × 2 grid: families across, Offense (gold) and Defense (blue) down; a cell picks the factor. */
function FrameworkGrid({ factor, onFactor }: { factor: FactorKey; onFactor: (key: FactorKey) => void }) {
  return <div className="sf-grid-frame">
    <table className="sf-framework">
      <thead><tr><td />{FAMILIES.map(family => <th key={family.name} scope="col"><Icon name={family.icon} size={16} /><span>{family.name}</span></th>)}</tr></thead>
      <tbody>{SIDES.map(side => <tr key={side.side}>
        <th scope="row" data-tone={side.tone}><Icon name={side.icon} size={16} />{side.label}</th>
        {FACTORS.filter(item => item.side === side.side).map(item => <td key={item.key}>
          <Button size="lg" variant="ghost" pressed={factor === item.key} onClick={() => onFactor(item.key)} title={item.label} aria-label={`${item.short}, ${item.label}`}>{item.short}</Button>
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

function HowItWorks({ page }: { page: SixFactorPage }) {
  const fit = page.reconstruction;
  return <ResearchCards>
    <ResearchCard title="Independent Regressions">
      <p className="rs-card-text">RAPM and each factor are separate ridge regressions on the same stints and lineup design, adjusting for teammates and opponents. The factors are true shooting, turnover rate and offensive rebound rate, each on offense and defense.</p>
    </ResearchCard>
    <ResearchCard title={fit ? `R² = ${r2(fit.in_sample.value)} Reconstruction` : "Reconstruction"}>
      <p className="rs-card-text">{fit
        ? <>A second regression weights the six factors into RAPM points. For {page.season} they explain {r2(fit.in_sample.value)} of RAPM across {count(fit.players)} players, and {r2(fit.cross_validated.value)} on held-out players. Across {fit.seasons} seasons: {r2(fit.range_in_sample[0])} to {r2(fit.range_in_sample[1])}.</>
        : "The second regression is registered for regular seasons only, so the weights and R² are unknown here."}</p>
    </ResearchCard>
    <ResearchCard title={page.intervals_available ? "One Season, 200 Resamples" : "One Season, No Intervals"}>
      <p className="rs-card-text">Each fit uses {page.season} {phaseLabel(page.phase).toLowerCase()} games only: no time decay and no box-score prior. {page.coverage ? `${count(page.coverage.admitted_games)} of ${count(page.coverage.scheduled_games)} games admitted, through ${formatDate(page.provenance.last_included_date)}. ` : `Games through ${formatDate(page.provenance.last_included_date)}. `}
        {page.intervals_available ? "Games are resampled 200 times for each 80% interval. " : "No resampling is registered for playoff fits, so intervals are unknown. "}
        {count(page.fit_players)} players in the fit, {count(page.players.length)} rated.</p>
    </ResearchCard>
  </ResearchCards>;
}

function FactorPanel({ factor, page, byId, treeHref }: { factor: FactorKey; page: SixFactorPage; byId: Map<string, SixFactorPlayer>; treeHref: (id: string) => string }) {
  const meta = factorMeta(factor), copy = FACTOR_COPY[factor], pair = factorMeta(copy.pair);
  const weights = page.reconstruction?.weights;
  const largest = weights && FACTORS.every(item => weights[item.key] <= weights[factor]);
  const known = useMemo(() => sortPlayers(page.players, factor, "desc").filter(p => p.metrics[factor].value != null), [page.players, factor]);
  const item = (player: SixFactorPlayer) => ({
    key: player.player_id, value: player.metrics[factor].value, low: player.metrics[factor].low, high: player.metrics[factor].high,
    identity: <PlayerIdentity playerId={player.player_id} name={player.player_name} team={player.team} era={seasonEra(page.season, player.team)} size="sm" href={treeHref(player.player_id)} />,
  });
  const archetypePlayers = page.archetypes.map(card => byId.get(card.player_id)).filter((p): p is SixFactorPlayer => p != null);
  return <div className="sf-factor">
    <div className="sf-factor-head">
      <h3 className="sf-factor-title">{meta.short}<span> — {meta.label}</span></h3>
      <p className="sf-factor-tagline">{copy.tagline}</p>
    </div>
    <p className="rs-card-text">{meta.help}, after adjusting for teammates and opponents, in percentage points. {weights
      ? <>In {page.season} one percentage point is worth <strong>{weights[factor].toFixed(2)}</strong> RAPM points{largest ? ", the largest weight of the six" : ""}.</>
      : "Its weight in RAPM points is unknown for this phase."}</p>
    <div className="sf-factor-lists">
      <FeatureList title="What Shows Up" icon="eye" mark="plus" items={copy.showsUp} />
      <FeatureList title="What Box Scores Miss" icon="eye-off" mark="question" items={copy.boxMisses} />
    </div>
    <div className="sf-factor-lists">
      <RankedList title="Highest Estimates" label={`${meta.label}, four highest estimates with 80% intervals`} items={known.slice(0, 4).map(item)} />
      <RankedList title="Lowest Estimates" label={`${meta.label}, three lowest estimates with 80% intervals`} items={known.slice(-3).reverse().map(item)} />
    </div>
    {archetypePlayers.length > 0 && <ResearchCallout icon="trend" title="Cross-Factor Tradeoffs">
      <p className="rs-card-text">{meta.short} beside {pair.short} for {page.season}&apos;s archetype players:</p>
      <ul className="sf-tradeoffs" aria-label={`${meta.short} beside ${pair.short}`}>
        {archetypePlayers.map(player => <li key={player.player_id}><strong>{player.player_name}</strong> {meta.short} <NodeValue node={player.metrics[factor]} /> · {pair.short} <NodeValue node={player.metrics[copy.pair]} /></li>)}
      </ul>
    </ResearchCallout>}
    <p className="rs-note">Order follows the estimates. Where intervals overlap, the data does not separate those players.</p>
  </div>;
}

function SliceCards({ page }: { page: SixFactorPage }) {
  const w = page.reconstruction?.weights;
  const term = (key: FactorKey) => w ? `${w[key].toFixed(2)} × ${factorMeta(key).short}` : factorMeta(key).short;
  const leader = (key: "net_efficiency" | "possession_control") => sortPlayers(page.players, key, "desc").find(p => p.composites[key] != null);
  const example = (key: "net_efficiency" | "possession_control", tone: "a" | "b") => {
    const player = leader(key);
    return <p className="rs-note">{player ? <>Largest in {page.season}: <strong className="sf-example" data-tone={tone}>{player.player_name}</strong> <span className="rs-value" data-value={player.composites[key] ?? undefined}>{signed(player.composites[key])}</span></> : "Unknown for this phase: it needs the season's regression weights."}</p>;
  };
  return <ResearchCards columns={2}>
    <ResearchCard tone="a" title="Net Efficiency">
      <p className="rs-card-text">The quality of possessions: how well a team turns them into points, on both ends. The shooting factors, weighted by the {page.season} regression.</p>
      <FormulaLine>Net Efficiency = {term("o_ts")} + {term("d_ts")}</FormulaLine>
      {example("net_efficiency", "a")}
    </ResearchCard>
    <ResearchCard tone="b" title="Possession Control">
      <p className="rs-card-text">The quantity of possessions: turnovers and rebounds decide who gets extra chances.</p>
      <FormulaLine>Possession Control = {term("o_tov")} + {term("o_reb")} + {term("d_tov")} + {term("d_reb")}</FormulaLine>
      {example("possession_control", "b")}
    </ResearchCard>
  </ResearchCards>;
}

function CompositeScatter({ players, season, highlighted }: { players: SixFactorPlayer[]; season: string; highlighted: Map<string, string> }) {
  const points = players.filter(p => p.composites.net_efficiency != null && p.composites.possession_control != null);
  if (!points.length) return <GatedNote>Net Efficiency and Possession Control need the season&apos;s regression weights and all six factors, so they are unknown here.</GatedNote>;
  const xs = points.map(p => p.composites.possession_control!), ys = points.map(p => p.composites.net_efficiency!);
  const low = Math.floor(Math.min(...xs, ...ys)), high = Math.ceil(Math.max(...xs, ...ys));
  const left = 44, right = 620, top = 12, bottom = 396;
  const x = (value: number) => left + (value - low) / (high - low) * (right - left);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const ticks = Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(value => value % 2 === 0);
  return <ChartFrame title={`Net Efficiency vs Possession Control, ${season}`} source="CourtLens model · public play-by-play stints" sample={`${points.length} players with all six factors`}
    note="Each axis weights factors by the season's regression. No interval is served for a sum of factors, so nearby dots are not separated.">
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
  return <ResearchCards label="Player archetypes">{page.archetypes.map(card => {
    const player = byId.get(card.player_id);
    if (!player) return null;
    return <ResearchCard key={card.key} listItem className="sf-archetype" kicker={card.label}
      aside={<span className="sf-archetype-rapm">RAPM <NodeValue node={player.metrics.rapm} /></span>}
      title={<PlayerIdentity playerId={player.player_id} name={player.player_name} team={player.team} era={seasonEra(page.season, player.team)} size="md" href={treeHref(player.player_id)} />}>
      <dl className="sf-strip">{FACTORS.map(item => <div key={item.key} data-picked={card.factors.includes(item.key) || undefined}><dt title={item.label}>{item.short}</dt><dd><NodeValue node={player.metrics[item.key]} /></dd></div>)}</dl>
      <p className="rs-card-text">Rule: {card.rule}. RAPM 80% interval {intervalText(player.metrics.rapm)}.</p>
    </ResearchCard>;
  })}</ResearchCards>;
}

function Caveats({ page }: { page: SixFactorPage }) {
  const fit = page.reconstruction;
  return <ul className="sf-caveats">
    <li><strong>Descriptive, not causal.</strong> These are ridge estimates under lineup confounding. Players who share most of their minutes are hard to pull apart.</li>
    <li><strong>Intervals are a lower bound on uncertainty.</strong> They show how far a number moves when games are resampled at a fixed penalty, not a confidence interval for true impact.</li>
    <li><strong>Overlap means no verdict.</strong> The page never calls one player better when their intervals overlap. About two thirds of qualified players have a RAPM interval that includes zero.</li>
    <li><strong>The factors do not add up to RAPM.</strong> Each factor is its own regression, in percentage points. {fit ? <>Weighted, they reconstruct {page.season} RAPM with R² {r2(fit.in_sample.value)} in-sample and {r2(fit.cross_validated.value)} on held-out players, across {fit.players} players. CourtLens measures {r2(fit.range_in_sample[0])} to {r2(fit.range_in_sample[1])} across {fit.seasons} seasons, not the commonly quoted 0.985.</> : "No reconstruction is registered for this phase, so its R² is unknown."}</li>
    <li><strong>Net Efficiency and Possession Control have no interval.</strong> The bundle keeps no replicates to combine, so they are unknown rather than estimated, and never coloured.</li>
    <li><strong>One season, not a pooled window.</strong> Databallr pools six seasons with time decay; these fits use one season each, so they move more from year to year.</li>
    {!page.intervals_available && <li><strong>Playoff intervals are unknown.</strong> The interval protocol covers regular-season fits only.</li>}
  </ul>;
}

function Credits() {
  return <ul className="sf-caveats">
    <li><strong>Design reference:</strong> <a href="https://databallr.com" rel="noreferrer">Databallr</a>&apos;s Six-Factor RAPM explainer and ShotQuality RAPM table. No value on this page comes from Databallr.</li>
    <li><strong>Method:</strong> regularized adjusted plus-minus after Rosenbaum (2004) and Sill (2010); the factors after Dean Oliver&apos;s Four Factors; the six-factor split after Databallr&apos;s framework.</li>
    <li><strong>Data:</strong> NBA play-by-play (PlayByPlayV3) via shufinskiy/nba_data, rebuilt into stints by CourtLens. Every fit, interval and weight is CourtLens&apos;s own.</li>
  </ul>;
}

/** Ratings table views: Databallr's Offense / Defense / Combined over the served nodes. */
function tableColumns(): { views: ResearchView<SixFactorPlayer>[]; trailing: ResearchColumn<SixFactorPlayer>[] } {
  const node = (key: NodeKey, title: string): ResearchColumn<SixFactorPlayer> => ({
    key, label: NODE_LABELS[key].short, title, signedValue: true,
    value: p => p.metrics[key].value, interval: p => ({ low: p.metrics[key].low, high: p.metrics[key].high }),
    unknown: p => unknownReason(p.metrics[key].status) ?? undefined,
  });
  const factor = (key: FactorKey) => node(key, `${factorMeta(key).label}, percentage points, with its 80% interval`);
  const composite = (key: "net_efficiency" | "possession_control", label: string): ResearchColumn<SixFactorPlayer> => ({
    key, label, title: `${key === "net_efficiency" ? "Net Efficiency" : "Possession Control"} in RAPM points. No interval is served, so never coloured`, signedValue: true, value: p => p.composites[key],
  });
  return {
    views: [
      { value: "combined", label: "Combined", icon: "layers", columns: [node("rapm", "RAPM, points per 100 counted controls, with its 80% interval"), node("orapm", "Offensive RAPM"), node("drapm", "Defensive RAPM, favorable sign"), composite("net_efficiency", "Net Eff"), composite("possession_control", "Poss Ctrl")] },
      { value: "offense", label: "Offense", icon: "trend", columns: [node("orapm", "Offensive RAPM"), ...FACTORS.filter(f => f.side === "offense").map(f => factor(f.key))] },
      { value: "defense", label: "Defense", icon: "shield", columns: [node("drapm", "Defensive RAPM, favorable sign"), ...FACTORS.filter(f => f.side === "defense").map(f => factor(f.key))] },
    ],
    trailing: [
      { key: "games", label: "GP", title: "Games in the fit", value: p => p.games },
      { key: "minutes", label: "MIN", title: "Minutes in the fit", value: p => p.minutes },
    ],
  };
}

const TABLE = tableColumns();

const GLOSSARY: GlossaryGroup[] = [
  { label: "Total", icon: "layers", items: [
    { term: "RAPM", text: "Points per 100 counted controls the team gains with the player on the floor, after adjusting for teammates and opponents. ORAPM plus DRAPM equals RAPM exactly." },
    { term: "Net Eff", text: "Net Efficiency: oTS and dTS weighted by the season's second regression, in RAPM points. No interval." },
    { term: "Poss Ctrl", text: "Possession Control: oTOV, oREB, dTOV and dREB weighted the same way, in RAPM points. No interval." },
  ] },
  { label: "Offense", icon: "trend", tone: "a", items: [
    { term: "ORAPM", text: "The offensive half of RAPM." },
    ...FACTORS.filter(f => f.side === "offense").map(f => ({ term: f.short, text: `${f.help}, in percentage points. Positive helps.` })),
  ] },
  { label: "Defense", icon: "shield", tone: "b", items: [
    { term: "DRAPM", text: "The defensive half of RAPM, signed so positive helps." },
    ...FACTORS.filter(f => f.side === "defense").map(f => ({ term: f.short, text: `${f.help}, in percentage points. Signs are flipped so positive helps.` })),
  ] },
  { label: "Sample", icon: "users", items: [
    { term: "GP", text: "Games the player appears in for this fit." },
    { term: "MIN", text: "Minutes the player appears in for this fit. The minimum filter uses it; possessions are not served." },
  ] },
];

function TreeNode({ nodeKey, node, domain, unit }: { nodeKey: NodeKey; node: ImpactNode; domain: [number, number]; unit: string }) {
  const meta = NODE_LABELS[nodeKey];
  const reason = unknownReason(node.status);
  return <div className="sf-node" data-node={nodeKey} data-status={node.status} data-value={node.value ?? undefined} data-low={node.low ?? undefined} data-high={node.high ?? undefined} title={node.replicates != null && node.replicates < 200 ? `The player appears in ${node.replicates} of 200 replicates` : undefined}>
    <p className="sf-node-code">{meta.short}<span>{meta.label}</span></p>
    {node.value == null ? <p className="sf-node-unknown">{UNKNOWN}</p> : <p className="sf-node-value"><NodeValue node={node} /><span className="sf-node-unit">{unit}</span></p>}
    <IntervalMark node={node} domain={domain} />
    <p className="sf-node-interval">{node.low == null || node.high == null ? "80% interval unknown" : `80%: ${intervalText(node)}`}</p>
    {reason && <p className="rs-note">{reason}</p>}
  </div>;
}

export function ImpactTree({ tree, reconstruction }: { tree: ImpactTreeData; reconstruction: Reconstruction | null }) {
  const unit = "pts", factorUnit = "pct pts";
  const ratingDomain = intervalDomain([tree.metrics.rapm, tree.metrics.orapm, tree.metrics.drapm]);
  const factorDomain = intervalDomain(FACTORS.map(factor => tree.metrics[factor.key]));
  const branch = (rating: "orapm" | "drapm", side: "offense" | "defense") => <li data-side={side}>
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
      <p className="rs-note">ORAPM plus DRAPM equals RAPM exactly. Each factor is a separate estimate, so the third level does not sum to the second.{reconstruction ? ` Across ${reconstruction.players} ${tree.season} players the weighted factors explain R² ${r2(reconstruction.in_sample.value)} of RAPM.` : ""}</p>
    </div>
  </div>;
}

function TreeSection({ page, playerId, onPlayer }: { page: SixFactorPage; playerId: string; onPlayer: (id: string | null) => void }) {
  const { data, error, loading, retry } = useFeed([playerId, page.season, page.phase], signal => getImpactTree(playerId, page.season, page.phase, signal));
  return <ResearchSection id="impact-tree" icon="split" title="Impact Tree" aside={<span className="rs-note">Any player, {page.season} · {phaseLabel(page.phase)}</span>}>
    <div className="sf-tree-head">
      <div className="sf-tree-picker"><EntityField label="Player" value={playerId} season={page.season} phase={page.phase} initialName={data?.player_name} onChange={value => onPlayer(value || null)} /></div>
      {data && <PlayerIdentity playerId={data.player_id} name={data.player_name} team={data.team} era={seasonEra(page.season, data.team)} size="lg" href={`/players/${data.player_id}?season=${page.season}`}
        subtitle={data.in_fit ? <>{data.games ?? "—"} GP · {data.minutes == null ? "—" : count(Math.round(data.minutes))} MIN</> : `Not in the ${page.season} fit`} />}
    </div>
    {error && <FeedFailure error={error} retry={retry} what="Impact Tree" />}
    {loading && <FeedSkeleton label="Loading Impact Tree" />}
    {data && <>
      {!data.in_fit && <GatedNote>This player has no stints in the {page.season} {phaseLabel(page.phase).toLowerCase()} fit, so every number is unknown, not zero.{data.rated_seasons.length > 0 ? ` RAPM is served for ${data.rated_seasons.join(", ")}.` : ""}</GatedNote>}
      <ImpactTree tree={data} reconstruction={page.reconstruction} />
    </>}
  </ResearchSection>;
}

function Body({ page, factor, playerId, treeHref, statsHref, set }: { page: SixFactorPage; factor: FactorKey; playerId: string; treeHref: (id: string) => string; statsHref: string; set: (next: Record<string, string | null>) => void }) {
  const players = page.players;
  const byId = useMemo(() => new Map(players.map(player => [player.player_id, player])), [players]);
  const leader = useMemo(() => sortPlayers(players, "rapm", "desc")[0], [players]);
  const highlighted = useMemo(() => {
    const labels = new Map(page.archetypes.map(card => [card.player_id, lastName(byId.get(card.player_id)?.player_name ?? "")]));
    const chosen = byId.get(playerId);
    if (chosen) labels.set(chosen.player_id, lastName(chosen.player_name));
    return labels;
  }, [page, byId, playerId]);
  const { views, trailing } = TABLE;
  const onFactor = (key: FactorKey) => set({ factor: key === "o_ts" ? null : key });
  const fit = page.reconstruction;
  const csvColumns = useMemo(() => [
    { header: "player_id", value: (p: SixFactorPlayer) => p.player_id }, { header: "player", value: (p: SixFactorPlayer) => p.player_name },
    { header: "team", value: (p: SixFactorPlayer) => p.team }, { header: "games", value: (p: SixFactorPlayer) => p.games }, { header: "minutes", value: (p: SixFactorPlayer) => p.minutes },
    ...(["rapm", "orapm", "drapm", ...FACTORS.map(f => f.key)] as NodeKey[]).flatMap(key => [
      { header: key, value: (p: SixFactorPlayer) => p.metrics[key].value }, { header: `${key}_p10`, value: (p: SixFactorPlayer) => p.metrics[key].low }, { header: `${key}_p90`, value: (p: SixFactorPlayer) => p.metrics[key].high },
    ]),
    { header: "net_efficiency", value: (p: SixFactorPlayer) => p.composites.net_efficiency }, { header: "possession_control", value: (p: SixFactorPlayer) => p.composites.possession_control },
  ], []);
  return <>
    <ResearchIntro tagline="RAPM split into six factors, each with an 80% interval, for any player."
      links={[{ label: "Check this in the Stats page", href: statsHref, icon: "table" }, { label: "Impact Tree for any player", href: "#impact-tree", icon: "split" }]} />
    {!page.intervals_available && <GatedNote>Playoff fits have values but no registered intervals or regression weights, so their intervals, composites and archetypes show as unknown.</GatedNote>}

    <ResearchSection icon="layers" title="The Framework">
      <ResearchProse>
        <p>RAPM gives one number per player. {leader && leader.metrics.rapm.value != null ? <>{leader.player_name} leads the {page.season}{page.phase === "playoffs" ? " playoffs" : ""} fit at <NodeValue node={leader.metrics.rapm} /> RAPM, but that number doesn&apos;t say why. </> : null}Six-Factor RAPM opens it up: the same ridge regression on the same lineups, run once for each of three rates (true shooting, turnover rate and offensive rebound rate), each on offense and defense.</p>
        <p>{fit ? <>Weighted by a second regression, the six factors rebuild {page.season} RAPM with <strong className="sf-r2">R² = {r2(fit.in_sample.value)}</strong>, measured by CourtLens ({r2(fit.cross_validated.value)} on held-out players). Databallr quotes 0.985 for its own pooled fit.</> : "No reconstruction is registered for playoff fits, so how far the factors rebuild RAPM is unknown here."}</p>
      </ResearchProse>
      <FrameworkGrid factor={factor} onFactor={onFactor} />
    </ResearchSection>

    <ResearchSection icon="info" title="How It Works"><HowItWorks page={page} /></ResearchSection>

    <ResearchSection id="six-factors" icon="crosshair" title="The Six Factors">
      <ResearchTabPanel label="Factor" value={factor} onChange={onFactor} options={FACTORS.map(item => ({ value: item.key, label: item.short, title: item.label }))}>
        <FactorPanel factor={factor} page={page} byId={byId} treeHref={treeHref} />
      </ResearchTabPanel>
    </ResearchSection>

    <ResearchSection icon="layers" title="Two Ways to Slice the Grid">
      <SliceCards page={page} />
      <CompositeScatter players={players} season={page.season} highlighted={highlighted} />
    </ResearchSection>

    <ResearchSection icon="target" title="Player Archetypes">
      <p className="rs-prose-line">Six profiles picked by fixed rules from {page.season}&apos;s players with all nine values: different routes to impact. A rule picks the largest estimate; that is how a card is filled, not a claim that the player is the best at it.</p>
      <ArchetypeCards page={page} byId={byId} treeHref={treeHref} />
    </ResearchSection>

    <ResearchSection id="ratings" icon="table" title="All Ratings">
      <ResearchTable label="Six-factor ratings with intervals" rows={players} rowKey={p => p.player_id} name={p => p.player_name} team={p => p.team} season={page.season}
        player={p => <PlayerIdentity playerId={p.player_id} name={p.player_name} era={seasonEra(page.season, p.team)} size="sm" href={`/players/${p.player_id}?season=${page.season}`} />}
        views={views} trailingColumns={trailing} defaultSort="rapm" noun="players"
        minimum={{ label: "Min MIN", value: p => p.minutes, initial: 0, step: 100 }}
        csv={{ filename: `courtlens-six-factor-${page.season}-${page.phase}.csv`, columns: csvColumns }}
        actions={<ButtonLink size="md" icon="book" href="#methodology">Methodology</ButtonLink>}
        rowAction={p => <IconButtonLink size="sm" icon="split" label={`Open ${p.player_name}'s Impact Tree`} href={treeHref(p.player_id)} />}
        footnote={<>RAPM in points per 100 counted controls, factors in percentage points, each with its 80% interval. Unknown values sort last and are never zero. {count(page.fit_players - players.length)} more players in the fit qualify for no value; find them in the Impact Tree. <ButtonLink size="sm" variant="text" href={statsHref}>All players in Stats</ButtonLink></>} />
    </ResearchSection>

    <ResearchSection icon="book" title="How to Read the Numbers">
      <ReadingGuide
        units={<>RAPM, ORAPM and DRAPM are in <strong>points per 100 counted controls</strong>; the six factors are in <strong>percentage points</strong> of their rate. Zero means average.</>}
        offense={<><strong className="sf-example" data-tone="a">+2.00 oTS</strong> means the team&apos;s true shooting is about 2 percentage points higher with this player on offense, after adjusting for teammates and opponents.</>}
        defense={<><strong className="sf-example" data-tone="b">−1.50 dTS</strong> means opponents&apos; true shooting is about 1.5 points higher with this player on defense (bad). Defensive signs are flipped, so positive always helps.</>}
        note={<>Lineup estimates with <strong>no box-score prior</strong>, not stabilized like DARKO or EPM. Overlapping intervals mean the data does not separate two players.</>} />
    </ResearchSection>

    <ResearchSection icon="help" title="Column Glossary"><Glossary groups={GLOSSARY} /></ResearchSection>

    {playerId && <TreeSection page={page} playerId={playerId} onPlayer={id => set({ player: id })} />}

    <ResearchDisclosure id="methodology" icon="book" title="Caveats & Methodology">
      <MethodBlock title="Caveats"><Caveats page={page} /></MethodBlock>
      <MethodBlock title="The Regressions">
        <MethodSteps steps={[
          { title: "Stints", text: <>Public play-by-play is rebuilt into stints: who was on the floor and what happened.{page.coverage ? ` ${count(page.coverage.admitted_games)} of ${count(page.coverage.scheduled_games)} ${page.season} games were admitted.` : ""}</> },
          { title: "RAPM", text: "A ridge regression of scoring on every player on the floor, offense and defense, for one season." },
          { title: "Six factors", text: "The same design and penalty with true shooting, turnover rate and offensive rebound rate as the targets, each split into offense and defense." },
          { title: "Resampling", text: page.intervals_available ? "Games are drawn with replacement 200 times (seeded) and every fit repeated. The 10th and 90th percentiles form each 80% interval." : "No resampling is registered for playoff fits." },
          { title: "Reconstruction", text: fit ? `A seconds-weighted regression of RAPM on the six factors gives each factor's weight in RAPM points: R² ${r2(fit.in_sample.value)} in-sample, ${r2(fit.cross_validated.value)} in 10-fold cross-validation.` : "Registered for regular seasons only." },
        ]} />
      </MethodBlock>
      <MethodBlock title="Data & Credits"><Credits /></MethodBlock>
    </ResearchDisclosure>
  </>;
}

/** Research → Six-Factor RAPM (R02, design phase row 18). Layout after Databallr's explainer; every value is CourtLens's own. */
export function SixFactorResearch() {
  const { get, set } = useUrlState();
  const pathname = usePathname();
  const season = get("season") ?? "2025-26";
  const phase: SixFactorPhase = get("phase") === "playoffs" ? "playoffs" : "regular_season";
  const factor = (FACTORS.find(item => item.key === get("factor"))?.key ?? "o_ts") as FactorKey;
  const { data: answer, error, loading, retry } = useFeed([season, phase], signal => getSixFactorPage(season, phase, signal));
  const data = answer?.status === "available" ? answer : null;
  const leader = useMemo(() => data ? sortPlayers(data.players, "rapm", "desc")[0] : undefined, [data]);
  const playerId = get("player") ?? leader?.player_id ?? "";
  const treeHref = (id: string) => {
    const next = new URLSearchParams({ ...(get("season") ? { season } : {}), ...(phase === "playoffs" ? { phase } : {}), ...(get("factor") ? { factor } : {}), player: id });
    return `${pathname}?${next}#impact-tree`;
  };
  const scopes = answer?.scopes ?? [{ season, phase }];
  const seasons = [...new Set(scopes.map(scope => scope.season))];
  if (!seasons.includes(season)) seasons.unshift(season);
  const phases = scopes.filter(scope => scope.season === season).map(scope => scope.phase);
  const statsHref = `/stats?${new URLSearchParams({ season, phase, viewId: "sixfactor", sortMetric: "rapm" })}`;
  const details: ReactNode = data && <DataDetailsButton rows={[
    { label: "Serving version", value: data.provenance.version, mono: true },
    { label: "Manifest SHA-256", value: data.provenance.manifest_sha256, mono: true },
    { label: "1Y fit SHA-256", value: `${data.provenance.artifact_sha256} · games through ${data.provenance.last_included_date}`, mono: true },
    { label: "Intervals", value: data.provenance.interval_sha256 ? `${data.provenance.interval_registration} · ${data.provenance.interval_sha256}` : "None served for this fit", mono: true },
    { label: "Reconstruction", value: data.reconstruction ? `${data.reconstruction.registration} · ${data.reconstruction.registration_sha256}` : "None registered for this phase", mono: true },
  ]} />;
  return <div className="rs-column sf-page">
    <FilterBar label="Six-Factor filters" summary={`${season} · ${phaseLabel(phase)}`}
      scope={<>
        <Field label="Season" layout="inline"><Select aria-label="Season" value={season} onChange={event => {
          const next = event.target.value;
          set({ season: next, phase: phase === "playoffs" && scopes.some(scope => scope.season === next && scope.phase === "playoffs") ? "playoffs" : null });
        }}>{seasons.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>
        <Field label="Phase" layout="inline"><Select aria-label="Phase" value={phase} onChange={event => set({ phase: event.target.value === "playoffs" ? "playoffs" : null })}>{(phases.length ? phases : [phase]).map(value => <option key={value} value={value}>{phaseLabel(value)}</option>)}</Select></Field>
      </>}
      count={data && <CountChip>{count(data.players.length)} rated</CountChip>}
      details={details} />
    {error && <FeedFailure error={error} retry={retry} what="Six-Factor RAPM" />}
    {loading && <FeedSkeleton label="Loading six-factor ratings" />}
    {answer?.status === "unavailable" && <GatedNote action={answer.scopes[0] && <ButtonLink size="lg" href={`${pathname}?season=${answer.scopes[0].season}`}>Open {answer.scopes[0].season}</ButtonLink>}>No one-year fit is served for {season} {phaseLabel(phase).toLowerCase()}. RAPM is sealed after a season ends, and history starts in 2014-15.</GatedNote>}
    {data && <Body page={data} factor={factor} playerId={playerId} treeHref={treeHref} statsHref={statsHref} set={set} />}
  </div>;
}

