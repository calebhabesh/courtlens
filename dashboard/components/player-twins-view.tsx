"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
// The Stats table look, as Player Matchups borrows it.
import "./stats-explorer.css";
import { LookupInput } from "./lookup-input";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogo } from "./team-logo";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { ControlScope } from "./ui/control-scope";
import { Icon } from "./ui/icon";
import { PageHeader } from "./ui/panel";
import { Tooltip } from "./ui/tooltip";
import { Button, IconButton, IconButtonLink, Segmented, Select } from "./ui/kit";
import { getPlayerTwins } from "@/lib/stats-feeds";
import type { LookupItem } from "@/lib/types";
import {
  DEFAULT_MIN_POSSESSIONS, MAX_ROWS, MODES, PAGE, POSSESSION_FLOORS, barShare, biggestGap, dimName, groups, relativeText, tone, valueText,
  type TwinCard, type TwinDimension, type TwinMatch, type TwinProfile, type TwinsMode, type TwinsPool, type TwinsView,
} from "@/lib/player-twins";

const one = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const whole = (value: number) => Math.round(value).toLocaleString("en-US");

/**
 * Player Twins (alignment row 17): Databallr's Shot Profile Twin for the NBA. The selected
 * player-season beside its twin, four groups of league-relative volume and efficiency, then the
 * closest player-seasons. Box Score mode applies the same method to box rates.
 */
export function PlayerTwinsView() {
  const { get, set } = useUrlState();
  const mode: TwinsMode = get("mode") === "box" ? "box" : "shot";
  const pool: TwinsPool = get("pool") === "same" ? "same" : "all";
  const minPoss = Number(get("minPoss")) || DEFAULT_MIN_POSSESSIONS;
  const excludeOwn = get("own") === "exclude";
  const rows = Math.min(Math.max(Number(get("rows")) || PAGE, PAGE), MAX_ROWS);
  const inputs = [mode, get("season"), get("playerId"), pool, get("from"), get("to"), String(minPoss), excludeOwn ? "1" : "", get("vs"), String(rows)];
  const { data, error, loading, retry } = useFeed(inputs, signal => getPlayerTwins({
    mode, season: get("season"), playerId: get("playerId"), pool, from: get("from"), to: get("to"),
    minPoss, excludeOwn: excludeOwn ? "true" : null, vs: get("vs"), limit: rows,
  }, signal));
  // Keep the last answer on screen while the next one loads, so a row click doesn't blank the page.
  const [shown, setShown] = useState<TwinsView | null>(null);
  if (data && data !== shown) setShown(data);
  const view = data ?? shown;
  const meta = MODES.find(entry => entry.value === mode)!;

  return <div className="tw-page" role="region" aria-label="Player Twins" aria-busy={loading || undefined}>
    <PageHeader className="pvp-header" icon="fingerprint" title="Player Twins" subtitle={meta.blurb} />
    {view && <Console view={view} set={set} mode={mode} pool={pool} minPoss={minPoss} excludeOwn={excludeOwn} />}
    {error && <FeedFailure error={error} retry={retry} what="Player Twins" />}
    {loading && !view && <FeedSkeleton label="Finding twins" />}
    {view && <>
      <section className="tw-panel player-glass" aria-label={meta.title}>
        <header className="tw-panel-head">
          <div>
            <span className="tw-eyebrow"><Icon name="fingerprint" size={14} />NBA · {meta.label}</span>
            <h2>{meta.title}</h2>
          </div>
          <div className="tw-panel-brand">
            <CourtLensWordmark height={14} />
            <p>{meta.blurb}</p>
          </div>
        </header>
        {view.focus_rule && <p className="tw-default">Shown by default · {view.focus_rule}</p>}
        <div className="tw-cards">
          <ProfileCard view={view} profile={view.player} />
          {view.twin
            ? <ProfileCard view={view} profile={view.twin} twin={view.twin} />
            : <div className="tw-card tw-card-empty"><p>No player-season in this pool shares six of the eight measures. Widen the seasons or lower the possession floor.</p></div>}
        </div>
      </section>
      <Matches view={view} rows={rows} set={set} />
    </>}
  </div>;
}

type Setter = ReturnType<typeof useUrlState>["set"];

