"use client";

import Link from "next/link";
import { RankedBars } from "./charts";
import { ExampleNote, FeedFailure, FeedScopeFields, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { TeamIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { formatDate } from "@/lib/format-date";
import { PHASE_LABELS, fmt, getWowy, signed, type FeedPhase, type WowyCellName, type WowyView as WowyData } from "@/lib/stats-feeds";

const SOURCE = "CourtLens stints from public play-by-play";

function splitLabels(a: string, b: string): Record<WowyCellName, string> {
  return { both: "Both on", a_only: `${a} without ${b}`, b_only: `${b} without ${a}`, neither: "Neither on" };
}

function Body({ data, select }: { data: WowyData; select: (a: string, b: string) => void }) {
  const pair = data.selected;
  const name = (id: string) => data.players.find(p => p.player_id === id)?.player_name ?? `NBA player ${id}`;
  if (!pair) return <GatedNote>No pairs observed for this team and scope.</GatedNote>;
  const [a, b] = [name(pair.a), name(pair.b)];
  const labels = splitLabels(a, b);
  const order: WowyCellName[] = ["both", "a_only", "b_only", "neither"];
  const together = pair.cells.both, apart = pair.cells.neither;
  const query = (x: string, y: string) => `?${new URLSearchParams({ season: data.season, phase: data.phase, teamId: data.team.team_id, a: x, b: y })}`;
  return <ResearchLayout findings={<>
    <StatTile label="Shared Minutes" value={fmt(pair.shared_minutes, 0)} footnote={`${fmt(together.possessions_for, 0)} offensive possessions together`} />
    <StatTile label="Net Rating Together" value={together.small_sample ? null : signed(together.net_rating)} unit="per 100" footnote={together.small_sample ? "Small sample" : `${fmt(together.offensive_rating)} ORtg · ${fmt(together.defensive_rating)} DRtg`} />
    <StatTile label="Net With Neither On" value={apart.small_sample ? null : signed(apart.net_rating)} unit="per 100" footnote={apart.small_sample ? `Small sample · ${fmt(apart.minutes, 0)} min` : `${fmt(apart.minutes, 0)} minutes`} />
    <StatTile label="Together Minus Neither" value={signed(pair.net_together_minus_apart)} unit="per 100" footnote={pair.net_together_minus_apart == null ? "Not compared: a split is under the sample rule" : "Descriptive difference, not an effect"} />
  </>}>
    <div className="feed-subject">
      <TeamIdentity team={data.team.team_id} name={data.team.team_name} subtitle={`${data.season} · ${PHASE_LABELS[data.phase]} · through ${formatDate(data.last_game_date)}`} />
      <ExampleNote name={`${a} · ${b}`} rule={data.default_rule} />
    </div>
    <RankedBars title={`${a} and ${b}: net rating by who was on the floor`} measure="net rating per 100 possessions" source={SOURCE}
      sample={`${data.team.team_tricode} · ${fmt(data.team_total.minutes, 0)} team minutes · splits under ${data.min_possessions} possessions are muted`}
      note="Net rating = points scored minus allowed per 100 possessions in that split. Descriptive; teammates and opponents differ between splits."
      items={order.map(cell => ({ key: cell, name: labels[cell], label: labels[cell], value: pair.cells[cell].net_rating, formatted: signed(pair.cells[cell].net_rating),
        detail: `${fmt(pair.cells[cell].minutes, 0)} min · ${fmt(pair.cells[cell].possessions_for, 0)} off. poss${pair.cells[cell].small_sample ? " · small sample" : ""}`, muted: pair.cells[cell].small_sample }))} />
    <div className="table-wrapper research-table" role="region" aria-label="Split detail" tabIndex={0}>
      <table className="data-table"><caption>Each possession falls in exactly one split; the four add up to the team&apos;s total.</caption>
        <thead><tr><th>Split</th><th className="num">Minutes</th><th className="num">Off. poss</th><th className="num">Def. poss</th><th className="num">ORtg</th><th className="num">DRtg</th><th className="num">Net</th></tr></thead>
        <tbody>{order.map(cell => { const c = pair.cells[cell]; return <tr key={cell} data-muted={c.small_sample ? "true" : undefined}>
          <th scope="row">{labels[cell]}{c.small_sample && <small className="feed-cell-note">Small sample</small>}</th>
          <td className="num">{fmt(c.minutes, 0)}</td><td className="num">{fmt(c.possessions_for, 0)}</td><td className="num">{fmt(c.possessions_against, 0)}</td>
          <td className="num">{fmt(c.offensive_rating)}</td><td className="num">{fmt(c.defensive_rating)}</td><td className="num">{signed(c.net_rating)}</td>
        </tr>; })}
          <tr><th scope="row">Team total</th><td className="num">{fmt(data.team_total.minutes, 0)}</td><td className="num">{fmt(data.team_total.possessions_for, 0)}</td><td className="num">{fmt(data.team_total.possessions_against, 0)}</td>
            <td className="num">{fmt(data.team_total.offensive_rating)}</td><td className="num">{fmt(data.team_total.defensive_rating)}</td><td className="num">{signed(data.team_total.net_rating)}</td></tr>
        </tbody>
      </table>
    </div>
    <section className="research-section" aria-label="Every duo on this team">
      <h2>Every {data.team.team_tricode} duo</h2>
      <div className="table-wrapper research-table" role="region" aria-label="Team duo table" tabIndex={0}>
        <table className="data-table"><caption>The ten players with the most minutes, every pair, by shared minutes. Select a pair to chart it.</caption>
          <thead><tr><th>Duo</th><th className="num">Shared min</th><th className="num">Net together</th><th className="num">Net, neither on</th><th className="num">Difference</th></tr></thead>
          <tbody>{data.pairs.map(p => <tr key={`${p.a}-${p.b}`} data-selected={p === pair || (p.a === pair.a && p.b === pair.b) ? "true" : undefined}>
            <th scope="row"><Link href={query(p.a, p.b)} scroll={false}>{name(p.a)} · {name(p.b)}</Link></th>
            <td className="num">{fmt(p.shared_minutes, 0)}</td>
            <td className="num">{p.cells.both.small_sample ? "Small sample" : signed(p.cells.both.net_rating)}</td>
            <td className="num">{p.cells.neither.small_sample ? "Small sample" : signed(p.cells.neither.net_rating)}</td>
            <td className="num">{signed(p.net_together_minus_apart)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="research-caption"><button className="feed-link-button" onClick={() => select(pair.b, pair.a)}>Swap A and B</button></p>
    </section>
  </ResearchLayout>;
}

/** PC11 WOWY: with-or-without splits for any duo, derived from sealed IM03 stints (D4). */
export function WowyView() {
  const { get, set } = useUrlState();
  const season = get("season"), phase = get("phase"), teamId = get("teamId"), a = get("a"), b = get("b");
  const { data, error, loading, retry } = useFeed([season, phase, teamId, a, b], signal => getWowy({ season, phase, teamId, a, b }, signal));
  const pair = data?.selected;
  const select = (x: string, y: string) => set({ a: x, b: y, teamId: data?.team.team_id ?? teamId, season: data?.season ?? season, phase: data?.phase ?? phase });
  return <PageShell template="research" className="feed-page">
    <PageHeader title="WOWY" subtitle="With or without you: how a team played with both, one or neither of two players on the floor."
      actions={data && <DataDetailsButton rows={[
        { label: "Scope", value: `${data.season} · ${PHASE_LABELS[data.phase]} · games through ${formatDate(data.last_game_date)}` },
        { label: "Source", value: data.source },
        { label: "Sample rule", value: `${data.min_possessions}+ possessions at each end of a split` },
        { label: "WOWY artifact", value: data.artifact_sha256, mono: true },
        { label: "IM03 acceptance", value: data.inputs.acceptance_sha256, mono: true },
      ]}><ul className="feed-limitations">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></DataDetailsButton>} />
    {data && <FilterBar label="WOWY filters" summary={`${data.team.team_tricode} · ${data.season}`}
      scope={<FeedScopeFields scopes={data.scopes} season={data.season} phase={data.phase} onChange={next => set({ season: next.season, phase: next.phase as FeedPhase, a: null, b: null })} />}
      filters={<>
        <Field label="Team" layout="inline"><Select aria-label="Team" value={data.team.team_id} onChange={e => set({ teamId: e.target.value, a: null, b: null, season: data.season, phase: data.phase })}>
          {data.teams.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}</Select></Field>
        {pair && <>
          <Field label="Player A" layout="inline"><Select aria-label="Player A" value={pair.a} onChange={e => select(e.target.value, e.target.value === pair.b ? pair.a : pair.b)}>
            {data.players.map(p => <option key={p.player_id} value={p.player_id}>{p.player_name}</option>)}</Select></Field>
          <Field label="Player B" layout="inline"><Select aria-label="Player B" value={pair.b} onChange={e => select(e.target.value === pair.a ? pair.b : pair.a, e.target.value)}>
            {data.players.map(p => <option key={p.player_id} value={p.player_id}>{p.player_name}</option>)}</Select></Field>
        </>}
      </>}
      count={<CountChip>{data.pairs.length} duos</CountChip>} />}
    {error && <FeedFailure error={error} retry={retry} what="WOWY" />}
    {loading && <FeedSkeleton label="Loading WOWY splits" />}
    {data && <Body data={data} select={select} />}
  </PageShell>;
}
