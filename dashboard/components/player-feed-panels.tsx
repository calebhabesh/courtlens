"use client";

import Link from "next/link";
import { PercentileCell } from "./charts";
import { FeedFailure, FeedSkeleton, useFeed } from "./stats-feed-ui";
import { GatedNote } from "./ui/gated-note";
import { StatTile } from "./ui/stat-tile";
import { PHASE_LABELS, fmt, getCombine, getPlayerTracking, inches, signed, trackingValue, type FeedPhase } from "@/lib/stats-feeds";

/** PC11 profile Tracking tab: every NBA tracking group for one player, with league percentiles. */
export function PlayerTrackingPanel({ playerId, name, season, phase }: { playerId: string; name: string; season: string; phase: string }) {
  const feedPhase: FeedPhase | null = phase === "playoffs" || phase === "regular_season" ? phase : null;
  const { data, error, loading, retry } = useFeed([playerId, season, feedPhase], signal => getPlayerTracking(playerId, { season, phase: feedPhase }, signal).catch(() =>
    // The profile's season may predate the tracking feeds; fall back to the latest observed scope.
    getPlayerTracking(playerId, {}, signal)));
  if (loading) return <FeedSkeleton label="Loading tracking" />;
  if (error || !data) return <FeedFailure error={error} retry={retry} what="Tracking" />;
  const scope = `${data.season} · ${PHASE_LABELS[data.phase]}`;
  if (!data.observed) return <GatedNote why="NBA tracking lists players who appeared in this scope; a missing row is unknown, not zero.">No tracking row for {name} in {scope}.</GatedNote>;
  const cohort = `players with ${data.qualification.minutes}+ minutes, ${scope}`;
  return <div className="feed-profile">
    {(data.season !== season || data.phase !== phase) && <GatedNote>Showing {scope}: tracking feeds are observed for {[...new Set(data.scopes.map(s => s.season))].join(", ")} only.</GatedNote>}
    <div className="feed-tiles">
      <StatTile label="Tracked Games" value={data.player?.games ?? null} footnote={scope} />
      <StatTile label="Tracked Minutes" value={fmt(data.player?.minutes, 0)} footnote={data.player?.qualified ? "Qualified for percentiles" : "Small sample: percentiles muted"} />
    </div>
    <div className="feed-group-grid">
      {data.groups.filter(g => g.values).map(g => <section key={g.group} className="panel feed-group" aria-label={g.label}>
        <h3>{g.label}</h3>
        <dl>{g.columns.map(c => <div key={c.key}><dt>{c.label}{c.kind === "total" ? " / G" : ""}</dt><dd>{c.higher_is_better === null ? trackingValue(c, g.values![c.key])
          : <PercentileCell value={trackingValue(c, g.values![c.key])} percentile={g.percentiles?.[c.key] ?? null} qualified={Boolean(data.player?.qualified)} label={`${name} ${c.label}`} cohort={cohort} />}</dd></div>)}</dl>
      </section>)}
    </div>
    <p className="research-caption">Source: NBA optical tracking season totals (hoopR mirror). Shaded values are percentiles among {cohort}. <Link href={`/stats/tracking?season=${data.season}&phase=${data.phase}`}>League tracking table</Link></p>
  </div>;
}

/** PC11 profile Measurements tab: the player's official Draft Combine record, if any. */
export function PlayerCombinePanel({ playerId, name }: { playerId: string; name: string }) {
  const { data, error, loading, retry } = useFeed([playerId], signal => getCombine({ playerId }, signal));
  if (loading) return <FeedSkeleton label="Loading combine measurements" />;
  if (error || !data) return <FeedFailure error={error} retry={retry} what="Combine measurements" />;
  // Rows without an NBA id have player_id null; only an explicit match is this player's record.
  const row = data.selected_player_id ? data.rows.find(r => r.player_id === data.selected_player_id) : undefined;
  if (!row) return <GatedNote why={`Combine records cover ${data.cohort.first_year}–${data.cohort.last_year}. Players who skipped the combine have none; that is unknown, not zero.`}>No Draft Combine record for {name}.</GatedNote>;
  const measured = [row.height_no_shoes_inches, row.wingspan_inches, row.standing_reach_inches, row.weight_lbs, row.max_vertical_inches].some(v => v != null);
  if (!measured) return <GatedNote why="The combine lists the player but published no measurements or drills for them; that is unknown, not zero.">{name} is listed in the {row.draft_year} Draft Combine without measurements.</GatedNote>;
  const cohort = "every measured combine participant since 2000";
  const cell = (key: string, value: string, label: string) => <PercentileCell value={value} percentile={row.percentiles[key] ?? null} qualified={row.percentiles[key] != null} label={`${name} ${label}`} cohort={cohort} />;
  return <div className="feed-profile">
    <div className="feed-tiles">
      <StatTile label="Wingspan" value={inches(row.wingspan_inches)} footnote={`${row.draft_year} combine`} />
      <StatTile label="Span Over Height" value={row.span_minus_height == null ? null : signed(row.span_minus_height, 2)} unit="in" footnote="Wingspan minus barefoot height" />
      <StatTile label="Barefoot Height" value={inches(row.height_no_shoes_inches)} footnote={row.position ?? undefined} />
      <StatTile label="Draft Pick" value={row.pick_overall ? `#${row.pick_overall}` : null} footnote={row.drafted_by ?? (row.pick_overall ? undefined : "Unknown or undrafted")} />
    </div>
    <section className="panel feed-group" aria-label="Combine measurements">
      <h3>{row.draft_year} NBA Draft Combine</h3>
      <dl>
        <div><dt>Wingspan</dt><dd>{cell("wingspan_inches", inches(row.wingspan_inches), "wingspan")}</dd></div>
        <div><dt>Standing reach</dt><dd>{cell("standing_reach_inches", inches(row.standing_reach_inches), "standing reach")}</dd></div>
        <div><dt>Height in shoes</dt><dd>{inches(row.height_shoes_inches)}</dd></div>
        <div><dt>Weight</dt><dd>{row.weight_lbs == null ? "—" : `${fmt(row.weight_lbs, 0)} lb`}</dd></div>
        <div><dt>Max vertical</dt><dd>{cell("max_vertical_inches", row.max_vertical_inches == null ? "—" : `${fmt(row.max_vertical_inches)} in`, "max vertical")}</dd></div>
        <div><dt>Lane agility</dt><dd>{cell("lane_agility_seconds", row.lane_agility_seconds == null ? "—" : `${fmt(row.lane_agility_seconds, 2)} s`, "lane agility")}</dd></div>
        <div><dt>¾-court sprint</dt><dd>{cell("three_quarter_sprint_seconds", row.three_quarter_sprint_seconds == null ? "—" : `${fmt(row.three_quarter_sprint_seconds, 2)} s`, "sprint")}</dd></div>
        <div><dt>Hand length × width</dt><dd>{row.hand_length_inches == null ? "—" : `${fmt(row.hand_length_inches, 2)} × ${fmt(row.hand_width_inches, 2)} in`}</dd></div>
      </dl>
    </section>
    <p className="research-caption">Source: official NBA Draft Combine (hoopR mirror). Percentiles among {cohort}. <Link href={`/wingspan?playerId=${playerId}`}>Compare with the {row.draft_year} class</Link></p>
  </div>;
}
