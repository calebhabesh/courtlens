// PC11 fictional fixtures for the populated former gate pages. No source claim; ids 99xxx.
const SOURCE = "NBA Stats via the hoopR-nba-stats-raw mirror (CC BY 4.0)";
const sources = feed => [{ dataset_id: `fixture-${feed}`, feed, variant: "fixture", season: "2025-26", season_type: "regular_season", observed_at: "2026-10-11T22:00:00Z", upstream_revision: "f".repeat(40), content_sha256: "c".repeat(64) }];
const envelope = (phase = "regular_season", qualification = { games: 20, defended_fga: 100, possessions: 250, minutes: 500 }) => ({
  version: "courtlens-stats-feed-views-v1", season: "2025-26", phase, label: `2025-26 · ${phase === "playoffs" ? "Playoffs" : "Regular season"}`,
  scopes: [{ season: "2025-26", phase: "regular_season" }, { season: "2025-26", phase: "playoffs" }], source: SOURCE, qualification,
  limitations: ["Fixture limitation: descriptive season totals."],
});
const NAMES = ["Fixture Anchor", "Fixture Wing", "Fixture Guard", "Fixture Big", "Fixture Rookie"];
const pcts = keys => Object.fromEntries(keys.map((key, i) => [key, 90 - i * 10]));

function matchupRows(side) {
  return NAMES.slice(1).map((name, i) => ({ player_id: `9910${i}`, player_name: `${name} ${side === "offense" ? "D" : "O"}`, team_tricode: "BOS", games: 4 - i, matchup_minutes: 20 - i * 3,
    partial_possessions: 90 - i * 15, player_points: 30 - i * 4, points_per_100: 33.3 - i, fgm: 12 - i, fga: 25 - i, fg_pct: 0.48, fg3m: 3, fg3a: 8, fg3_pct: 0.375,
    ftm: 2, fta: 3, assists: 2, turnovers: 1, blocks: 0 }));
}
const detail = (id, name, side) => ({ player_id: id, player_name: name, team_tricode: "TOR", side, opponents: 4, matchup_minutes: 62, partial_possessions: 300,
  player_points: 100, points_per_100: 33.3, fg_pct: 0.47, rows: matchupRows(side) });

export function defense(url) {
  const category = url.searchParams.get("category") ?? "overall";
  const players = NAMES.map((name, i) => ({ player_id: `9900${i}`, player_name: name, team_id: "1610612761", team_tricode: "TOR", games: i === 4 ? 6 : 70,
    defended_fga: 1000 - i * 100, defended_fgm: 440 + i * 20, defended_fg_pct: 0.44 + i * 0.02, expected_fg_pct: 0.5, fg_pct_difference: -0.06 + i * 0.02,
    makes_below_expected: i === 4 ? null : 60 - i * 15, contested_shots_per_game: 10 - i, deflections_per_game: 2, charges_drawn: 3,
    matchup_minutes: 600, matchup_partial_possessions: 900, matchup_points_per_100: 30 + i, qualified: i !== 4,
    percentiles: i === 4 ? {} : pcts(["fg_pct_difference", "makes_below_expected", "contested_shots_per_game", "deflections_per_game", "matchup_points_per_100"]) }));
  const focus = players.find(p => p.player_id === url.searchParams.get("playerId")) ?? players[0];
  return { ...envelope(url.searchParams.get("phase") ?? "regular_season"), category,
    categories: [{ value: "overall", label: "All shots" }, { value: "3-pointers", label: "Threes" }], matchups_observed: true,
    focus_rule: focus === players[0] && !url.searchParams.get("playerId") ? "Most makes below expected (qualified)" : null,
    players, detail: detail(focus.player_id, focus.player_name, "defense"), sources: sources("defense") };
}

export function seasonMatchups(url) {
  const side = url.searchParams.get("side") === "defense" ? "defense" : "offense";
  const id = url.searchParams.get("playerId"), opponent = url.searchParams.get("opponentId");
  const focus = detail(id ?? "99000", id ? "Fixture Picked" : NAMES[0], side);
  // A pairing observed one way only: the other direction is null (unobserved), never zeros.
  const row = matchupRows("offense").find(entry => entry.player_id === opponent);
  const pair = opponent ? { player_id: opponent, player_name: row?.player_name ?? "Fixture Opponent", team_tricode: "BOS",
    player_on_offense: row ? { ...row, player_id: opponent } : null, opponent_on_offense: null } : null;
  return { ...envelope(), side, focus_rule: id ? null : "Most matchup possessions in this scope", detail: focus, pair, sources: sources("matchups") };
}

