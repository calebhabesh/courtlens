"use client";

import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { Field } from "./ui/field";
import { Select } from "./ui/kit";
import { Section } from "./ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { fixed, percent, signed } from "@/lib/draft-classes";
import {
  INPUT_LABELS, MARGINAL_LABELS, MISS_LABELS, getFourFactors, getFourFactorsSeason,
  type FactorInput, type FourFactorsSummary, type MissKind
} from "@/lib/research-r10";
import { teamArtwork } from "@/lib/team-era";

/**
 * Research R10 build-phase data on the ORtg calculator: each season's observed four-factor inputs
 * and Poropudas and Halme's Eq. (11) rating (courtlens-four-factors-inputs-v2). Plain sections
 * (D13); the interactive ORTG Lab is the design phase's.
 */

const INPUTS: FactorInput[] = ["efg", "ftr", "tov_pct", "orb_pct", "fg", "ft"];
const MISSES: MissKind[] = ["two", "three", "ft_end", "and_one"];

function NumCell({ field, value, text }: { field: string; value: number | null | undefined; text: string }) {
  return <TableCell numeric data-field={field} data-value={value ?? ""}>{text}</TableCell>;
}

function TeamsTable({ season }: { season: string }) {
  const { data, error, loading, retry } = useFeed([season], signal => getFourFactorsSeason(season, signal));
  if (error) return <FeedFailure error={error} retry={retry} what="Team inputs" />;
  if (loading || !data) return <FeedSkeleton label="Loading team inputs" />;
  const teams = [...data.teams].sort((a, b) => (b.ortg_factors ?? 0) - (a.ortg_factors ?? 0));
  return <Section title={`Teams, ${season}`} description={`Each team's own inputs with the league's mu (${fixed(data.mu, 4)}); highest Eq. (11) rating first.`}>
    <Table aria-label={`Team inputs ${season}`} density="compact" data-table="teams">
      <TableHeader><TableRow hoverable={false}>
        <TableHead>Team</TableHead><TableHead align="right">ORTG</TableHead>
        {INPUTS.map(k => <TableHead key={k} align="right">{INPUT_LABELS[k]}</TableHead>)}
        <TableHead align="right">3PA rate</TableHead><TableHead align="right">Possessions</TableHead>
      </TableRow></TableHeader>
      <TableBody>{teams.map(t => <TableRow key={t.team} data-row={t.team}>
        <TableCell data-field="team" data-value={t.team}><TeamLogo team={t.team} season={season} size={16} /> {teamArtwork(t.team, season)?.tricode ?? t.team}</TableCell>
        <NumCell field="ortg" value={t.ortg_factors} text={fixed(t.ortg_factors, 1)} />
        {INPUTS.map(k => <NumCell key={k} field={k} value={t.inputs[k]} text={percent(t.inputs[k], 1)} />)}
        <NumCell field="fg3a_rate" value={t.fg3a_rate} text={percent(t.fg3a_rate, 1)} />
        <NumCell field="possessions" value={t.possessions} text={t.possessions === null ? "—" : Math.round(t.possessions).toLocaleString("en-US")} />
      </TableRow>)}</TableBody>
    </Table>
  </Section>;
}

