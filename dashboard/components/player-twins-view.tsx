"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { Button, ButtonSummary, IconButton, IconButtonLink, Segmented, Select } from "./ui/kit";
import { TwinMapSection } from "./player-twins-map";
import { getPlayerTwins, getPlayerTwinsPlayers } from "@/lib/stats-feeds";
import { teamBrandColor } from "@/lib/team-colors";
import type { LookupItem } from "@/lib/types";
import {
  DEFAULT_MIN_POSSESSIONS, MAX_ROWS, MODES, PAGE, POSSESSION_FLOORS, WEIGHT_STEPS, barShare, biggestGap, dimName, groups, isMode, nextSummary, searchTarget,
  ordinal, relativeText, signed, tone, valueText, weightsParam,
  type CareerSeason, type TwinCard, type TwinDimension, type TwinMatch, type TwinNext, type TwinProfile, type TwinsMode, type TwinsPool, type TwinsView,
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
  const modeParam = get("mode");
  const mode: TwinsMode = isMode(modeParam) ? modeParam : "shot";
  const pool: TwinsPool = get("pool") === "same" ? "same" : "all";
  const minPoss = Number(get("minPoss")) || DEFAULT_MIN_POSSESSIONS;
  const excludeOwn = get("own") === "exclude";
  const byPosition = get("position") === "same";
  const rows = Math.min(Math.max(Number(get("rows")) || PAGE, PAGE), MAX_ROWS);
  const inputs = [mode, get("season"), get("playerId"), pool, get("from"), get("to"), String(minPoss), excludeOwn ? "1" : "", byPosition ? "1" : "", get("w"), get("vs"), String(rows)];
  const { data, error, loading, retry } = useFeed(inputs, signal => getPlayerTwins({
    mode, season: get("season"), playerId: get("playerId"), pool, from: get("from"), to: get("to"),
    minPoss, excludeOwn: excludeOwn ? "true" : null, position: byPosition ? "same" : null, w: get("w"), vs: get("vs"), limit: rows,
  }, signal));
  // Keep the last answer on screen while the next one loads, so a row click doesn't blank the page.
  const [shown, setShown] = useState<TwinsView | null>(null);
  if (data && data !== shown) setShown(data);
  const view = data ?? shown;
  const meta = MODES.find(entry => entry.value === mode)!;

  return <div className="tw-page" role="region" aria-label="Player Twins" aria-busy={loading || undefined}>
    <PageHeader className="pvp-header" icon="fingerprint" title="Player Twins" subtitle={meta.blurb} />
    {view && <Console view={view} set={set} mode={mode} pool={pool} minPoss={minPoss} byPosition={byPosition} />}
    {error && <FeedFailure error={error} retry={retry} what="Player Twins" />}
    {loading && !view && <FeedSkeleton label="Finding twins" />}
    {view && <>
      <section className="tw-panel player-glass" aria-label={meta.title}>
        <header className="tw-panel-head">
          <div>
            <span className="tw-eyebrow"><Icon name="fingerprint" size={14} />NBA · {meta.label}</span>
            <div className="tw-title"><h2>{meta.title}</h2><Info label="How to read the bars">{{
              shot: "Volume is attempts per 100 offensive possessions.",
              box: "Rates are per 100 offensive possessions (defensive possessions for DREB, STL and BLK).",
              all: "Volume and box rates are per 100 offensive possessions (defensive possessions for DREB, STL and BLK).",
            }[view.mode]} Bars and signed values compare the player with the possession-weighted league-season average. PCTL ranks the season among player-seasons with {whole(view.method.base_possessions)}+ offensive possessions.</Info></div>
          </div>
          <span className="tw-panel-brand"><CourtLensWordmark height={18} /></span>
        </header>
        {view.focus_rule && <p className="tw-default">Shown by default · {view.focus_rule}</p>}
        <div className="tw-cards">
          <ProfileCard view={view} profile={view.player} next={view.player.next} />
          {view.twin
            ? <ProfileCard view={view} profile={view.twin} twin={view.twin} next={view.twin.next} />
            : <div className="tw-card tw-card-empty"><p>No player-season in this pool shares {view.method.min_overlap} of the {view.method.measures} measures. Widen the seasons or lower the possession floor.</p></div>}
        </div>
      </section>
      {view.career.length > 1 && <Career view={view} />}
      <Matches view={view} rows={rows} set={set} excludeOwn={excludeOwn} />
      {view.map && <TwinMapSection view={view} map={view.map} set={set} />}
    </>}
  </div>;
}