export function playTypes(url) {
  const side = url.searchParams.get("side") === "defensive" ? "defensive" : "offensive";
  const players = NAMES.map((name, i) => ({ player_id: `9900${i}`, player_name: name, team_tricodes: ["TOR"], games: 60, possessions: i === 4 ? 40 : 800 - i * 100,
    points: 900, points_per_possession: 1.12 - i * 0.03, expected_points_per_possession: 1.0, adjusted_per_100: i === 4 ? 2 : 12 - i * 5, top_play_type: "spotup",
    qualified: i !== 4, percentiles: i === 4 ? {} : pcts(["adjusted_per_100", "points_per_possession"]) }));
  const focusId = url.searchParams.get("playerId") ?? "99000";
  const focus = { ...players.find(p => p.player_id === focusId) ?? players[0], breakdown: [
    { play_type: "spotup", label: "Spot-up", possessions: 300, share: 0.4, points_per_possession: 1.1, league_points_per_possession: 1.05, fg_pct: 0.45 },
    { play_type: "isolation", label: "Isolation", possessions: 200, share: 0.25, points_per_possession: 0.9, league_points_per_possession: 0.95, fg_pct: 0.41 }] };
  return { ...envelope(), side, focus_player_id: focus.player_id, focus_rule: url.searchParams.get("playerId") ? null : "Most play-type possessions in this scope", focus,
    league: [{ play_type: "spotup", label: "Spot-up", possessions: 59000, points: 62000, points_per_possession: 1.05 }, { play_type: "isolation", label: "Isolation", possessions: 18000, points: 17000, points_per_possession: 0.95 }],
    players, sources: sources("synergy") };
}

const TRACKING_COLUMNS = [
  { key: "drives", label: "Drives", kind: "total", higher_is_better: true },
  { key: "drive_fg_pct", label: "Drive FG%", kind: "pct", higher_is_better: true },
  { key: "drive_tov", label: "Drive turnovers", kind: "total", higher_is_better: null },
];
export function tracking(url) {
  const group = url.searchParams.get("group") ?? "drives";
  const players = NAMES.map((name, i) => ({ player_id: `9900${i}`, player_name: name, team_tricode: "TOR", games: 60, minutes: i === 4 ? 90 : 2000,
    values: { drives: 20 - i * 3, drive_fg_pct: 0.5 + i * 0.01, drive_tov: 1.5 }, qualified: i !== 4, percentiles: i === 4 ? {} : pcts(["drives", "drive_fg_pct"]) }));
  return { ...envelope(), group, groups: [{ value: "drives", label: "Drives" }, { value: "passing", label: "Passing" }], columns: TRACKING_COLUMNS, players, sources: sources("tracking") };
}
export function playerTracking(id) {
  return { ...envelope(), player_id: id, observed: true, player: { games: 60, minutes: 2000, qualified: true, team_tricode: "TOR" },
    groups: [{ group: "drives", label: "Drives", columns: TRACKING_COLUMNS, values: { drives: 12, drive_fg_pct: 0.52, drive_tov: 1.1 }, percentiles: { drives: 80, drive_fg_pct: 70, drive_tov: null } }],
    sources: sources("tracking") };
}

export function combine(url) {
  const year = Number(url.searchParams.get("draftYear") ?? 2026);
  const rows = NAMES.map((name, i) => ({ row_key: `r${i}`, player_id: i === 4 ? null : `9900${i}`, player_name: i === 4 ? "Fixture Unknown" : name, draft_year: year, position: "F",
    height_no_shoes_inches: 78 + i, height_shoes_inches: null, wingspan_inches: i === 3 ? null : 82 + i * 2, standing_reach_inches: 104, weight_lbs: 210, body_fat_pct: null,
    hand_length_inches: null, hand_width_inches: null, standing_vertical_inches: null, max_vertical_inches: 34, lane_agility_seconds: 11.1, three_quarter_sprint_seconds: 3.2,
    span_minus_height: i === 3 ? null : 4 + i, pick_overall: i < 3 ? i + 1 : null, drafted_by: i < 3 ? "TOR" : null, percentiles: { span_minus_height: i === 3 ? null : 50 + i * 10, wingspan_inches: 60 } }));
  return { version: "courtlens-stats-feed-views-v1", source: SOURCE, draft_year: year, draft_years: [{ year: 2026, players: 5 }, { year: 2025, players: 5 }],
    cohort: { players: 10, measured: 8, first_year: 2000, last_year: 2026 }, default_rule: url.searchParams.get("draftYear") ? null : "Latest draft class",
    selected_player_id: null, limitations: ["Fixture combine limitation."], rows, sources: sources("draftcombine") };
}

