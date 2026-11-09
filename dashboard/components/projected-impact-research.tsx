"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { LookupInput } from "./lookup-input";
import { SeasonLineChart } from "./research/season-line-chart";
import {
  Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchLinks, ResearchSection, type GlossaryGroup,
} from "./research/research-page";
import { sortRows } from "./research/research-table";
import { GridPlayer, GridSearch, GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { TeamPicker } from "./research/team-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar } from "./ui/identity";
import { Button, IconButton, Segmented } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { addDays, formatDate } from "@/lib/format-date";
import { seasonEra } from "@/lib/portrait-source";
import {
  blockRows, BUCKET_LABELS, featureRows, fixed, gapBand, gapText, getProjectedImpactPage, getProjectedImpactPlayer, intervalTone, percent, RATING_LABELS, RATING_ORDER, signed, signTone,
  TARGET_MINUTE_LABELS, type Gap, type GameTable, type PlayerTable, type ProjectedImpactPage, type ProjectedPlayer, type ScoreGroup,
} from "@/lib/projected-impact";
import { evidenceUrl } from "@/lib/research-facts";
import { teamAccent } from "@/lib/team-colors";
import type { LookupItem } from "@/lib/types";

/**
 * Research → Models → Projected Impact (R07, designed in RD11). Every number is the frozen courtlens-projected-impact-v1 files' or the
 * weekly scorer's; exact values sit on `data-*`. Rows of a comparison stay in registered order. The projections table is sorted by the
 * estimate, but it carries no rank: its intervals overlap, so its order is not a verdict on players.
 */

const SEASON = "2026-27", LAST_SEASON = "2025-26";
const NO_PLAYER = "none";
const VIEWS = [
  { value: "roster", label: "On a roster" },
  { value: "rookie", label: "Rookies and returners" },
  { value: "all", label: "Everyone" },
];
/** The gaps a rating is measured against on the test seasons and in the weekly score. */
const BASELINES = ["carry_forward", "time_decay"] as const;
type Baseline = typeof BASELINES[number];
const BASELINE_LABELS: Record<Baseline, string> = { carry_forward: "carry-forward", time_decay: "time decay" };

const count = (n: number) => n.toLocaleString("en-US");
const teamOf = (row: ProjectedPlayer) => row.tricode ?? row.last_tricode;
const teamSeason = (row: ProjectedPlayer) => row.tricode ? SEASON : LAST_SEASON;
const vars = (props: Record<string, string>) => props as CSSProperties;
const gainData = (gap: Gap | undefined, field: string) => ({ field, value: gap?.gap ?? "", low: gap?.low ?? "", high: gap?.high ?? "" });

function subtitleOf(row: ProjectedPlayer): string {
  const team = row.on_roster ? row.tricode ?? "—" : `Not on a roster · last ${row.last_tricode ?? "—"}`;
  return row.group === "prior" ? team : `${team} · ${row.group === "rookie" ? "Rookie" : "Returner"}`;
}

/** The frozen model reads as the page's own name, with its technical name under it. */
const ratingName = (name: string, selected: string) => name === selected ? "Projected Impact" : RATING_LABELS[name] ?? name;

function Rating({ name, selected }: { name: string; selected: string }) {
  return <><span className="pi-rating">{ratingName(name, selected)}</span>{name === selected && <span className="pi-rating-sub">LightGBM, the frozen model</span>}</>;
}

// ---- The answer --------------------------------------------------------------------------------

function Answer({ page }: { page: ProjectedImpactPage }) {
  const { ratings } = page.card.test.pooled.game;
  const error = (name: string) => <strong data-value={ratings[name].rmse}>{fixed(ratings[name].rmse)}</strong>;
  return <ResearchSection id="answer" icon="trophy" title="Does the model beat carrying last season forward?">
    <div className="pi-answer" data-field="answer">
      <p className="pi-headline">Yes, the frozen model beat it on both held-out seasons, but its edge over time-decay RAPM is small.</p>
      <p className="pi-lead" data-field="edge">Error on final game margins, in points: {error(page.model.selected)} for the model, {error("time_decay")} for time decay and {error("carry_forward")} for carry-forward.</p>
      <p className="pi-lead">Time-decay RAPM already blends several seasons, so most of the gain over carry-forward is what any multi-year rating gives. The test was read once, after every choice was fixed.</p>
    </div>
  </ResearchSection>;
}

// ---- 2026-27 projections -------------------------------------------------------------------------

function RangeMark({ row, left, right }: { row: ProjectedPlayer; left: number; right: number }) {
  const at = (value: number) => `${((value - left) / (right - left)) * 100}%`;
  const tone = intervalTone(row), identity = tone ? undefined : signTone(row.projection);
  return <span className="pi-range" aria-hidden="true" data-tone={tone} data-identity={identity} style={vars({ "--pi-low": at(row.low), "--pi-high": at(row.high), "--pi-at": at(row.projection), "--pi-zero": at(0) })}>
    <span className="pi-range-zero" /><span className="pi-range-span" /><span className="pi-range-dot" />
  </span>;
}

function Projections({ page, chosen, onChoose }: { page: ProjectedImpactPage; chosen: string | null; onChoose: (id: string) => void }) {
  const { get, set } = useUrlState();
  const { players, model } = page;
  const view = VIEWS.some(v => v.value === get("view")) ? get("view")! : "roster";
  const team = get("team");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "projection", direction: "desc" });
  // The bars' scale fits every served interval, so none is cut off.
  const axis = useMemo(() => ({ left: Math.floor(Math.min(...players.map(p => p.low))), right: Math.ceil(Math.max(...players.map(p => p.high))) }), [players]);
  const below = players.some(p => p.high < 0);
  const rookies = view === "rookie";
  const zero = `${((0 - axis.left) / (axis.right - axis.left)) * 100}%`;
  const columns: GridColumn<ProjectedPlayer>[] = [
    { key: "projection", label: "Projected", title: "Projected RAPM with its 80% interval, and the interval drawn on one scale for every player", group: SEASON, width: "fill", sort: p => p.projection,
      headerAfter: <span className="pi-scale" aria-hidden="true" data-field="axis" data-left={axis.left} data-right={axis.right} style={vars({ "--pi-zero": zero })}>
        <span data-end="left">{signed(axis.left, 0)}</span><span data-end="zero">0</span><span data-end="right">{signed(axis.right, 0)}</span>
      </span>,
      data: p => ({ field: "projection", value: p.projection, low: p.low, high: p.high }),
      cell: p => <span className="pi-projection">
        <span className="pi-projection-value"><GridValue text={signed(p.projection)} sub={gapBand(p, 1)} tone={intervalTone(p)} identity={intervalTone(p) ? undefined : signTone(p.projection)} title={intervalTone(p) ? "80% interval excludes zero" : "80% interval includes zero"} /></span>
        <RangeMark row={p} left={axis.left} right={axis.right} />
      </span> },
    { key: "age", label: "Age", title: "Age at the season opener", group: SEASON, width: "xs", sort: p => p.age, data: p => ({ field: "age", value: p.age ?? "" }), cell: p => <GridValue text={p.age == null ? null : String(Math.floor(p.age))} /> },
    // Rookies and returners have no last season at all, so that view shows how long each has been around instead of two columns of dashes.
    ...(rookies ? [{ key: "years", label: "Years in league", title: "Years in the league at the season opener", group: SEASON, width: "md" as const, sort: (p: ProjectedPlayer) => p.years_in_league,
      data: (p: ProjectedPlayer) => ({ field: "years", value: p.years_in_league ?? "" }), cell: (p: ProjectedPlayer) => <GridValue text={p.years_in_league == null ? null : String(p.years_in_league)} /> }] : [
      { key: "last", label: "RAPM", title: "Last season's RAPM. Rookies and returners have none", group: "Last season", width: "sm" as const, sort: (p: ProjectedPlayer) => p.group === "prior" ? p.ratings.carry_forward : null,
        data: (p: ProjectedPlayer) => ({ field: "last", value: p.group === "prior" ? p.ratings.carry_forward : "" }), cell: (p: ProjectedPlayer) => p.group === "prior" ? <GridValue text={signed(p.ratings.carry_forward)} identity={signTone(p.ratings.carry_forward)} /> : <GridValue text={null} /> },
      { key: "minutes", label: "Minutes", title: "Minutes last season", group: "Last season", width: "sm" as const, sort: (p: ProjectedPlayer) => p.minutes_last_season, data: (p: ProjectedPlayer) => ({ field: "minutes", value: p.minutes_last_season ?? "" }),
        cell: (p: ProjectedPlayer) => <GridValue text={p.minutes_last_season == null ? null : count(Math.round(p.minutes_last_season))} /> },
    ]),
  ];
  const column = columns.find(c => c.key === sort.key) ?? columns[0];
  const needle = query.trim().toLocaleLowerCase("en-US");
  const filtered = players.filter(row => (view === "all" || (view === "rookie" ? row.group !== "prior" : row.on_roster)) && (!team || teamOf(row) === team) && (!needle || row.name.toLocaleLowerCase("en-US").includes(needle)));
  const rows = sortRows(filtered, column.sort!, sort.direction, p => p.player_id);
  const onSort = (key: string) => setSort(s => s.key === key ? { key, direction: s.direction === "desc" ? "asc" : "desc" } : { key, direction: "desc" });
  return <ResearchSection id="projections" icon="list-ordered" title={`${SEASON} projected RAPM, points per 100 possessions`}>
    <p className="pi-lead">Zero is an average player. Frozen on {formatDate(model.frozen_at.slice(0, 10))} and never updated; every input ends before the {formatDate(model.feature_cutoff)} opener.
      The interval describes next season&apos;s one-year RAPM, a noisy estimate, and not the player&apos;s true ability. CourtLens makes no claim about which of two players is better when their intervals overlap.</p>
    <div className="pi-tools">
      <Segmented label="Players" size="md" value={view} onChange={next => set({ view: next === "roster" ? null : next })} options={VIEWS} />
      <TeamPicker value={team} onChange={code => set({ team: code })} season={SEASON} />
      <span className="pi-count" data-field="shown" data-value={rows.length}>{count(rows.length)} players</span>
    </div>
    <ul className="rs-legend" aria-label="Colour key">
      <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />80% interval above zero</li>
      {below && <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />80% interval below zero</li>}
      <li><span className="rs-swatch pi-swatch" data-identity="a" aria-hidden="true" />Above zero, interval includes zero</li>
      <li><span className="rs-swatch pi-swatch" data-identity="b" aria-hidden="true" />Below zero, interval includes zero</li>
    </ul>
    <StatsGrid<ProjectedPlayer> label="Projected impact" name="projections" className="pi-board" rows={rows} rowKey={p => p.player_id} leadWidth="lg" columns={columns}
      sort={{ key: column.key, direction: sort.direction, onSort }} empty="No players match these filters." rowData={p => ({ group: p.group, roster: p.on_roster ? "true" : "false" })}
      lead={{ span: true, label: <GridSearch value={query} onChange={setQuery} />,
        cell: p => <GridPlayer playerId={p.player_id} name={p.name} team={teamOf(p)} season={teamSeason(p)} era={seasonEra(teamSeason(p), teamOf(p))} subtitle={subtitleOf(p)} href={`/players/${p.player_id}`}
          tools={<IconButton size="sm" icon="arrow-right" label={`Why ${p.name} is projected here`} pressed={chosen === p.player_id} onClick={() => onChoose(p.player_id)} />} /> }} />
  </ResearchSection>;
}

