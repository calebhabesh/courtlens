"use client";

import { useMemo } from "react";
import { ChartData, ChartFrame } from "./charts/chart-frame";
import { toneColor } from "./charts/semantics";
import { ExampleNote, FeedFailure, FeedSkeleton, PlayerPicker, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader, Section } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  bandText, CANDIDATE_LABELS, digitsFor, fixed, gainText, gainTone, getLineupFit, getLineupModel, getLineupPlayers, PAIR_TEXT, percent,
  SHORT_VERDICT, signed, STATUS_TEXT, verdictSentences, whole,
  type FitResult, type Gain, type Identity, type LineupModelPage, type PlayersPage, type ToolPlayer
} from "@/lib/lineup-model";
import { seasonEra } from "@/lib/portrait-source";

/**
 * Research → Models → Lineup Model (R14). A plain build-phase page: the registered test against
 * ridge, the lineup tool, the similarity map, the game backtest entry, selection, coverage, caveats,
 * credits and the method card. Every number is the frozen courtlens-lineup-model-v1 or
 * courtlens-lineup-backtest-v1 results' or the tool's; exact values sit on `data-value`.
 */

const MODEL_LABELS = { lineup: "Lineup model", ridge: "Ridge RAPM", home_only: "Home court only" } as const;
const ACCENT = toneColor("identity-a");
const short = (season: string) => season.slice(2);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function GainCell({ g, field, digits: base = 2 }: { g: Gain; field: string; digits?: number }) {
  const digits = digitsFor([g.gain, g.low, g.high], base);
  return <TableCell numeric tone={gainTone(g)} data-field={field} data-value={g.gain} data-low={g.low} data-high={g.high}>
    {signed(g.gain, digits)}<br /><small>{signed(g.low, digits)} to {signed(g.high, digits)}</small>
  </TableCell>;
}

function PlayerCell({ p }: { p: Identity }) {
  const name = p.name ?? p.player_id;
  return <TableCell data-field="player" data-value={p.player_id}>
    <PlayerIdentity playerId={p.player_id} name={name} team={p.tricode} size="sm" era={seasonEra(p.photo_season, p.tricode)}
      href={`/players/${p.player_id}${p.photo_season ? `?season=${p.photo_season}` : ""}`} />
  </TableCell>;
}

function TeamCell({ p }: { p: Identity }) {
  if (!p.tricode) return <TableCell>—</TableCell>;
  return <TableCell data-field="team" data-value={p.tricode}><TeamLogo team={p.tricode} season={p.photo_season} size={16} /> {p.tricode}</TableCell>;
}

// ---- The test ----------------------------------------------------------------------------------

function GainChart({ page }: { page: LineupModelPage }) {
  const r = page.results;
  const rows = [...r.test_seasons.map(s => ({ key: s, label: short(s), g: r.gains.lineup_over_ridge.seasons[s] })),
    { key: "pooled", label: "Pooled", g: r.gains.lineup_over_ridge.pooled }];
  const extent = Math.max(...rows.flatMap(p => [Math.abs(p.g.low), Math.abs(p.g.high)])) * 1.15 || 1;
  const tickDigits = digitsFor([extent / 2]);
  const left = 96, right = 608, top = 16, bottom = 200;
  const slot = (right - left) / rows.length;
  const x = (i: number) => left + slot * (i + 0.5);
  const y = (v: number) => top + ((extent - v) / (2 * extent)) * (bottom - top);
  const ticks = [-extent, -extent / 2, 0, extent / 2, extent];
  return <svg className="chart-graphic chart-reliability" viewBox="0 0 640 232" role="img"
    aria-label="Ridge's error minus the lineup model's, points per 100 possessions, by test season and pooled, with 95% intervals. Above zero favours the lineup model.">
    {ticks.map(t => <g key={t}>
      <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-text-secondary)" : "var(--color-hairline-strong)"} />
      <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end">{signed(t, tickDigits)}</text>
    </g>)}
    {rows.map((p, i) => {
      const tone = gainTone(p.g);
      const color = tone ? `var(--color-${tone})` : ACCENT;
      return <g key={p.key} stroke={color} fill={color}>
        <line x1={x(i)} x2={x(i)} y1={y(p.g.low)} y2={y(p.g.high)} strokeWidth="2" />
        <circle cx={x(i)} cy={y(p.g.gain)} r="4" data-season={p.key} data-value={p.g.gain} data-low={p.g.low} data-high={p.g.high}>
          <title>{`${p.key}: ${gainText(p.g)}`}</title>
        </circle>
        <text x={x(i)} y={bottom + 20} textAnchor="middle" stroke="none" fill="var(--color-text-secondary)">{p.label}</text>
      </g>;
    })}
  </svg>;
}

