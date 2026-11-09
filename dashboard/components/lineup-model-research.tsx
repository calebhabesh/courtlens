"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { LookupInput } from "./lookup-input";
import {
  Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchLinks, ResearchSection, type GlossaryGroup,
} from "./research/research-page";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { PlayerAvatar } from "./ui/identity";
import { Button, IconButton } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { formatDate } from "@/lib/format-date";
import {
  bandText, CANDIDATE_LABELS, digitsFor, fixed, gainBand, getLineupFit, getLineupModel, getLineupPlayers, gridTone, identityOf, PAIR_TEXT, percent, ratingGap, scaleRatio, signed, STATUS_LABEL, stripScale, visitorText, whole,
  type FitResult, type Gain, type LineupModelPage, type PlayersPage, type Scored, type ToolPlayer,
} from "@/lib/lineup-model";
import { PORTRAIT_CROP_VERSION, seasonEra } from "@/lib/portrait-source";
import { evidenceUrl } from "@/lib/research-facts";
import { teamAccent } from "@/lib/team-colors";
import type { LookupItem } from "@/lib/types";

/**
 * Research → Models → Lineup Model (R14, designed in RD12). Every number is the frozen courtlens-lineup-model-v1 or courtlens-lineup-backtest-v1 results' or the lineup tool's;
 * exact values sit on `data-*`. The page must not read as a win for ridge: its lead says the registered edge is no practical difference, and the lineup-against-ridge gains
 * are left uncoloured even where their interval excludes zero (owner, RD12 Q1).
 */

const MODELS = ["lineup", "ridge", "home_only"] as const;
const MODEL_LABELS = { lineup: "Lineup model", ridge: "Ridge RAPM", home_only: "Home court only" } as const;
const LINEUP_SUB = "Self-attention over the ten players";
const short = (season: string) => season.slice(2);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const vars = (props: Record<string, string>) => props as CSSProperties;
const gainData = (g: Gain | null | undefined, field: string) => ({ field, value: g?.gain ?? "", low: g?.low ?? "", high: g?.high ?? "" });

function GainValue({ g, tinted = true }: { g: Gain; tinted?: boolean }) {
  const digits = digitsFor([g.gain, g.low, g.high]);
  return <GridValue text={signed(g.gain, digits)} sub={gainBand(g, digits)} tone={tinted ? gridTone(g) : undefined} />;
}

function ModelName({ model }: { model: keyof typeof MODEL_LABELS }) {
  return <><span className="lm-name">{MODEL_LABELS[model]}</span>{model === "lineup" && <span className="lm-name-sub">{LINEUP_SUB}</span>}</>;
}

// ---- The answer --------------------------------------------------------------------------------

function ScaleStrip({ page }: { page: LineupModelPage }) {
  const { gains } = page.results;
  const rows: { key: keyof typeof gains; label: string; tinted: boolean }[] = [
    { key: "ridge_over_home_only", label: "Ridge RAPM over home court only", tinted: true },
    { key: "lineup_over_home_only", label: "Lineup model over home court only", tinted: true },
    { key: "lineup_over_ridge", label: "Lineup model over ridge RAPM", tinted: false },
  ];
  const { left, right } = stripScale(rows.map(row => gains[row.key].pooled));
  const at = (value: number) => `${((value - left) / (right - left)) * 100}%`;
  return <figure className="lm-figure" data-chart="scale" data-left={left} data-right={right}>
    <figcaption className="lm-figure-title">Gain in error, points per 100 possessions, pooled, 95% intervals</figcaption>
    <div className="lm-strip-axis" aria-hidden="true">
      <span className="lm-strip-axis-gap" />
      <span className="lm-strip-scale" style={vars({ "--lm-zero": at(0) })}><span data-end="left">{signed(left)}</span><span data-end="zero">0</span><span data-end="right">{signed(right)}</span></span>
      <span className="lm-strip-axis-gap" />
    </div>
    <ul className="lm-strip">{rows.map(row => {
      const g = gains[row.key].pooled, digits = digitsFor([g.gain, g.low, g.high]), tone = row.tinted ? gridTone(g) : undefined;
      return <li key={row.key} className="lm-strip-row" data-key={row.key} data-value={g.gain} data-low={g.low} data-high={g.high}>
        <span className="lm-name">{row.label}</span>
        <span className="lm-range" aria-hidden="true" data-tone={tone} style={vars({ "--lm-low": at(g.low), "--lm-high": at(g.high), "--lm-at": at(g.gain), "--lm-zero": at(0) })}>
          <span className="lm-range-zero" /><span className="lm-range-span" /><span className="lm-range-dot" />
        </span>
        <span className="lm-strip-value"><strong data-tone={tone}>{signed(g.gain, digits)}</strong><small>{gainBand(g, digits)}</small></span>
      </li>;
    })}</ul>
    <p className="lm-note">Above zero, the first-named model has the lower error. Green means the whole interval is above zero. The last row is drawn to the same scale and is too small to see; it is left uncoloured because the gap is too small to matter.</p>
  </figure>;
}