// ---- Why a player is projected there --------------------------------------------------------------

function Bars({ title, rows, name }: { title: string; rows: { key: string; label: string; value: number }[]; name: string }) {
  const max = Math.max(.5, ...rows.map(r => Math.abs(r.value)));
  return <div className="pi-bars-block" data-block={name}>
    <h4 className="pi-bars-title">{title}</h4>
    <ul className="pi-bars" data-bars={name}>{rows.map(row => <li key={row.key} className="pi-bar-row" data-key={row.key} data-value={row.value}>
      <span className="pi-bar-label">{row.label}</span>
      <span className="pi-bar-value" data-identity={signTone(row.value)}>{signed(row.value)}</span>
      <span className="pi-bar-track" aria-hidden="true"><span className="pi-bar" data-sign={row.value >= 0 ? "up" : "down"} data-identity={signTone(row.value)} style={vars({ "--pi-bar": `${(Math.abs(row.value) / max) * 50}%` })} /></span>
    </li>)}</ul>
  </div>;
}

function Why({ page, id, fallback, onChoose, onClear, onReset }: { page: ProjectedImpactPage; id: string | null; fallback: string | null; onChoose: (id: string) => void; onClear: () => void; onReset: () => void }) {
  const { players, model } = page;
  const [text, setText] = useState("");
  const [side, setSide] = useState<"blocks" | "top">("blocks");
  const row = id ? players.find(p => p.player_id === id) ?? null : null;
  const { data, error, loading, retry } = useFeed([row?.player_id ?? null], signal => row ? getProjectedImpactPlayer(row.player_id, signal) : Promise.resolve(null));
  const items = useMemo(() => players.map((p): LookupItem => ({
    id: p.player_id, canonical_id: p.player_id, kind: "player", display_name: p.name, match_basis: "suggestion", match_score: 1,
    availability: { has_current_season: true, status: "available", seasons: [SEASON] }, destination_url: `/players/${p.player_id}`,
    metadata: { caption: `${subtitleOf(p)} · ${signed(p.projection)}` },
  } as LookupItem)), [players]);
  const team = row ? teamOf(row) : null;
  const tint = row && team ? teamAccent(team, teamSeason(row)) : null;
  return <ResearchSection id="contributions" icon="scale" title="Why a player is projected there">
    <div className="pi-why-pick">
      <LookupInput label="Player" placeholder={`Search ${count(players.length)} projected players`} value={text} onChange={setText} candidates={items} limit={12} groupLabel="Projected players"
        onSelect={item => { setText(""); onChoose(item.canonical_id); }} />
      {id !== NO_PLAYER && <Button size="md" variant="ghost" icon="close" onClick={onClear}>Clear</Button>}
    </div>
    {id === NO_PLAYER && <GatedNote action={fallback ? <Button size="lg" variant="secondary" onClick={onReset}>Open the default player</Button> : undefined}>No player chosen. Search for one above, or open the default: the highest projection on a roster.</GatedNote>}
    {id !== NO_PLAYER && !row && <GatedNote>No contributions for this player.</GatedNote>}
    {row && error && <FeedFailure error={error} retry={retry} what="The player's contributions" />}
    {row && loading && <FeedSkeleton label="Loading the player's contributions" />}
    {row && data && <article className="pi-card" data-player={row.player_id} style={tint ? vars({ "--pi-team": tint }) : undefined}>
      <header className="pi-card-head">
        <PlayerAvatar playerId={row.player_id} name={row.name} team={team} size="lg" era={seasonEra(teamSeason(row), team)} />
        <span className="pi-card-titles">
          <a className="pi-card-name" href={`/players/${row.player_id}`}>{row.name}</a>
          <span className="pi-card-team">{team && <TeamLogo team={team} season={teamSeason(row)} size={16} />}{subtitleOf(row)}{row.age == null ? "" : ` · Age ${Math.floor(row.age)}`}</span>
        </span>
        <span className="pi-card-value" data-field="card-projection" data-value={row.projection} data-low={row.low} data-high={row.high}>
          <strong data-tone={intervalTone(row)} data-identity={intervalTone(row) ? undefined : signTone(row.projection)}>{signed(row.projection)}</strong>
          <small>80% interval {gapBand(row, 1)}</small>
        </span>
      </header>
      <p className="pi-sum" data-field="sum" data-base={data.base}>{signed(data.base)} training average + the sources below = {signed(row.projection)}</p>
      <div className="pi-bars-switch"><Segmented label="Contribution list" size="md" stretch value={side} onChange={setSide} options={[{ value: "blocks", label: "By source" }, { value: "top", label: "Largest inputs" }]} /></div>
      <div className="pi-bars-pair" data-side={side}>
        <Bars title="By source" name="blocks" rows={blockRows(data.player.contributions.blocks)} />
        <Bars title="Largest single inputs" name="top" rows={featureRows(data.player.contributions.top)} />
      </div>
      <div className="pi-tiles" data-field="ratings">{RATING_ORDER.map(name => <div key={name} className="pi-tile" data-rating={name} data-value={row.ratings[name]}>
        <span className="pi-tile-label">{name === "carry_forward" && row.group !== "prior" ? "Group average" : ratingName(name, model.selected)}</span>
        <span className="pi-tile-value" data-tone={name === model.selected ? intervalTone(row) : undefined} data-identity={name === model.selected && intervalTone(row) ? undefined : signTone(row.ratings[name])}>{signed(row.ratings[name])}</span>
      </div>)}</div>
      <p className="pi-note">The bars describe the model&apos;s arithmetic, not a cause. Only the frozen model has an interval.</p>
    </article>}
  </ResearchSection>;
}

