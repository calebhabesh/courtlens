"use client";

import { useState } from "react";
import Link from "next/link";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { Button, Segmented, Select } from "./ui/kit";
import { PageHeader, Panel, Section } from "./ui/panel";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { seasonEra } from "@/lib/portrait-source";
import {
  getDefensiveCards, getDefensiveSummary, type DefenseBoard, type DefenseCard, type DefenseSort, type DefenseSummary, type ShotKind
} from "@/lib/shot-decomposition";
import { formatFixed, formatInterval, formatShare, formatSigned, formatWhole, signTone } from "@/lib/shot-quality";

/**
 * Research → Defensive Shot Quality (R06). A plain build-phase page after the saved Databallr D-ShotQuality
 * card grid. Every number is the frozen courtlens-defensive-shot-quality-v1 results' (the RAPM headline is
 * courtlens-shot-decomposition-v1's dSQ); exact values sit on `data-value`.
 */
const LATEST = "2025-26";
const PAGE = 6;
const KINDS: { value: ShotKind; label: string }[] = [{ value: "all", label: "All" }, { value: "2pt", label: "2PT" }, { value: "3pt", label: "3PT" }];
const SORTS: { value: DefenseSort; label: string }[] = [
  { value: "dsq", label: "D-SQ" }, { value: "rapm", label: "D-SQ RAPM" }, { value: "fga", label: "Shots defended" },
  { value: "xpps", label: "Expected PPS (lowest)" }, { value: "pps", label: "Actual PPS (lowest)" },
];

