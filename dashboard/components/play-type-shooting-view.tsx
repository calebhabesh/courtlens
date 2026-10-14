"use client";

import Link from "next/link";
import { useState } from "react";
import { DeltaChip, PercentileCell, RankedBars } from "./charts";
import { ExampleNote, FeedDetails, FeedFailure, FeedScopeFields, FeedSkeleton, PlayerPicker, useFeed, useUrlState } from "./stats-feed-ui";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { PlayerIdentity } from "./ui/identity";
import { ResearchLayout } from "./ui/page-shell";
import { StatTile } from "./ui/stat-tile";
import { fmt, getPlayTypes, pct, signed, sourceLabel, type FeedPhase, type PlayTypePlayer, type PlayTypesView } from "@/lib/stats-feeds";
import { Button, Segmented } from "./ui/kit";

const TABLE_LIMIT = 50;

function Focus({ data, player, scope, setFocus }: { data: PlayTypesView; player: PlayTypePlayer; scope: string; setFocus: (id: string) => void }) {
  const offense = data.side === "offensive";
  return <section className="panel research-section" aria-label="Play-type breakdown">
    <div className="feed-subject">
      <PlayerIdentity playerId={player.player_id} name={player.player_name} href={`/players/${player.player_id}?${scope}`} subtitle={`${player.team_tricodes.join(" / ")} · ${fmt(player.possessions, 0)} play-type possessions`} />
      <ExampleNote name={player.player_name} rule={data.focus_rule} />
    </div>
    <div className="feed-inline-controls"><PlayerPicker label="Player" value={player.player_id} players={data.players} onChange={setFocus} /></div>
    <div className="table-wrapper research-table" role="region" aria-label="Play-type breakdown table" tabIndex={0}>
      <table className="data-table">
        <caption>{offense ? "Points" : "Points allowed"} per possession by play type, against the league rate for the same play type. Chips show the difference in the better direction&apos;s color.</caption>
        <thead><tr><th>Play type</th><th className="num">Possessions</th><th className="num">Share</th><th className="num">{offense ? "PPP" : "PPP allowed"}</th><th className="num">League</th><th className="num">Difference</th><th className="num">FG%</th></tr></thead>
        <tbody>{(player.breakdown ?? []).map(row => <tr key={row.play_type}>
          <th scope="row">{row.label}</th>
          <td className="num">{fmt(row.possessions, 0)}</td><td className="num">{pct(row.share, 0)}</td>
          <td className="num">{fmt(row.points_per_possession, 2)}</td><td className="num">{fmt(row.league_points_per_possession, 2)}</td>
          <td className="num"><DeltaChip a={row.points_per_possession} b={row.league_points_per_possession} direction={offense ? "high" : "low"} names={[player.player_name, "League"]} precision={2} unit="PPP" /></td>
          <td className="num">{pct(row.fg_pct)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function Body({ data, scope, setFocus }: { data: PlayTypesView; scope: string; setFocus: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const offense = data.side === "offensive";
  const qualified = data.players.filter(p => p.qualified && p.adjusted_per_100 != null);
  const top = qualified.slice(0, 12);
  const best = qualified[0];
  const busiest = data.league[0];
  const leaguePpp = data.league.reduce((sum, row) => sum + row.points, 0) / Math.max(1, data.league.reduce((sum, row) => sum + row.possessions, 0));
  const shown = all ? data.players : data.players.slice(0, TABLE_LIMIT);
  const cohort = `${qualified.length} players with ${data.qualification.possessions}+ play-type possessions`;
  return <ResearchLayout findings={<>
    <StatTile label={offense ? "Top Adjusted Scorer" : "Stingiest Adjusted Defender"} value={best ? signed(best.adjusted_per_100) : null} unit="per 100" footnote={best?.player_name} />
    <StatTile label="League Play-Type PPP" value={fmt(leaguePpp, 3)} footnote={`${data.league.length} play types listed`} />
    <StatTile label="Most Common Play Type" value={busiest?.label ?? null} footnote={busiest ? `${fmt(busiest.points_per_possession, 3)} PPP league-wide` : undefined} />
    <StatTile label="Qualified Players" value={qualified.length.toLocaleString("en-US")} footnote={`${data.qualification.possessions}+ possessions`} />
  </>}>
    <RankedBars title={offense ? "Points per 100 above the play-type expectation" : "Points allowed per 100 versus the play-type expectation"} measure="points per 100 versus expectation"
      source={sourceLabel(data.sources)} sample={cohort}
      note={offense ? "Expectation = what the league scored on the same mix of play types." : "Lower is better on defense: negative bars allowed fewer points than the league on the same mix."}
      items={top.map(p => ({ key: p.player_id, name: p.player_name, label: <Link href={`/players/${p.player_id}?${scope}`}>{p.player_name}</Link>,
        detail: `${fmt(p.points_per_possession, 2)} vs ${fmt(p.expected_points_per_possession, 2)} PPP · ${fmt(p.possessions, 0)} poss`, value: p.adjusted_per_100, formatted: signed(p.adjusted_per_100) }))} />
    {data.focus && <Focus data={data} player={data.focus} scope={scope} setFocus={setFocus} />}
    <section className="research-section" aria-label="Player table">
      <h2>{offense ? "Scorers" : "Defenders"}</h2>
      <div className="table-wrapper research-table" role="region" aria-label="Play-type player table" tabIndex={0}>
        <table className="data-table feed-percentile-table">
          <caption>Shaded cells are percentiles among {cohort}; muted cells are small samples.</caption>
          <thead><tr><th>Player</th><th className="num">Possessions</th><th className="num">{offense ? "PPP" : "PPP allowed"}</th><th className="num">Expected</th><th className="num">Adjusted / 100</th><th>Most used</th></tr></thead>
          <tbody>{shown.map(p => <tr key={p.player_id}>
            <th scope="row"><button className="feed-link-button" onClick={() => setFocus(p.player_id)}>{p.player_name}</button><small className="feed-cell-note">{p.team_tricodes.join(" / ")}{p.qualified ? "" : " · small sample"}</small></th>
            <td className="num">{fmt(p.possessions, 0)}</td>
            <td className="num"><PercentileCell value={fmt(p.points_per_possession, 3)} percentile={p.percentiles.points_per_possession ?? null} qualified={p.qualified} label={`${p.player_name} PPP`} cohort={cohort} /></td>
            <td className="num">{fmt(p.expected_points_per_possession, 3)}</td>
            <td className="num"><PercentileCell value={signed(p.adjusted_per_100)} percentile={p.percentiles.adjusted_per_100 ?? null} qualified={p.qualified} label={`${p.player_name} adjusted per 100`} cohort={cohort} /></td>
            <td>{data.league.find(row => row.play_type === p.top_play_type)?.label ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {data.players.length > TABLE_LIMIT && <Button size="lg" onClick={() => setAll(v => !v)}>{all ? `Show first ${TABLE_LIMIT}` : `Show all ${data.players.length} players`}</Button>}
    </section>
  </ResearchLayout>;
}

/** PC11 Playtype-adjusted shooting: NBA Synergy play types against the league rate per play type. */
export function PlayTypeShootingView() {
  const { get, set } = useUrlState();
  const season = get("season"), phase = get("phase"), playerId = get("playerId"), side = get("side") === "defensive" ? "defensive" : "offensive";
  const { data, error, loading, retry } = useFeed([season, phase, side, playerId], signal => getPlayTypes({ season, phase, side, playerId }, signal));
  const scope = data ? new URLSearchParams({ season: data.season, phase: data.phase }).toString() : "";
  return <>
    {data && <FilterBar label="Play-type filters" summary={data.label}
      scope={<FeedScopeFields scopes={data.scopes} season={data.season} phase={data.phase} onChange={next => set({ season: next.season, phase: next.phase as FeedPhase, playerId: null })} />}
      modes={<Segmented size="lg" label="Side" value={side} onChange={value => set({ side: value === "defensive" ? "defensive" : null, playerId: null })}
        options={[{ value: "offensive", label: "Offense" }, { value: "defensive", label: "Defense" }]} />}
      count={<CountChip>{data.players.length} players</CountChip>} details={<FeedDetails envelope={data} />} />}
    {error && <FeedFailure error={error} retry={retry} what="Playtype-adjusted shooting" />}
    {loading && <FeedSkeleton label="Loading play types" />}
    {data && <Body data={data} scope={scope} setFocus={id => set({ playerId: id })} />}
  </>;
}