// ---- The test ------------------------------------------------------------------------------------

function gainCell(gaps: Record<string, Gap>, name: string, base: Baseline, tinted: boolean, digits = 2) {
  if (name === base) return <GridValue text="Baseline" muted />;
  const gap = gaps[`${name}_over_${base}`];
  return gap ? <GridValue text={signed(gap.gap, digits)} sub={gapBand(gap, digits)} tone={tinted ? intervalTone(gap) : undefined} /> : <GridValue text={null} />;
}

const gainColumns = <T extends string>(gaps: (name: T) => Record<string, Gap>, tinted = true): GridColumn<T>[] => BASELINES.map(base => ({
  key: `over_${base}`, label: `Gain over ${BASELINE_LABELS[base]}`, title: `Squared-error gain over ${BASELINE_LABELS[base]} with its 95% interval`, width: "lg",
  data: name => name === base ? { field: base, baseline: "true" } : gainData(gaps(name)[`${name}_over_${base}`], base),
  cell: name => gainCell(gaps(name), name, base, tinted),
}));

function TestGrids({ player, game, selected }: { player: PlayerTable; game: GameTable; selected: string }) {
  return <>
    <h3 className="pi-subhead">Players: next season&apos;s RAPM, weighted by minutes</h3>
    <p className="pi-note" data-field="test-players" data-value={player.players}>{count(player.players)} player seasons with a prior season.</p>
    <StatsGrid<string> label="Final test, players" name="test-players" density="compact" height="auto" leadWidth="md" className="pi-test" rows={RATING_ORDER} rowKey={n => n}
      lead={{ label: "Rating", cell: n => <Rating name={n} selected={selected} /> }}
      columns={[
        ...gainColumns<string>(() => player.gaps),
        { key: "rmse", label: "RMSE", width: "sm", data: n => ({ field: "rmse", value: player.models[n].rmse }), cell: n => <GridValue text={fixed(player.models[n].rmse)} /> },
        { key: "correlation", label: "Correlation", width: "sm", data: n => ({ field: "correlation", value: player.models[n].correlation }), cell: n => <GridValue text={fixed(player.models[n].correlation)} /> },
      ]} />
    <h3 className="pi-subhead">Games: final margin</h3>
    <p className="pi-note" data-field="test-games" data-value={game.games}>{count(game.games)} games.</p>
    <StatsGrid<string> label="Final test, games" name="test-games" density="compact" height="auto" leadWidth="md" className="pi-test" rows={RATING_ORDER} rowKey={n => n}
      lead={{ label: "Rating", cell: n => <Rating name={n} selected={selected} /> }}
      columns={[
        ...gainColumns<string>(() => game.gaps),
        { key: "rmse", label: "Margin RMSE", width: "sm", data: n => ({ field: "rmse", value: game.ratings[n].rmse }), cell: n => <GridValue text={fixed(game.ratings[n].rmse)} /> },
        { key: "winner", label: "Winner picked", width: "sm", data: n => ({ field: "winner", value: game.ratings[n].winner_accuracy ?? "" }), cell: n => <GridValue text={game.ratings[n].winner_accuracy == null ? null : percent(game.ratings[n].winner_accuracy)} /> },
      ]} />
  </>;
}