type Setter = ReturnType<typeof useUrlState>["set"];

function Console({ view, set, mode, pool, minPoss, byPosition }: {
  view: TwinsView; set: Setter; mode: TwinsMode; pool: TwinsPool; minPoss: number; byPosition: boolean;
}) {
  const [lookup, setLookup] = useState("");
  const seasons = view.seasons;
  const index = seasons.indexOf(view.season);
  // A new season keeps the player when he played it; the twin and paging start over.
  const goSeason = (season: string | undefined) => season && set({
    season: season === seasons.at(-1) ? null : season,
    playerId: view.roster.length && view.player ? view.player.player_id : null, vs: null, rows: null,
  });
  // Every player is searchable: the selected season's players first (opening that season), then
  // everyone else by most recent season (opening it). The index loads once.
  const { data: directory } = useFeed(["twins-players"], signal => getPlayerTwinsPlayers(signal));
  const candidates = useMemo<LookupItem[]>(() => {
    const item = (id: string, name: string, team: string | null, caption: string): LookupItem => ({
      id, canonical_id: id, kind: "player", display_name: name, subtitle: team ?? undefined, match_basis: "suggestion", match_score: 1,
      availability: { has_current_season: true, status: "available", seasons: [] },
      team_association: { basis: "selected_scope", teams: team ? [team] : [], observed_through: null, season: null, phase: null, before_date: null },
      destination_url: `/players/${id}`, metadata: { caption },
    });
    const here = view.roster.map(player => item(player.player_id, player.name, player.team,
      `${view.season} · ${[player.team, player.position].filter(Boolean).join(" · ") || "—"} · ${whole(player.off_poss)} offensive possessions`));
    const inSeason = new Set(view.roster.map(player => player.player_id));
    const others = (directory?.players ?? []).filter(player => !inSeason.has(player.player_id))
      .sort((a, b) => b.last_season.localeCompare(a.last_season) || a.name.localeCompare(b.name))
      .map(player => item(player.player_id, player.name, player.last_team,
        `Opens ${player.last_season}${player.last_team ? ` · ${player.last_team}` : ""} · ${player.first_season === player.last_season ? "one season" : `${player.first_season} to ${player.last_season}`}`));
    return [...here, ...others];
  }, [view.roster, view.season, directory]);
  const pick = (id: string) => {
    const player = directory?.players.find(entry => entry.player_id === id);
    const target = player ? searchTarget(player, view) : { season: view.season === view.seasons.at(-1) ? null : view.season, inSeason: true };
    set({ playerId: id, season: target.season, vs: null, rows: null });
  };
  const rangeSeasons = [...seasons].reverse();
  return <ControlScope tone="console">
    <div className="tw-consoles">
      <section className="tw-console tw-console-scope" aria-label="Player and season">
        <Segmented<TwinsMode> size="sm" stretch label="Twin profile" value={mode} onChange={value => set({ mode: value === "shot" ? null : value, w: null, vs: null, rows: null })}
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
            onSelect={item => { setLookup(""); pick(item.canonical_id); }} />
        </div>
        <div className="tw-position">
          <Segmented size="sm" label="Position" value={byPosition ? "same" : "any"} onChange={value => set({ position: value === "same" ? value : null, vs: null, rows: null })}
          options={[{ value: "any", label: "Any Position", title: "Match every position" }, { value: "same", label: view.player.position ? `${view.player.position} Only` : "Same Position", disabled: !view.player.position,
            title: view.player.position_basis === "listed" ? `Only ${positionGroupName(view.player.position ?? "")} player-seasons (listed position; no estimate before 2000-01)` : `Only player-seasons estimated at ${view.player.position}` }]} />
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
      </section>
      <Weights view={view} set={set} />
    </div>
  </ControlScope>;
}