function Answer({ page }: { page: LineupModelPage }) {
  const r = page.results;
  const pooled = r.gains.lineup_over_ridge.pooled, home = r.gains.ridge_over_home_only.pooled;
  const digits = digitsFor([pooled.gain, pooled.low, pooled.high]);
  const seasons = r.test_seasons.length;
  const ratio = scaleRatio(home.gain, pooled.gain);
  return <ResearchSection id="answer" icon="trophy" title="Does the lineup model beat ridge RAPM?">
    <div className="lm-answer" data-field="verdict-summary" data-verdict={r.verdict}>
      <p className="lm-headline">No. On {seasons} seasons it never saw, the lineup model and ridge RAPM both miss a stint by {fixed(r.models.lineup.pooled.wrmse)} points per 100 possessions. Ridge&apos;s edge is {fixed(Math.abs(pooled.gain), digits)} per 100: no practical difference.</p>
      <p className="lm-lead" data-field="edge" data-ratio={ratio}>For scale, ridge beats a model that knows only home court by <strong data-value={home.gain}>{fixed(home.gain)}</strong> per 100, about <strong>{whole(ratio)}</strong> times that edge.</p>
      <p className="lm-lead" data-field="rule-line">The rule fixed before any fit calls ridge better, because the pooled 95% interval is below zero and ridge had the lower error in {seasons - r.seasons_lineup_lower} of {seasons} seasons. It says which side of zero the gap falls on, not that the gap matters.</p>
    </div>
    <ScaleStrip page={page} />
  </ResearchSection>;
}

// ---- The lineup tool ---------------------------------------------------------------------------