const cell = (minutes, net, small = false) => ({ seconds: minutes * 60, points_for: 100, points_against: 90, possessions_for: small ? 50 : 400, possessions_against: small ? 50 : 400,
  stints: 10, minutes, offensive_rating: 115, defensive_rating: 115 - net, net_rating: net, small_sample: small });
export function wowy(url) {
  const players = NAMES.slice(0, 4).map((name, i) => ({ player_id: `9900${i}`, player_name: name, minutes: 2000 - i * 200 }));
  const pairs = [["99000", "99001", 1200], ["99000", "99002", 900], ["99001", "99002", 600]].map(([a, b, shared]) => ({ a, b, shared_minutes: shared,
    net_together_minus_apart: shared === 600 ? null : 8, cells: { both: cell(shared, 6), a_only: cell(500, 2), b_only: cell(300, -1), neither: cell(200, -2, shared === 600) } }));
  const wanted = [url.searchParams.get("a"), url.searchParams.get("b")];
  const selected = pairs.find(p => wanted.includes(p.a) && wanted.includes(p.b)) ?? pairs[0];
  return { version: "courtlens-wowy-v1", season: "2025-26", phase: "regular_season", scopes: [{ season: "2025-26", phase: "regular_season" }, { season: "2024-25", phase: "regular_season" }],
    games: 82, last_game_date: "2026-04-12", team: { team_id: "1610612761", team_tricode: "TOR", team_name: "Toronto Raptors" },
    teams: [{ team_id: "1610612761", team_tricode: "TOR", team_name: "Toronto Raptors" }, { team_id: "1610612738", team_tricode: "BOS", team_name: "Boston Celtics" }],
    players, team_total: cell(3936, 3), selected, pairs, default_rule: url.searchParams.get("teamId") ? null : "Minutes leader's team, top duo by shared minutes",
    min_possessions: 200, artifact_sha256: "w".repeat(64), inputs: { acceptance_sha256: "a".repeat(64), datasets: {} },
    source: "CourtLens stints reconstructed from public NBA play-by-play (IM03, event-accepted)", limitations: ["Fixture WOWY limitation."] };
}

const FACTORS = ["o_ts", "o_tov", "o_reb", "d_ts", "d_tov", "d_reb"];
export function sixFactor(url) {
  const sort = url.searchParams.get("sortMetric");
  const players = NAMES.slice(0, 4).map((name, i) => ({ player_id: `9900${i}`, player_name: name,
    metrics: { rapm: 3 - i, ...Object.fromEntries(FACTORS.map((key, k) => [key, (key === sort ? 4 : 1) - i * 0.8 + k * 0.1])) },
    support: Object.fromEntries(FACTORS.map(key => [key, { qualified: i !== 3, offense_percentile: 90 - i * 20, defense_percentile: 80 - i * 20 }])), on_off: {} }));
  return { status: "available", source: "CourtLens model", version: "courtlens-impact-serving-v1", methodology_url: "/methodology#impact", manifest_sha256: "m".repeat(64),
    artifacts: [{ sha256: "s".repeat(64), season: "2025-26", seasons: ["2025-26"], phase: "regular_season", years: 1, cutoff: "2026-07-01", last_included_date: "2026-04-12" }],
    coverage: [{ season: "2025-26", phase: "regular_season", scheduled_games: 1230, admitted_games: 1227, clean_games: 0, patched_games: 1227, excluded_games: 3, patch_rate: 0.99, estimate_within_two_percent: 46.7 }],
    limitations: ["Fixture impact limitation."], unavailable_columns: {}, reason: null, players, total_players: 802 };
}

/** Returns the fixture for a PC11 endpoint, or null when `url` is not one. */
export function pc11Response(url) {
  const path = url.pathname;
  if (path === "/api/workbench/defense") return defense(url);
  if (path === "/api/workbench/season-matchups") return seasonMatchups(url);
  if (path === "/api/workbench/play-types") return playTypes(url);
  if (path === "/api/workbench/tracking") return tracking(url);
  if (path === "/api/workbench/combine") return combine(url);
  if (path === "/api/workbench/wowy") return wowy(url);
  // Only the Six-Factor tab sorts by a factor; the RAPM tab keeps its existing unavailable state.
  if (path === "/api/workbench/impact" && url.searchParams.get("sortMetric")) return sixFactor(url);
  const player = path.match(/^\/api\/workbench\/players\/([^/]+)\/tracking$/);
  if (player) return playerTracking(player[1]);
  return null;
}