/** One side of the twin panel: who, then each group's two bars against the league average. */
function ProfileCard({ view, profile, twin, next }: { view: TwinsView; profile: TwinProfile; twin?: TwinCard; next?: TwinNext }) {
  const label = twin
    ? twin.rank ? `#${twin.rank} twin` : "Compared"
    : "Selected";
  // The ring and backing take that season's team colour (the era's, e.g. the 2012-13 Hornets).
  const tint = teamBrandColor(profile.team ?? undefined, profile.season);
  return <article className="tw-card" aria-label={`${profile.season} ${profile.name}, ${label}`} data-side={twin ? "twin" : "player"}>
    <span className="tw-card-kicker">{twin ? (twin.rank ? `#${twin.rank} Match` : "Compared Player-Season") : "Selected Player-Season"}</span>
    <div className="tw-who">
      <span className="tw-avatar" style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
        <PlayerPortrait playerId={profile.player_id} name={profile.name} size="lg" era={profile.team ? { season: profile.season, team: profile.team } : null} />
        {profile.team && <span className="tw-avatar-logo"><TeamLogo team={profile.team} season={profile.season} size={22} /></span>}
      </span>
      <div className="tw-who-text">
        <h3><span className="tw-season">{profile.season}</span> <Link href={`/players/${profile.player_id}?season=${profile.season}`}>{profile.name}</Link>
          {profile.team && <span className="tw-name-logo"><TeamLogo team={profile.team} season={profile.season} size={24} /></span>}</h3>
        <div className="tw-badges">
          {profile.teams.length > 0 && <span className="tw-badge tw-badge-team">{profile.teams.join(" / ")}</span>}
          {profile.position && <PositionBadge position={profile.position} basis={profile.position_basis} />}
          {twin
            ? twin.match != null && <span className="tw-badge tw-badge-match" title={`${one(twin.match)}% match over ${twin.overlap} of 8 shared measures`}>{one(twin.match)}% Match</span>
            : <span className="tw-badge tw-badge-selected">Selected</span>}
          <span className="tw-badge"><abbr title="Points per game">PTS</abbr> {one(profile.pts_per_game)}</span>
          <span className="tw-badge tw-badge-ts"><abbr title="True shooting percentage">TS%</abbr> {valueText({ kind: "pct" }, profile.ts_pct)}</span>
        </div>
        <span className="tw-sample">{profile.games} games · {whole(profile.off_poss)} offensive possessions</span>
        {next && <NextLine next={next} />}
      </div>
    </div>
    {groups(view.dimensions).map(({ group, dims }, index, all) => <section key={group} className="tw-group" aria-label={group}>
      <div className="tw-group-head">
        {(index === 0 || index === all.length - 1) && <span className="tw-axis tw-axis-low">Below Avg</span>}
        <h4>{group}</h4>
        {(index === 0 || index === all.length - 1) && <span className="tw-axis tw-axis-high">Above Avg</span>}
        <span className="tw-pct-head" title="Percentile among the season's player-seasons with 500+ offensive possessions">PCTL</span>
        <span className="tw-lg-head">LG AVG</span>
      </div>
      {dims.map(dim => <Bar key={dim.key} dim={dim} value={profile.dims[dim.key]} off={view.weights[dim.key] === 0} />)}
    </section>)}
  </article>;
}

function Bar({ dim, value, off }: { dim: TwinDimension; value: TwinProfile["dims"][string]; off: boolean }) {
  const relative = value?.relative ?? null;
  const side = relative == null ? "none" : relative >= 0 ? "pos" : "neg";
  const share = barShare(value?.z);
  return <div className="tw-row" data-off={off || undefined} title={off ? "Left out of the match (weight Off)" : undefined}>
    <span className="tw-row-label" data-kind={dim.kind} title={dim.description}>{dim.label}</span>
    <div className="tw-track" data-side={side} data-tone={tone(dim, relative)} title={`${dim.description}: ${valueText(dim, value?.value)} (${relativeText(dim, relative)} against the league average)`}
      style={{ "--tw-share": share } as CSSProperties}>
      <span className="tw-fill" />
      <span className="tw-value">{valueText(dim, value?.value)} <span className="tw-rel" data-tone={tone(dim, relative)}>({relativeText(dim, relative)})</span></span>
    </div>
    <span className="tw-pct">{ordinal(value?.percentile)}</span>
    <span className="tw-lg">{valueText(dim, value?.league)}</span>
  </div>;
}