function Slot({ player, others, items, onPick }: { player: ToolPlayer; others: readonly string[]; items: readonly LookupItem[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const name = player.name ?? player.player_id;
  const team = player.tricode;
  const tint = teamAccent(team, player.photo_season);
  const close = () => { setOpen(false); setText(""); };
  return <article className="lm-slot" data-slot={player.player_id} style={tint ? vars({ "--lm-team": tint }) : undefined}>
    <PlayerAvatar playerId={player.player_id} name={name} team={team} size="lg" era={seasonEra(player.photo_season, team)} />
    {open ? <div className="lm-slot-search">
      <LookupInput label={`Replace ${name}`} placeholder="Search players" value={text} onChange={setText} candidates={[...items]} excludedIds={[...others, player.player_id]} limit={12} groupLabel="Players in this fit" portalDropdown dropdownMinWidth={280} autoFocus
        onSelect={item => { close(); onPick(item.canonical_id); }} />
      <IconButton size="sm" variant="ghost" icon="close" label="Cancel" onClick={close} />
    </div> : <>
      <span className="lm-slot-tool"><IconButton size="xs" variant="ghost" icon="search" label={`Replace ${name}`} onClick={() => setOpen(true)} /></span>
      <span className="lm-slot-copy">
        <a className="lm-slot-name" href={`/players/${player.player_id}${player.photo_season ? `?season=${player.photo_season}` : ""}`}>{name}</a>
        {team && <span className="lm-slot-team" data-field="team" data-value={team}><TeamLogo team={team} season={player.photo_season ?? undefined} size={16} />{team}</span>}
        {player.status && <span className="lm-slot-status" data-field="status" data-status={player.status}>{STATUS_LABEL[player.status]}</span>}
      </span>
      <span className="lm-slot-rating">
        <span>Ridge rating</span>
        <strong data-field="rating" data-value={player.ridge_rating} data-additive={player.lineup_additive_rating} data-identity={identityOf(player.ridge_rating)}>{signed(player.ridge_rating)}</strong>
        <small data-field="possessions" data-value={player.window_possessions ?? ""}>{player.window_possessions == null ? "No possessions" : `${whole(player.window_possessions)} poss.`}</small>
      </span>
    </>}
  </article>;
}

function FitView({ fit }: { fit: FitResult }) {
  if (fit.state === "unavailable") return <GatedNote>This five can&apos;t be predicted here: the lineup tool needs the model&apos;s weights, which aren&apos;t on this server.</GatedNote>;
  if (fit.state === "no_opponents") return <GatedNote>Every lineup in the panel shares a player with this five, so there is nothing to predict against.</GatedNote>;
  const { lineup_model: l, ridge: rd } = fit;
  if (!l || !rd) return null;
  const rows = [{ key: "lineup_model", model: "lineup" as const, net: l.net, low: l.low, high: l.high }, { key: "ridge", model: "ridge" as const, net: rd.net, low: rd.low, high: rd.high }];
  type Row = typeof rows[number];
  const tone = (row: Row) => gridTone(row);
  const interaction = digitsFor([l.interaction]);
  return <>
    <StatsGrid<Row> label="Predicted net rating" name="fit" density="compact" height="auto" leadWidth="xl" minWidth="narrow" className="lm-fit" rows={rows} rowKey={r => r.key}
      lead={{ label: "Model", cell: r => <ModelName model={r.model} /> }}
      columns={[
        { key: "net", label: "Net rating", data: r => ({ field: "net", value: r.net }), cell: r => <GridValue text={signed(r.net)} tone={tone(r)} identity={tone(r) ? undefined : identityOf(r.net)} title={tone(r) ? "80% interval excludes zero" : "80% interval includes zero"} /> },
        { key: "interval", label: "80% interval", data: r => ({ field: "interval", low: r.low, high: r.high }), cell: r => <GridValue text={`${signed(r.low)} to ${signed(r.high)}`} /> },
      ]} />
    <p className="lm-lead" data-field="interaction" data-value={l.interaction} data-additive={l.additive}>Of the lineup model&apos;s {signed(l.net)}, the interaction between these players adds <strong>{signed(l.interaction, interaction)}</strong>. The other {signed(l.additive)} is the additive part, the same kind of number ridge gives.</p>
    <p className="lm-note" data-field="fit-note" data-opponents={fit.opponents} data-panel={fit.panel_size} data-refits={fit.refits}>Against the {fit.opponents} of {fit.panel_size} panel lineups that share no player with this five, at a neutral site. Intervals run from the 10th to the 90th percentile over {fit.refits} game-bootstrap refits; the estimate comes from the five-seed fit and can sit outside them. This is a model output, not a forecast of how these five will play, and overlapping intervals rank nothing.</p>
  </>;
}

function Tool({ page, roster, rosterError, rosterLoading, retryRoster, five, players, onChoose, onReset }: {
  page: LineupModelPage; roster: PlayersPage | null; rosterError: string; rosterLoading: boolean; retryRoster: () => void; five: readonly string[]; players: ReadonlyMap<string, ToolPlayer>; onChoose: (index: number, id: string) => void; onReset: () => void;
}) {
  const { serving } = page;
  const ready = roster?.state === "ready";
  const key = five.join(",");
  const { data: fit, error, loading, retry } = useFeed([key, String(ready)], signal => ready ? getLineupFit(five, signal) : Promise.resolve(null));
  const items = useMemo(() => (roster?.players ?? []).map((p): LookupItem => ({
    id: p.player_id, canonical_id: p.player_id, kind: "player", display_name: p.name ?? p.player_id, match_basis: "suggestion", match_score: 1,
    portrait_url: p.photo_season ? `/api/workbench/players/${p.player_id}/portrait?size=64&season=${p.photo_season}${p.tricode ? `&team=${p.tricode}` : ""}&crop=${PORTRAIT_CROP_VERSION}` : undefined,
    availability: { has_current_season: true, status: "available", seasons: [serving.season] }, destination_url: `/players/${p.player_id}`,
    team_association: p.tricode ? { basis: "last_observed", teams: [p.tricode], observed_through: null, season: p.photo_season } : null,
    metadata: { caption: `${p.tricode ?? "No team"} · ${p.status ? STATUS_LABEL[p.status] : "Unknown"}` },
  } as LookupItem)), [roster, serving.season]);
  const isDefault = key === serving.default_five.join(",");
  const gap = ratingGap(roster?.players ?? []);
  const unavailable = !serving.tool_available || roster?.state === "unavailable";
  return <ResearchSection id="tool" icon="users" title="Lineup tool, points per 100 possessions">
    {unavailable ? <p className="lm-lead" data-field="tool-unavailable">The lineup tool needs the model&apos;s weights, which aren&apos;t on this server. Everything else on this page still works.</p> : <>
      <p className="lm-lead">Pick any five of {whole(roster?.players.length ?? 0)} players. Both models predict that five&apos;s net rating against {serving.panel_season}&apos;s {serving.panel_size} most-used lineups, from a fit trained on {serving.window[0]} to {serving.window.at(-1)}.</p>
      {rosterError && <FeedFailure error={rosterError} retry={retryRoster} what="The lineup tool's players" />}
      {rosterLoading && <FeedSkeleton label="Loading the players" />}
      {ready && <>
        <div className="lm-tool-head">
          <p className="lm-note" data-field="five-note">{isDefault ? `Opens on ${serving.panel_season}'s most-used lineup, by possessions together.` : "Your five, in the link so it can be shared."}</p>
          {!isDefault && <Button size="sm" variant="ghost" icon="reset" onClick={onReset}>Most-used five</Button>}
        </div>
        <div className="lm-five" role="group" aria-label="Five players">
          {five.map((id, index) => { const player = players.get(id); return player ? <Slot key={id} player={player} others={five.filter(other => other !== id)} items={items} onPick={next => onChoose(index, next)} /> : null; })}
        </div>
        <p className="lm-note" data-field="rating-gap" data-value={gap}>Each card shows the player&apos;s ridge rating, in points per 100 above an average player, and possessions in the fit. The lineup model&apos;s own additive ratings differ from these by at most {fixed(gap, 4)} across all {whole(roster?.players.length ?? 0)} players.</p>
        {error && <FeedFailure error={error} retry={retry} what="This five's prediction" />}
        {loading && <FeedSkeleton label="Predicting this five" />}
        {fit && <FitView fit={fit} />}
      </>}
    </>}
  </ResearchSection>;
}

// ---- The test ----------------------------------------------------------------------------------

interface TestRow { key: string; label: string; stints: number; games: number; scope: (block: { seasons: Record<string, Gain>; pooled: Gain }) => Gain; score: (block: { seasons: Record<string, Scored>; pooled: Scored }) => Scored }

function TestSection({ page }: { page: LineupModelPage }) {
  const r = page.results;
  const rows: TestRow[] = [
    ...r.test_seasons.map((season): TestRow => ({ key: season, label: season, stints: r.diagnostics[season].test_stints, games: r.diagnostics[season].test_games, scope: b => b.seasons[season], score: b => b.seasons[season] })),
    { key: "pooled", label: "Pooled", stints: r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_stints, 0), games: r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_games, 0), scope: b => b.pooled, score: b => b.pooled },
  ];
  const scores = MODELS.flatMap(model => [...Object.values(r.models[model].seasons), r.models[model].pooled].map(s => s.wrmse));
  const noise = { low: Math.min(...scores), high: Math.max(...scores) };
  const gainColumn = (key: keyof typeof r.gains, label: string, tinted: boolean, width: GridColumn<TestRow>["width"]): GridColumn<TestRow> => ({
    key, label, group: "Gain, 95% interval", width, data: row => gainData(row.scope(r.gains[key]), key),
    cell: row => <GainValue g={row.scope(r.gains[key])} tinted={tinted} />,
  });
  const seasonsDiag = r.test_seasons.map(season => ({ season, d: r.diagnostics[season] }));
  type Diag = typeof seasonsDiag[number];
  return <ResearchSection id="test" icon="target" title="The test: stint error, points per 100 possessions">
    <p className="lm-lead">Each test season is predicted by models trained only on the {page.registration.parameters.window_seasons} seasons before it. Error is the possession-weighted miss on each stint&apos;s home margin. A gain is the second model&apos;s error minus the first&apos;s, so above zero the first did better.</p>
    <p className="lm-lead" data-field="noise" data-low={noise.low} data-high={noise.high}>Stint margins are very noisy: across these seasons and models, the typical miss is {fixed(noise.low, 1)} to {fixed(noise.high, 1)} points per 100.</p>
    <ul className="rs-legend" aria-label="Colour key">
      <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />Better: 95% interval above zero</li>
      <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />Worse: 95% interval below zero</li>
      <li><span className="rs-swatch" aria-hidden="true" />Interval includes zero, or the gap is too small to matter</li>
    </ul>
    <p className="lm-note" data-field="neutral-note">The lineup-against-ridge gains are better by the registered rule where their interval excludes zero, but they are no practical difference, so they stay uncoloured.</p>
    <StatsGrid<TestRow> label="Stint margin error by test season" name="test" density="compact" height="auto" leadWidth="md" className="lm-test" rows={rows} rowKey={row => row.key}
      lead={{ label: "Season", cell: row => <><span className="lm-name">{row.label}</span><span className="lm-name-sub" data-field="counts" data-stints={row.stints} data-games={row.games}>{whole(row.stints)} stints · {whole(row.games)} games</span></> }}
      columns={[
        gainColumn("lineup_over_ridge", "Lineup over ridge", false, "xl"),
        gainColumn("lineup_over_home_only", "Lineup over home court", true, "lg"),
        gainColumn("ridge_over_home_only", "Ridge over home court", true, "lg"),
        ...MODELS.map((model): GridColumn<TestRow> => ({ key: model, label: MODEL_LABELS[model], group: "Error, 95% interval", width: "md",
          data: row => { const s = row.score(r.models[model]); return { field: model, value: s.wrmse, low: s.low, high: s.high }; },
          cell: row => { const s = row.score(r.models[model]); return <GridValue text={fixed(s.wrmse, 3)} sub={bandText(s, 2)} />; } })),
      ]} />
    <h3 className="lm-subhead">Why the two models match</h3>
    <p className="lm-lead">Selection chose the strongest interaction penalty it was offered, so the attention layer was left with almost nothing to add. Across these seasons its part of the prediction is more than a thousand times smaller than the additive part.</p>
    <StatsGrid<Diag> label="Interaction size by test season" name="diagnostics" density="compact" height="auto" leadWidth="sm" className="lm-auto" rows={seasonsDiag} rowKey={row => row.season}
      lead={{ label: "Season", cell: row => <span className="lm-name">{row.season}</span> }}
      columns={[
        { key: "interaction", label: "Interaction SD", title: "Standard deviation of the learned interaction, per 100", data: row => ({ field: "interaction_sd", value: row.d.interaction_sd_per100 }), cell: row => <GridValue text={fixed(row.d.interaction_sd_per100, 4)} /> },
        { key: "largest", label: "Largest interaction", title: "The largest interaction on any test stint, per 100", data: row => ({ field: "max_interaction", value: row.d.max_abs_interaction_per100 }), cell: row => <GridValue text={fixed(row.d.max_abs_interaction_per100, 4)} /> },
        { key: "additive", label: "Additive SD", title: "Standard deviation of the additive part, per 100", data: row => ({ field: "additive_sd", value: row.d.additive_sd_per100 }), cell: row => <GridValue text={fixed(row.d.additive_sd_per100, 2)} /> },
        { key: "correlation", label: "Correlation with ridge", title: "Correlation of the two models' stint predictions", data: row => ({ field: "correlation", value: row.d.prediction_correlation_with_ridge }), cell: row => <GridValue text={fixed(row.d.prediction_correlation_with_ridge, 10)} /> },
      ]} />
  </ResearchSection>;
}