const GROUP_RATINGS = ["lightgbm", "ridge", "time_decay", "group_mean"] as const;
const GROUPS = ["rookie", "returner"] as const;

function GroupsGrid({ page }: { page: ProjectedImpactPage }) {
  const { groups } = page.card.test.pooled;
  const columns: GridColumn<string>[] = GROUPS.flatMap((group): GridColumn<string>[] => {
    const table = groups[group], heading = `${group === "rookie" ? "Rookies" : "Returners"}, ${count(table.players)} players`;
    const model = (name: string) => table.models[name];
    return [
      { key: `${group}-gain`, label: "Gain", title: "Squared-error gain over the group's average, with its 95% interval", group: heading, width: "md",
        data: n => n === "group_mean" ? { field: `${group}-gain`, baseline: "true" } : gainData(model(n).gap_over_group_mean, `${group}-gain`),
        cell: n => n === "group_mean" ? <GridValue text="Baseline" muted /> : <GridValue text={signed(model(n).gap_over_group_mean.gap)} sub={gapBand(model(n).gap_over_group_mean)} tone={intervalTone(model(n).gap_over_group_mean)} /> },
      { key: `${group}-rmse`, label: "RMSE", group: heading, width: "sm", data: n => ({ field: `${group}-rmse`, value: n === "group_mean" ? table.group_mean_rule_rmse : model(n).rmse }),
        cell: n => <GridValue text={fixed(n === "group_mean" ? table.group_mean_rule_rmse : model(n).rmse)} /> },
    ];
  });
  return <StatsGrid<string> label="Rookies and returners against the group average" name="test-groups" density="compact" height="auto" leadWidth="md" className="pi-test" rows={GROUP_RATINGS} rowKey={n => n}
    lead={{ label: "Rating", cell: n => n === "group_mean" ? <span className="pi-rating">Group average</span> : <Rating name={n} selected={page.model.selected} /> }} columns={columns} />;
}