function Console({ view, set, mode, pool, minPoss, excludeOwn }: {
  view: TwinsView; set: Setter; mode: TwinsMode; pool: TwinsPool; minPoss: number; excludeOwn: boolean;
}) {
  const [lookup, setLookup] = useState("");
  const seasons = view.seasons;
  const index = seasons.indexOf(view.season);
  // A new season keeps the player when he played it; the twin and paging start over.
  const goSeason = (season: string | undefined) => season && set({
    season: season === seasons.at(-1) ? null : season,
    playerId: view.roster.length && view.player ? view.player.player_id : null, vs: null, rows: null,
  });
  const candidates = useMemo<LookupItem[]>(() => view.roster.map(player => ({
    id: player.player_id, canonical_id: player.player_id, kind: "player", display_name: player.name,
    subtitle: player.team ?? undefined, match_basis: "suggestion", match_score: 1,
    availability: { has_current_season: true, status: "available", seasons: [] },
    team_association: { basis: "selected_scope", teams: player.team ? [player.team] : [], observed_through: null, season: null, phase: null, before_date: null },
    destination_url: `/players/${player.player_id}`,
    metadata: { caption: `${player.team ?? "—"} · ${whole(player.off_poss)} offensive possessions` },
  })), [view.roster]);
  const rangeSeasons = [...seasons].reverse();
  return <ControlScope tone="console">
    <div className="tw-consoles">
      <section className="tw-console tw-console-scope" aria-label="Player and season">
        <Segmented<TwinsMode> size="sm" stretch label="Twin profile" value={mode} onChange={value => set({ mode: value === "box" ? value : null, vs: null, rows: null })}
          options={MODES.map(entry => ({ value: entry.value, label: entry.label, title: entry.title }))} />
        <div className="tw-season-step" role="group" aria-label="Season">
          <IconButton size="sm" icon="left" label="Previous season" disabled={index <= 0} onClick={() => goSeason(seasons[index - 1])} />
          <Select size="sm" aria-label="Season" value={view.season} onChange={event => goSeason(event.target.value)}>
            {rangeSeasons.map(season => <option key={season} value={season}>{season}</option>)}
          </Select>
          <IconButton size="sm" icon="right" label="Next season" disabled={index >= seasons.length - 1} onClick={() => goSeason(seasons[index + 1])} />
        </div>
        <div className="tw-search">
          <LookupInput label="Player" placeholder={view.player.name} value={lookup} onChange={setLookup} kinds={["player"]} candidates={candidates} limit={12}
            compactResults portalDropdown dropdownMinWidth={320}
            onSelect={item => { setLookup(""); set({ playerId: item.canonical_id, vs: null, rows: null }); }} />
        </div>
      </section>
      <section className="tw-console tw-console-pool" aria-label="Match pool">
        <Segmented<TwinsPool> size="sm" stretch label="Match pool" value={pool} onChange={value => set({ pool: value === "same" ? value : null, vs: null, rows: null })}
          options={[{ value: "same", label: "Same Season", title: `Only ${view.season} player-seasons` }, { value: "all", label: "All Seasons", title: "Every season in the chosen range" }]} />
        <div className="tw-range" role="group" aria-label="Seasons to search">
          <Select size="sm" aria-label="From season" disabled={pool === "same"} value={view.pool.from_season}
            onChange={event => set({ from: event.target.value === seasons[0] ? null : event.target.value, vs: null, rows: null })}>
            {rangeSeasons.map(season => <option key={season} value={season}>{season}</option>)}
          </Select>
          <span aria-hidden="true">to</span>
          <Select size="sm" aria-label="To season" disabled={pool === "same"} value={view.pool.to_season}
            onChange={event => set({ to: event.target.value === seasons.at(-1) ? null : event.target.value, vs: null, rows: null })}>
            {rangeSeasons.map(season => <option key={season} value={season}>{season}</option>)}
          </Select>
        </div>
        <Select size="sm" aria-label="Minimum offensive possessions" value={String(minPoss)}
          onChange={event => set({ minPoss: Number(event.target.value) === DEFAULT_MIN_POSSESSIONS ? null : event.target.value, vs: null, rows: null })}>
          {[...new Set([...POSSESSION_FLOORS, minPoss])].sort((a, b) => a - b).map(floor => <option key={floor} value={floor}>{whole(floor)}+ possessions</option>)}
        </Select>
        <Segmented size="sm" stretch label="The player's other seasons" value={excludeOwn ? "exclude" : "include"} onChange={value => set({ own: value === "exclude" ? value : null, vs: null, rows: null })}
          options={[{ value: "include", label: "Own Seasons", title: `Include ${view.player.name}'s other seasons` }, { value: "exclude", label: "Others Only", title: `Leave out ${view.player.name}'s other seasons` }]} />
      </section>
    </div>
  </ControlScope>;
}