/** The closest player-seasons in the Stats table's look; a row puts that one in the twin card. */
function Matches({ view, rows, set, excludeOwn }: { view: TwinsView; rows: number; set: Setter; excludeOwn: boolean }) {
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
        <div className="tw-title"><h2>Closest Matches to {view.season} {view.player.name}</h2><Info label="How matches are scored">
          Select a row to put that player-season in the twin card. Similarity {Object.keys(view.weights).length ? "uses the chosen weights over" : "equally weights"} each league-season standardized measure; a pair needs {view.method.min_overlap} of the {view.method.measures} measures. Percentages need {view.method.min_attempts} attempts. Match = 100 − {view.method.match_scale} × distance, standardized among player-seasons with {whole(view.method.base_possessions)}+ offensive possessions.
        </Info></div>
      </div>
      <ControlScope tone="console">
        <Segmented size="sm" label={`${view.player.name}'s other seasons`} value={excludeOwn ? "exclude" : "include"} onChange={value => set({ own: value === "exclude" ? value : null, vs: null, rows: null })}
          options={[{ value: "include", label: `With ${view.player.name}`, title: `Include ${view.player.name}'s other seasons` }, { value: "exclude", label: "Other Players Only", title: `Leave out ${view.player.name}'s other seasons` }]} />
      </ControlScope>
      <p className="tw-pool">{poolText} · {whole(view.pool.min_possessions)}+ possessions{view.pool.by_position && view.player.position ? ` · ${view.player.position_basis === "listed" ? positionGroupName(view.player.position) : view.player.position} only` : ""}{view.pool.exclude_own ? ` · without ${view.player.name}` : ""}<span>{whole(view.pool.candidates)} player-seasons qualify</span></p>
    </header>
    <div className="stats-table-frame is-table">
      <div className="table-wrapper stats-scroll-region tw-scroll" role="region" aria-label="Closest matches scroll area" tabIndex={0}>
        <table className="data-table dense-stats-table tw-grid" data-mode={view.mode} aria-label={`Closest matches to ${view.season} ${view.player.name}`}>
          <colgroup><col className="tw-rank-column" /><col className="tw-name-column" /><col className="tw-season-column" /><col className="tw-match-column" />{view.dimensions.map(dim => <col key={dim.key} />)}<col className="tw-gap-column" /><col className="tw-next-column" /><col className="tw-act-column" /></colgroup>
          <thead>
            <tr className="stats-header-tier-1">
              <th className="pinned-col tw-rank-head" />
              <th className="pinned-col tw-name-head" />
              <th />
              <th />
              {grouped.map(entry => <th key={entry.group} colSpan={entry.dims.length} scope="colgroup" className="stats-group-th group-start">{entry.group}</th>)}
              <th colSpan={3} className="stats-group-th group-start">Pair</th>
            </tr>
            <tr className="stats-header-tier-2">
              <th scope="col" className="pinned-col tw-rank-head">#</th>
              <th scope="col" className="pinned-col tw-name-head">Player</th>
              <th scope="col" className="tw-season-head">Season</th>
              <th scope="col" className="num" title={`100 − ${view.method.match_scale} × the root mean square standardized difference`}>Match</th>
              {view.dimensions.map(dim => <th key={dim.key} scope="col" data-off={view.weights[dim.key] === 0 || undefined} className={`num ${starts.has(dim.key) ? "group-start" : ""}`} title={`${dim.description}, relative to that season's league average`}>{dim.label}</th>)}
              <th scope="col" className="group-start tw-gap-head" title="The measure on which the two player-seasons sit furthest apart, in standard deviations">Biggest Gap</th>
              <th scope="col" className="group-start tw-next-head" title="The twin's following season as recorded: the change in points per game. A record of what happened, not a forecast.">Next</th>
              <th scope="col"><span className="sr-only">Compare</span></th>
            </tr>
          </thead>
          <tbody>
            {view.matches.length === 0 && <tr><td colSpan={view.dimensions.length + 7} className="stats-empty-cell">No player-season in this pool shares {view.method.min_overlap} of the {view.method.measures} measures.</td></tr>}
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
                      <small>{[match.teams.join(" / ") || "—", match.position].filter(Boolean).join(" · ")}</small>
                    </span>
                  </span>
                </th>
                <td className="tw-season-cell">{match.season}</td>
                <td className="num tw-score">{one(match.match)}</td>
                {view.dimensions.map(dim => <td key={dim.key} data-off={view.weights[dim.key] === 0 || undefined} className={`stats-metric-cell num ${starts.has(dim.key) ? "group-start" : ""}`} data-tone={tone(dim, match.relative[dim.key])}>{relativeText(dim, match.relative[dim.key])}</td>)}
                <td className="group-start tw-gap">{gap ? <Tooltip content={`${dimName(gap.dim)}: ${match.name} is ${one(Math.abs(gap.gap))} standard deviations ${gap.gap > 0 ? "higher" : "lower"} than ${view.player.name}`}>
                  <span className="tw-gap-chip" tabIndex={0}>{dimName(gap.dim)} <Icon name={gap.gap > 0 ? "up" : "down"} size={14} />{one(Math.abs(gap.gap))}σ</span>
                </Tooltip> : "—"}</td>
                <td className="group-start tw-next"><NextCell next={match.next} name={match.name} /></td>
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
    <NextSummary view={view} />
    <p className="tw-note">Source: {view.source}.</p>
  </section>;
}