// ---- The game backtest -------------------------------------------------------------------------

function BacktestSection({ page }: { page: LineupModelPage }) {
  const bt = page.backtest;
  if (!bt) return <ResearchSection id="backtest" icon="chart-trend" title="In the game backtest, final margin in points"><p className="lm-lead" data-field="backtest-unavailable">The game backtest results aren&apos;t on this server.</p></ResearchSection>;
  const names = Object.keys(CANDIDATE_LABELS).filter(name => bt.candidates[name]);
  const asLineup = (other: string): Gain | null => {
    const pair = bt.pairs.find(p => (p.candidate === "lineup_model" && p.reference === other) || (p.reference === "lineup_model" && p.candidate === other));
    if (!pair) return null;
    const g = pair.pooled.rmse;
    return pair.candidate === "lineup_model" ? g : { gain: -g.gain, low: -g.high, high: -g.low };
  };
  const lead = (name: string) => { const g = asLineup(name); return g ? signed(g.gain, digitsFor([g.gain, g.low, g.high])) : "—"; };
  const seasonsOf = (name: string) => bt.candidates[name].test_seasons;
  const twoSeason = names.filter(name => seasonsOf(name).length < seasonsOf("lineup_model").length);
  const best = bt.verdict.best.map(name => CANDIDATE_LABELS[name] ?? name);
  return <ResearchSection id="backtest" icon="chart-trend" title="In the game backtest, final margin in points">
    <p className="lm-lead">The lineup model also entered Metric Backtest&apos;s game test as a new candidate, under its own registration, so that test&apos;s results are unchanged. Each game sums the model&apos;s stint predictions for who actually played, so this tests the ratings and isn&apos;t a game forecast.</p>
    <p className="lm-lead" data-field="backtest-line">The lineup model&apos;s gain in final-margin error is <strong>{lead("team_net")}</strong> against Team net, <strong>{lead("time_decay")}</strong> against monthly time decay and <strong>{lead("time_decay_opener")}</strong> against time decay at the opener. Against ridge on the same stints it is <strong>{lead("lineup_ridge")}</strong>, the opposite sign to the stint test and just as negligible.</p>
    <ul className="rs-legend" aria-label="Colour key">
      <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />Lineup model ahead: 95% interval above zero</li>
      <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />Lineup model behind: 95% interval below zero</li>
      <li><span className="rs-swatch" aria-hidden="true" />Interval includes zero, or the gap is too small to matter</li>
    </ul>
    <StatsGrid<string> label="Game margin error, lineup backtest" name="backtest" density="compact" height="auto" leadWidth="lg" className="lm-backtest" rows={names} rowKey={name => name}
      lead={{ label: "Metric", cell: name => <><span className="lm-name">{CANDIDATE_LABELS[name] ?? name}</span><span className="lm-name-sub" data-field="scope" data-games={bt.candidates[name].pooled.games} data-seasons={seasonsOf(name).length}>{seasonsOf(name).map(short).join(", ")} · {whole(bt.candidates[name].pooled.games)} games</span></> }}
      columns={[
        { key: "gain", label: "Lineup model's gain, 95%", title: "This metric's RMSE minus the lineup model's on the seasons both were scored. Above zero, the lineup model did better", width: "lg",
          data: name => name === "lineup_model" ? { field: "gain", baseline: "true" } : gainData(asLineup(name), "gain"),
          cell: name => { if (name === "lineup_model") return <GridValue text="The model" muted />; const g = asLineup(name); return g ? <GainValue g={g} tinted={name !== "lineup_ridge"} /> : <GridValue text={null} />; } },
        { key: "verdict", label: "Registered verdict", width: "lg", data: name => ({ field: "verdict", value: bt.verdict.lineup_model_against[name] ?? "" }),
          cell: name => { const v = bt.verdict.lineup_model_against[name]; if (!v) return <GridValue text={null} />; return <span className="lm-verdict">{name === "lineup_ridge" ? "Better by the registered rule, no practical difference" : PAIR_TEXT[v]}</span>; } },
        { key: "rmse", label: "Margin RMSE, 95%", title: "Each row's RMSE is over its own games", width: "md", data: name => { const c = bt.candidates[name].pooled; return { field: "rmse", value: c.rmse, low: c.intervals.rmse.low, high: c.intervals.rmse.high }; },
          cell: name => { const c = bt.candidates[name].pooled; return <GridValue text={fixed(c.rmse)} sub={bandText(c.intervals.rmse)} />; } },
      ]} />
    {twoSeason.length > 0 && <p className="lm-note" data-field="samples">{twoSeason.map(name => CANDIDATE_LABELS[name] ?? name).join(" and ")} {twoSeason.length === 1 ? "covers" : "cover"} fewer seasons, so don&apos;t compare RMSE across rows that cover different seasons. Each gain uses the seasons both metrics were scored.</p>}
    {best.length > 0 && <p className="lm-note" data-field="best">Ranked above every other metric: {best.join(", ")}. Rows stay in their registered order.</p>}
    <ResearchLinks label="Related results" links={[{ label: "Every metric head to head in Metric Backtest", href: "/research/backtest" }]} />
  </ResearchSection>;
}

