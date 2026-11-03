"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { FeedFailure, FeedSkeleton, useFeed } from "./stats-feed-ui";
import { GatedNote } from "./ui/gated-note";
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
  const qualified = Boolean(data.player?.qualified);
  return <div className="player-feed">
    {(data.season !== season || data.phase !== phase) && <GatedNote>Showing {scope}: tracking feeds are observed for {[...new Set(data.scopes.map(s => s.season))].join(", ")} only.</GatedNote>}
    <section className="player-open-section" aria-label="Tracking">
      <header className="player-open-heading">
        <h2>Tracking</h2>
        <span>{[data.player?.games != null ? `${data.player.games} games` : null, data.player?.minutes != null ? `${fmt(data.player.minutes, 0)} min` : null, scope].filter(Boolean).join(" · ")}
          {" · "}{qualified ? `percentiles among ${data.qualification.minutes}+ minute players` : "small sample: not ranked"}</span>
      </header>
      <div className="player-stat-groups">
        {data.groups.filter(g => g.values).map(g => <section key={g.group} className="player-stat-group" aria-label={g.label}>
          <h3>{g.label}</h3>
          <dl>{g.columns.map(c => <StatRow key={c.key} label={`${c.label}${c.kind === "total" ? " / G" : ""}`} value={trackingValue(c, g.values![c.key])}
            percentile={c.higher_is_better === null ? undefined : g.percentiles?.[c.key] ?? null} qualified={qualified} cohort={cohort} />)}</dl>
        </section>)}
      </div>
    </section>
    <p className="research-caption">Source: NBA optical tracking season totals (hoopR mirror). Bars are percentiles among {cohort}. <Link href={`/stats/tracking?season=${data.season}&phase=${data.phase}`}>League tracking table</Link></p>
  </div>;
}

/**
 * One stat as a row: label, value, then a thin percentile bar and the percentile, coloured on the
 * Stats table's scale (gold high, grey middle, blue low). `percentile` undefined: the stat is not
 * ranked; null: the rank is unknown. Small samples show the value without a rank.
 */
function StatRow({ label, value, percentile, qualified, cohort }: { label: string; value: ReactNode; percentile?: number | null; qualified: boolean; cohort: string }) {
  const known = value != null && value !== "" && value !== "—";
  const ranked = known && qualified && percentile != null;
  const note = !known || percentile === undefined ? null : !qualified ? "small sample" : percentile == null ? "rank unknown" : null;
  return <div className="player-stat-row" style={ranked ? { "--pct": Math.round(percentile) } as CSSProperties : undefined}>
    <dt>{label}</dt>
    <dd>
      <span className="player-stat-value">{known ? value : "—"}</span>
      {ranked ? <>
        <span className="player-stat-bar" aria-hidden="true" />
        <span className="player-stat-pct" title={`${Math.round(percentile)} percentile among ${cohort}`}>{Math.round(percentile)}</span>
        <span className="sr-only">, {Math.round(percentile)} percentile</span>
      </> : note && <span className="player-stat-note">{note}</span>}
    </dd>
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
  const row_ = (key: string | null, label: string, value: string) =>
    <StatRow key={label} label={label} value={value} percentile={key ? row.percentiles[key] ?? null : undefined} qualified cohort={cohort} />;
  const figures: [string, string | null, string | null][] = [
    ["Wingspan", inches(row.wingspan_inches), `${row.draft_year} combine`],
    ["Span over height", row.span_minus_height == null ? null : `${signed(row.span_minus_height, 2)} in`, "Wingspan minus barefoot height"],
    ["Barefoot height", inches(row.height_no_shoes_inches), row.position ?? null],
    ["Draft pick", row.pick_overall ? `#${row.pick_overall}` : null, row.drafted_by ?? (row.pick_overall ? null : "Unknown or undrafted")],
  ];
  return <div className="player-feed">
    <section className="player-open-section" aria-label="Combine measurements">
      <header className="player-open-heading"><h2>{row.draft_year} NBA Draft Combine</h2><span>Percentiles among {cohort}</span></header>
      <dl className="player-figures">{figures.map(([label, value, note]) => <div key={label}>
        <dt>{label}</dt><dd><span className="player-figure-value">{value ?? "—"}</span>{note && <small>{note}</small>}</dd>
      </div>)}</dl>
      <div className="player-stat-groups">
        <section className="player-stat-group" aria-label="Measurements">
          <h3>Measurements</h3>
          <dl>
            {row_("wingspan_inches", "Wingspan", inches(row.wingspan_inches))}
            {row_("standing_reach_inches", "Standing reach", inches(row.standing_reach_inches))}
            {row_(null, "Height in shoes", inches(row.height_shoes_inches))}
            {row_(null, "Weight", row.weight_lbs == null ? "—" : `${fmt(row.weight_lbs, 0)} lb`)}
            {row_(null, "Hand length × width", row.hand_length_inches == null ? "—" : `${fmt(row.hand_length_inches, 2)} × ${fmt(row.hand_width_inches, 2)} in`)}
          </dl>
        </section>
        <section className="player-stat-group" aria-label="Athletic testing">
          <h3>Athletic testing</h3>
          <dl>
            {row_("max_vertical_inches", "Max vertical", row.max_vertical_inches == null ? "—" : `${fmt(row.max_vertical_inches)} in`)}
            {row_("lane_agility_seconds", "Lane agility", row.lane_agility_seconds == null ? "—" : `${fmt(row.lane_agility_seconds, 2)} s`)}
            {row_("three_quarter_sprint_seconds", "¾-court sprint", row.three_quarter_sprint_seconds == null ? "—" : `${fmt(row.three_quarter_sprint_seconds, 2)} s`)}
          </dl>
        </section>
      </div>
    </section>
    <p className="research-caption">Source: official NBA Draft Combine (hoopR mirror). Percentiles among {cohort}. <Link href={`/wingspan?playerId=${playerId}`}>Compare with the {row.draft_year} class</Link></p>
  </div>;
}
