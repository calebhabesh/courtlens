"use client";

import Link from "next/link";
import { useState } from "react";
import { PercentileCell, RankedBars } from "./charts";
import { ExampleNote, FeedDetails, FeedFailure, FeedScopeFields, FeedSkeleton, PlayerPicker, useFeed, useUrlState } from "./stats-feed-ui";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { fmt, getDefense, pct, signed, sourceLabel, type Defender, type DefenseView, type FeedPhase, type MatchupDetail } from "@/lib/stats-feeds";
import { Button } from "./ui/kit";

const TABLE_LIMIT = 50;
const COHORT = "qualified defenders in this season, phase and shot category";

export function MatchupTable({ detail, caption, scope }: { detail: MatchupDetail; caption: string; scope: string }) {
  const other = detail.side === "defense" ? "Offensive player" : "Defender";
  return <div className="table-wrapper research-table" role="region" aria-label={caption} tabIndex={0}>
    <table className="data-table"><caption>{caption}</caption>
      <thead><tr><th>{other}</th><th className="num">Games</th><th className="num">Matchup min</th><th className="num">Partial poss.</th><th className="num">Points</th><th className="num">Pts / 100</th><th className="num">FG</th><th className="num">3P</th></tr></thead>
      <tbody>{detail.rows.length ? detail.rows.map(row => <tr key={row.player_id}>
        <th scope="row"><Link href={`/players/${row.player_id}?${scope}`}>{row.player_name}</Link></th>
        <td className="num">{row.games ?? "—"}</td><td className="num">{fmt(row.matchup_minutes)}</td><td className="num">{fmt(row.partial_possessions)}</td>
        <td className="num">{fmt(row.player_points, 0)}</td><td className="num">{fmt(row.points_per_100)}</td>
        <td className="num">{row.fga == null ? "—" : `${fmt(row.fgm, 0)}/${fmt(row.fga, 0)}`}</td><td className="num">{row.fg3a == null ? "—" : `${fmt(row.fg3m, 0)}/${fmt(row.fg3a, 0)}`}</td>
      </tr>) : <tr><td colSpan={8}>No matchups observed in this scope.</td></tr>}</tbody>
    </table>
  </div>;
}

function leader(players: Defender[], key: keyof Defender, lowest = false): Defender | null {
  const known = players.filter(p => p.qualified && typeof p[key] === "number");
  if (!known.length) return null;
  return known.reduce((best, p) => ((p[key] as number) < (best[key] as number)) === lowest ? p : best);
}