// ---- The map -----------------------------------------------------------------------------------

function MapChart({ page, five }: { page: LineupModelPage; five: ReadonlySet<string> }) {
  const pts = page.map.points;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const left = 12, right = 628, top = 12, bottom = 408;
  const px = (v: number) => left + ((v - x0) / (x1 - x0 || 1)) * (right - left);
  const py = (v: number) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);
  const ordered = [...pts].sort((a, b) => Number(five.has(a.player_id)) - Number(five.has(b.player_id)));
  return <svg className="lm-map" viewBox="0 0 640 420" role="img" aria-label={`Map of ${pts.length} players placed by UMAP from the lineup model's learned vectors. The axes have no meaning, and the seed check says the arrangement is noise.`}>
    {ordered.map(p => <circle key={p.player_id} className="lm-dot" cx={px(p.x)} cy={py(p.y)} r="2.5" data-player={p.player_id} data-x={p.x} data-value={p.y} data-on={five.has(p.player_id) || undefined}>
      <title>{`${p.name ?? p.player_id}${p.tricode ? `, ${p.tricode}` : ""}${p.photo_season ? ` (${p.photo_season})` : ""}`}</title>
    </circle>)}
  </svg>;
}

function MapSection({ page, five, players, isDefault }: { page: LineupModelPage; five: readonly string[]; players: ReadonlyMap<string, ToolPlayer>; isDefault: boolean }) {
  const s = page.map.seed_stability;
  const ids = new Set(page.map.points.map(p => p.player_id));
  const missing = five.filter(id => !ids.has(id));
  const names = missing.map(id => players.get(id)?.name ?? id);
  return <ResearchSection id="map" icon="map-pin" title="Player similarity map">
    {s.mean_overlap < 2 * s.chance && <div data-field="seed-warning"><GatedNote tone="warning">
      Read this map as noise. Across the fit&apos;s seeds, each player&apos;s {s.neighbours} nearest neighbours agree <span data-field="seed-stability" data-value={s.mean_overlap}>{percent(s.mean_overlap)}</span> of the time, against <span data-field="seed-chance" data-value={s.chance}>{percent(s.chance)}</span> by chance, so the arrangement has no stable structure.
    </GatedNote></div>}
    <figure className="lm-figure">
      <div className="lm-map-row">
        <div className="lm-block">
          <MapChart page={page} five={new Set(five)} />
          <ul className="lm-key">
            <li><span className="lm-key-mark" aria-hidden="true" />{whole(page.map.points.length)} players with their own vector</li>
            <li><span className="lm-key-mark" data-on aria-hidden="true" />{isDefault ? `${page.serving.panel_season}'s most-used lineup` : "The five chosen above"}</li>
          </ul>
          {missing.length > 0 && <p className="lm-note" data-field="map-missing" data-value={missing.length}>{names.join(", ")} {missing.length === 1 ? "has" : "have"} no dot: box-score fallback players have no vector.</p>}
        </div>
        <ul className="lm-list">
          <li><strong>What it shows:</strong> where one fit places each player. Close dots have similar learned vectors in this fit.</li>
          <li><strong>What it doesn&apos;t show:</strong> the axes, directions and distances between groups mean nothing. It isn&apos;t a map of playing style, position, skill or value. None of those was tested.</li>
          <li><strong>Why so little:</strong> the chosen interaction penalty shrank the vectors to almost nothing, so there is very little for the map to arrange.</li>
        </ul>
      </div>
    </figure>
  </ResearchSection>;
}