function Body({ data }: { data: FourFactorsSummary }) {
  const { get, set } = useUrlState();
  const latest = data.seasons.at(-1)!.season;
  const season = data.seasons.find(s => s.season === get("season")) ?? data.seasons.at(-1)!;
  const L = season.league;
  const paper = data.paper.published_2024_25;
  return <>
    <Section title={`League inputs, ${season.season}`}
      description={`Every regular-season game (${season.games.toLocaleString("en-US")}) counted from play-by-play. ORTG is ${data.paper.authors}'s ${data.paper.equation}: ${data.paper.formula}, times 100. It equals points per estimated possession exactly.`}
      actions={<Field label="Season" layout="inline"><Select aria-label="Season" value={season.season} onChange={e => set({ season: e.target.value === latest ? null : e.target.value })}>
        {[...data.seasons].reverse().map(s => <option key={s.season} value={s.season}>{s.season}</option>)}</Select></Field>}>
      <Table aria-label="League inputs" density="compact" data-table="league">
        <TableHeader><TableRow hoverable={false}><TableHead>Input</TableHead><TableHead align="right">League</TableHead></TableRow></TableHeader>
        <TableBody>
          <TableRow data-row="ortg"><TableCell>ORTG, Eq. (11)</TableCell><NumCell field="ortg" value={L.ortg_factors} text={fixed(L.ortg_factors, 2)} /></TableRow>
          <TableRow data-row="mu"><TableCell>mu, share of free throws that end a possession</TableCell><NumCell field="mu" value={season.mu} text={fixed(season.mu, 4)} /></TableRow>
          {INPUTS.map(k => <TableRow key={k} data-row={k}><TableCell>{INPUT_LABELS[k]}</TableCell><NumCell field={k} value={L.inputs[k]} text={percent(L.inputs[k], 2)} /></TableRow>)}
          <TableRow data-row="fg2"><TableCell>2P%</TableCell><NumCell field="fg2" value={L.fg2} text={percent(L.fg2, 2)} /></TableRow>
          <TableRow data-row="fg3"><TableCell>3P%</TableCell><NumCell field="fg3" value={L.fg3} text={percent(L.fg3, 2)} /></TableRow>
          <TableRow data-row="fg3a_rate"><TableCell>3PA rate (3PA/FGA)</TableCell><NumCell field="fg3a_rate" value={L.fg3a_rate} text={percent(L.fg3a_rate, 2)} /></TableRow>
          <TableRow data-row="ts"><TableCell>TS%</TableCell><NumCell field="ts" value={L.ts} text={percent(L.ts, 2)} /></TableRow>
          <TableRow data-row="possessions"><TableCell>Possessions, FGA + TOV − ORB + mu FTA</TableCell><NumCell field="possessions" value={L.possessions} text={L.possessions === null ? "—" : Math.round(L.possessions).toLocaleString("en-US")} /></TableRow>
        </TableBody>
      </Table>
    </Section>
    <Section title="Marginal value" description="Change in Eq. (11) ORTG when one input moves by one percentage point and the others stay at the league value.">
      <Table aria-label="Marginal value" density="compact" data-table="marginals">
        <TableHeader><TableRow hoverable={false}><TableHead>Change</TableHead><TableHead align="right">ORTG change</TableHead></TableRow></TableHeader>
        <TableBody>{Object.entries(L.marginals).map(([k, v]) => <TableRow key={k} data-row={k}>
          <TableCell>{MARGINAL_LABELS[k] ?? k}</TableCell><NumCell field="marginal" value={v} text={signed(v, 2)} />
        </TableRow>)}</TableBody>
      </Table>
    </Section>
    <Section title="Offensive rebounds by miss" description="After each kind of miss, the share of rebounds the shooting team took (team rebounds included). A miss followed by a shot, foul shot, turnover or period end before any rebound is unrebounded and left out of the rate.">
      <Table aria-label="Offensive rebounds by miss" density="compact" data-table="rebounds">
        <TableHeader><TableRow hoverable={false}>
          <TableHead>Miss</TableHead><TableHead align="right">Misses</TableHead><TableHead align="right">Offensive</TableHead><TableHead align="right">Defensive</TableHead>
          <TableHead align="right">Unrebounded</TableHead><TableHead align="right">OREB%</TableHead>
        </TableRow></TableHeader>
        <TableBody>{MISSES.map(k => { const r = L.rebounds_by_miss[k]; return <TableRow key={k} data-row={k}>
          <TableCell>{MISS_LABELS[k]}</TableCell>
          <NumCell field="misses" value={r.misses} text={r.misses.toLocaleString("en-US")} />
          <NumCell field="offensive" value={r.offensive} text={r.offensive.toLocaleString("en-US")} />
          <NumCell field="defensive" value={r.defensive} text={r.defensive.toLocaleString("en-US")} />
          <NumCell field="unrebounded" value={r.unrebounded} text={r.unrebounded.toLocaleString("en-US")} />
          <NumCell field="orb_rate" value={r.orb_rate} text={percent(r.orb_rate, 2)} />
        </TableRow>; })}</TableBody>
      </Table>
    </Section>
    <Section title="Against the paper" description="The paper's published 2024-25 league values (Appendix A and B) beside CourtLens's counts. Reported, not adjusted.">
      <Table aria-label="Against the paper" density="compact" data-table="paper">
        <TableHeader><TableRow hoverable={false}><TableHead>Value</TableHead><TableHead align="right">Paper, 2024-25</TableHead><TableHead align="right">CourtLens, 2024-25</TableHead></TableRow></TableHeader>
        <TableBody>{(() => { const s = data.seasons.find(x => x.season === "2024-25"); return s ? <>
          <TableRow data-row="mu"><TableCell>mu</TableCell><NumCell field="paper" value={paper.mu} text={fixed(paper.mu, 3)} /><NumCell field="courtlens" value={s.mu} text={fixed(s.mu, 3)} /></TableRow>
          <TableRow data-row="beta"><TableCell>Make rate of final free throws</TableCell><NumCell field="paper" value={paper.ft_end_make_rate} text={fixed(paper.ft_end_make_rate, 3)} /><NumCell field="courtlens" value={s.ft_end_make_rate} text={fixed(s.ft_end_make_rate, 3)} /></TableRow>
          <TableRow data-row="alpha"><TableCell>OREB% after a missed final free throw</TableCell><NumCell field="paper" value={paper.ft_end_orb_rate} text={fixed(paper.ft_end_orb_rate, 3)} /><NumCell field="courtlens" value={s.ft_end_orb_rate} text={fixed(s.ft_end_orb_rate, 3)} /></TableRow>
        </> : null; })()}</TableBody>
      </Table>
    </Section>
    <Section title="mu by season" description="Share of free throws that end a possession: the last of a two- or three-shot trip, or a lone free throw that is not an and-one.">
      <Table aria-label="mu by season" density="compact" data-table="mu">
        <TableHeader><TableRow hoverable={false}><TableHead>Season</TableHead><TableHead align="right">Games</TableHead><TableHead align="right">mu</TableHead><TableHead align="right">ORTG</TableHead><TableHead align="right">Games off final score</TableHead></TableRow></TableHeader>
        <TableBody>{data.seasons.map(s => <TableRow key={s.season} data-row={s.season}>
          <TableCell>{s.season}</TableCell>
          <NumCell field="games" value={s.games} text={s.games.toLocaleString("en-US")} />
          <NumCell field="mu" value={s.mu} text={fixed(s.mu, 4)} />
          <NumCell field="ortg" value={s.league.ortg_factors} text={fixed(s.league.ortg_factors, 2)} />
          <NumCell field="points_differ" value={s.games_points_differ} text={String(s.games_points_differ)} />
        </TableRow>)}</TableBody>
      </Table>
    </Section>
    <TeamsTable season={season.season} />
    <Section title="Caveats"><ul>{data.caveats.map(c => <li key={c}>{c}</li>)}</ul></Section>
    <Section title="Credits">
      <ul>{data.credits.map(c => <li key={c}>{c}</li>)}</ul>
      <p>Paper: <a href={data.paper.url}>{data.paper.authors}, “{data.paper.title}”</a>, arXiv:{data.paper.arxiv} ({data.paper.version}; first posted as “{data.paper.earlier_title}”).</p>
      <p>Registration <code>{data.registration.identity}</code> · <code data-field="registration-sha" data-value={data.registration.content_sha256}>{data.registration.content_sha256.slice(0, 16)}</code>; results <code data-field="results-sha" data-value={data.registration.results_sha256}>{data.registration.results_sha256.slice(0, 16)}</code>.</p>
    </Section>
  </>;
}

export function FourFactorsInputs() {
  const { data, error, loading, retry } = useFeed([], signal => getFourFactors(signal));
  if (error) return <FeedFailure error={error} retry={retry} what="Four-factor inputs" />;
  if (loading || !data) return <FeedSkeleton label="Loading four-factor inputs" />;
  return <div data-section="four-factors"><Body data={data} /></div>;
}