function Body({ data, setFocus, scope }: { data: DefenseView; setFocus: (id: string) => void; scope: string }) {
  const [all, setAll] = useState(false);
  const qualified = data.players.filter(p => p.qualified);
  const saves = leader(data.players, "makes_below_expected");
  const stingy = leader(data.players, "fg_pct_difference", true);
  const contests = leader(data.players, "contested_shots_per_game");
  const top = qualified.filter(p => p.makes_below_expected != null).slice(0, 12);
  const shown = all ? data.players : data.players.slice(0, TABLE_LIMIT);
  const source = sourceLabel(data.sources);
  const cell = (p: Defender, key: keyof Defender & string, value: string, label: string) =>
    <td className="num"><PercentileCell value={value} percentile={p.percentiles[key] ?? null} qualified={p.qualified} label={`${p.player_name} ${label}`} cohort={COHORT} /></td>;
  return <ResearchLayout findings={<>
    <StatTile label="Most Makes Saved" value={saves ? fmt(saves.makes_below_expected) : null} footnote={saves ? `${saves.player_name} · below expected` : "No qualified defender"} />
    <StatTile label="Lowest FG% vs Expected" value={stingy ? signed((stingy.fg_pct_difference ?? 0) * 100) : null} unit="pts" footnote={stingy?.player_name} />
    <StatTile label="Most Contests / Game" value={contests ? fmt(contests.contested_shots_per_game) : null} footnote={contests?.player_name} />
    <StatTile label="Qualified Defenders" value={qualified.length.toLocaleString("en-US")} footnote={`${data.qualification.games}+ games and ${data.qualification.defended_fga}+ defended shots`} />
  </>}>
    <RankedBars title="Makes below expected, top 12" measure="makes below expected" source={source}
      sample={`${qualified.length} qualified defenders · ${data.categories.find(c => c.value === data.category)?.label ?? data.category}`}
      note="Expected = the shooters' normal FG% on these shots. Descriptive, not blame or credit."
      items={top.map(p => ({ key: p.player_id, name: p.player_name, label: <Link href={`/players/${p.player_id}?${scope}`}>{p.player_name}</Link>, detail: `${p.team_tricode ?? "—"} · ${fmt(p.defended_fga, 0)} shots · ${pct(p.defended_fg_pct)} vs ${pct(p.expected_fg_pct)}`, value: p.makes_below_expected, formatted: fmt(p.makes_below_expected) }))} />
    {data.detail ? <section className="panel research-section" aria-label="Who this defender guarded">
      <h2>Who {data.detail.player_name} guarded</h2>
      <div className="feed-subject">
        <PlayerIdentity playerId={data.detail.player_id} name={data.detail.player_name} href={`/players/${data.detail.player_id}?${scope}`}
          subtitle={data.players.find(p => p.player_id === data.detail!.player_id)?.team_tricode ?? undefined} />
        <ExampleNote name={data.detail.player_name} rule={data.focus_rule} />
      </div>
      <div className="feed-inline-controls"><PlayerPicker label="Defender" value={data.detail.player_id} players={data.players} onChange={setFocus} /></div>
      <div className="feed-detail-stats">
        <span><strong>{fmt(data.detail.matchup_minutes, 0)}</strong> matchup minutes</span>
        <span><strong>{data.detail.opponents}</strong> players guarded</span>
        <span><strong>{fmt(data.detail.points_per_100)}</strong> points allowed / 100 partial poss.</span>
        <span><strong>{pct(data.detail.fg_pct)}</strong> FG allowed</span>
      </div>
      <MatchupTable detail={data.detail} caption="Most-guarded offensive players, by partial possessions" scope={scope} />
    </section> : <GatedNote why="NBA matchup feeds were observed empty for this phase; empty is unknown, not zero.">No matchup data in this scope.</GatedNote>}
    <section className="research-section" aria-label="Defenders">
      <h2>Defenders</h2>
      <div className="table-wrapper research-table" role="region" aria-label="Defender table" tabIndex={0}>
        <table className="data-table feed-percentile-table">
          <caption>Shaded cells are percentiles among {COHORT}; muted cells are small samples.</caption>
          <thead><tr><th>Defender</th><th className="num">Games</th><th className="num">Defended FGA</th><th className="num">FG% allowed</th><th className="num">Expected</th><th className="num">Diff (pts)</th><th className="num">Makes saved</th><th className="num">Contests / G</th><th className="num">Deflections / G</th><th className="num">Matchup pts / 100</th></tr></thead>
          <tbody>{shown.map(p => <tr key={p.player_id}>
            <th scope="row"><Link href={`/players/${p.player_id}?${scope}`}>{p.player_name}</Link><small className="feed-cell-note">{p.team_tricode ?? "—"}{p.qualified ? "" : " · small sample"}</small></th>
            <td className="num">{p.games ?? "—"}</td><td className="num">{fmt(p.defended_fga, 0)}</td>
            {cell(p, "fg_pct_difference", pct(p.defended_fg_pct), "FG% allowed")}
            <td className="num">{pct(p.expected_fg_pct)}</td>
            <td className="num">{p.fg_pct_difference == null ? "—" : signed(p.fg_pct_difference * 100)}</td>
            {cell(p, "makes_below_expected", fmt(p.makes_below_expected), "makes below expected")}
            {cell(p, "contested_shots_per_game", fmt(p.contested_shots_per_game), "contests per game")}
            {cell(p, "deflections_per_game", fmt(p.deflections_per_game), "deflections per game")}
            {cell(p, "matchup_points_per_100", fmt(p.matchup_points_per_100), "matchup points per 100")}
          </tr>)}</tbody>
        </table>
      </div>
      {data.players.length > TABLE_LIMIT && <Button size="lg" onClick={() => setAll(v => !v)}>{all ? `Show First ${TABLE_LIMIT}` : `Show All ${data.players.length} Defenders`}</Button>}
    </section>
  </ResearchLayout>;
}

/** PC11 Defensive Matchups: populated from NBA tracking defense, hustle and season matchups. */
export function DefensiveMatchupsView() {
  const { get, set } = useUrlState();
  const season = get("season"), phase = get("phase"), category = get("category") ?? "overall", playerId = get("playerId");
  const { data, error, loading, retry } = useFeed([season, phase, category, playerId], signal => getDefense({ season, phase, category, playerId }, signal));
  const scope = data ? new URLSearchParams({ season: data.season, phase: data.phase }).toString() : "";
  return <PageShell template="research" className="feed-page">
    <PageHeader title="Defensive Matchups" subtitle={data ? `${data.label} · shots defended versus expectation, hustle and who guarded whom` : "Shots defended versus expectation, hustle and who guarded whom"} actions={data && <FeedDetails envelope={data} />} />
    {data && <FilterBar label="Defense filters" summary={data.label}
      scope={<FeedScopeFields scopes={data.scopes} season={data.season} phase={data.phase} onChange={next => set({ season: next.season, phase: next.phase as FeedPhase, playerId: null })} />}
      filters={<Field label="Shots" layout="inline"><Select aria-label="Shot category" value={data.category} onChange={event => set({ category: event.target.value === "overall" ? null : event.target.value })}>
        {data.categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>}
      count={<CountChip>{data.players.length} defenders</CountChip>} />}
    {error && <FeedFailure error={error} retry={retry} what="Defensive Matchups" />}
    {loading && <FeedSkeleton label="Loading defensive matchups" />}
    {data && <Body data={data} scope={scope} setFocus={id => set({ playerId: id })} />}
  </PageShell>;
}