function TestSection({ page }: { page: ProjectedImpactPage }) {
  const { get, set } = useUrlState();
  const { card, model } = page;
  const seasons = Object.keys(card.test.seasons);
  const season = seasons.includes(get("testSeason") ?? "") ? get("testSeason")! : "pooled";
  const scope = season === "pooled" ? card.test.pooled : card.test.seasons[season];
  const pooled = card.test.pooled;
  return <ResearchSection id="test" icon="target" title="The test">
    <p className="pi-lead">Each row is one rating on 2024-25 and 2025-26. A gain is the baseline&apos;s squared error minus the rating&apos;s, so above zero the rating did better. A dash is a pair that was never computed.</p>
    <div className="pi-tools">
      <Segmented label="Test seasons" size="md" value={season} onChange={next => set({ testSeason: next === "pooled" ? null : next })} options={[{ value: "pooled", label: "Pooled" }, ...seasons.map(s => ({ value: s, label: s }))]} />
    </div>
    <ul className="rs-legend" aria-label="Colour key">
      <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />Better: 95% interval above zero</li>
      <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />Worse: 95% interval below zero</li>
      <li><span className="rs-swatch" aria-hidden="true" />Interval includes zero</li>
    </ul>
    <div className="pi-block" data-field="test" data-season={season}><TestGrids player={scope.player} game={scope.game} selected={model.selected} /></div>
    <p className="pi-lead" data-field="ridge-line"><strong>The selection didn&apos;t pick the best test model.</strong> LightGBM, the frozen model, won on {card.selection.season} and stays in place, but ridge did better on the pooled test: margin RMSE {fixed(pooled.game.ratings.ridge.rmse)} against {fixed(pooled.game.ratings[model.selected].rmse)},
      player RMSE {fixed(pooled.player.models.ridge.rmse)} against {fixed(pooled.player.models[model.selected].rmse)}. Switching now would be choosing on the test, so ridge&apos;s values are kept and scored beside it.</p>
    <h3 className="pi-subhead">Rookies and returners, against their group&apos;s average, pooled</h3>
    <p className="pi-lead" data-field="groups-line"><strong>Neither group shows a clear gain:</strong> every interval includes zero, since most inputs need a prior season. Time decay has no record for a rookie, so it matches the rookie average.</p>
    <GroupsGrid page={page} />
  </ResearchSection>;
}

// ---- 2026-27, scored each week --------------------------------------------------------------------

function ScoreGrid({ group, name, label, tinted, selected }: { group: ScoreGroup; name: string; label: string; tinted: boolean; selected: string }) {
  const ratings = group.ratings!, gaps = group.gaps;
  return <StatsGrid<string> label={label} name={name} density="compact" height="auto" leadWidth="md" className="pi-test" rows={RATING_ORDER} rowKey={n => n}
    lead={{ label: "Rating", cell: n => <Rating name={n} selected={selected} /> }}
    columns={[
      ...(gaps ? gainColumns<string>(() => gaps, tinted) : []),
      { key: "rmse", label: "Margin RMSE", width: "sm", data: n => ({ field: "rmse", value: ratings[n].rmse }), cell: n => <GridValue text={fixed(ratings[n].rmse)} /> },
      { key: "winner", label: "Winner picked", width: "sm", data: n => ({ field: "winner", value: ratings[n].winner_accuracy ?? "" }), cell: n => <GridValue text={ratings[n].winner_accuracy == null ? null : percent(ratings[n].winner_accuracy)} /> },
    ]} />;
}