// ---- How to read and About ---------------------------------------------------------------------

const GLOSSARY: GlossaryGroup[] = [
  { label: "Models", icon: "chart-trend", items: [
    { term: "Lineup model", text: "Ridge RAPM's ratings plus an interaction: each player has a learned vector, and a self-attention layer reads the ten players together." },
    { term: "Ridge RAPM", text: "Home court plus each player's rating, home five minus away five, weighted by possessions." },
    { term: "Home court only", text: "A model that knows who is at home and nothing else. It sets the floor." },
  ] },
  { label: "Scores", icon: "target", items: [
    { term: "Stint", text: "A stretch of a game with the same ten players on the floor." },
    { term: "Error", text: "Possession-weighted root mean squared error of each stint's home margin, per 100 possessions. Lower is better." },
    { term: "Gain", text: "One model's error minus the other's, on the same stints or games. Above zero, the model named first did better." },
    { term: "Interaction", text: "The part of a prediction that depends on which players share the floor, beyond the sum of their ratings." },
    { term: "Additive part", text: "The part of a prediction that is the sum of the players' ratings, home five minus away five." },
  ] },
  { label: "The tool", icon: "users", items: [
    { term: "Net rating", text: "Predicted points per 100 possessions above an opponent, at a neutral site, averaged over the panel lineups." },
    { term: "Panel", text: "Last season's most-used lineups. A five is compared with those that share none of its players." },
    { term: "Own vector", text: "A player with 1,000 or more possessions in the window, with learned numbers of their own." },
    { term: "Box-score fallback", text: "A player under 1,000 possessions, with numbers read from box-score rates. Fallback players have no dot on the map." },
  ] },
];

function Reading() {
  return <>
    <ResearchSection id="reading" icon="book" title="How to read">
      <ResearchCards columns={3}>
        <ResearchCard kicker="Error"><p className="lm-card-text">How far a model misses a stint&apos;s margin, in points per 100 possessions. Lower is better, and every model here misses by a lot.</p></ResearchCard>
        <ResearchCard kicker="Gain"><p className="lm-card-text">One model&apos;s error minus the other&apos;s. Above zero, the model named first did better. An interval that includes zero is not a difference.</p></ResearchCard>
        <ResearchCard kicker="Colour"><p className="lm-card-text">Green or red only where a whole interval is on one side of zero, and the lineup-against-ridge gains stay uncoloured. Elsewhere gold is above zero and blue below.</p></ResearchCard>
      </ResearchCards>
    </ResearchSection>
    <ResearchDisclosure id="glossary" icon="list-ordered" title="Models and scores, defined"><Glossary groups={GLOSSARY} /></ResearchDisclosure>
  </>;
}

function SelectionGrids({ page }: { page: LineupModelPage }) {
  const sel = page.selection;
  const seasonColumns = <T,>(read: (row: T) => { seasons: Record<string, number>; pooled: number }): GridColumn<T>[] => [
    ...sel.seasons.map((season): GridColumn<T> => ({ key: season, label: season, data: row => ({ value: read(row).seasons[season] }), cell: row => <GridValue text={fixed(read(row).seasons[season], 3)} /> })),
    { key: "pooled", label: "Pooled", data: row => ({ field: "pooled", value: read(row).pooled }), cell: row => <GridValue text={fixed(read(row).pooled, 3)} /> },
  ];
  const ridge = Object.entries(sel.ridge_alpha_grid), lineup = Object.entries(sel.lineup_grid).sort(([, a], [, b]) => (a.dim ?? 0) - (b.dim ?? 0) || (a.penalty ?? 0) - (b.penalty ?? 0));
  type Entry = typeof ridge[number];
  return <div className="lm-block">
    <p className="lm-lead">{sel.seasons.join(" and ")} only. {capital(sel.rule)}. The chosen penalty is the strongest offered, and a stronger one would only move the model closer to ridge.</p>
    <StatsGrid<Entry> label="Ridge penalty" name="alpha-grid" density="compact" height="auto" leadWidth="sm" minWidth="narrow" className="lm-auto" rows={ridge} rowKey={([a]) => a}
      lead={{ label: "Ridge penalty", cell: ([a]) => <><span className="lm-name">{whole(Number(a))}</span>{Number(a) === sel.selected_alpha && <span className="lm-name-sub">Chosen</span>}</> }}
      columns={seasonColumns<Entry>(([, row]) => row)} />
    <StatsGrid<Entry> label="Lineup model size and penalty" name="lineup-grid" density="compact" height="auto" leadWidth="sm" minWidth="narrow" className="lm-auto" rows={lineup} rowKey={([k]) => k}
      lead={{ label: "Vector size", cell: ([k, row]) => <><span className="lm-name">{row.dim}</span>{k === sel.selected_config.key && <span className="lm-name-sub">Chosen</span>}</> }}
      columns={[{ key: "penalty", label: "Interaction penalty", data: ([, row]) => ({ field: "penalty", value: row.penalty ?? "" }), cell: ([, row]) => <GridValue text={String(row.penalty)} /> }, ...seasonColumns<Entry>(([, row]) => row)]} />
  </div>;
}

