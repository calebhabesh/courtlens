"use client";

import Link from "next/link";
import { RankedBars } from "./charts";
import { MatchupTable } from "./defensive-matchups-view";
import { ExampleNote, FeedDetails, FeedFailure, FeedScopeFields, FeedSkeleton, PlayerLookup, useFeed, useUrlState } from "./stats-feed-ui";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { PlayerIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { fmt, getSeasonMatchups, pct, sourceLabel, type FeedPhase } from "@/lib/stats-feeds";
import { Segmented } from "./ui/kit";

/** PC11 Player Matchups from NBA tracking season matchups: who guarded a player, or whom they guarded. */
export function SeasonMatchupsView() {
  const { get, set } = useUrlState();
  const season = get("season"), phase = get("phase"), playerId = get("playerId"), side = get("side") === "defense" ? "defense" : "offense";
  const { data, error, loading, retry } = useFeed([season, phase, playerId, side], signal => getSeasonMatchups({ season, phase, playerId, side }, signal));
  const detail = data?.detail;
  const scope = data ? new URLSearchParams({ season: data.season, phase: data.phase }).toString() : "";
  const verb = side === "offense" ? "Who guarded" : "Who was guarded by";
  return <PageShell template="research" className="feed-page">
    <PageHeader title="Player Matchups" subtitle={data ? `${data.label} · NBA tracking's estimate of who guarded whom` : "NBA tracking's estimate of who guarded whom"} actions={data && <FeedDetails envelope={data} />} />
    {data && <FilterBar label="Matchup filters" summary={data.label}
      scope={<FeedScopeFields scopes={data.scopes} season={data.season} phase={data.phase} onChange={next => set({ season: next.season, phase: next.phase as FeedPhase })} />}
      filters={<PlayerLookup label="Find a player" onPick={id => set({ playerId: id })} />}
      modes={<Segmented size="lg" label="Matchup side" value={side} onChange={value => set({ side: value === "defense" ? "defense" : null })}
        options={[{ value: "offense", label: "On offense" }, { value: "defense", label: "On defense" }]} />}
      count={detail && <CountChip>{detail.opponents} opponents</CountChip>} />}
    {error && <FeedFailure error={error} retry={retry} what="Player Matchups" />}
    {loading && <FeedSkeleton label="Loading matchups" />}
    {data && detail && <ResearchLayout findings={<>
      <StatTile label="Matchup Minutes" value={fmt(detail.matchup_minutes, 0)} footnote={`${detail.opponents} ${side === "offense" ? "defenders" : "players guarded"}`} />
      <StatTile label={side === "offense" ? "Points / 100 Partial Poss." : "Points Allowed / 100"} value={fmt(detail.points_per_100)} footnote="Matchup-weighted possessions" />
      <StatTile label={side === "offense" ? "FG% in Matchups" : "FG% Allowed"} value={pct(detail.fg_pct)} footnote={`${fmt(detail.player_points, 0)} points`} />
    </>}>
      <div className="feed-subject">
        <PlayerIdentity playerId={detail.player_id} name={detail.player_name} href={`/players/${detail.player_id}?${scope}`} subtitle={side === "offense" ? "On offense" : "On defense"} />
        <ExampleNote name={detail.player_name} rule={data.focus_rule} />
      </div>
      <RankedBars title={`${verb} ${detail.player_name}`} measure="partial possessions" source={sourceLabel(data.sources)} sample={`Top ${detail.rows.length} of ${detail.opponents} matchups`}
        note="Partial possessions weight each matchup by time together. An absent pairing is unobserved, not zero."
        items={detail.rows.map(row => ({ key: row.player_id, name: row.player_name, label: <Link href={`/players/${row.player_id}?${scope}`}>{row.player_name}</Link>,
          detail: `${fmt(row.points_per_100)} pts / 100 · FG ${row.fga == null ? "—" : `${fmt(row.fgm, 0)}/${fmt(row.fga, 0)}`}`, value: row.partial_possessions, formatted: fmt(row.partial_possessions, 0) }))} />
      <MatchupTable detail={detail} caption={`${verb} ${detail.player_name}, by partial possessions`} scope={scope} />
    </ResearchLayout>}
  </PageShell>;
}