function ScoreSection({ page }: { page: ProjectedImpactPage }) {
  const { scorecard: score, model } = page;
  const prospective = score?.prospective, hindsight = score?.hindsight;
  const unprojected = (group: ScoreGroup) => group.unprojected_minutes_share === undefined ? null
    : <p className="pi-note" data-field="unprojected" data-value={group.unprojected_minutes_share}>Minutes played by someone with no frozen row, who takes the rookie average: {percent(group.unprojected_minutes_share)}. A dash is a pair the weekly score doesn&apos;t compute.</p>;
  return <><ResearchSection id="season-2026-27" icon="calendar" title={`${SEASON}, scored each week`}>
    <p className="pi-lead">The season-long target won&apos;t exist until the season ends, so the frozen numbers are scored each week on real games. It uses the minutes players really played, so it tests the ratings and is not a game forecast.
      Only games that tipped after the freeze on {formatDate(model.frozen_at.slice(0, 10))} count as prospective.</p>
    {!score || !prospective || !hindsight ? <p className="pi-note">No {SEASON} game has been scored yet.</p> : <>
      <p className="pi-lead" data-field="score-status">Scored through {score.scored_through ? formatDate(score.scored_through) : "no games yet"} (last run {formatDate(score.written_at.slice(0, 10))}):{" "}
        <strong data-field="prospective-games" data-value={prospective.games}>{count(prospective.games)}</strong> prospective {prospective.games === 1 ? "game" : "games"} and <strong data-field="hindsight-games" data-value={hindsight.games}>{count(hindsight.games)}</strong> hindsight.</p>
      <h3 className="pi-subhead">Prospective, after the freeze</h3>
      {prospective.games && prospective.ratings
        ? <>{!prospective.gaps && <p className="pi-note" data-field="prospective-intervals">Gains start at 20 games.</p>}
          <ScoreGrid group={prospective} name="score-prospective" label="Prospective 2026-27 games" tinted selected={model.selected} />{unprojected(prospective)}</>
        : <p className="pi-note" data-field="prospective-empty">No game has been scored since the freeze, so there is no prospective result yet. The next weekly score is due around {formatDate(addDays(score.written_at.slice(0, 10), 7))}.</p>}
      {hindsight.games > 0 && <p className="pi-lead" data-field="hindsight-note">The {count(hindsight.games)} hindsight games tipped before the freeze. They aren&apos;t a test of the frozen model and are too few to quote, so they are kept apart below.</p>}
    </>}
  </ResearchSection>
    {hindsight && hindsight.games > 0 && hindsight.ratings && <ResearchDisclosure id="hindsight" icon="calendar" title="Hindsight games, before the freeze">
      <ScoreGrid group={hindsight} name="score-hindsight" label="Hindsight 2026-27 games" tinted={false} selected={model.selected} />{unprojected(hindsight)}
    </ResearchDisclosure>}
  </>;
}

// ---- The aging curve --------------------------------------------------------------------------------

const AGE_LABELS = [20, 24, 27, 30, 34, 38];

function Aging({ page }: { page: ProjectedImpactPage }) {
  const { card, model } = page;
  const { aging } = card;
  const dependence = aging.partial_dependence[model.selected];
  const rows = aging.ages.map((age, i) => ({ age, delta: aging.delta_method_relative_to_27[i], model: dependence[i] })).filter(p => p.age >= 20 && p.age <= 38);
  const anchor = rows.find(p => p.age === 27)?.model ?? 0;
  const points = rows.map(p => ({ season: String(p.age), value: p.delta, label: `Age ${p.age}` }));
  const { player, game } = card.test.pooled;
  return <ResearchSection id="aging" icon="chart-line" title="The aging curve">
    <p className="pi-lead" data-field="aging-line">The age-curve candidate learns a clear rise and fall but adds almost nothing over carry-forward: players {gapText(player.gaps.age_curve_over_carry_forward)}, games {gapText(game.gaps.age_curve_over_carry_forward)}, which is worse.
      {" "}The frozen model barely moves with age once it has seen a player&apos;s record, so age is not where its gain comes from. That doesn&apos;t mean players don&apos;t age.</p>
    <figure className="pi-figure" data-chart="aging">
      <figcaption className="pi-figure-title">Impact by age, relative to age 27, points per 100 possessions</figcaption>
      <ul className="pi-key">
        <li><span className="pi-key-mark" data-series="main" aria-hidden="true" />Age-curve candidate: year-on-year change, summed</li>
        <li><span className="pi-key-mark" data-series="overlay" aria-hidden="true" />Projected Impact: partial dependence on age</li>
      </ul>
      <SeasonLineChart label="Impact relative to age 27" name="Age curve" overlay={{ name: "Projected Impact", values: rows.map(p => p.model - anchor) }} points={points} zero
        xTicks={AGE_LABELS.map(age => rows.findIndex(p => p.age === age)).filter(i => i >= 0)} format={v => signed(v)} axisFormat={v => signed(v, 1)} />
      <p className="pi-note">Age at the season opener. The ends rest on few players, so read them loosely. Neither curve has a served interval.</p>
    </figure>
  </ResearchSection>;
}

// ---- Do the intervals hold? --------------------------------------------------------------------------

/** Most minutes first, then no prior season at all. */
const COVERAGE_ORDER = ["1500_plus", "500_to_1499", "under_500", "no_prior"];

interface CoverageRow { key: string; label: string; players: number; coverage: number; width: number | null; calibration: number | null }