function CoverageGrids({ page }: { page: LineupModelPage }) {
  const c = page.coverage;
  const seasons = Object.entries(c.seasons), cold = Object.entries(c.cold_start);
  type Season = typeof seasons[number]; type Cold = typeof cold[number];
  const serving = c.cold_start[page.serving.season];
  return <div className="lm-block">
    <p className="lm-lead">A stint counts when both sides had a possession. {visitorText(c.excluded_games)}</p>
    <StatsGrid<Season> label="Stints by season" name="coverage" density="compact" height="auto" leadWidth="sm" className="lm-auto" rows={seasons} rowKey={([s]) => s}
      lead={{ label: "Season", cell: ([s]) => <span className="lm-name">{s}</span> }}
      columns={[
        { key: "games", label: "Games", data: ([, v]) => ({ field: "games", value: v.games }), cell: ([, v]) => <GridValue text={whole(v.games)} /> },
        { key: "stints", label: "Stints", data: ([, v]) => ({ field: "stints", value: v.stints }), cell: ([, v]) => <GridValue text={whole(v.stints)} /> },
        { key: "usable", label: "Usable stints", data: ([, v]) => ({ field: "usable", value: v.usable_stints }), cell: ([, v]) => <GridValue text={whole(v.usable_stints)} /> },
        { key: "possessions", label: "Usable possessions", data: ([, v]) => ({ field: "possessions", value: v.usable_possessions, total: v.possessions }), cell: ([, v]) => <GridValue text={whole(v.usable_possessions)} sub={percent(v.usable_possessions / v.possessions)} /> },
        { key: "players", label: "Players", data: ([, v]) => ({ field: "players", value: v.players }), cell: ([, v]) => <GridValue text={whole(v.players)} /> },
      ]} />
    <StatsGrid<Cold> label="Cold start by target season" name="cold-start" density="compact" height="auto" leadWidth="md" className="lm-auto" rows={cold} rowKey={([s]) => s}
      lead={{ label: "Target season", cell: ([s, v]) => <><span className="lm-name">{s}</span><span className="lm-name-sub">From {v.window[0]} to {v.window.at(-1)}</span></> }}
      columns={[
        { key: "own", label: "Own vector", data: ([, v]) => ({ field: "own", value: v.target?.own_embedding ?? v.own_embedding }), cell: ([, v]) => <GridValue text={whole(v.target?.own_embedding ?? v.own_embedding)} /> },
        { key: "box", label: "Box fallback", data: ([, v]) => ({ field: "box", value: v.target?.box_fallback ?? v.fallback_in_window }), cell: ([, v]) => <GridValue text={whole(v.target?.box_fallback ?? v.fallback_in_window)} /> },
        { key: "new", label: "Newcomers", data: ([, v]) => ({ field: "newcomer", value: v.target?.newcomer_no_box_in_window ?? "" }), cell: ([, v]) => <GridValue text={v.target ? whole(v.target.newcomer_no_box_in_window) : null} /> },
        { key: "shares", label: "Possessions: own / box / new", width: "lg", data: ([, v]) => ({ field: "shares", value: v.target?.possession_share_own ?? "" }), cell: ([, v]) => v.target ? <GridValue text={`${percent(v.target.possession_share_own)} / ${percent(v.target.possession_share_box_fallback)} / ${percent(v.target.possession_share_newcomer)}`} /> : <GridValue text="Not scored" muted /> },
      ]} />
    <p className="lm-note">Counts are players who appear in the target season; the {page.serving.season} row counts players in its window. The fallback reads {serving.fallback_reads.features.length} box-score inputs from the window (per-36 rates and log minutes), standardized on {serving.fallback_reads.standardized_on}. Newcomers have no box minutes in the window, so every input is at that mean.</p>
  </div>;
}

function SubsetGrid({ page }: { page: LineupModelPage }) {
  const r = page.results;
  const groups = [{ key: "all_ten_own", label: "All ten have own vectors" }, { key: "any_fallback", label: "Any fallback player" }] as const;
  return <StatsGrid<string> label="Error by who was on the floor" name="subsets" density="compact" height="auto" leadWidth="sm" className="lm-auto" rows={r.test_seasons} rowKey={s => s}
    lead={{ label: "Season", cell: s => <span className="lm-name">{s}</span> }}
    columns={groups.flatMap(({ key, label }): GridColumn<string>[] => [
      { key: `${key}-ridge`, label: "Ridge", group: label, data: s => ({ field: `${key}-ridge`, value: r.subsets[key][s].ridge }), cell: s => <GridValue text={fixed(r.subsets[key][s].ridge, 3)} /> },
      { key: `${key}-lineup`, label: "Lineup", group: label, data: s => ({ field: `${key}-lineup`, value: r.subsets[key][s].lineup }), cell: s => <GridValue text={fixed(r.subsets[key][s].lineup, 3)} /> },
      { key: `${key}-share`, label: "Possessions", group: label, data: s => ({ field: `${key}-share`, value: r.subsets[key][s].possession_share, stints: r.subsets[key][s].stints }), cell: s => <GridValue text={percent(r.subsets[key][s].possession_share)} sub={`${whole(r.subsets[key][s].stints)} stints`} /> },
    ])} />;
}