function Card({ card, position, season, kind }: { card: DefenseCard; position: number; season: string; kind: ShotKind }) {
  const v = card.value;
  const stats = [
    { key: "fga", label: `Shots (${kind === "all" ? "All" : kind === "2pt" ? "2PT" : "3PT"})`, value: v.fga, text: formatWhole(v.fga), rank: card.rank?.fga },
    { key: "xpps", label: "Opp. expected PPS", value: v.xpps, text: formatFixed(v.xpps, 2), rank: card.rank?.xpps },
    { key: "pps", label: "Opp. actual PPS", value: v.pps, text: formatFixed(v.pps, 2), rank: card.rank?.pps },
  ];
  return <Panel data-card={card.player_id} title={<span>#{position}</span>}>
    <PlayerIdentity playerId={card.player_id} name={card.player_name} team={card.tricode} size="md" era={seasonEra(season, card.tricode)} href={`/players/${card.player_id}?season=${season}`} />
    <Table aria-label={`${card.player_name} matchup shooting`} density="compact" data-table="stats">
      <TableHeader><TableRow hoverable={false}><TableHead>Stat</TableHead><TableHead align="right">Value</TableHead><TableHead align="right">Rank</TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow data-stat="rapm">
          <TableCell>D-SQ RAPM (80%){card.rapm.reason && <><br /><small>{card.rapm.reason}</small></>}</TableCell>
          <TableCell numeric tone={signTone(card.rapm.value)} data-field="rapm" data-value={card.rapm.value ?? ""} data-low={card.rapm.interval?.[0] ?? ""} data-high={card.rapm.interval?.[1] ?? ""}>
            {card.rapm.value == null ? "unknown" : <>{formatSigned(card.rapm.value, 2)}<br /><small>{formatInterval(card.rapm.interval, x => formatSigned(x, 2))}</small></>}
          </TableCell>
          <TableCell numeric>—</TableCell>
        </TableRow>
        <TableRow data-stat="dsq">
          <TableCell>D-SQ per 100 (95%){card.reason && <><br /><small>{card.reason}</small></>}</TableCell>
          <TableCell numeric tone={signTone(v.dsq)} data-field="dsq" data-value={v.dsq ?? ""} data-low={v.interval?.[0] ?? ""} data-high={v.interval?.[1] ?? ""}>
            {v.dsq == null ? "unknown" : <>{formatSigned(v.dsq)}<br /><small>{formatInterval(v.interval, x => formatSigned(x))}</small></>}
          </TableCell>
          <TableCell numeric data-value={card.rank?.dsq ?? ""}>{card.rank ? `#${card.rank.dsq}` : "—"}</TableCell>
        </TableRow>
        {stats.map(s => <TableRow key={s.key} data-stat={s.key}>
          <TableCell>{s.label}</TableCell>
          <TableCell numeric data-field={s.key} data-value={s.value ?? ""}>{s.text}</TableCell>
          <TableCell numeric data-value={s.rank ?? ""}>{s.rank ? `#${s.rank}` : "—"}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
    <Table aria-label={`${card.player_name} key matchups`} density="compact" data-table="key-matchups">
      <TableHeader><TableRow hoverable={false}><TableHead>Key matchups</TableHead></TableRow></TableHeader>
      <TableBody>{card.key_matchups.map(m => <TableRow key={m.player_id} data-matchup={m.player_id}>
        <TableCell><PlayerIdentity playerId={m.player_id} name={m.player_name} team={m.tricode} size="sm" era={seasonEra(season, m.tricode)} href={`/players/${m.player_id}?season=${season}`}
          subtitle={<><span data-field="fga" data-value={m.fga}>{formatWhole(m.fga)} FGA</span> · <span data-field="xpps" data-value={m.xpps}>{formatFixed(m.xpps, 2)} xPPS</span> · <span data-field="pps" data-value={m.pps}>{formatFixed(m.pps, 2)} PPS</span></>} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Panel>;
}

function Grid({ board }: { board: DefenseBoard }) {
  const [shown, setShown] = useState(PAGE);
  return <>
    <p data-count={board.rows.length}>{board.defenders_served} defenders with at least 300 matchup attempts in {board.season}; {board.unknown_count} with fewer have no value. {board.interval_excludes_zero} of {board.defenders_served} have an all-shots interval that excludes zero. League: {formatFixed(board.league.pps)} PPS against {formatFixed(board.league.xpps)} expected.</p>
    <div className="ui-design-foundation-grid" data-grid="defenders">
      {board.rows.slice(0, shown).map((card, i) => <Card key={card.player_id} card={card} position={i + 1} season={board.season} kind={board.kind} />)}
    </div>
    {shown < board.rows.length && <Button onClick={() => setShown(s => s + PAGE)}>Show next {Math.min(PAGE, board.rows.length - shown)} players ({shown}/{board.rows.length} shown)</Button>}
  </>;
}

function Checks({ summary }: { summary: DefenseSummary }) {
  const seasons = Object.keys(summary.seasons).sort();
  const p = summary.persistence.correlations;
  const a = summary.agreement_with_rapm.correlations;
  return <>
    <Section title="Is it signal?" description="Reported checks, registered before any defender value was computed. No gate.">
      <Table aria-label="Reported checks" density="compact" data-table="checks">
        <TableHeader><TableRow hoverable={false}><TableHead>Check</TableHead><TableHead align="right">r</TableHead><TableHead align="right">95% interval</TableHead><TableHead align="right">Pairs</TableHead></TableRow></TableHeader>
        <TableBody>{([
          ["persistence-dsq", "D-SQ, season to next season", p.dsq, summary.persistence.pairs],
          ["persistence-pps", "Actual PPS, season to next season", p.pps, summary.persistence.pairs],
          ["persistence-xpps", "Expected PPS, season to next season (who they guard)", p.xpps, summary.persistence.pairs],
          ["agreement-make", "D-SQ against dContest, same season", a.make, summary.agreement_with_rapm.pairs],
          ["agreement-sq", "D-SQ against dSQ, same season", a.sq, summary.agreement_with_rapm.pairs],
          ["agreement-ts", "D-SQ against dTS, same season", a.ts, summary.agreement_with_rapm.pairs],
        ] as const).map(([key, label, c, pairs]) => <TableRow key={key} data-row={key}>
          <TableCell>{label}</TableCell><TableCell numeric data-value={c.r}>{formatFixed(c.r)}</TableCell>
          <TableCell numeric data-value={c.interval[0]} data-high={c.interval[1]}>{formatInterval(c.interval, x => formatFixed(x))}</TableCell>
          <TableCell numeric data-value={pairs}>{formatWhole(pairs)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <Table aria-label="By season" density="compact" data-table="seasons">
        <TableHeader><TableRow hoverable={false}><TableHead>Season</TableHead><TableHead align="right">Games</TableHead><TableHead align="right">Defenders served</TableHead><TableHead align="right">Interval excludes 0</TableHead><TableHead align="right">Share</TableHead><TableHead align="right">Median width</TableHead><TableHead align="right">League PPS</TableHead><TableHead align="right">Expected PPS</TableHead></TableRow></TableHeader>
        <TableBody>{seasons.map(s => { const b = summary.seasons[s]; return <TableRow key={s} data-season={s}>
          <TableCell>{s}</TableCell>
          <TableCell numeric data-value={b.games}>{formatWhole(b.games)}</TableCell>
          <TableCell numeric data-value={b.defenders_served}>{b.defenders_served}</TableCell>
          <TableCell numeric data-value={b.interval_excludes_zero}>{b.interval_excludes_zero}</TableCell>
          <TableCell numeric data-value={b.interval_excludes_zero_share}>{formatShare(b.interval_excludes_zero_share)}</TableCell>
          <TableCell numeric data-value={b.median_interval_width}>{formatFixed(b.median_interval_width, 1)}</TableCell>
          <TableCell numeric data-value={b.league.all.pps}>{formatFixed(b.league.all.pps)}</TableCell>
          <TableCell numeric data-value={b.league.all.xpps}>{formatFixed(b.league.all.xpps)}</TableCell>
        </TableRow>; })}</TableBody>
      </Table>
    </Section>
    <Section title="How to read the cards"><ul>
      {(["dsq", "rapm", "xpps", "pps", "fga", "interval", "hindsight"] as const).map(k => <li key={k}>{summary.definitions[k]}</li>)}
      <li>Key matchups always count all shots, whichever shot type is selected, and are small samples.</li>
      <li>Green is better than expected, red worse. Expected and actual PPS have no colour: ranks run from the lowest, and a low expected PPS says who was guarded, not how well.</li>
    </ul></Section>
    <Section title="Method and data"><ul>
      <li>{summary.credit}</li><li>{summary.reference_note}</li>
      <li>NBA tracking&apos;s closest-defender season numbers and hustle stats are on the <Link href="/research/defensive-matchups/tracking">Tracking page</Link>.</li>
    </ul>
      <p>Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</p>
    </Section>
  </>;
}

export function DefensiveShotQualityView() {
  const { get, set } = useUrlState();
  const season = get("season") ?? LATEST;
  const kind = (get("kind") ?? "all") as ShotKind;
  const sort = (get("sort") ?? "dsq") as DefenseSort;
  const team = get("team");
  const summary = useFeed([], signal => getDefensiveSummary(signal));
  const { data, error, loading, retry } = useFeed([season, kind, sort, team], signal => getDefensiveCards(season, kind, sort, team, signal));
  const s = summary.data;
  return <PageShell template="research">
    <PageHeader icon="shield" title="Defensive Shot Quality" subtitle="What shooters scored against each defender, against what their own shooting predicts. From free NBA matchup data, 2017-18 onward." />
    {summary.error && <FeedFailure error={summary.error} retry={summary.retry} what="Defensive Shot Quality" />}
    <ResearchLayout findings={s && <>
      <StatTile label="Interval excludes zero" value={formatShare(s.signal.share)} footnote={`${formatWhole(s.signal.interval_excludes_zero)} of ${formatWhole(s.signal.defender_seasons)} defender-seasons; 5% if no defender differed`} />
      <StatTile label="D-SQ, next season" value={`r ${formatFixed(s.persistence.correlations.dsq.r, 2)}`} footnote={`${formatInterval(s.persistence.correlations.dsq.interval, x => formatFixed(x, 2))}, ${formatWhole(s.persistence.pairs)} pairs`} />
      <StatTile label="D-SQ and dContest" value={`r ${formatFixed(s.agreement_with_rapm.correlations.make.r, 2)}`} footnote={`${formatInterval(s.agreement_with_rapm.correlations.make.interval, x => formatFixed(x, 2))}, ${formatWhole(s.agreement_with_rapm.pairs)} player-seasons`} />
    </>}>
      <Section title="Defenders" description="Ranked by points per 100 matchup attempts below what the shooters' own season shooting predicts. Positive is good. Overlapping intervals do not rank two defenders."
        actions={<>
          <Field label="Season" layout="inline"><Select aria-label="Season" value={season} onChange={event => set({ season: event.target.value === LATEST ? null : event.target.value, team: null })}>
            {(data?.seasons ?? [LATEST]).slice().reverse().map(x => <option key={x} value={x}>{x}</option>)}</Select></Field>
          <Field label="Team" layout="inline"><Select aria-label="Team" value={team ?? ""} onChange={event => set({ team: event.target.value || null })}>
            <option value="">All teams</option>
            {data?.status === "available" && data.teams.map(t => <option key={t.team_id} value={t.tricode ?? t.team_id}>{t.tricode ?? t.team_id}</option>)}</Select></Field>
          <Field label="Rank by" layout="inline"><Select aria-label="Rank by" value={sort} onChange={event => set({ sort: event.target.value === "dsq" ? null : event.target.value })}>
            {SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Segmented label="Shot type" size="sm" value={kind} onChange={next => set({ kind: next === "all" ? null : next })} options={KINDS} />
        </>}>
        {error && <FeedFailure error={error} retry={retry} what="The defender cards" />}
        {loading && <FeedSkeleton label="Loading the defender cards" />}
        {data?.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
        {data?.status === "available" && <Grid key={`${season}:${kind}:${sort}:${team}`} board={data} />}
      </Section>
      {s && <Checks summary={s} />}
    </ResearchLayout>
  </PageShell>;
}