function Intervals({ page }: { page: ProjectedImpactPage }) {
  const { card, model } = page;
  const coverage = card.test.pooled.coverage;
  const rows: CoverageRow[] = [
    { key: "all", label: "All", players: coverage.overall.players, coverage: coverage.overall.coverage, width: null, calibration: null },
    ...COVERAGE_ORDER.filter(bucket => coverage.by_prior_minutes[bucket]).map(bucket => [bucket, coverage.by_prior_minutes[bucket]] as const).map(([bucket, row]) => ({ key: bucket, label: BUCKET_LABELS[bucket] ?? bucket, players: row.players, coverage: row.coverage ?? NaN, width: row.half_width ?? null, calibration: model.conformal[`${bucket}_n`] ?? null })),
  ];
  const seasons = Object.entries(card.test.seasons);
  return <ResearchSection id="intervals" icon="ruler" title="Do the intervals hold?">
    <p className="pi-lead" data-field="coverage-line">They ran wide. On the test seasons the 80% intervals covered <strong data-field="coverage" data-value={coverage.overall.coverage}>{percent(coverage.overall.coverage)}</strong> of {count(coverage.overall.players)} players
      {" "}({seasons.map(([season, row]) => `${percent(row.coverage.overall.coverage)} in ${season}`).join(", ")}), past the 77–83% they were meant to stay within. They were kept as tested and never tuned on those seasons. The average interval is <span data-field="mean-width" data-value={coverage.mean_width}>{fixed(coverage.mean_width)}</span> points wide.</p>
    <StatsGrid<CoverageRow> label="Interval coverage" name="coverage" density="compact" height="auto" leadWidth="xl" minWidth="narrow" className="pi-coverage" rows={rows} rowKey={r => r.key}
      lead={{ label: "Bucket, known before the season", cell: r => <span className="pi-rating">{r.label}</span> }}
      columns={[
        { key: "players", label: "Test players", width: "sm", data: r => ({ field: "players", value: r.players }), cell: r => <GridValue text={count(r.players)} /> },
        { key: "width", label: "± points", title: "Half-width of the interval, from 2023-24 residuals", width: "sm", data: r => ({ field: "width", value: r.width ?? "" }), cell: r => <GridValue text={r.width === null ? null : fixed(r.width)} /> },
        { key: "calibration", label: "Calibrated on", title: "Players in 2023-24 the width comes from", width: "sm", data: r => ({ field: "calibration", value: r.calibration ?? "" }), cell: r => <GridValue text={r.calibration === null ? null : count(r.calibration)} /> },
        { key: "coverage", label: "Coverage", width: "sm", data: r => ({ field: "coverage", value: r.coverage }), cell: r => <GridValue text={percent(r.coverage)} /> },
      ]} />
  </ResearchSection>;
}

// ---- How to read and About -----------------------------------------------------------------------------

const GLOSSARY: GlossaryGroup[] = [
  { label: "Ratings", icon: "chart-trend", items: [
    { term: "RAPM", text: "Regularized adjusted plus-minus: points per 100 possessions a player adds above an average player, from who was on the floor. One season of it is noisy." },
    { term: "Projected Impact (LightGBM)", text: "The frozen model, gradient-boosted trees on past RAPM, box-score rates, play types, shot profile, minutes and age. It was picked on 2023-24, before the test." },
    { term: "Ridge", text: "A linear model on the same inputs. It did better on the test seasons but wasn't the one selected, so it is scored beside the frozen model." },
    { term: "Time-decay RAPM", text: "RAPM over several seasons, with older games counting for less, as of the season opener." },
    { term: "Age curve", text: "Last season's RAPM plus the average change for a player of that age." },
    { term: "Carry-forward", text: "Last season's RAPM, unchanged. Rookies and returners, who have none, take their group's training average." },
  ] },
  { label: "Scores", icon: "target", items: [
    { term: "RMSE", text: "Root mean squared error. For players it's in RAPM points; for games, in points of final margin. Lower is better." },
    { term: "Gain", text: "The baseline's mean squared error minus the rating's, on the same players or games. Above zero, the rating did better." },
    { term: "Correlation", text: "How closely the rating moves with next season's RAPM." },
    { term: "Winner picked", text: "The share of games in which the rating's predicted winner won." },
  ] },
  { label: "Players and games", icon: "users", items: [
    { term: "Rookie", text: "A first NBA season, or no NBA box score before the opener." },
    { term: "Returner", text: "An earlier NBA box score, but none last season." },
    { term: "Prospective", text: "A game that tipped after the freeze. Only these test the frozen numbers." },
    { term: "Hindsight", text: "A game that tipped before the freeze. Shown apart, and not a test." },
  ] },
];

function Reading() {
  return <>
    <ResearchSection id="reading" icon="book" title="How to read">
      <ResearchCards columns={3}>
        <ResearchCard kicker="Projection"><p className="pi-card-text">Expected one-season RAPM in {SEASON}: points per 100 possessions above an average player.</p></ResearchCard>
        <ResearchCard kicker="Interval"><p className="pi-card-text">Where about 80% of next season&apos;s one-year results should fall. Overlapping intervals rank nothing.</p></ResearchCard>
        <ResearchCard kicker="Colour"><p className="pi-card-text">Green or red only where a whole interval is on one side of zero. Otherwise gold is above zero and blue below.</p></ResearchCard>
      </ResearchCards>
    </ResearchSection>
    <ResearchDisclosure id="glossary" icon="list-ordered" title="Ratings and scores, defined"><Glossary groups={GLOSSARY} /></ResearchDisclosure>
  </>;
}