function About({ page }: { page: LineupModelPage }) {
  const p = page.registration.parameters, r = page.results, s = page.map.seed_stability, bt = page.backtest;
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Limits"><ul className="lm-list" data-field="caveats">{page.caveats.map(caveat => <li key={caveat}>{visitorText(caveat)}</li>)}</ul></MethodBlock>
    <MethodBlock title="Choices made on the selection seasons"><SelectionGrids page={page} /></MethodBlock>
    <MethodBlock title="Data and cold start"><CoverageGrids page={page} /></MethodBlock>
    <MethodBlock title="Error by who was on the floor, points per 100"><SubsetGrid page={page} /></MethodBlock>
    <MethodBlock title="Method">
      <dl className="lm-defs">
        <dt>Ridge</dt><dd>Home court plus each player&apos;s rating, home five minus away five, weighted by possessions. Players under {whole(p.min_possessions)} window possessions read a box-score map. Penalty {whole(r.selected_alpha)}, chosen on the selection seasons.</dd>
        <dt>Lineup model</dt><dd>The same ratings plus an interaction: a learned vector of {r.selected_config.dim} numbers for each player, one self-attention layer with {p.heads} heads and a small feed-forward layer over the ten players, antisymmetric in the two fives. Trained by {p.rounds} rounds of an exact ridge solve then {p.epochs} epochs of Adam on the interaction, with an interaction penalty of {r.selected_config.penalty}. Each fit averages {p.seeds.length} seeds.</dd>
        <dt>Windows</dt><dd>Each season is predicted from the {p.window_seasons} seasons before it. Selection on {p.selection_seasons.join(" and ")}; test on {p.test_seasons[0]} to {p.test_seasons.at(-1)}, read once. Intervals on the test are a paired game bootstrap with {whole(p.replicates)} replicates.</dd>
        <dt>Rule</dt><dd>{capital(r.rule)}.</dd>
        <dt>Seed check</dt><dd data-field="seed-detail">Each other seed against seed 1401, share of {s.neighbours} nearest neighbours shared across {whole(s.players)} players: {Object.entries(s.overlap_with_seed_1401).map(([seed, v]) => `seed ${seed} ${percent(v)}`).join(", ")}. Mean {percent(s.mean_overlap)}; chance {percent(s.chance)}.</dd>
        {bt && <><dt>Game backtest</dt><dd data-field="backtest-method">{capital(visitorText(bt.verdict.rule))}. {bt.verdict.unranked_pairs} pairs could not be ranked. Games: {Object.entries(bt.games_per_season).filter(([season]) => season !== "2022-23").map(([season, n]) => `${season} ${whole(n)}`).join(", ")}; left out for having no stints: {Object.entries(bt.games_without_stints).filter(([season]) => season !== "2022-23").map(([season, n]) => `${season} ${n}`).join(", ")}.</dd></>}
        <dt>Compute</dt><dd>Local CPU only. Packages: {Object.entries(r.versions).map(([k, v]) => `${k} ${v}`).join(", ")}.</dd>
        <dt>Fixed in advance</dt><dd>Registered on {formatDate(page.registration.registered_on)}, before any fit.</dd>
        <dt>Hashes</dt><dd>Registration <code>{page.registration.content_sha256.slice(0, 16)}</code> · results <code data-field="results-sha" data-value={r.results_sha256}>{r.results_sha256.slice(0, 16)}</code> · selection <code>{r.selection_sha256.slice(0, 16)}</code> · serving <code>{page.serving.serving_sha256.slice(0, 16)}</code> · stints <code>{p.dataset_sha256.stints_sha256.slice(0, 16)}</code> · boxes <code>{p.dataset_sha256.boxes_sha256.slice(0, 16)}</code>.</dd>
        <dt>Credits</dt><dd data-field="credits"><ul className="lm-list">{page.credits.map(c => <li key={c.what}><strong>{c.what}:</strong> {visitorText(c.who)}</li>)}</ul></dd>
      </dl>
      <ResearchLinks label="Evidence" links={[{ label: "How the lineup model was built", href: evidenceUrl("docs/evidence/research/r14/README.md"), icon: "external" }]} />
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Page --------------------------------------------------------------------------------------

function Sections({ page }: { page: LineupModelPage }) {
  const { get, set } = useUrlState();
  const available = page.serving.tool_available;
  const { data: roster, error, loading, retry } = useFeed([String(available)], signal => available ? getLineupPlayers(signal) : Promise.resolve<PlayersPage>({ state: "unavailable", players: [] }));
  const players = useMemo(() => new Map((roster?.players ?? []).map(p => [p.player_id, p])), [roster]);
  const fallback = page.serving.default_five;
  const raw = get("five")?.split(",") ?? [];
  const valid = raw.length === 5 && new Set(raw).size === 5 && (roster?.state !== "ready" || raw.every(id => players.has(id)));
  const five = valid ? raw : fallback;
  const choose = (index: number, id: string) => {
    const next = [...five];
    next[index] = id;
    set({ five: next.every((p, k) => p === fallback[k]) ? null : next.join(",") });
  };
  return <>
    <Answer page={page} />
    <Tool page={page} roster={roster} rosterError={error} rosterLoading={loading} retryRoster={retry} five={five} players={players} onChoose={choose} onReset={() => set({ five: null })} />
    <TestSection page={page} />
    <BacktestSection page={page} />
    <MapSection page={page} five={five} players={players} isDefault={five.join(",") === fallback.join(",")} />
    <Reading />
    <About page={page} />
  </>;
}

export function LineupModelResearch() {
  const { data, error, loading, retry } = useFeed([], signal => getLineupModel(signal));
  const r = data?.results;
  return <PageShell template="research">
    <div className="rs-column lm-page">
      <PageHeader className="sq-hero research-hero" icon="users" title="Lineup Model" subtitle="A neural model of how the ten players on the floor combine, tested against ridge RAPM on seasons it never saw." />
      <ResearchIntro
        tagline={r ? <span data-field="hero-meta">{whole(r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_stints, 0))} held-out stints · {r.test_seasons.length} test seasons · registered before any fit</span> : null}
        links={[{ label: "RAPM Ratings", href: "/research/rapm", icon: "chart-line" }, { label: "Metric Backtest", href: "/research/backtest", icon: "chart-trend" }]} />
      {error && <FeedFailure error={error} retry={retry} what="The lineup model" />}
      {loading && <FeedSkeleton label="Loading the lineup model" />}
      {data && <Sections page={data} />}
    </div>
  </PageShell>;
}
