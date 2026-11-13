"use client";

import type { ReactNode } from "react";
import { FeedFailure, FeedSkeleton } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { MethodBlock } from "./research/research-page";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { fixed, percent, signed } from "@/lib/draft-classes";
import {
  INPUT_LABELS, MARGINAL_LABELS, MISS_LABELS,
  type FactorInput, type FactorRow, type FourFactorsSeason, type FourFactorsSummary, type MissKind, type Rebounds
} from "@/lib/research-r10";
import { teamArtwork } from "@/lib/team-era";

/**
 * R10's observed four-factor inputs (courtlens-four-factors-inputs-v2) under the ORTG lab (RD02): the league and team
 * inputs, the served marginals, rebounds by miss, the paper's 2024-25 values and μ by season, in the site's table look,
 * inside the collapsed Observed Inputs & Caveats section. The lab above starts from the same rows.
 */

const INPUTS: FactorInput[] = ["efg", "ftr", "tov_pct", "orb_pct", "fg", "ft"];
const MISSES: MissKind[] = ["two", "three", "ft_end", "and_one"];
const whole = (v: number | null) => v === null ? "—" : Math.round(v).toLocaleString("en-US");

interface Line { key: string; label: string; value: number | null; text: string }
const one = (label: string, title: string): GridColumn<Line>[] => [{ key: "value", label, title, cell: r => <GridValue text={r.text} />, data: r => ({ field: r.key, value: r.value ?? "" }), width: "md" }];

function LeagueTable({ season, row, mu }: { season: string; row: FactorRow; mu: number }) {
  const lines: Line[] = [
    { key: "ortg", label: "ORTG, Eq. (11)", value: row.ortg_factors, text: fixed(row.ortg_factors, 2) },
    { key: "mu", label: "μ, share of free throws that end a possession", value: mu, text: fixed(mu, 4) },
    ...INPUTS.map(k => ({ key: k, label: INPUT_LABELS[k], value: row.inputs[k], text: percent(row.inputs[k], 2) })),
    { key: "fg2", label: "2P%", value: row.fg2, text: percent(row.fg2, 2) },
    { key: "fg3", label: "3P%", value: row.fg3, text: percent(row.fg3, 2) },
    { key: "fg3a_rate", label: "3PA rate (3PA/FGA)", value: row.fg3a_rate, text: percent(row.fg3a_rate, 2) },
    { key: "ts", label: "TS%", value: row.ts, text: percent(row.ts, 2) },
    { key: "possessions", label: "Possessions, FGA + TOV − ORB + μ FTA", value: row.possessions, text: whole(row.possessions) },
  ];
  return <StatsGrid label="League inputs" name="league" density="compact" height="auto" minWidth="narrow" leadWidth="xl" rows={lines} rowKey={r => r.key}
    lead={{ label: "Input", cell: r => r.label }} columns={one(`League ${season}`, "League value")} />;
}

function MarginalTable({ row }: { row: FactorRow }) {
  const lines: Line[] = Object.entries(row.marginals).map(([k, v]) => ({ key: k, label: MARGINAL_LABELS[k] ?? k, value: v ?? null, text: signed(v, 2) }));
  return <StatsGrid label="Marginal value" name="marginals" density="compact" height="auto" minWidth="narrow" leadWidth="lg" rows={lines} rowKey={r => r.key}
    lead={{ label: "Change", cell: r => r.label }}
    columns={[{ key: "value", label: "ORTG change", cell: r => <GridValue text={r.text} identity={r.value == null || Number(r.value.toFixed(2)) === 0 ? undefined : r.value > 0 ? "a" : "b"} />, data: r => ({ field: "marginal", value: r.value ?? "" }), width: "md" }]} />;
}