function About({ page }: { page: ProjectedImpactPage }) {
  const { model, card } = page;
  const selected = RATING_LABELS[model.selected];
  const bySelection = card.selection.gaps_over_carry_forward_90;
  const frozen = model.frozen_at;
  const served = card.test.pooled.coverage.by_target_minutes_diagnostic;
  const diagnostic = Object.keys(TARGET_MINUTE_LABELS).filter(band => served[band]).map(band => [band, served[band]] as const);
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Limits">
      <ul className="pi-list">
        <li><strong>One-season RAPM is noisy and shrunk.</strong> The interval describes it, not true ability.</li>
        <li><strong>Who played is hindsight</strong> in both the player population and the game measure, so this tests ratings and isn&apos;t a forecast of minutes.</li>
        <li><strong>Minutes, role, team changes and injuries</strong> aren&apos;t modelled, and only the regular season is.</li>
        <li><strong>Selection and calibration share {card.selection.season}.</strong></li>
        <li><strong>The intervals missed their limit only by covering too many players</strong>: too wide, not too narrow, and widest in the smallest buckets. The point projections are unaffected. By minutes actually played, known only afterwards: {diagnostic.map(([band, row]) => `${TARGET_MINUTE_LABELS[band]}, ${percent(row.coverage)}`).join("; ")}.</li>
      </ul>
    </MethodBlock>
    <MethodBlock title="Method">
      <dl className="pi-defs">
        <dt>Target</dt><dd>RAPM from the target season&apos;s games alone, weighted by minutes. One season is noisier than a window of seasons, but it shares no games with the inputs.</dd>
        <dt>Seasons</dt><dd>Trained on target seasons from 2016-17 to {model.trained_through}, selected and calibrated on {model.calibrated_on}, tested on 2024-25 and 2025-26. 2015-16 is left out because its prior season has no play types. Frozen as tested, with no refit.</dd>
        <dt>Selection</dt><dd>{selected} ({card.lightgbm.num_leaves} leaves, {card.lightgbm.rounds} rounds, chosen on training seasons; ridge alpha {card.ridge_alpha}). Gain over carry-forward on {card.selection.season} (90%): {RATING_ORDER.filter(n => bySelection[n]).map(n => `${RATING_LABELS[n]} ${gapText(bySelection[n])}`).join("; ")}.</dd>
        <dt>Intervals</dt><dd>Split-conformal at a nominal 80%, one width per bucket from {model.calibrated_on} residuals, for players with 500 or more minutes in the target season.</dd>
        <dt>Rookies and returners</dt><dd>Kept, predicted from whatever exists, and reported separately. A player with no frozen row takes the rookie average of {signed(model.fallback_rating)}.</dd>
        <dt>Weekly score</dt><dd>Predicted margin = a + b × (home minus away of box minutes ÷ 48 × rating), with a and b fixed on {card.selection.season}, against the actual final margin. Each game is scored once. Gains use a paired game bootstrap once 20 games exist.</dd>
        <dt>Sources</dt><dd>The frozen model&apos;s own attribution for the contribution bars. Aging curves are from training target seasons, 2016-17 to {model.trained_through}.</dd>
        <dt>Fixed in advance</dt><dd>Registered before any fit. Frozen {formatDate(frozen.slice(0, 10))}, {frozen.slice(11, 16)} UTC. No update during the season; a new version is an offseason job.</dd>
        <dt>Hashes</dt><dd>Registration <code data-field="registration-sha" data-value={model.registration_sha256}>{model.registration_sha256.slice(0, 16)}</code> · projections <code data-field="projections-sha" data-value={model.projections_sha256}>{model.projections_sha256.slice(0, 16)}</code> · manifest <code data-field="manifest-sha" data-value={model.manifest_sha256}>{model.manifest_sha256.slice(0, 16)}</code>. The projections are checked against their hash each time the file loads.</dd>
        <dt>Credit</dt><dd data-field="credit">In the style of published player projections such as DARKO (Kostya Medvedovsky) and EPM (Taylor Snarr). It replicates neither and uses neither as an input.</dd>
      </dl>
      <ResearchLinks label="Evidence" links={[{ label: "How the projections were built", href: evidenceUrl("docs/evidence/research/r07/README.md"), icon: "external" }]} />
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Page ----------------------------------------------------------------------------------------------

function Sections({ page }: { page: ProjectedImpactPage }) {
  const { get, set } = useUrlState();
  const fallback = page.players.find(p => p.on_roster)?.player_id ?? null;
  const asked = get("player");
  const id = asked ?? fallback;
  const choose = (next: string) => {
    set({ player: next === fallback ? null : next });
    document.getElementById("contributions")?.scrollIntoView({ block: "start" });
  };
  return <>
    <Answer page={page} />
    <Projections page={page} chosen={id} onChoose={choose} />
    <Why page={page} id={id} fallback={fallback} onChoose={choose} onClear={() => set({ player: NO_PLAYER })} onReset={() => set({ player: null })} />
    <TestSection page={page} />
    <ScoreSection page={page} />
    <Aging page={page} />
    <Intervals page={page} />
    <Reading />
    <About page={page} />
  </>;
}

export function ProjectedImpactResearch() {
  const { data, error, loading, retry } = useFeed([], signal => getProjectedImpactPage(signal));
  return <PageShell template="research">
    <div className="rs-column pi-page">
      <PageHeader className="sq-hero research-hero" icon="target" title="Projected Impact" subtitle="Every player's expected impact for 2026-27, fixed before the season and never updated." />
      <ResearchIntro
        tagline={data ? <span data-field="hero-meta">{count(data.players.length)} players · frozen {formatDate(data.model.frozen_at.slice(0, 10))} · 80% intervals</span> : null}
        links={[{ label: "RAPM Ratings", href: "/research/rapm", icon: "chart-line" }, { label: "Metric Backtest", href: "/research/backtest", icon: "chart-trend" }, { label: "Learning", href: "/methodology/learning", icon: "book" }]} />
      {error && <FeedFailure error={error} retry={retry} what="Projected Impact" />}
      {loading && <FeedSkeleton label="Loading the projections" />}
      {data && <Sections page={data} />}
    </div>
  </PageShell>;
}