/** Estimated positions read plainly; a listing (seasons before 2000-01) says so on hover. */
function PositionBadge({ position, basis }: { position: string; basis: TwinProfile["position_basis"] }) {
  return <span className="tw-badge tw-badge-position" title={basis === "listed" ? `${position}: NBA.com's listed position (no estimate before 2000-01)` : `${position}: CourtLens' estimated position this season`}>
    {position}{basis === "listed" && <span aria-hidden="true">*</span>}
  </span>;
}

const positionGroupName = (position: string) => ({ G: "guard", F: "forward", C: "center" } as Record<string, string>)[position[0]] ?? position;

/** Measure weights: leave a measure out, halve it or double it. Every weight is 1 by default. */
function Weights({ view, set }: { view: TwinsView; set: Setter }) {
  const changed = Object.keys(view.weights).length;
  const active = view.dimensions.filter(dim => (view.weights[dim.key] ?? 1) > 0).length;
  const setWeight = (key: string, value: number) => set({ w: weightsParam({ ...view.weights, [key]: value }, view.dimensions), vs: null, rows: null });
  return <details className="tw-weights" open={changed > 0 || undefined}>
    <ButtonSummary size="sm" variant="secondary" icon="sliders">Measure Weights{changed ? ` · ${changed} Changed` : ""}</ButtonSummary>
    <div className="tw-weights-body">
      {groups(view.dimensions).map(({ group, dims }) => <fieldset key={group} className="tw-weights-group">
        <legend>{group}</legend>
        {dims.map(dim => {
          const weight = String(view.weights[dim.key] ?? 1);
          return <div key={dim.key} className="tw-weight" title={dim.description}>
            <span>{dim.label}</span>
            <Segmented size="xs" dense label={`${dimName(dim)} weight`} value={weight} onChange={value => setWeight(dim.key, Number(value))}
              options={WEIGHT_STEPS.map(step => ({ ...step, disabled: step.value === "0" && active === 1 && weight !== "0" }))} />
          </div>;
        })}
      </fieldset>)}
      {changed > 0 && <div className="tw-weights-reset"><Button size="sm" variant="ghost" icon="reset" onClick={() => set({ w: null, vs: null, rows: null })}>Equal Weights</Button></div>}
    </div>
  </details>;
}

/** The following season as recorded; unknown seasons say why without guessing. */
function NextLine({ next }: { next: TwinNext }) {
  if (next.status !== "recorded") return <span className="tw-next-line">Next season: {next.status === "beyond_data" ? `${next.season} not in the data yet` : `no ${next.season} record`}</span>;
  return <span className="tw-next-line">Next season ({next.season}{next.team ? `, ${next.team}` : ""}): {one(next.pts_per_game)} PTS <span data-tone={toneOf(next.pts_change)}>({signed(next.pts_change)})</span>
    {" · "}TS% {valueText({ kind: "pct" }, next.ts_pct)} <span data-tone={toneOf(next.ts_change)}>({signed(next.ts_change, 1, 100)})</span></span>;
}