function ReboundTable({ row }: { row: FactorRow }) {
  const rows = MISSES.map(k => ({ k, r: row.rebounds_by_miss[k] }));
  const count = (key: keyof Rebounds, label: string): GridColumn<{ k: MissKind; r: Rebounds }> => ({ key, label, cell: x => <GridValue text={(x.r[key] as number).toLocaleString("en-US")} />, data: x => ({ field: key, value: x.r[key] ?? "" }) });
  return <StatsGrid label="Offensive rebounds by miss" name="rebounds" density="compact" height="auto" leadWidth="lg" rows={rows} rowKey={x => x.k}
    lead={{ label: "Miss", cell: x => MISS_LABELS[x.k] }}
    columns={[count("misses", "Misses"), count("offensive", "Offensive"), count("defensive", "Defensive"), count("unrebounded", "Unrebounded"),
      { key: "orb_rate", label: "OREB%", cell: x => <GridValue text={percent(x.r.orb_rate, 2)} />, data: x => ({ field: "orb_rate", value: x.r.orb_rate ?? "" }) }]} />;
}

function PaperTable({ data }: { data: FourFactorsSummary }) {
  const s = data.seasons.find(x => x.season === "2024-25");
  if (!s) return null;
  const p = data.paper.published_2024_25;
  const rows = [
    { key: "mu", label: "μ", paper: p.mu, ours: s.mu },
    { key: "beta", label: "Make rate of final free throws", paper: p.ft_end_make_rate, ours: s.ft_end_make_rate },
    { key: "alpha", label: "OREB% after a missed final free throw", paper: p.ft_end_orb_rate, ours: s.ft_end_orb_rate },
  ];
  return <StatsGrid label="Against the paper" name="paper" density="compact" height="auto" minWidth="narrow" leadWidth="xl" rows={rows} rowKey={r => r.key}
    lead={{ label: "Value", cell: r => r.label }}
    columns={[
      { key: "paper", label: "Paper, 2024-25", cell: r => <GridValue text={fixed(r.paper, 3)} />, data: r => ({ field: "paper", value: r.paper }), width: "md" },
      { key: "courtlens", label: "CourtLens, 2024-25", cell: r => <GridValue text={fixed(r.ours, 3)} />, data: r => ({ field: "courtlens", value: r.ours ?? "" }), width: "md" },
    ]} />;
}

function MuTable({ data }: { data: FourFactorsSummary }) {
  return <StatsGrid label="mu by season" name="mu" density="compact" height="auto" leadWidth="sm" rows={data.seasons} rowKey={s => s.season}
    lead={{ label: "Season", cell: s => s.season }}
    columns={[
      { key: "games", label: "Games", cell: s => <GridValue text={s.games.toLocaleString("en-US")} />, data: s => ({ field: "games", value: s.games }) },
      { key: "mu", label: "μ", cell: s => <GridValue text={fixed(s.mu, 4)} />, data: s => ({ field: "mu", value: s.mu }) },
      { key: "ortg", label: "ORTG", cell: s => <GridValue text={fixed(s.league.ortg_factors, 2)} />, data: s => ({ field: "ortg", value: s.league.ortg_factors ?? "" }) },
      { key: "points_differ", label: "Off final score", title: "Games whose counted points differ from the final score", cell: s => <GridValue text={String(s.games_points_differ)} />, data: s => ({ field: "points_differ", value: s.games_points_differ }) },
    ]} />;
}

function TeamsTable({ season }: { season: FourFactorsSeason }) {
  const teams = [...season.teams].sort((a, b) => (b.ortg_factors ?? 0) - (a.ortg_factors ?? 0));
  type T = FourFactorsSeason["teams"][number];
  const pctCol = (key: string, label: string, get: (t: T) => number | null): GridColumn<T> => ({ key, label, cell: t => <GridValue text={percent(get(t), 1)} />, data: t => ({ field: key, value: get(t) ?? "" }) });
  return <StatsGrid label={`Team inputs ${season.season}`} name="teams" density="compact" height="auto" leadWidth="sm" minWidth="wide" rows={teams} rowKey={t => t.team}
    lead={{ label: "Team", cell: t => <span className="ol-team-cell"><TeamLogo team={t.team} season={season.season} size={20} />{teamArtwork(t.team, season.season)?.tricode ?? t.team}</span> }}
    columns={[
      { key: "ortg", label: "ORTG", cell: t => <GridValue text={fixed(t.ortg_factors, 1)} />, data: t => ({ field: "ortg", value: t.ortg_factors ?? "" }) },
      ...INPUTS.map(k => pctCol(k, INPUT_LABELS[k], t => t.inputs[k])),
      pctCol("fg3a_rate", "3PA rate", t => t.fg3a_rate),
      { key: "possessions", label: "Poss.", title: "Possessions, FGA + TOV − ORB + μ FTA", cell: t => <GridValue text={whole(t.possessions)} />, data: t => ({ field: "possessions", value: t.possessions ?? "" }) },
    ]} />;
}