/** One side of the twin panel: who, then each group's two bars against the league average. */
function ProfileCard({ view, profile, twin }: { view: TwinsView; profile: TwinProfile; twin?: TwinCard }) {
  const label = twin
    ? twin.rank ? `#${twin.rank} twin` : "Compared"
    : "Selected";
  return <article className="tw-card" aria-label={`${profile.season} ${profile.name}, ${label}`} data-side={twin ? "twin" : "player"}>
    <span className="tw-card-kicker">{twin ? (twin.rank ? `#${twin.rank} Match` : "Compared Player-Season") : "Selected Player-Season"}</span>
    <div className="tw-who">
      <span className="tw-avatar">
        <PlayerPortrait playerId={profile.player_id} name={profile.name} size="lg" era={profile.team ? { season: profile.season, team: profile.team } : null} />
        {profile.team && <span className="tw-avatar-logo"><TeamLogo team={profile.team} season={profile.season} size={22} /></span>}
      </span>
      <div className="tw-who-text">
        <h3><span className="tw-season">{profile.season}</span> <Link href={`/players/${profile.player_id}?season=${profile.season}`}>{profile.name}</Link></h3>
        <div className="tw-badges">
          {profile.teams.length > 0 && <span className="tw-badge tw-badge-team">{profile.teams.join(" / ")}</span>}
          {twin
            ? twin.match != null && <span className="tw-badge tw-badge-match" title={`${one(twin.match)}% match over ${twin.overlap} of 8 shared measures`}>{one(twin.match)}% Match</span>
            : <span className="tw-badge tw-badge-selected">Selected</span>}
          <span className="tw-badge"><abbr title="Points per game">PTS</abbr> {one(profile.pts_per_game)}</span>
          <span className="tw-badge tw-badge-ts"><abbr title="True shooting percentage">TS%</abbr> {valueText({ kind: "pct" }, profile.ts_pct)}</span>
        </div>
        <span className="tw-sample">{profile.games} games · {whole(profile.off_poss)} offensive possessions</span>
      </div>
    </div>
    {groups(view.dimensions).map(({ group, dims }, index) => <section key={group} className="tw-group" aria-label={group}>
      <div className="tw-group-head">
        {(index === 0 || index === 3) && <span className="tw-axis tw-axis-low">Below Avg</span>}
        <h4>{group}</h4>
        {(index === 0 || index === 3) && <span className="tw-axis tw-axis-high">Above Avg</span>}
        <span className="tw-lg-head">LG AVG</span>
      </div>
      {dims.map(dim => <Bar key={dim.key} dim={dim} value={profile.dims[dim.key]} />)}
    </section>)}
    <p className="tw-card-note">{view.mode === "shot"
      ? "Volume is attempts per 100 offensive possessions. Relative values compare the player with the possession-weighted league-season average."
      : "Rates are per 100 offensive possessions (defensive possessions for DREB, STL and BLK). Relative values compare the player with the possession-weighted league-season average."}</p>
  </article>;
}

function Bar({ dim, value }: { dim: TwinDimension; value: TwinProfile["dims"][string] }) {
  const relative = value?.relative ?? null;
  const side = relative == null ? "none" : relative >= 0 ? "pos" : "neg";
  const share = barShare(value?.z);
  return <div className="tw-row">
    <span className="tw-row-label" data-kind={dim.kind} title={dim.description}>{dim.label}</span>
    <div className="tw-track" data-side={side} data-tone={tone(dim, relative)} title={`${dim.description}: ${valueText(dim, value?.value)} (${relativeText(dim, relative)} against the league average)`}
      style={{ "--tw-share": share } as CSSProperties}>
      <span className="tw-fill" />
      <span className="tw-value">{valueText(dim, value?.value)} <span className="tw-rel" data-tone={tone(dim, relative)}>({relativeText(dim, relative)})</span></span>
    </div>
    <span className="tw-lg">{valueText(dim, value?.league)}</span>
  </div>;
}