const toneOf = (value: number | null | undefined) => value == null || Math.abs(value) < 0.05 ? undefined : value > 0 ? "above" : "below";

function NextCell({ next, name }: { next: TwinNext; name: string }) {
  if (next.status !== "recorded") return <span className="tw-next-none" title={next.status === "beyond_data" ? `${next.season} is not in the data yet` : `${name} has no ${next.season} record`}>—</span>;
  return <Tooltip content={`${next.season}${next.team ? ` (${next.team})` : ""}: ${one(next.pts_per_game)} PTS per game (${signed(next.pts_change)}), TS% ${valueText({ kind: "pct" }, next.ts_pct)} (${signed(next.ts_change, 1, 100)}), ${next.games} games`}>
    <span className="tw-next-chip" tabIndex={0} data-tone={toneOf(next.pts_change)}>{signed(next.pts_change)} PTS</span>
  </Tooltip>;
}

/** What the shown twins did the following season, beside the player's own next season when known. */
function NextSummary({ view }: { view: TwinsView }) {
  const summary = nextSummary(view.matches);
  if (!summary.shown) return null;
  const own = view.player.next;
  return <p className="tw-next-summary" title="What these twins did the following season: a record of what happened, not a forecast"><Icon name="history" size={14} />
    <span><strong>Next season</strong> · {summary.recorded} of {summary.shown} twins on record{summary.recorded > 0 && <> · median {signed(summary.pts)} PTS, {signed(summary.ts, 1, 100)} TS%</>}
    {own.status === "recorded" && <> · {view.player.name} {signed(own.pts_change)} PTS, {signed(own.ts_change, 1, 100)} TS%</>}</span></p>;
}

/** Each season of the player's career beside its nearest other player, under the same pool rules. */
function Career({ view }: { view: TwinsView }) {
  const { params } = useUrlState();
  const href = (entry: CareerSeason) => {
    const next = new URLSearchParams(params.toString());
    for (const name of ["vs", "rows"]) next.delete(name);
    next.set("playerId", view.player.player_id);
    if (entry.season === view.seasons.at(-1)) next.delete("season"); else next.set("season", entry.season);
    // The card's twin opens beside the player, so the panel shows what the card showed.
    if (entry.twin) next.set("vs", `${entry.twin.player_id}:${entry.twin.season}`);
    return `?${next}`;
  };
  return <section className="tw-career" aria-label="Career twins">
    <header className="tw-matches-head">
      <div>
        <div className="tw-title"><h2>Career Twins</h2><Info label="About career twins">
          Each {view.player.name} season beside its closest other player ({view.player.name}&apos;s own seasons left out), under the pool above. Select one to open that season with that twin beside it.
        </Info></div>
      </div>
    </header>
    <ol className="tw-career-list">
      {view.career.map(entry => <li key={entry.season}>
        <Link className="tw-career-card" href={href(entry)} scroll={false} aria-current={entry.season === view.season || undefined}
          aria-label={`${entry.season}: ${entry.twin ? `${entry.twin.season} ${entry.twin.name}, ${one(entry.twin.match)}% match` : "no twin in this pool"}`}>
          <span className="tw-career-season">{entry.team && <TeamLogo team={entry.team} season={entry.season} size={16} />}{entry.season}</span>
          {entry.twin ? <>
            <PlayerPortrait playerId={entry.twin.player_id} name={entry.twin.name} size="sm" era={entry.twin.team ? { season: entry.twin.season, team: entry.twin.team } : null} />
            <span className="tw-career-name">{entry.twin.name}</span>
            <span className="tw-career-meta">{entry.twin.season} · {one(entry.twin.match)}%</span>
          </> : <span className="tw-career-meta">No twin in this pool</span>}
        </Link>
      </li>)}
    </ol>
  </section>;
}

/** Method notes behind an info button, so the page carries no paragraphs of grey text. */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip content={<span className="tw-info-text">{children}</span>} className="tw-info">
    <IconButton size="xs" variant="ghost" icon="info" label={label} />
  </Tooltip>;
}