export function ObservedInputs({ data, season, seasonData, seasonError, retry, details }: {
  data: FourFactorsSummary; season: string; seasonData: FourFactorsSeason | null; seasonError: string | null; retry: () => void; details: ReactNode;
}) {
  const head = data.seasons.find(s => s.season === season) ?? data.seasons.at(-1)!;
  return <div className="ol-observed" data-section="four-factors">
    <p className="rs-note">Every regular-season game ({head.games.toLocaleString("en-US")} in {head.season}) counted from play-by-play. ORTG is {data.paper.authors}&apos;s {data.paper.equation}, {data.paper.formula}, times 100; it equals points per estimated possession exactly.</p>
    <div className="ol-observed-pair">
      <MethodBlock title={`League inputs, ${head.season}`}><LeagueTable season={head.season} row={head.league} mu={head.mu} /></MethodBlock>
      <div className="ol-observed-stack">
        <MethodBlock title="Marginal value"><p className="rs-note">Eq. (11) change when one input moves one point, the others at the league value.</p><MarginalTable row={head.league} /></MethodBlock>
        <MethodBlock title="Against the paper"><p className="rs-note">The paper&apos;s published 2024-25 values (Appendix A and B) beside CourtLens&apos; counts. Reported, not adjusted.</p><PaperTable data={data} /></MethodBlock>
      </div>
    </div>
    <MethodBlock title="Offensive rebounds by miss"><p className="rs-note">The share of rebounds the shooting team took after each kind of miss (team rebounds included). A miss followed by a shot, foul shot, turnover or period end before any rebound is unrebounded and left out of the rate.</p><ReboundTable row={head.league} /></MethodBlock>
    <MethodBlock title={`Teams, ${head.season}`}>
      {seasonError ? <FeedFailure error={seasonError} retry={retry} what="Team inputs" /> : !seasonData ? <FeedSkeleton label="Loading team inputs" /> : <><p className="rs-note">Each team&apos;s own inputs with the league&apos;s μ ({fixed(seasonData.mu, 4)}); highest rating first.</p><TeamsTable season={seasonData} /></>}
    </MethodBlock>
    <MethodBlock title="μ by season"><p className="rs-note">The last of a two- or three-shot trip, or a lone free throw that is not an and-one.</p><MuTable data={data} /></MethodBlock>
    <MethodBlock title="Caveats"><ul className="ol-list">{data.caveats.map(c => <li key={c}>{c}</li>)}</ul></MethodBlock>
    <MethodBlock title="Credits">
      <ul className="ol-list">{data.credits.map(c => <li key={c}>{c}</li>)}</ul>
      <p className="rs-note">Paper: <a href={data.paper.url}>{data.paper.authors}, “{data.paper.title}”</a>, arXiv:{data.paper.arxiv} ({data.paper.version}). Registration <code>{data.registration.identity}</code> · <code data-field="registration-sha" data-value={data.registration.content_sha256}>{data.registration.content_sha256.slice(0, 16)}</code>; results <code data-field="results-sha" data-value={data.registration.results_sha256}>{data.registration.results_sha256.slice(0, 16)}</code>. {details}</p>
    </MethodBlock>
  </div>;
}