/** The closest player-seasons in the Stats table's look; a row puts that one in the twin card. */
function Matches({ view, rows, set }: { view: TwinsView; rows: number; set: Setter }) {
  const grouped = groups(view.dimensions);
  const starts = new Set(grouped.map(entry => entry.dims[0].key));
  const twinKey = view.twin ? `${view.twin.player_id}:${view.twin.season}` : null;
  const poolText = view.pool.scope === "same" ? `${view.season} only`
    : view.pool.from_season === view.pool.to_season ? view.pool.from_season : `${view.pool.from_season} to ${view.pool.to_season}`;
  const compareTo = (match: TwinMatch) => `/compare?${new URLSearchParams({
    season: view.season, playerA: view.player.player_id, seasonA: view.season, playerB: match.player_id, seasonB: match.season,
  })}`;
  return <section className="tw-matches stats-workspace" aria-label="Closest matches">
    <header className="tw-matches-head">
      <div>
        <h2>Closest Matches</h2>
        <p>Select a row to compare from that player-season.</p>
      </div>
      <p className="tw-pool">{poolText} · {whole(view.pool.min_possessions)}+ possessions{view.pool.exclude_own ? ` · without ${view.player.name}` : ""}<span>{whole(view.pool.candidates)} player-seasons qualify</span></p>
    </header>
    <div className="stats-table-frame is-table">
      <div className="table-wrapper stats-scroll-region tw-scroll" role="region" aria-label="Closest matches scroll area" tabIndex={0}>
        <table className="data-table dense-stats-table tw-grid" aria-label={`Closest matches to ${view.season} ${view.player.name}`}>
          <colgroup><col className="tw-rank-column" /><col className="tw-name-column" /><col className="tw-match-column" />{view.dimensions.map(dim => <col key={dim.key} />)}<col className="tw-gap-column" /><col className="tw-act-column" /></colgroup>
          <thead>
            <tr className="stats-header-tier-1">
              <th className="pinned-col tw-rank-head" />
              <th className="pinned-col tw-name-head" />
              <th />
              {grouped.map(entry => <th key={entry.group} colSpan={entry.dims.length} scope="colgroup" className="stats-group-th group-start">{entry.group}</th>)}
              <th colSpan={2} className="stats-group-th group-start">Pair</th>
            </tr>
            <tr className="stats-header-tier-2">
              <th scope="col" className="pinned-col tw-rank-head">#</th>
              <th scope="col" className="pinned-col tw-name-head">Player Season</th>
              <th scope="col" className="num" title={`100 − ${view.method.match_scale} × the root mean square standardized difference`}>Match</th>
              {view.dimensions.map(dim => <th key={dim.key} scope="col" className={`num ${starts.has(dim.key) ? "group-start" : ""}`} title={`${dim.description}, relative to that season's league average`}>{dim.label}</th>)}
              <th scope="col" className="group-start" title="The measure on which the two player-seasons sit furthest apart, in standard deviations">Biggest Gap</th>
              <th scope="col"><span className="sr-only">Compare</span></th>
            </tr>
          </thead>
          <tbody>
            {view.matches.length === 0 && <tr><td colSpan={view.dimensions.length + 5} className="stats-empty-cell">No player-season in this pool shares six of the eight measures.</td></tr>}
            {view.matches.map(match => {
              const key = `${match.player_id}:${match.season}`;
              const gap = biggestGap(match, view.dimensions);
              return <tr key={key} className="tw-match-row" data-selected={key === twinKey || undefined}
                onClick={event => { if (!(event.target as HTMLElement).closest("a, button")) set({ vs: key === `${view.matches[0]?.player_id}:${view.matches[0]?.season}` ? null : key }); }}>
                <td className="pinned-col tw-rank">{match.rank}</td>
                <th scope="row" className="pinned-col tw-name">
                  <span className="tw-identity">
                    <PlayerPortrait playerId={match.player_id} name={match.name} size="sm" era={match.team ? { season: match.season, team: match.team } : null} />
                    <span className="tw-identity-text">
                      <Link href={`/players/${match.player_id}?season=${match.season}`}>{match.name}</Link>
                      <small>{match.season} · {match.teams.join(" / ") || "—"}</small>
                    </span>
                  </span>
                </th>
                <td className="num tw-score">{one(match.match)}</td>
                {view.dimensions.map(dim => <td key={dim.key} className={`stats-metric-cell num ${starts.has(dim.key) ? "group-start" : ""}`} data-tone={tone(dim, match.relative[dim.key])}>{relativeText(dim, match.relative[dim.key])}</td>)}
                <td className="group-start tw-gap">{gap ? <Tooltip content={`${dimName(gap.dim)}: ${match.name} is ${one(Math.abs(gap.gap))} standard deviations ${gap.gap > 0 ? "higher" : "lower"} than ${view.player.name}`}>
                  <span className="tw-gap-chip" tabIndex={0}>{dimName(gap.dim)} <Icon name={gap.gap > 0 ? "up" : "down"} size={14} />{one(Math.abs(gap.gap))}σ</span>
                </Tooltip> : "—"}</td>
                <td className="tw-act"><IconButton size="sm" variant="ghost" icon="columns" label={`Show ${match.season} ${match.name} beside ${view.player.name}`} pressed={key === twinKey} onClick={() => set({ vs: key })} /><IconButtonLink size="sm" icon="scale" href={compareTo(match)} label={`Compare ${view.season} ${view.player.name} with ${match.season} ${match.name}`} /></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
    {view.matches.length < view.pool.candidates && rows < MAX_ROWS && <div className="tw-more">
      <Button size="sm" onClick={() => set({ rows: String(Math.min(rows + PAGE, MAX_ROWS)) })}>Load {Math.min(PAGE, MAX_ROWS - rows, view.pool.candidates - view.matches.length)} More</Button>
    </div>}
    <p className="tw-note">Similarity equally weights each available league-season standardized measure; a pair needs {view.method.min_overlap} of eight. Percentages need {view.method.min_attempts} attempts. Match = 100 − {view.method.match_scale} × distance. Standardized among player-seasons with {whole(view.method.base_possessions)}+ offensive possessions. Source: {view.source}.</p>
  </section>;
}