function TestSection({ page }: { page: LineupModelPage }) {
  const r = page.results;
  const models = ["lineup", "ridge", "home_only"] as const;
  return <Section title="Does the lineup model beat ridge on seasons it never saw?"
    description={`Each test season is predicted by models trained only on the ${page.registration.parameters.window_seasons} seasons before it. Error is the root mean squared error of each stint's home margin per 100 possessions, weighted by possessions. Intervals: paired game bootstrap, ${r.models.lineup.pooled ? page.registration.parameters.replicates.toLocaleString("en-US") : ""} replicates, 95%.`}>
    <ul data-field="verdict-summary">{verdictSentences(page).map(t => <li key={t}>{t}</li>)}</ul>
    <ChartFrame title="Ridge error minus lineup model error, per 100" source="Frozen courtlens-lineup-model-v1 results"
      sample={`Usable stints, ${r.test_seasons[0]} to ${r.test_seasons.at(-1)}`} state="ready">
      <ChartData fingerprint={r.results_sha256}><GainChart page={page} /></ChartData>
    </ChartFrame>
    <Table aria-label="Stint margin error by test season" density="compact" data-table="test">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Season</TableHead><TableHead align="right">Stints</TableHead><TableHead align="right">Games</TableHead>
        {models.map(m => <TableHead key={m} align="right">{MODEL_LABELS[m]}, 95%</TableHead>)}
        <TableHead align="right">Ridge minus lineup, 95%</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {r.test_seasons.map(s => <TableRow key={s} data-row={s}>
          <TableCell>{s}</TableCell>
          <TableCell numeric data-field="stints" data-value={r.diagnostics[s].test_stints}>{whole(r.diagnostics[s].test_stints)}</TableCell>
          <TableCell numeric data-field="games" data-value={r.diagnostics[s].test_games}>{whole(r.diagnostics[s].test_games)}</TableCell>
          {models.map(m => {
            const v = r.models[m].seasons[s];
            return <TableCell key={m} numeric data-field={m} data-value={v.wrmse} data-low={v.low} data-high={v.high}>{fixed(v.wrmse, 3)}<br /><small>{bandText(v, 3)}</small></TableCell>;
          })}
          <GainCell g={r.gains.lineup_over_ridge.seasons[s]} field="gain" digits={3} />
        </TableRow>)}
        <TableRow data-row="pooled">
          <TableCell><strong>Pooled</strong></TableCell>
          <TableCell numeric>{whole(r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_stints, 0))}</TableCell>
          <TableCell numeric>{whole(r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_games, 0))}</TableCell>
          {models.map(m => {
            const v = r.models[m].pooled;
            return <TableCell key={m} numeric data-field={m} data-value={v.wrmse} data-low={v.low} data-high={v.high}>{fixed(v.wrmse, 3)}<br /><small>{bandText(v, 3)}</small></TableCell>;
          })}
          <GainCell g={r.gains.lineup_over_ridge.pooled} field="gain" digits={3} />
        </TableRow>
      </TableBody>
    </Table>
    <h3>Where the models differ</h3>
    <Table aria-label="Interaction size and cold start" density="compact" data-table="diagnostics">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Season</TableHead><TableHead align="right">Interaction SD, per 100</TableHead><TableHead align="right">Additive SD, per 100</TableHead>
        <TableHead align="right">Correlation with ridge</TableHead><TableHead align="right">All ten own vectors: ridge / lineup</TableHead>
        <TableHead align="right">Any fallback player: ridge / lineup</TableHead>
      </TableRow></TableHeader>
      <TableBody>{r.test_seasons.map(s => {
        const d = r.diagnostics[s];
        const a = r.subsets.all_ten_own[s];
        const f = r.subsets.any_fallback[s];
        return <TableRow key={s} data-row={s}>
          <TableCell>{s}</TableCell>
          <TableCell numeric data-field="interaction_sd" data-value={d.interaction_sd_per100}>{fixed(d.interaction_sd_per100, 3)}</TableCell>
          <TableCell numeric data-field="additive_sd" data-value={d.additive_sd_per100}>{fixed(d.additive_sd_per100, 3)}</TableCell>
          <TableCell numeric data-field="correlation" data-value={d.prediction_correlation_with_ridge}>{fixed(d.prediction_correlation_with_ridge, 4)}</TableCell>
          <TableCell numeric data-field="all_own" data-value={a.lineup} title={`${whole(a.stints)} stints, ${percent(a.possession_share)} of possessions`}>{fixed(a.ridge, 3)} / {fixed(a.lineup, 3)}<br /><small>{percent(a.possession_share)} of possessions</small></TableCell>
          <TableCell numeric data-field="any_fallback" data-value={f.lineup} title={`${whole(f.stints)} stints`}>{fixed(f.ridge, 3)} / {fixed(f.lineup, 3)}<br /><small>{percent(f.possession_share)} of possessions</small></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </Section>;
}

// ---- The lineup tool ---------------------------------------------------------------------------

function FitResultView({ fit, players }: { fit: FitResult; players: Map<string, ToolPlayer> }) {
  if (fit.state === "unavailable") return <GatedNote>The lineup tool needs the model weights, which are not on this server ({fit.reason}).</GatedNote>;
  if (fit.state === "no_opponents") return <GatedNote>Every panel lineup shares a player with this five, so there is nothing to predict against.</GatedNote>;
  const l = fit.lineup_model!, rd = fit.ridge!;
  return <>
    <Table aria-label="Predicted net rating" density="compact" data-table="fit">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Model</TableHead><TableHead align="right">Net rating per 100</TableHead><TableHead align="right">80% interval</TableHead>
        <TableHead align="right">Additive part</TableHead><TableHead align="right">Interaction part</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        <TableRow data-row="lineup_model">
          <TableCell>Lineup model</TableCell>
          <TableCell numeric data-field="net" data-value={l.net}>{signed(l.net, 1)}</TableCell>
          <TableCell numeric data-field="interval" data-low={l.low} data-high={l.high}>{signed(l.low, 1)} to {signed(l.high, 1)}</TableCell>
          <TableCell numeric data-field="additive" data-value={l.additive}>{signed(l.additive, 2)}</TableCell>
          <TableCell numeric data-field="interaction" data-value={l.interaction}>{signed(l.interaction, digitsFor([l.interaction]))}</TableCell>
        </TableRow>
        <TableRow data-row="ridge">
          <TableCell>Ridge RAPM</TableCell>
          <TableCell numeric data-field="net" data-value={rd.net}>{signed(rd.net, 1)}</TableCell>
          <TableCell numeric data-field="interval" data-low={rd.low} data-high={rd.high}>{signed(rd.low, 1)} to {signed(rd.high, 1)}</TableCell>
          <TableCell numeric>{signed(rd.net, 2)}</TableCell><TableCell numeric>—</TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <p>Against {fit.opponents} of the {fit.panel_size} panel lineups (those sharing no player with this five), at a neutral site. Intervals: 10th to 90th percentile over {fit.refits} game-bootstrap refits; the point is the five-seed fit and can sit outside them. No verdict is drawn from overlapping intervals.</p>
    <Table aria-label="Players in this five" density="compact" data-table="five">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Player</TableHead><TableHead>Team</TableHead><TableHead>Input</TableHead>
        <TableHead align="right">Window possessions</TableHead><TableHead align="right">Ridge rating</TableHead><TableHead align="right">Lineup additive rating</TableHead>
      </TableRow></TableHeader>
      <TableBody>{(fit.players ?? []).map(p => {
        const row = players.get(p.player_id);
        return <TableRow key={p.player_id} data-row={p.player_id}>
          <PlayerCell p={p} /><TeamCell p={p} />
          <TableCell data-field="status" data-value={p.status ?? ""}>{p.status ? STATUS_TEXT[p.status] : "—"}</TableCell>
          <TableCell numeric data-field="possessions" data-value={p.window_possessions ?? ""}>{p.window_possessions == null ? "—" : whole(p.window_possessions)}</TableCell>
          <TableCell numeric data-field="ridge_rating" data-value={row?.ridge_rating ?? ""}>{row ? signed(row.ridge_rating) : "—"}</TableCell>
          <TableCell numeric data-field="lineup_rating" data-value={row?.lineup_additive_rating ?? ""}>{row ? signed(row.lineup_additive_rating) : "—"}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </>;
}

function ToolSection({ page, roster }: { page: LineupModelPage; roster: PlayersPage | null }) {
  const { get, set } = useUrlState();
  const fallback = page.serving.default_five;
  const raw = get("five")?.split(",") ?? [];
  const five = raw.length === 5 ? raw : fallback;
  const byId = useMemo(() => new Map((roster?.players ?? []).map(p => [p.player_id, p])), [roster]);
  const key = five.join(",");
  const { data: fit, error, loading } = useFeed([key, String(page.serving.tool_available)], signal =>
    page.serving.tool_available ? getLineupFit(five, signal) : Promise.resolve<FitResult>({ state: "unavailable", reason: "no weights on this server" }));
  const choose = (i: number, id: string) => {
    const next = [...five];
    next[i] = id;
    const same = next.every((p, k) => p === fallback[k]);
    set({ five: same ? null : next.join(",") });
  };
  const options = (roster?.players ?? []).map(p => ({ player_id: p.player_id, player_name: `${p.name ?? p.player_id}${p.tricode ? ` (${p.tricode})` : ""}`, qualified: p.status === "own" }));
  return <Section title="Lineup tool"
    description={`Predicted net rating per 100 possessions of any five players from the ${page.serving.season} fit (trained on ${page.serving.window[0]} to ${page.serving.window.at(-1)}), against ${page.serving.panel_season}'s ${page.serving.panel_size} most-used lineups. Players under 1,000 possessions read the box-score fallback.`}>
    <ExampleNote name="2025-26's most-used lineup" rule={raw.length === 5 ? null : "The tool opens on the five with the most possessions together in 2025-26."} />
    {roster?.state === "unavailable" && <GatedNote>The player list needs the model weights, which are not on this server.</GatedNote>}
    {roster?.state === "ready" && <div role="group" aria-label="Five players" className="chart-legend-inline">
      {five.map((id, i) => <PlayerPicker key={i} label={`Player ${i + 1}`} value={id} players={options.filter(o => o.player_id === id || !five.includes(o.player_id))} onChange={next => choose(i, next)} />)}
    </div>}
    {error && <GatedNote tone="warning" why={error}>This five could not be predicted.</GatedNote>}
    {loading && <FeedSkeleton label="Predicting this five" />}
    {fit && <FitResultView fit={fit} players={byId} />}
  </Section>;
}

// ---- The similarity map ------------------------------------------------------------------------

function MapChart({ page, highlight }: { page: LineupModelPage; highlight: Set<string> }) {
  const pts = page.map.points;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const left = 16, right = 624, top = 16, bottom = 464;
  const px = (v: number) => left + ((v - x0) / (x1 - x0 || 1)) * (right - left);
  const py = (v: number) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);
  const ordered = [...pts].sort((a, b) => Number(highlight.has(a.player_id)) - Number(highlight.has(b.player_id)));
  return <svg className="chart-graphic chart-reliability" viewBox="0 0 640 480" role="img"
    aria-label={`UMAP map of ${pts.length} players' learned vectors. Axes have no meaning.`}>
    {ordered.map(p => {
      const on = highlight.has(p.player_id);
      return <circle key={p.player_id} cx={px(p.x)} cy={py(p.y)} r={on ? 5 : 2.5} data-player={p.player_id} data-x={p.x} data-value={p.y}
        fill={on ? ACCENT : "var(--color-text-secondary)"} fillOpacity={on ? 1 : 0.55}>
        <title>{`${p.name ?? p.player_id}${p.tricode ? `, ${p.tricode}` : ""} (${p.photo_season ?? ""})`}</title>
      </circle>;
    })}
  </svg>;
}

function MapSection({ page }: { page: LineupModelPage }) {
  const { get } = useUrlState();
  const raw = get("five")?.split(",") ?? [];
  const five = new Set(raw.length === 5 ? raw : page.serving.default_five);
  const s = page.map.seed_stability;
  return <Section title="Player similarity map"
    description={`Each dot is one of the ${page.map.points.length} players with their own vector in the ${page.serving.season} fit, placed by UMAP from seed 1401's vectors. The five chosen in the tool are highlighted.`}>
    <ChartFrame title="Learned player vectors, projected to two dimensions" source="Frozen courtlens-lineup-model-v1 serving manifest; UMAP (umap-learn)"
      sample={`Players with 1,000+ possessions, ${page.map.window[0]} to ${page.map.window.at(-1)}`} state="ready">
      <ChartData fingerprint={page.serving.serving_sha256}><MapChart page={page} highlight={five} /></ChartData>
    </ChartFrame>
    <p data-field="seed-stability" data-value={s.mean_overlap}>
      Seed check: of each player&apos;s {s.neighbours} nearest neighbours in vector space, seed 1401&apos;s fit and each other seed&apos;s fit agree on {percent(s.mean_overlap)} on average
      (by seed: {Object.entries(s.overlap_with_seed_1401).map(([k, v]) => `${k} ${percent(v)}`).join(", ")}); chance is {percent(s.chance)}.
    </p>
    {s.mean_overlap < 2 * s.chance && <GatedNote tone="warning" why="Seed agreement is at the level of chance.">
      In this fit the seeds agree on nearest neighbours no more often than chance, so the map shows no stable structure. The selected model&apos;s interaction is almost zero, so the vectors carry almost nothing; read the map as noise.
    </GatedNote>}
    <ul>
      <li><strong>What it shows:</strong> players close together have similar learned vectors in this fit, so the model treats them alike when it works out how a lineup&apos;s players combine. Neighbourhoods are only as stable as the seed check above.</li>
      <li><strong>What it does not show:</strong> the axes, directions and the distances between groups mean nothing (UMAP keeps local neighbourhoods, not global layout). It is not a map of playing style, position, skill or value: none of those was tested.</li>
    </ul>
  </Section>;
}

// ---- The game backtest -------------------------------------------------------------------------

function BacktestSection({ page }: { page: LineupModelPage }) {
  const bt = page.backtest;
  if (!bt) return <Section title="In the game backtest"><GatedNote>The lineup backtest results are not on this server.</GatedNote></Section>;
  const names = Object.keys(bt.candidates);
  const pairWith = (other: string) => bt.pairs.find(p => (p.candidate === "lineup_model" && p.reference === other) || (p.reference === "lineup_model" && p.candidate === other));
  const asLineup = (other: string): Gain | null => {
    const p = pairWith(other);
    if (!p) return null;
    const g = p.pooled.rmse;
    return p.candidate === "lineup_model" ? g : { gain: -g.gain, low: -g.high, high: -g.low };
  };
  return <Section title="In the game backtest"
    description={`The lineup model entered as a new candidate in Metric Backtest's game test, under its own registration (${bt.version}); the original backtest is unchanged. Each game's prediction sums the model's stint predictions for who actually played together, as the backtest uses actual minutes. Games: ${Object.entries(bt.games_per_season).filter(([s]) => s !== "2022-23").map(([s, n]) => `${s} ${whole(n)}`).join(", ")} (games without R01 stints left out: ${Object.entries(bt.games_without_stints).filter(([s]) => s !== "2022-23").map(([s, n]) => `${s} ${n}`).join(", ")}).`}>
    <Table aria-label="Game margin error, lineup backtest" density="compact" data-table="backtest">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Metric</TableHead><TableHead>Seasons</TableHead><TableHead align="right">Games</TableHead>
        <TableHead align="right">Margin RMSE, 95%</TableHead><TableHead align="right">Lineup model&apos;s RMSE gain, 95%</TableHead><TableHead>Verdict for the lineup model</TableHead>
      </TableRow></TableHeader>
      <TableBody>{names.map(name => {
        const c = bt.candidates[name];
        const g = name === "lineup_model" ? null : asLineup(name);
        const v = bt.verdict.lineup_model_against[name];
        return <TableRow key={name} data-row={name}>
          <TableCell>{CANDIDATE_LABELS[name] ?? name}</TableCell>
          <TableCell>{c.test_seasons.map(short).join(", ")}</TableCell>
          <TableCell numeric data-field="games" data-value={c.pooled.games}>{whole(c.pooled.games)}</TableCell>
          <TableCell numeric data-field="rmse" data-value={c.pooled.rmse} data-low={c.pooled.intervals.rmse.low} data-high={c.pooled.intervals.rmse.high}>{fixed(c.pooled.rmse)}<br /><small>{bandText(c.pooled.intervals.rmse)}</small></TableCell>
          {g ? <GainCell g={g} field="gain" /> : <TableCell numeric>—</TableCell>}
          <TableCell data-field="verdict" data-value={v ?? ""}>{v ? PAIR_TEXT[v] : "—"}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
    <p>Gain is the other metric&apos;s RMSE minus the lineup model&apos;s on the seasons both were scored; positive favours the lineup model. Green or red only when the whole interval is on one side of zero. Verdicts use R08&apos;s registered rule. {bt.verdict.best.length ? `Ranked above every other metric: ${bt.verdict.best.map(n => CANDIDATE_LABELS[n] ?? n).join(", ")}.` : "No metric ranks above every other."}</p>
  </Section>;
}

// ---- Selection, coverage, words ----------------------------------------------------------------

function SelectionSection({ page }: { page: LineupModelPage }) {
  const sel = page.selection;
  return <Section title="Choices made on the selection seasons" description={`${sel.seasons.join(" and ")} only. ${capital(sel.rule)}.`}>
    <Table aria-label="Ridge penalty" density="compact" data-table="alpha-grid">
      <TableHeader><TableRow hoverable={false}><TableHead>Ridge penalty</TableHead>{sel.seasons.map(s => <TableHead key={s} align="right">{s}</TableHead>)}<TableHead align="right">Pooled</TableHead></TableRow></TableHeader>
      <TableBody>{Object.entries(sel.ridge_alpha_grid).map(([a, row]) => <TableRow key={a} data-row={a}>
        <TableCell>{a}{Number(a) === sel.selected_alpha ? " (chosen)" : ""}</TableCell>
        {sel.seasons.map(s => <TableCell key={s} numeric data-value={row.seasons[s]}>{fixed(row.seasons[s], 3)}</TableCell>)}
        <TableCell numeric data-field="pooled" data-value={row.pooled}>{fixed(row.pooled, 3)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <Table aria-label="Lineup model size and penalty" density="compact" data-table="lineup-grid">
      <TableHeader><TableRow hoverable={false}><TableHead>Vector size</TableHead><TableHead align="right">Interaction penalty</TableHead>{sel.seasons.map(s => <TableHead key={s} align="right">{s}</TableHead>)}<TableHead align="right">Pooled</TableHead></TableRow></TableHeader>
      <TableBody>{Object.entries(sel.lineup_grid).map(([k, row]) => <TableRow key={k} data-row={k}>
        <TableCell>{row.dim}{k === sel.selected_config.key ? " (chosen)" : ""}</TableCell>
        <TableCell numeric>{row.penalty}</TableCell>
        {sel.seasons.map(s => <TableCell key={s} numeric data-value={row.seasons[s]}>{fixed(row.seasons[s], 3)}</TableCell>)}
        <TableCell numeric data-field="pooled" data-value={row.pooled}>{fixed(row.pooled, 3)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Section>;
}

function CoverageSection({ page }: { page: LineupModelPage }) {
  const c = page.coverage;
  return <Section title="Data and cold start" description={`R01's stints, ${Object.keys(c.seasons)[0]} to ${Object.keys(c.seasons).at(-1)}. A stint counts when both sides had a possession (R01's rule). ${c.excluded_games}`}>
    <Table aria-label="Stints by season" density="compact" data-table="coverage">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Season</TableHead><TableHead align="right">Games</TableHead><TableHead align="right">Stints</TableHead>
        <TableHead align="right">Usable stints</TableHead><TableHead align="right">Usable possessions</TableHead><TableHead align="right">Players</TableHead>
      </TableRow></TableHeader>
      <TableBody>{Object.entries(c.seasons).map(([s, v]) => <TableRow key={s} data-row={s}>
        <TableCell>{s}</TableCell>
        <TableCell numeric data-field="games" data-value={v.games}>{whole(v.games)}</TableCell>
        <TableCell numeric data-field="stints" data-value={v.stints}>{whole(v.stints)}</TableCell>
        <TableCell numeric data-field="usable" data-value={v.usable_stints}>{whole(v.usable_stints)}</TableCell>
        <TableCell numeric data-field="possessions" data-value={v.usable_possessions} title={`${percent(v.usable_possessions / v.possessions)} of all possessions`}>{whole(v.usable_possessions)}<br /><small>{percent(v.usable_possessions / v.possessions)}</small></TableCell>
        <TableCell numeric data-field="players" data-value={v.players}>{whole(v.players)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <Table aria-label="Cold start by target season" density="compact" data-table="cold-start">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Target season</TableHead><TableHead>Window</TableHead><TableHead align="right">Own vector</TableHead>
        <TableHead align="right">Box fallback</TableHead><TableHead align="right">Newcomers</TableHead>
        <TableHead align="right">Possessions: own / box / new</TableHead>
      </TableRow></TableHeader>
      <TableBody>{Object.entries(c.cold_start).map(([s, v]) => <TableRow key={s} data-row={s}>
        <TableCell>{s}</TableCell>
        <TableCell>{v.window[0]} to {v.window.at(-1)}</TableCell>
        <TableCell numeric data-field="own" data-value={v.target?.own_embedding ?? v.own_embedding}>{v.target?.own_embedding ?? v.own_embedding}</TableCell>
        <TableCell numeric data-field="box" data-value={v.target?.box_fallback ?? ""}>{v.target ? v.target.box_fallback : "—"}</TableCell>
        <TableCell numeric data-field="newcomer" data-value={v.target?.newcomer_no_box_in_window ?? ""}>{v.target ? v.target.newcomer_no_box_in_window : "—"}</TableCell>
        <TableCell numeric data-field="shares" data-value={v.target?.possession_share_own ?? ""}>{v.target ? `${percent(v.target.possession_share_own)} / ${percent(v.target.possession_share_box_fallback)} / ${percent(v.target.possession_share_newcomer)}` : "Not scored"}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <p>Counts are players who appear in the target season; the {page.serving.season} row counts players in its window. The fallback reads {c.cold_start[page.serving.season].fallback_reads.features.length} box-score inputs from the window (per-36 rates and log minutes), standardized on the {c.cold_start[page.serving.season].fallback_reads.standardized_on}. Newcomers (no box minutes in the window) have every input at that mean.</p>
  </Section>;
}

function Words({ page }: { page: LineupModelPage }) {
  const p = page.registration.parameters;
  const r = page.results;
  return <>
    <Section title="Caveats"><ul>{page.caveats.map(c => <li key={c}>{c}</li>)}</ul></Section>
    <Section title="Credits"><ul>{page.credits.map(c => <li key={c.what}><strong>{c.what}:</strong> {c.who}</li>)}</ul></Section>
    <Section title="Method and reproducibility">
      <dl>
        <dt>Ridge</dt><dd>Home court plus each player&apos;s rating, home five minus away five, weighted by possessions; players under {whole(p.min_possessions)} window possessions read a box-score map. Penalty {r.selected_alpha} (chosen on the selection seasons).</dd>
        <dt>Lineup model</dt><dd>The same ratings plus an interaction: each player&apos;s learned vector ({r.selected_config.dim} numbers), one self-attention layer with {p.heads} heads and a small feed-forward layer over the ten players, antisymmetric in the two fives. Trained by backfitting ({p.rounds} rounds of an exact ridge solve, then {p.epochs} epochs of Adam on the interaction), interaction penalty {r.selected_config.penalty}; each fit averages {p.seeds.length} seeds ({p.seeds.join(", ")}).</dd>
        <dt>Windows</dt><dd>Each season is predicted from the {p.window_seasons} seasons before it. Selection {p.selection_seasons.join(", ")}; test {p.test_seasons.join(", ")}.</dd>
        <dt>Rule</dt><dd>{capital(r.rule)}.</dd>
        <dt>Compute</dt><dd>Local CPU only; float32 PyTorch for training, a numpy forward pass for every published number. Packages: {Object.entries(r.versions).map(([k, v]) => `${k} ${v}`).join(", ")}.</dd>
        <dt>Registration</dt><dd><code>{page.registration.identity}</code> · <code>{page.registration.content_sha256.slice(0, 16)}</code>, committed before any fit.</dd>
        <dt>Data</dt><dd>Stints <code>{p.dataset_sha256.stints_sha256.slice(0, 16)}</code>, boxes <code>{p.dataset_sha256.boxes_sha256.slice(0, 16)}</code>.</dd>
        <dt>Results</dt><dd><code data-field="results-sha" data-value={r.results_sha256}>{r.results_sha256.slice(0, 16)}</code>; selection <code>{r.selection_sha256.slice(0, 16)}</code>; serving <code>{page.serving.serving_sha256.slice(0, 16)}</code>. Reruns give the same hashes.</dd>
      </dl>
    </Section>
  </>;
}

// ---- Page --------------------------------------------------------------------------------------

export function LineupModelResearch() {
  const { data, error, loading, retry } = useFeed([], signal => getLineupModel(signal));
  const { data: roster } = useFeed([String(data?.serving.tool_available ?? "")], signal =>
    data?.serving.tool_available ? getLineupPlayers(signal) : Promise.resolve<PlayersPage>({ state: "unavailable", players: [] }));
  const r = data?.results;
  const pooled = r?.gains.lineup_over_ridge.pooled ?? { gain: 0, low: 0, high: 0 };
  const pooledDigits = digitsFor([pooled.gain, pooled.low, pooled.high]);
  return <PageShell template="research">
    <PageHeader icon="users" title="Lineup Model" subtitle="A neural model of the ten players on the floor, tested against ridge RAPM on seasons it never saw." />
    {error && <FeedFailure error={error} retry={retry} what="The lineup model" />}
    {loading && <FeedSkeleton label="Loading the lineup model" />}
    {data && r && <ResearchLayout findings={<>
      <StatTile label="Verdict" value={SHORT_VERDICT[r.verdict]} footnote="Registered rule, held-out stints" />
      <StatTile label="Ridge minus lineup error" value={signed(pooled.gain, pooledDigits)} footnote={`Points per 100; 95% ${signed(pooled.low, pooledDigits)} to ${signed(pooled.high, pooledDigits)}`} />
      <StatTile label="Held-out stints" value={whole(r.test_seasons.reduce((n, s) => n + r.diagnostics[s].test_stints, 0))} footnote={`${r.test_seasons[0]} to ${r.test_seasons.at(-1)}`} />
      <StatTile label="Interaction size" value={(() => { const v = r.test_seasons.reduce((n, s) => n + r.diagnostics[s].interaction_sd_per100, 0) / r.test_seasons.length; return fixed(v, digitsFor([v])); })()} footnote={`Average SD per 100 of the learned interaction; the additive part's is ${fixed(r.test_seasons.reduce((n, s) => n + r.diagnostics[s].additive_sd_per100, 0) / r.test_seasons.length, 1)}`} />
    </>}>
      <TestSection page={data} />
      <ToolSection page={data} roster={roster ?? null} />
      <MapSection page={data} />
      <BacktestSection page={data} />
      <SelectionSection page={data} />
      <CoverageSection page={data} />
      <Words page={data} />
    </ResearchLayout>}
  </PageShell>;
}

