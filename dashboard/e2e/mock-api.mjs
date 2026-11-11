import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const playerReference = JSON.parse(readFileSync(new URL("../lib/player-reference-fixture.json", import.meta.url), "utf8"));
import { pc11Response, sixFactor } from "./pc11-fixtures.mjs";

// Recorded real retained finding, no question/provider prose. Other public examples stay
// unavailable in this fixture, exercising the partial-library state without fabricated results.
const retainedDistribution = JSON.parse(readFileSync(new URL("./fixtures/pc12-retained-distribution.json", import.meta.url), "utf8"));
// Player Twins (row 17): real API answers for 2025-26 (default, the #2 match picked, Box Score).
// Real 2025-26 playoffs (alignment row 8) and seasons whose formats test the bracket's byes.
const playoffBrackets = Object.fromEntries(["2025-26", "1975-76", "1965-66", "1949-50"].map(season =>
  [season, JSON.parse(readFileSync(new URL(`./fixtures/playoffs-bracket-${season}.json`, import.meta.url), "utf8"))]));
// Real answers of the frozen win-probability model's page, cut to a few rows.
const projectedImpact = JSON.parse(readFileSync(new URL("./fixtures/projected-impact-page.json", import.meta.url), "utf8"));
// R03: real Signal vs Noise answers (results file, 2025-26 shrinkage, the default worked example).
const signalNoise = JSON.parse(readFileSync(new URL("./fixtures/signal-noise.json", import.meta.url), "utf8"));
const zts = JSON.parse(readFileSync(new URL("./fixtures/zts.json", import.meta.url), "utf8"));
const shotQuality = JSON.parse(readFileSync(new URL("./fixtures/shot-quality.json", import.meta.url), "utf8"));
// RD17: the sealed earlier expected-shot run, as the research API serves it (Shot Quality → Model → An earlier attempt).
const expectedShot = JSON.parse(readFileSync(new URL("./fixtures/rd17-expected-shot.json", import.meta.url), "utf8"));
const shotDecomposition = JSON.parse(readFileSync(new URL("./fixtures/shot-decomposition.json", import.meta.url), "utf8"));
// R08: the real Metric Backtest answer (frozen results, metric notes, 2026-27 score).
const metricBacktest = JSON.parse(readFileSync(new URL("./fixtures/metric-backtest.json", import.meta.url), "utf8"));
// R09: real Draft Classes answers (summary, six classes, combine, rookie tracker, one rookie).
const lineupFixture = name => JSON.parse(readFileSync(new URL(`./fixtures/lineup-model${name}.json`, import.meta.url), "utf8"));
const lineupPage = lineupFixture(""), lineupPlayers = lineupFixture("-players"), lineupFit = lineupFixture("-fit"), lineupFitAlt = lineupFixture("-fit-alt");
const draftFixture = name => JSON.parse(readFileSync(new URL(`./fixtures/draft-${name}.json`, import.meta.url), "utf8"));
const draftSummary = draftFixture("summary"), draftClasses = draftFixture("classes"), draftCombine = draftFixture("combine");
const draftRookies = draftFixture("rookies"), draftRookie = draftFixture("rookie");
const r10Fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/r10-${name}.json`, import.meta.url), "utf8"));
const r10Wingspan = r10Fixture("wingspan"), r10Nearest = r10Fixture("wingspan-nearest");
const r10FourFactors = r10Fixture("four-factors"), r10FourFactorSeasons = r10Fixture("four-factors-seasons");
// Real answers of the six-factor API for 2025-26, cut to a few rows, and real Impact Trees.
const sixFactorPage = JSON.parse(readFileSync(new URL("./fixtures/six-factor-page.json", import.meta.url), "utf8"));
const winProbability = JSON.parse(readFileSync(new URL("./fixtures/win-probability-page.json", import.meta.url), "utf8"));
const okcPhx = JSON.parse(readFileSync(new URL("./fixtures/playoffs-series-2026-r1-okc-phx.json", import.meta.url), "utf8"));
const playerTwins = JSON.parse(readFileSync(new URL("./fixtures/player-twins-v1.json", import.meta.url), "utf8"));
function playerTwinsView(url) {
  // Captured answers: Shot Profile (and a picked row), Box Score, Combined and one weighting. The
  // roster and the shot map are stored once and shared.
  const mode = ["box", "all"].includes(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "shot";
  const vs = url.searchParams.get("vs");
  const weighted = mode === "shot" && url.searchParams.get("w");
  const source = mode !== "shot" ? playerTwins[mode] : weighted ? playerTwins.weighted : vs ? playerTwins.picked : playerTwins.shot;
  const base = structuredClone(source);
  base.roster ??= playerTwins.shot.roster;
  base.map ??= structuredClone(playerTwins.shot.map);
  const pool = url.searchParams.get("pool") === "same" ? "same" : "all";
  base.pool = { ...base.pool, scope: pool, by_position: url.searchParams.get("position") === "same", exclude_own: url.searchParams.get("excludeOwn") === "true", ...(pool === "same" ? { from_season: base.season, to_season: base.season } : {}) };
  // The weighted answer stands in for any weighting; the weights echo the request.
  if (weighted) base.weights = Object.fromEntries(weighted.split(",").map(part => [part.split(":")[0], Number(part.split(":")[1])]));
  base.matches = base.matches.slice(0, Number(url.searchParams.get("limit")) || 12);
  base.map.twins = base.map.twins.slice(0, base.matches.length);
  return base;
}

const snapshotId = "snapshot-browser-fixture";
const catalog = {
  snapshot_id: snapshotId,
  dataset_id: "dataset-browser-fixture",
  replay_date: "2023-01-10",
  cutoff_utc: null,
  mode: "historical_reconstruction",
  source: "fixture:browser",
  coverage_start: "2023-01-01",
  coverage_end: "2023-01-20",
  default_replay_date: "2023-01-10",
  supported_replay_dates: ["2023-01-02", "2023-01-10"],
  supported_seasons: ["2022-23"],
  published_at: "2026-09-21T00:00:00Z",
  metric_version: "basketball-v1",
  feature_version: "historical-prior-day-v1",
  scoring_version: "fixture-score",
  estimator: { status: "baseline_selected", version: "ewma_20_hl5" },
  warnings: ["Browser acceptance fixture"]
};
const summary = {
  n: 3,
  minutes_n: 3,
  minutes_per_game: 36,
  points_n: 3,
  points_per_game: 28,
  reference_points_n: 3,
  reference_points_per_game: 45.5,
  reference_points_per_minute: 1.26,
  fg_pct: 0.526,
  fg3_pct: 0.333,
  ft_pct: 0.857
};
const games = [
  {
    game_id: "0000000003", date: "2023-01-08", season: "2022-23", team_id: "100",
    team: "TOR", opponent_id: "200", opponent: "BOS", appearance: "appeared", minutes: 38,
    stats: { points: 28, reboundsTotal: 8, assists: 7, fieldGoalsAttempted: 19, freeThrowsAttempted: 7 },
    reference_points: 48.5, lineage_url: "/api/analytics/lineage?fixture=1"
  }
];

const streamedNarrative = "Fixture Guard led the 2025-26 regular season with 9.1 assists per game.";
function streamedAnswer(turn) {
  return { schema_version: "courtload-assistant-v2", request_id: turn.request_id, thread_id: turn.thread_id, turn_id: turn.request_id, status: "answered", intent: "local_analysis",
    blocks: [{ kind: "narrative", checker: "narrative-check-v1", text: streamedNarrative, operation_hashes: ["a".repeat(64)] }], sources: [], actions: [] };
}

function streamedAgentAnswer(turn) {
  return { schema_version: "courtlens-assistant-v3", request_id: turn.request_id, thread_id: turn.thread_id, turn_id: turn.request_id,
    status: "answered", mode: "agent", answer: { text: "The retained fixture answer from the source.[^s1]" },
    accounting: { provider: "replay", model: "synthetic-ag04", prompt_version: "fixture" },
    sources: [{ source_id: "s1", origin: "web", url: "https://example.org/ag04", title: "Synthetic source", publisher: "example.org" }], results: [], saveable: false };
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(body));
}

const workbenchStatus = {
  status: "healthy",
  release: {
    channel: "public",
    snapshot_id: "5bbb6035-6794-4bb0-b894-7208f52ef7ad",
    dataset_id: "17251a08-a4eb-4f46-b356-999fcf37c65d",
    semantic_signature: "mock-signature",
    published_at: "2026-09-21T00:00:00Z",
    coverage_start: "2023-10-24",
    coverage_end: "2026-06-13"
  },
  source: {
    namespace: "sportsdataverse",
    admitted_seasons: ["2023-24", "2024-25", "2025-26", "2026-27"],
    latest_finalized_date: "2026-06-13"
  },
  worker: {
    scheduled_refresh_utc: "09:00",
    active_job: null,
    latest_job: {
      id: "mock-job-1",
      job_type: "refresh",
      status: "succeeded",
      stage: "completed",
      finished_at: "2026-09-21T09:05:00Z"
    }
  },
  capabilities: {
    research: true,
    forecasting: "points-v1-prior_blend",
    teams_count: 30,
    portraits: {
      total_cached: 200,
      active: 200,
      total_players: 816,
      storage_path: "data/cache/portraits"
    }
  }
};

const playerMetrics = {
  gp: 70, min: 2500, min_per_game: 35.7, pts: 1960, pts_per_game: 28.0,
  oreb: 70, oreb_per_game: 1.0, dreb: 490, dreb_per_game: 7.0, reb: 560, reb_per_game: 8.0,
  ast: 490, ast_per_game: 7.0, stl: 70, stl_per_game: 1.0, blk: 35, blk_per_game: 0.5,
  tov: 140, tov_per_game: 2.0, pf: 140, pf_per_game: 2.0,
  fgm: 700, fga: 1400, fg_pct: 0.5, fg3m: 140, fg3a: 400, fg3_pct: 0.35,
  ftm: 420, fta: 500, ft_pct: 0.84, pts_per_36: 28.2, reb_per_36: 8.1, ast_per_36: 7.1,
  stl_per_36: 1.0, blk_per_36: 0.5, legacy_fantasy_score: 3200, legacy_fantasy_score_per_game: 45.7
};

const workbenchContext = {
  release_id: "5bbb6035-6794-4bb0-b894-7208f52ef7ad",
  snapshot_id: "5bbb6035-6794-4bb0-b894-7208f52ef7ad",
  dataset_id: "17251a08-a4eb-4f46-b356-999fcf37c65d",
  dataset_type: "workbench",
  semantic_signature: "mock-signature",
  mode: "workbench_recent",
  source: "sportsdataverse",
  season: "2025-26",
  phase: "regular_season",
  before_date: "2026-06-30",
  cutoff_utc: "2026-06-30T04:00:00Z",
  window: "season",
  coverage_start: "2023-10-24",
  coverage_end: "2026-06-13",
  metric_version: "v1",
  published_at: "2026-09-21T00:00:00Z",
  last_included_date: "2026-04-14",
  sample_size: 2,
  warnings: []
};

const workbenchPlayers = {
  context: workbenchContext,
  query: {
    release_id: "5bbb6035-6794-4bb0-b894-7208f52ef7ad",
    season: "2025-26",
    phase: "regular_season",
    before_date: "2026-06-30",
    window: "season",
    sort_metric: "pts",
    sort_direction: "desc",
    limit: 50
  },
  total_eligible_players: 2,
  items: [
    {
      player_id: "23",
      player_name: "Fixture Star",
      team_id: "100",
      team_abbreviation: "TOR",
      team_name: "Toronto Raptors",
      teams: ["TOR"],
      games_played: 70,
      total_minutes: 2500,
      stints_count: 1,
      sample_sizes: { gp: 70 },
      stints: [{ team_id: "100", tricode: "TOR", name: "Toronto Raptors", games_played: 70 }],
      metrics: { ...playerMetrics, dpm: 6.2, o_dpm: 4.1, d_dpm: 2.1 },
      // Listed with the team he played for: no "now" chip.
      current_team: { team_id: "1610612761", team_tricode: "TOR", listing_season: "2026-27", index_refreshed_at: "2026-10-01T12:00:00Z", trade_date: "2026-09-14" },
      portrait_available: true,
      lineage_url: "/api/workbench/lineage?playerId=23"
    },
    {
      player_id: "24",
      player_name: "Fixture Guard",
      team_id: "200",
      team_abbreviation: "BOS",
      team_name: "Boston Celtics",
      teams: ["BOS"],
      games_played: 68,
      total_minutes: 2278,
      stints_count: 1,
      sample_sizes: { gp: 68 },
      stints: [{ team_id: "200", tricode: "BOS", name: "Boston Celtics", games_played: 68 }],
      metrics: { ...playerMetrics, pts: 1500, pts_per_game: 22.0, dpm: 2.4, o_dpm: 1.7, d_dpm: 0.7 },
      // Played the season for Boston, listed with Toronto since: the row shows "now TOR".
      current_team: { team_id: "1610612761", team_tricode: "TOR", listing_season: "2026-27", index_refreshed_at: "2026-10-01T12:00:00Z", trade_date: "2026-09-14" },
      portrait_available: false,
      lineage_url: "/api/workbench/lineage?playerId=24"
    }
  ],
  next_cursor: null,
  has_more: false,
  warnings: ["Historical reconstruction from completed records."]
};

// Alignment row 4: the six-factor team table. BOS's DEF is unknown, so unknowns stay "—" and sort last.
const sixFactorRates = (ts, tov) => ({ ts_pct: ts, tov_per_100: tov, orb_pct: 0.27, ftr: 0.26, fg3a_per_100: 37.1, fg3_pct: 0.362, opp_ts_pct: 0.571, opp_tov_per_100: 13.9, drb_pct: 0.73, opp_ftr: 0.25, opp_fg3a_per_100: 35.2, opp_fg3_pct: 0.351 });
// Context fields (instruction 9): a ten-point rolling trend; BOS's net is unknown, so its Adj Net is too.
const sixFactorTrend = (start) => Array.from({ length: 12 }, (_, i) => ({ date: `2026-03-${String(i + 1).padStart(2, "0")}`, net: Math.round((start + Math.sin(i / 2) * 6) * 10) / 10 }));
// Team scoring (NBA Stats Misc totals): season totals, so unknown for a window or a venue.
const teamScoring = (pace, fb, paint, second, offTov, oppFb, oppPaint, oppSecond, oppOffTov) =>
  ({ games: 72, minutes: 3466, pace, pts_fb: fb, pts_paint: paint, pts_2nd_chance: second, pts_off_tov: offTov,
    opp_pts_fb: oppFb, opp_pts_paint: oppPaint, opp_pts_2nd_chance: oppSecond, opp_pts_off_tov: oppOffTov });
const workbenchSixFactors = (url) => {
  const luck = Number(url.searchParams.get("offenseLuck") || 0);
  const windowDays = Number(url.searchParams.get("windowDays")) || null;
  const venue = url.searchParams.get("venue");
  const season = !windowDays && !venue;
  return {
    context: workbenchContext,
    teams: [
      { team_id: "100", tricode: "TOR", name: "Toronto Raptors", conference: "Eastern", division: "Atlantic", games_played: windowDays ? 12 : 72, wins: windowDays ? 8 : 45, losses: windowDays ? 4 : 27,
        possessions: 7100, opp_possessions: 7080, points: 8190, opp_points: 7800, ortg: 115.4 - luck, drtg: 110.2, net: 5.2 - luck,
        off: 1.9 - luck, o_ts: 1.2 - luck, o_tov: 0.9, o_orb: -0.2, def: 3.3, d_ts: 2.1, d_tov: 0.4, d_drb: 0.8, net_eff: 3.3 - luck, net_poss: 1.9,
        off_luck: -luck, def_luck: 0, league_rating: 113.5, rates: sixFactorRates(0.584, 12.8),
        sos: 0.4, adj_net: 5.6 - luck, expected_wins: 46.2, win_luck: -1.2, close_wins: 9, close_losses: 7,
        standings: { wins: 45, losses: 27, last10_wins: 7, last10_losses: 3, streak: 3 }, trend: sixFactorTrend(4),
        scoring: season ? teamScoring(99.2, 1065, 3550, 994, 1349, 852, 3398, 1062, 1133) : null },
      { team_id: "200", tricode: "BOS", name: "Boston Celtics", conference: "Eastern", division: "Atlantic", games_played: 72, wins: 55, losses: 17,
        possessions: 7000, opp_possessions: 7020, points: 8260, opp_points: 7900, ortg: 118.0, drtg: null, net: null,
        off: 4.5, o_ts: 2.0, o_tov: 1.5, o_orb: 1.0, def: null, d_ts: null, d_tov: null, d_drb: null, net_eff: null, net_poss: null,
        off_luck: 0, def_luck: 0, league_rating: 113.5, rates: sixFactorRates(0.592, 11.9),
        sos: -0.3, adj_net: null, expected_wins: null, win_luck: null, close_wins: 6, close_losses: 2,
        standings: { wins: 55, losses: 17, last10_wins: 8, last10_losses: 2, streak: -1 }, trend: sixFactorTrend(-1),
        scoring: season ? teamScoring(97.8, 1120, 3360, 1050, 1260, 910, 3510, null, 1190) : null },
    ],
    league: { rating: 113.5, ts_pct: 0.578, tov_per_100: 13.4, orb_pct: 0.26, ftr: 0.26, fg3a_per_100: 36.3, fg3_pct: 0.36 },
    window: { days: windowDays, start: windowDays ? "2026-03-14" : null, first_game: windowDays ? "2026-03-14" : "2025-10-21", last_game: "2026-04-12", games: windowDays ? 40 : 1230, excluded_games: 0 },
    venue: venue === "home" || venue === "away" ? venue : null,
    luck: { offense: luck, defense: Number(url.searchParams.get("defenseLuck") || 0) },
    method_version: "courtlens-team-six-factors-v1",
    context_method_version: "courtlens-team-context-v1",
    warnings: [],
    scoring: { method_version: "courtlens-team-scoring-v1", status: season ? "complete" : "unavailable", teams: season ? 2 : 0,
      reason: season ? null : venue ? "Season totals cannot be split by venue." : "Season totals cannot be cut to a recent-game window.",
      dataset_ids: season ? ["fixture-team-misc"] : [], observed_at: season ? "2026-04-13T10:00:00+00:00" : null, upstream_revisions: [],
      limitations: ["Fixture team scoring totals."] },
  };
};

const workbenchTeams = {
  context: workbenchContext,
  teams: [
    {
      team_id: "100",
      tricode: "TOR",
      name: "Toronto Raptors",
      games_played: 72,
      wins: 45,
      losses: 27,
      win_pct: 0.625,
      production: { pts_per_game: 115.4, reb_per_game: 44.2, ast_per_game: 28.1 },
      ratings: {off_rating:115.4,def_rating:110.2,net_rating:5.2,pace:null},
      allowance: { pts_allowed_per_game: 110.2, reb_allowed_per_game: 42.1, ast_allowed_per_game: 24.5 },
      observed_games: 72,
      exclusions: 0
    },
    {
      team_id: "200",
      tricode: "BOS",
      name: "Boston Celtics",
      games_played: 72,
      wins: 55,
      losses: 17,
      win_pct: 0.764,
      production: { pts_per_game: 118.9, reb_per_game: 45.6, ast_per_game: 27.4 },
      ratings: {off_rating:null,def_rating:108.5,net_rating:null,pace:99},
      allowance: { pts_allowed_per_game: 108.5, reb_allowed_per_game: 41.8, ast_allowed_per_game: 23.9 },
      observed_games: 72,
      exclusions: 0
    }
  ],
  warnings: ["Historical reconstruction from completed records."],
  order_notice: "Ties in record ordering do not establish official conference placement. Standings are presented by win percentage without tiebreaker resolution."
};

const workbenchTeamDetail = {
  team: { id: "100", tricode: "TOR", name: "Toronto Raptors" },
  context: workbenchContext,
  record: { games_played: 72, wins: 45, losses: 27, win_pct: 0.625 },
  production: { pts_per_game: 115.4, reb_per_game: 44.2, ast_per_game: 28.1 },
  allowance: { pts_allowed_per_game: 110.2, reb_allowed_per_game: 42.1, ast_allowed_per_game: 24.5 },
  player_cohort: [
    {
      player_id: "23",
      player_name: "Fixture Star",
      games_played: 70,
      min_per_game: 35.7,
      total_minutes: 2500,
      points: 1960,
      points_per_game: 28.0,
      reb_per_game: 8.0,
      ast_per_game: 7.0
    }
  ],
  recent_games: [
    {
      game_id: "0022500001",
      game_date: "2026-04-12",
      opponent_id: "200",
      opponent_tricode: "BOS",
      side: "home",
      team_points: 112,
      opponent_points: 104,
      is_win: true
    }
  ]
};

function workbenchPlayerProfile(id) {
  const isGuard = id === "24";
  return {
    player: {
      id,
      name: isGuard ? "Fixture Guard" : "Fixture Star",
      portrait_url: isGuard ? null : `/api/workbench/media/players/mock-hash-23`
    },
    context: workbenchContext,
    summaries: {
      season: playerMetrics,
      last_5: { ...playerMetrics, gp: 5, pts_per_game: 30.2 },
      last_10: { ...playerMetrics, gp: 10, pts_per_game: 29.1 }
    },
    stints: [
      {
        team_id: isGuard ? "200" : "100",
        team_tricode: isGuard ? "BOS" : "TOR",
        team_name: isGuard ? "Boston Celtics" : "Toronto Raptors",
        games_played: isGuard ? 68 : 70,
        metrics: playerMetrics
      }
    ],
    latest_team: {
      id: isGuard ? "200" : "100",
      tricode: isGuard ? "BOS" : "TOR",
      name: isGuard ? "Boston Celtics" : "Toronto Raptors"
    },
    last_observed_date: "2026-04-14",
    forecast_status: {
      status: "no_policy_registered",
      message: "No forecast policy activated for current release",
      horizon_days: 1
    },
    target: null,
    lineage_url: `/api/workbench/lineage?playerId=${id}`
  };
}

function workbenchPlayerGames(id) {
  return {
    player: { id, name: id === "24" ? "Fixture Guard" : "Fixture Star" },
    context: workbenchContext,
    games: [
      {
        game_id: "0022500001",
        game_date: "2026-04-12",
        season: "2025-26",
        phase: "regular_season",
        team_id: "100",
        team_tricode: "TOR",
        opponent_id: "200",
        opponent_tricode: "BOS",
        side: "home",
        appearance: "appeared",
        minutes: 36.5,
        points: 32,
        stats: { pts: 32, reb: 8, ast: 7, fgm: 11, fga: 22, fg3m: 3, fg3a: 8, ftm: 7, fta: 8 },
        legacy_fantasy_score: 52.5,
        lineage_ref: "wb-game-0022500001"
      }
    ],
    next_cursor: null,
    has_more: false,
    warnings: []
  };
}

const mockPlayoffSeriesSummary = {
  series_id: "004230040",
  slug: "2024-finals-bos-dal",
  season: "2023-24",
  round_number: 4,
  round_name: "NBA Finals",
  conference: null,
  matchup_index: 0,
  team1: { team_id: "100", tricode: "BOS", name: "Boston Celtics", seed: 1, wins: 4 },
  team2: { team_id: "200", tricode: "DAL", name: "Dallas Mavericks", seed: 5, wins: 1 },
  series_score: "4-1",
  status: "final",
  winner_team_id: "100",
  winner_tricode: "BOS",
  games_count: 5,
  total_scheduled: 7,
  is_sweep: false,
  summary_text: "Boston Celtics won 4-1"
};

const mockPlayoffBracket = {
  season: "2023-24",
  season_year: 2024,
  cutoff_date: null,
  rounds: [
    {
      round_number: 4,
      round_name: "NBA Finals",
      eastern_series: [],
      western_series: [],
      finals_series: [mockPlayoffSeriesSummary],
      series: [mockPlayoffSeriesSummary]
    }
  ],
  seeds: {
    East: [
      {
        team_id: "100",
        tricode: "BOS",
        team_name: "Boston Celtics",
        conference: "East",
        seed: 1,
        wins: 64,
        losses: 18,
        win_pct: 0.78,
        is_tied: false,
        tie_note: null,
        source_label: "reconstructed_regular_season_standings"
      }
    ],
    West: [
      {
        team_id: "200",
        tricode: "DAL",
        team_name: "Dallas Mavericks",
        conference: "West",
        seed: 5,
        wins: 50,
        losses: 32,
        win_pct: 0.61,
        is_tied: false,
        tie_note: null,
        source_label: "reconstructed_regular_season_standings"
      }
    ]
  },
  capabilities: {
    bracket_hierarchy: "completed_rounds_1_to_4",
    box_scores: "factual_completed_games_only",
    matchups_gated: "B23_B24_pending",
    rotations_gated: "B19_B22_pending"
  },
  disclaimers: ["CourtLens strictly reports completed-game descriptive playoff facts."]
};

const mockPlayoffSeriesDetail = {
  series_id: "004230040",
  slug: "2024-finals-bos-dal",
  season: "2023-24",
  season_year: 2024,
  round_number: 4,
  round_name: "NBA Finals",
  conference: null,
  matchup_index: 0,
  status: "final",
  series_score: "4-1",
  winner_team_id: "100",
  winner_tricode: "BOS",
  cutoff_date: null,
  team1: {
    team_id: "100",
    tricode: "BOS",
    team_name: "Boston Celtics",
    seed: 1,
    wins: 4,
    losses: 1,
    games_played: 5,
    points_per_game: 106.8,
    opponent_points_per_game: 99.2,
    average_margin: 7.6,
    pace: 91.2,
    off_rating: 114.5,
    def_rating: 106.2,
    net_rating: 8.3,
    efg_pct: 0.542,
    tov_pct: 0.105,
    oreb_pct: 0.284,
    ftr: 0.245,
    totals: {}
  },
  team2: {
    team_id: "200",
    tricode: "DAL",
    team_name: "Dallas Mavericks",
    seed: 5,
    wins: 1,
    losses: 4,
    games_played: 5,
    points_per_game: 99.2,
    opponent_points_per_game: 106.8,
    average_margin: -7.6,
    pace: 91.2,
    off_rating: 106.2,
    def_rating: 114.5,
    net_rating: -8.3,
    efg_pct: 0.512,
    tov_pct: 0.132,
    oreb_pct: 0.245,
    ftr: 0.21,
    totals: {}
  },
  game_cards: [
    {
      game_id: "0042300401",
      game_number: 1,
      game_date: "2024-06-06",
      home_team_id: "100",
      home_team_tricode: "BOS",
      away_team_id: "200",
      away_team_tricode: "DAL",
      home_score: 107,
      away_score: 89,
      status: "final",
      venue: "TD Garden",
      winner_team_id: "100",
      margin: 18
    },
    {
      game_id: "0042300406",
      game_number: 6,
      game_date: null,
      home_team_id: "200",
      home_team_tricode: "DAL",
      away_team_id: "100",
      away_team_tricode: "BOS",
      home_score: null,
      away_score: null,
      status: "unplayed_placeholder",
      venue: null,
      winner_team_id: null,
      margin: null
    }
  ],
  team1_players: [
    {
      player_id: "23",
      player_name: "Fixture Star",
      team_id: "100",
      team_tricode: "BOS",
      games_played: 5,
      games_started: 5,
      minutes_total_seconds: 12060,
      minutes_per_game: 40.2,
      points_total: 111,
      points_per_game: 22.2,
      rebounds_total: 39,
      rebounds_per_game: 7.8,
      offensive_rebounds: 5,
      defensive_rebounds: 34,
      assists_total: 36,
      assists_per_game: 7.2,
      steals_total: 6,
      steals_per_game: 1.2,
      blocks_total: 3,
      blocks_per_game: 0.6,
      turnovers_total: 16,
      turnovers_per_game: 3.2,
      fouls_total: 14,
      fouls_per_game: 2.8,
      fgm: 37,
      fga: 95,
      fg_pct: 0.389,
      fg3m: 11,
      fg3a: 42,
      fg3_pct: 0.262,
      ftm: 26,
      fta: 35,
      ft_pct: 0.743,
      efg_pct: 0.447,
      ts_pct: 0.503
    }
  ],
  team2_players: [],
  capabilities: {
    bracket_hierarchy: "completed_rounds_1_to_4",
    box_scores: "factual_completed_games_only"
  },
  disclaimers: ["Descriptive completed-game facts only."]
};

// Finish plan F04: accounts as the API answers them, in memory. One invited account and the shared
// demo; sessions are opaque JWT-shaped tokens the dashboard's account proxy keeps in a cookie.
const mockFavoritePlayers = {
  "23": { name: "Fixture Star", season: "2025-26", team: "TOR" },
  "24": { name: "Fixture Guard", season: "2025-26", team: "BOS" },
};
const mockAccounts = {
  "owner@example.com": { id: "u-owner", name: "Owner", email: "owner@example.com", is_demo: false, password: "correct horse battery", favorites: [] },
  demo: { id: "u-demo", name: "Demo account", email: null, is_demo: true, favorites: ["23"] },
};
const mockSessions = new Map();
let mockSignInFailures = 0;
function mockSession(account) {
  const token = `mock.${account.id}.${mockSessions.size + 1}`;
  mockSessions.set(token, account);
  return { user: { id: account.id, name: account.name, email: account.email, is_demo: account.is_demo }, token, expires_in: 43200 };
}
function mockFavorites(account) {
  return { player_ids: account.favorites, players: account.favorites.map(id => ({ player_id: id, ...(mockFavoritePlayers[id] ?? { name: null, season: null, team: null }) })), limit: 100, shared: account.is_demo };
}
async function mockAccountRoute(request, response, url) {
  if (url.pathname === "/api/auth/session" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email = "", password = "" } = JSON.parse(raw || "{}");
    if (mockSignInFailures >= 5) {
      response.writeHead(429, { "Content-Type": "application/json", "Retry-After": "540" });
      return response.end(JSON.stringify({ detail: "Too many attempts. Try again later." }));
    }
    const account = mockAccounts[String(email).trim().toLowerCase()];
    if (!account || account.password !== password) {
      mockSignInFailures += 1;
      return json(response, 401, { detail: "That email and password don't match an account." });
    }
    return json(response, 200, mockSession(account));
  }
  if (url.pathname === "/api/auth/demo-session" && request.method === "POST") return json(response, 200, mockSession(mockAccounts.demo));
  if (url.pathname === "/api/__accounts/reset" && request.method === "POST") {
    mockAccounts["owner@example.com"].favorites = [];
    mockAccounts.demo.favorites = ["23"];
    mockSessions.clear();
    mockSignInFailures = 0;
    return json(response, 200, { reset: true });
  }
  if (!url.pathname.startsWith("/api/me")) return false;
  const account = mockSessions.get((request.headers.authorization ?? "").replace(/^Bearer /, ""));
  if (!account) return json(response, 401, { detail: "Your session has ended. Sign in again." });
  if (url.pathname === "/api/me") return json(response, 200, { id: account.id, name: account.name, email: account.email, is_demo: account.is_demo });
  if (url.pathname === "/api/me/favorites" && request.method === "GET") return json(response, 200, mockFavorites(account));
  const match = url.pathname.match(/^\/api\/me\/favorites\/(\d{1,12})$/);
  if (!match) return json(response, 404, { detail: "Not Found" });
  if (!mockFavoritePlayers[match[1]]) return json(response, 404, { detail: "unknown player" });
  if (request.method === "POST" && !account.favorites.includes(match[1])) account.favorites = [...account.favorites, match[1]];
  if (request.method === "DELETE") account.favorites = account.favorites.filter(id => id !== match[1]);
  return json(response, 200, mockFavorites(account));
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4100");
  if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/me") || url.pathname.startsWith("/api/__accounts/")) {
    if (await mockAccountRoute(request, response, url) !== false) return;
  }
  if (url.pathname === `/api/workbench/assistant/investigations/${retainedDistribution.id}`) return json(response, 200, retainedDistribution);
  // Live (alignment row 7): an observed empty date; e2e/live.spec.ts routes real ESPN reads itself.
  if (url.pathname === "/api/six-factor") return json(response, 200, sixFactorPage.pages[url.searchParams.get("season") ?? "2025-26"] ?? { status: "unavailable", season: url.searchParams.get("season"), phase: "regular_season", scopes: sixFactorPage.pages["2025-26"].scopes });
  if (url.pathname === "/api/six-factor/tree") {
    const tree = sixFactorPage.trees[url.searchParams.get("playerId")];
    return tree ? json(response, 200, tree) : json(response, 200, sixFactorPage.notInFit);
  }
  if (url.pathname === "/api/signal-noise") return json(response, 200, signalNoise.summary);
  if (url.pathname === "/api/signal-noise/shrinkage") return json(response, 200, { ...signalNoise.shrinkage, season: url.searchParams.get("season"), phase: url.searchParams.get("phase") });
  if (url.pathname === "/api/signal-noise/player") return json(response, 200, signalNoise.player);
  // R04 zTS: real answers of the zTS API; other seasons answer as the API does for a season it lacks.
  // R06: real answers of the decomposition and Defensive Shot Quality APIs.
  if (url.pathname === "/api/shot-quality/decomposition") return json(response, 200, shotDecomposition.summary);
  if (url.pathname === "/api/shot-quality/decomposition/players") {
    const q = url.searchParams;
    const key = `${q.get("season") ?? "2025-26"}:${q.get("side") ?? "offense"}:${q.get("sort") ?? "ts"}:${q.get("team") ?? "all"}:${q.get("minShots") ?? "1000"}`;
    return json(response, 200, shotDecomposition.boards[key] ?? { ...shotDecomposition.unknown_season, season: q.get("season") });
  }
  if (url.pathname === "/api/defensive-shot-quality") return json(response, 200, shotDecomposition.defense_summary);
  if (url.pathname === "/api/defensive-shot-quality/cards") {
    const q = url.searchParams;
    const key = `${q.get("season") ?? "2025-26"}:${q.get("kind") ?? "all"}:${q.get("sort") ?? "dsq"}:${q.get("team") ?? "all"}`;
    return json(response, 200, shotDecomposition.cards[key] ?? { ...shotDecomposition.unknown_cards, season: q.get("season") });
  }
  if (url.pathname === "/api/workbench/research/experiments") return json(response, 200, expectedShot.experiments);
  if (url.pathname === "/api/workbench/research/runs") return json(response, 200, expectedShot.runs);
  if (url.pathname === `/api/workbench/research/runs/${expectedShot.result.run.run_id}`) return json(response, 200, expectedShot.result);
  if (url.pathname === "/api/shot-quality") return json(response, 200, shotQuality.summary);
  if (url.pathname === "/api/shot-quality/players") {
    const q = url.searchParams;
    const key = `${q.get("season") ?? "2025-26"}:${q.get("sort") ?? "shot_making"}:${q.get("team") ?? "all"}:${q.get("minFga") ?? "300"}`;
    return json(response, 200, shotQuality.boards[key] ?? { ...shotQuality.unknown_season, season: q.get("season") });
  }
  if (url.pathname === "/api/shot-quality/player") return json(response, 200, shotQuality.default_player);
  if (url.pathname === "/api/zts") return json(response, 200, zts.summary);
  if (url.pathname === "/api/zts/leaderboard") {
    const season = url.searchParams.get("season") ?? "2025-26";
    if (season === "all") return json(response, 200, zts.top);
    return json(response, 200, zts.boards[`${season}:${url.searchParams.get("sort") ?? "zts"}`] ?? { ...zts.unknown_season, season });
  }
  if (url.pathname === "/api/zts/teams") {
    const season = url.searchParams.get("season") ?? "2025-26";
    return json(response, 200, season === zts.teams.season ? zts.teams : { status: "unknown", season, seasons: zts.teams.seasons, reason: "No team playtype difficulty for this season: Synergy play types start in 2015-16, and 2026-27 has no play-type rows yet." });
  }
  if (url.pathname === "/api/zts/role-moves") {
    const season = url.searchParams.get("season") ?? "2025-26";
    return json(response, 200, season === zts.role_moves.season ? zts.role_moves : { status: "unknown", season, reason: "No zTS for this season: Synergy play types start in 2015-16." });
  }
  if (url.pathname === "/api/zts/player") {
    const id = url.searchParams.get("playerId");
    return json(response, 200, id ? zts.players[id] ?? { status: "unknown", player_id: id, player_name: `NBA player ${id}`, season: url.searchParams.get("season"), reason: "No rTS or play-type rows for this player in 2015-16 to 2025-26.", history: [], selection_rule: null } : zts.default_player);
  }
  if (url.pathname === "/api/projected-impact") return json(response, 200, projectedImpact.page);
  if (url.pathname === "/api/metric-backtest") return json(response, 200, metricBacktest);
  if (url.pathname === "/api/lineup-model") return json(response, 200, lineupPage);
  if (url.pathname === "/api/lineup-model/players") return json(response, 200, lineupPlayers);
  if (url.pathname === "/api/lineup-model/fit") {
    // Real API answers for two fives; any other five is "not in the fit" (404), as the API says for unknown ids.
    const five = url.searchParams.get("players") ?? "";
    const known = [lineupFit, lineupFitAlt].find(fit => fit.players.map(p => p.player_id).join(",") === five);
    return known ? json(response, 200, known) : json(response, 404, { detail: "Not in the 2026-27 fit" });
  }
  if (url.pathname === "/api/wingspan") return json(response, 200, r10Wingspan);
  if (url.pathname.startsWith("/api/wingspan/nearest/")) {
    const body = r10Nearest[url.pathname.split("/").at(-1)];
    return body ? json(response, 200, body) : json(response, 404, { detail: "No combine record for this player since 2000." });
  }
  if (url.pathname === "/api/four-factors") return json(response, 200, r10FourFactors);
  if (url.pathname.startsWith("/api/four-factors/seasons/")) {
    const body = r10FourFactorSeasons[url.pathname.split("/").at(-1)];
    return body ? json(response, 200, body) : json(response, 404, { detail: "No inputs for this season" });
  }
  if (url.pathname === "/api/draft") return json(response, 200, draftSummary);
  if (url.pathname === "/api/draft/combine") return json(response, 200, draftCombine);
  if (url.pathname === "/api/draft/rookies") return json(response, 200, draftRookies);
  if (url.pathname.startsWith("/api/draft/rookies/")) {
    const id = url.pathname.split("/").at(-1);
    return id === draftRookie.rookie.player_id ? json(response, 200, draftRookie) : json(response, 200, { ...draftRookie, rookie: draftRookies.rookies.find(r => r.player_id === id) ?? draftRookie.rookie, comparisons: [] });
  }
  if (url.pathname.startsWith("/api/draft/classes/")) {
    const body = draftClasses[url.pathname.split("/").at(-1)];
    return body ? json(response, 200, body) : json(response, 404, { detail: "No such draft class" });
  }
  if (url.pathname.startsWith("/api/projected-impact/players/")) {
    const detail = projectedImpact.players[url.pathname.split("/").at(-1)];
    return detail ? json(response, 200, detail) : json(response, 404, { detail: "No frozen projection for this player" });
  }
  if (url.pathname === "/api/win-probability") return json(response, 200, winProbability.page);
  if (url.pathname === "/api/win-probability/wpa") {
    const table = winProbability.wpa[url.searchParams.get("season")];
    return table ? json(response, 200, table) : json(response, 404, { detail: "No win probability added for this season" });
  }
  if (url.pathname === "/api/live") return json(response, 200, { namespace: "espn", resource: `slate:${url.searchParams.get("slate_date")}`, status: "observed", final: false, stale: false, age_seconds: 0, acquired_at: null, source_time: null, http_date: null, refresh_seconds: 600, error: null, observation_id: null, content_sha256: null, data: { games: [], calendar: [] } });
  // Standings (row 23): no ESPN standings in the fixture; standings specs route their own. Answering
  // (rather than leaving the request open) lets pages that show division standings settle.
  if (url.pathname === "/api/live/standings") return json(response, 200, { namespace: "espn", resource: `standings:${url.searchParams.get("season") ?? "current"}`, status: "observed", final: true, stale: false, age_seconds: 0, acquired_at: null, source_time: null, http_date: null, refresh_seconds: null, error: null, observation_id: null, content_sha256: null, data: { season: url.searchParams.get("season"), standings: null } });
  // Team schedule (row 4 follow-up): ESPN's season for the team page calendar.
  if (/^\/api\/live\/teams\/[A-Za-z0-9]+\/schedule$/.test(url.pathname)) {
    const side = (id, tricode, home, score, winner) => ({ source_id: id, canonical_id: null, identity_status: "verified", tricode, name: tricode, side: home ? "home" : "away", score, winner });
    const game = (id, day, status, teams, note = null) => ({ source_id: id, canonical_id: null, identity_status: "unmapped", namespace: "espn", slate_date: day, event_time: `${day}T23:30:00Z`, status, period: status === "final" ? 4 : null, clock: null, teams, provisional: true, status_detail: status === "final" ? "Final" : null, odds: null, note });
    return json(response, 200, { namespace: "espn", resource: "schedule:28:2026:2", status: "observed", final: true, stale: false, age_seconds: 0, acquired_at: null, source_time: null, http_date: null, refresh_seconds: null, error: null, observation_id: null, content_sha256: null,
      data: { team_source_id: "28", season: "2025-26", year: 2026, season_type: 2, dropped_events: 1, games: [
        game("401000001", "2026-03-01", "final", [side("28", "TOR", true, 112, true), side("2", "BOS", false, 104, false)]),
        game("401000002", "2026-03-03", "final", [side("18", "NYK", true, 120, true), side("28", "TOR", false, 99, false)]),
        game("401000003", "2026-04-12", "postponed", [side("28", "TOR", true, null, null), side("14", "MIA", false, null, null)], "NBA Cup - Group Play"),
      ] } });
  }
  // Browser JSON POSTs (for example Showcase rank queries) send a CORS preflight, as the real API allows.
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type"
    });
    response.end();
    return;
  }
  if (url.pathname === "/api/workbench/impact" && !url.searchParams.get("sortMetric")) return json(response, 200, sixFactor(url));
  const pc11 = pc11Response(url);
  if (pc11) return json(response, 200, pc11);
  if (url.pathname === "/api/workbench/lookup") {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const kinds = (url.searchParams.get("kinds") || "player,team,page").split(",");
    const players = [["23","Fixture Star"],["24","Fixture Guard"],["1627751","Fixture Shooter"],["1630567","Scottie Barnes"],["1628389","Bam Adebayo"],["202695","Kawhi Leonard"], ...[1,2,3,4,5].map(n=>[String(n),`Fixture Player ${n}`])];
    const teams = [["TOR","Toronto Raptors"],["100","Toronto Raptors"],["200","Boston Celtics"]];
    const items = [...players.map(([id,name])=>({id,canonical_id:id,display_name:name,kind:"player",portrait_fallback:"FP",subtitle:"Synthetic browser fixture",availability:{status:"available",has_current_season:true,seasons:["2023-24","2025-26"]},team_association:{basis:"selected_scope",teams:["TOR"]},destination_url:`/players/${id}`})), ...teams.map(([id,name])=>({id:`team-${id}`,canonical_id:id,display_name:name,kind:"team",portrait_fallback:id === "200" ? "BOS" : "TOR",subtitle:"Synthetic browser fixture",destination_url:`/teams/${id}`}))].filter(item=>kinds.includes(item.kind) && (!q || item.canonical_id.toLowerCase() === q || item.display_name.toLowerCase().includes(q))).slice(0,Number(url.searchParams.get("limit") || 10));
    return json(response,200,{query:{raw:q,normalized:q,tokens:[],version:"fixture-pf04"},catalog_version:"fixture-pf04",total_matches:items.length,items});
  }
  if (url.pathname === "/api/workbench/assistant/v2/turn/stream" && request.method === "POST") {
    // AR05: a real, paced event stream so browser tests observe each phase through the proxy.
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const turn = JSON.parse(raw);
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const send = (event) => response.write(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
    send({ event: "accepted", request_id: turn.request_id, thread_id: turn.thread_id, turn_id: turn.request_id });
    if (turn.message.startsWith("AG04")) {
      for (const [kind, label] of [["thinking", "Considering sources"], ["tool", "Querying CourtLens: awards"], ["search", "Web search completed"], ["writing", "Writing the answer"]]) {
        send({ event: "step", kind, label }); await pause(700);
      }
      response.write(": keep-alive\n\n");
      send({ event: "delta", text: "Initial draft 🏀" }); await pause(700);
      if (turn.message.includes("repair")) {
        send({ event: "reset" }); await pause(700);
        send({ event: "step", kind: "writing", label: "Writing the repaired answer" });
        send({ event: "delta", text: "Repaired live " }); await pause(350);
        send({ event: "delta", text: "draft" }); await pause(700);
      }
      send({ event: "final", response: streamedAgentAnswer(turn) });
      return response.end();
    }
    for (const phase of ["understanding", "querying", "writing"]) { send({ event: "phase", phase }); await pause(700); }
    response.write(": keep-alive\n\n");
    for (const text of streamedNarrative.match(/\S+\s*/g)) { send({ event: "narrative", text }); await pause(120); }
    await pause(500);
    send({ event: "final", response: streamedAnswer(turn) });
    return response.end();
  }
  if (url.pathname === "/api/workbench/assistant/status") return json(response, 200, {
    configured: false,
    model: "fixture-disabled",
    provider: "gemini",
    limited_mode: true,
    prompt_version: "synthetic-ag05",
    limits: { max_steps: 6, max_web_searches: 3, max_tokens: 60000, turn_timeout_seconds: 60, max_question_length: 2000, max_rounds: 4, max_total_tool_calls: 8, timeout_seconds: 45 },
    allowed_tools: [],
    setup_instructions: "Set a server-side Gemini key to opt in.",
    privacy_notice: "Provider retention is separate from local saved evidence."
  });
  if (url.pathname === "/api/workbench/assistant/operations") return json(response, 200, [
    { name: "workload_shifts", description: "Historical workload changes", parameters: { type: "object" } }
  ]);
  if (url.pathname === "/api/workbench/player-twins/players") {
    // This season's roster, plus the captured matches' players at their latest captured season.
    const players = new Map(playerTwins.shot.roster.map(p => [p.player_id, { player_id: p.player_id, name: p.name, first_season: "2025-26", last_season: "2025-26", last_team: p.team, seasons: 1 }]));
    for (const m of playerTwins.shot.matches) {
      const known = players.get(m.player_id);
      if (!known || known.last_season < m.season) players.set(m.player_id, { player_id: m.player_id, name: m.name, first_season: m.season, last_season: known?.last_season > m.season ? known.last_season : m.season, last_team: m.team, seasons: 1 });
    }
    return json(response, 200, { players: [...players.values()] });
  }
  if (url.pathname === "/api/workbench/player-twins") return json(response, 200, playerTwinsView(url));
  if (url.pathname === "/api/workbench/catalog") return json(response, 200, {
    ...workbenchContext, snapshot_id: snapshotId, seasons: ["2025-26"], phases: ["regular_season"],
    default_season: "2025-26", default_phase: "regular_season", default_before_date: "2026-06-30",
    stats_scopes: [{ season: "2025-26", phase: "regular_season", coverage_start: "2025-10-21", coverage_end: "2026-04-12", default_before_date: "2026-06-30" }],
    stats_windows: ["season", "last_10", "last_5"], stats_normalizations: ["raw", "per_game", "per_36"],
    stats_sort_fields: Object.keys(workbenchPlayers.items[0].metrics), warnings: [],
    darko: { status: "available", manifest_sha256: "b".repeat(64),
      scopes: [{ season: "2025-26", phase: "regular_season", as_of: "2026-04-12", data_date: "2026-04-12" }] }
  });
  if (url.pathname === "/api/workbench/query" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const query = body.query;
    // The Draft Classes page's rookie table: the fixture rookies who have played, as Stats season lines.
    if (body.presentation?.draft_year === 2026) {
      const items = draftRookies.rookies.filter(r => r.comparison).map(r => {
        const line = r.comparison.line, game = line.minutes / line.games / 36, metrics = { gp: line.games, min: line.minutes, min_per_game: line.mpg, ts_pct: line.ts, efg_pct: 0.5, fg2_pct: 0.5, fg3_pct: null, ft_pct: 0.75 };
        for (const [key, per36] of Object.entries({ pts: line.pts36, reb: line.reb36, ast: line.ast36, stl: line.stl36, blk: line.blk36, tov: line.tov36, oreb: 1, dreb: 2, fg3a: 3, fta: 4 })) Object.assign(metrics, { [`${key}_per_36`]: per36, [`${key}_per_game`]: per36 * game, [key]: per36 * game * line.games });
        return { player_id: r.player_id, player_name: r.name, teams: [r.team], metrics };
      });
      return json(response, 200, { context: workbenchContext, query, total_eligible_players: items.length, total_output_players: items.length, output_offset: 0, items, next_cursor: null, has_more: false, warnings: [] });
    }
    // Estimated positions and draft classes the server would resolve for the fixture players.
    const fixturePositions = { 23: "SF", 24: "PG" }, fixtureDrafts = { 23: 2018, 24: 2020 };
    const darkoAvailable = query.window?.kind === "season" && query.before_date > "2026-04-12";
    const rows = workbenchPlayers.items.map((row, index) => ({ ...row,
      metrics: darkoAvailable ? row.metrics : { ...row.metrics, dpm: null, o_dpm: null, d_dpm: null },
      position: fixturePositions[row.player_id] ?? null,
      percentiles: Object.fromEntries(Object.keys(row.metrics).map((key) => [key, index === 0 ? 75 : 25])),
      ...(body.presentation?.table_percentiles ? {
        table_qualified: true,
        table_percentiles: Object.fromEntries(Object.keys(row.metrics).map(key => [key, index === 0 ? 75 : 25])),
        table_cohort_sample_sizes: Object.fromEntries(Object.keys(row.metrics).map(key => [key, 2]))
      } : {})
    }));
    // name=traded: Fixture Guard as a two-team season (BOS / MIA), now listed with TOR.
    const teamId = query.team_scope?.team_id;
    const matchesTeam = (row) => !teamId || row.team_id === teamId || ((teamId === "1610612760" || teamId === "1610612761") && row.team_id === "100") || (teamId === "1610612738" && row.team_id === "200");
    const selected = query.name === "traded" ? rows.filter(row => row.player_id === "24").map(row => ({ ...row, teams: ["BOS", "MIA"] })) : rows.filter((row) => matchesTeam(row) && (!query.name || row.player_name.toLowerCase().includes(query.name.toLowerCase())) &&
      (body.presentation?.player_ids == null || body.presentation.player_ids.includes(row.player_id)) &&
      (!body.presentation?.positions?.length || body.presentation.positions.includes(fixturePositions[row.player_id])) &&
      (!body.presentation?.draft_year || body.presentation.draft_year === fixtureDrafts[row.player_id]));
    const sort = query.sort?.[0];
    if (sort) selected.sort((a, b) => (sort.field === "player_name" ? a.player_name.localeCompare(b.player_name) : (a.metrics[sort.field] ?? 0) - (b.metrics[sort.field] ?? 0)) * (sort.direction === "asc" ? 1 : -1));
    return json(response, 200, { context: workbenchContext, query, total_eligible_players: rows.length,
      total_output_players: selected.length, output_offset: 0,
      cohort: { version: "pf01a-v1", scope_hash: "fixture-cohort", eligible_players: rows.length, formula: "midrank", good_directions: {} },
      ...(body.presentation?.table_percentiles ? { table_cohort: { version: "courtlens-table-percentiles-v1", scope_hash: "fixture-table-cohort", qualified_players: 2, min_season_minutes: 500, reference: "League", formula: "midrank" } } : {}),
      items: selected, next_cursor: null, has_more: false, warnings: [],
      darko: { status: darkoAvailable ? "available" : "unavailable", source: "DARKO (synthetic browser fixture)",
        version: "fixture", manifest_sha256: "b".repeat(64), limitations: ["Synthetic UI fixture; no real player rating."],
        ...(darkoAvailable ? { as_of: "2026-04-12", data_date: "2026-04-12" } : {}) } });
  }
  if (url.pathname === "/api/workbench/draft-classes") return json(response, 200, {
    source: "NBA draft history (fixture)", classes: [2020, 2019, 2018].map(year => ({ year, players: 58 }))
  });
  const careerMatch = url.pathname.match(/^\/api\/workbench\/players\/([^/]+)\/career$/);
  if (careerMatch) {
    // One played fixture season, ranked against its two-player league, and its Career row.
    const index = workbenchPlayers.items.findIndex(row => row.player_id === careerMatch[1]);
    const row = workbenchPlayers.items[index];
    const phase = url.searchParams.get("phase") ?? "regular_season";
    const ranked = row && {
      ...row, table_qualified: true,
      table_percentiles: Object.fromEntries(Object.keys(row.metrics).map(key => [key, index === 0 ? 75 : 25])),
      table_cohort_sample_sizes: Object.fromEntries(Object.keys(row.metrics).map(key => [key, 2]))
    };
    return json(response, 200, { player_id: careerMatch[1], release_id: url.searchParams.get("releaseId") ?? workbenchContext.release_id,
      phase, seasons: row && phase === "regular_season" ? [{ season: "2025-26", item: ranked }] : [],
      career: row && phase === "regular_season" ? row : null });
  }
  if (url.pathname === "/api/workbench/player-dashboard/feeds") {
    // Tracking cells for the two fixture players: player 23 leads, 24 trails; play types for 23 only.
    const id = url.searchParams.get("playerId"), lead = id === "23";
    const values = { potential_ast: lead ? 9.2 : 4.1, defended_fga: lead ? 12.4 : 8.0, rim_defended_fga: lead ? 6.1 : 2.2, contested_shots: lead ? 11 : 6,
      deflections: lead ? 2.4 : 1.1, loose_balls: lead ? 0.6 : 0.3, charges_drawn: lead ? 0.2 : 0.1 };
    const ratios = { ast_efg: lead ? 0.71 : 0.64, potential_ast_per_min: lead ? 2.4 : 1.6, defended_diff: lead ? -0.06 : 0.02, rim_defended_diff: lead ? -0.09 : 0.03 };
    const ranks = Object.fromEntries([...Object.keys(values), ...Object.keys(ratios)].map(key => [key, lead ? 75 : 25]));
    const family = (key, label, share, rel) => ({ family: key, label, possessions: 200 * share, frequency: share, points_per_possession: 1 + rel / 100,
      league_points_per_possession: 1, relative_per_100: rel, percentiles: { frequency: 60, relative_per_100: rel > 0 ? 80 : 30 } });
    return json(response, 200, {
      version: "courtlens-player-dashboard-feeds-v1", player_id: id, season: url.searchParams.get("season"), phase: url.searchParams.get("phase") ?? "regular_season",
      label: "2025-26 · Regular Season", source: "NBA Stats (fixture)", qualification: { minutes: 500 },
      observed: { tracking: true, defense: true, hustle: true, play_types: lead },
      first_seasons: { tracking: "2013-14", defense: "2013-14", hustle: "2015-16", play_types: "2015-16" }, metrics: [],
      player: { games: 70, minutes: 2400, qualified: true, defense_qualified: true, per_game: { ...values, ...ratios }, per_36: { ...values, ...ratios },
        percentiles: { per_game: ranks, per_36: ranks } },
      play_types: lead ? [family("creation", "Creation", 0.3, 4.2), family("spacing", "Spacing", 0.25, -1.5), family("transition", "Transition", 0.15, 7.1), family("finishing", "Finishing", 0.3, 9.0)] : null,
      cohort: { qualified_players: 2, rule: "500+ tracked minutes" }, limitations: [], sources: [] });
  }
  if (url.pathname === "/api/workbench/player-seasons") return json(response, 200, {
    phase: url.searchParams.get("phase") ?? "regular_season",
    seasons: Object.fromEntries(url.searchParams.getAll("playerId").map(id => [id, ["2025-26"]]))
  });
  if (url.pathname === "/api/workbench/status") return json(response, 200, workbenchStatus);
  if (url.pathname === "/api/workbench/players") {
    const q = (url.searchParams.get("name") ?? "").toLowerCase();
    let filtered = q ? workbenchPlayers.items.filter(p => p.player_name.toLowerCase().includes(q)) : [...workbenchPlayers.items];
    if (url.searchParams.get("sortMetric") === "min") filtered.sort((a,b) => b.total_minutes-a.total_minutes || a.player_id.localeCompare(b.player_id));
    // Dedicated observed-team duo fixture; kept out of the normal two-row Stats cohort.
    if (url.searchParams.get("teamId") === "TOR") filtered = filtered.map(player => ({...player,teams:["TOR"]}));
    return json(response, 200, { ...workbenchPlayers, items: filtered, total_eligible_players: filtered.length });
  }
  const bioMatch = url.pathname.match(/^\/api\/workbench\/players\/(23|24)\/bio$/);
  if (bioMatch) {
    // Synthetic listings; neither fixture player attended a combine.
    const fixture = bioMatch[1] === "23"
      ? { jersey: "7", listed_position: "F", listed_height_inches: 80, listed_weight_lbs: 220, prior_seasons: 6, birth_date: "1998-02-10", age: 28, country: "Fixtureland", college: "Fixture State", draft: { year: 2018, round: 1, pick: 9, team_id: "100", team_tricode: "TOR", organization: "Fixture State" }, undrafted: false }
      : { jersey: null, listed_position: "G", listed_height_inches: 75, listed_weight_lbs: 190, prior_seasons: 0, birth_date: null, age: null, country: null, college: null, draft: null, undrafted: true };
    return json(response, 200, { player_id: bioMatch[1], season: url.searchParams.get("season") ?? "2025-26", as_of: "2026-04-12",
      listing_source: "season_roster", combine: null,
      current_team: { team_id: "1610612761", team_tricode: "TOR", listing_season: "2026-27", index_refreshed_at: "2026-10-01T12:00:00Z" },
      reference: bioMatch[1] === "24" ? playerReference : null, limitations: ["Synthetic UI fixture."], ...fixture });
  }
  if (url.pathname === "/api/workbench/players/23") return json(response, 200, workbenchPlayerProfile("23"));
  if (url.pathname === "/api/workbench/players/24") return json(response, 200, workbenchPlayerProfile("24"));
  if (url.pathname === "/api/workbench/players/23/games") return json(response, 200, workbenchPlayerGames("23"));
  if (url.pathname === "/api/workbench/players/24/games") return json(response, 200, workbenchPlayerGames("24"));
  // FO10: bounded synthetic detail fixtures cover tabs, known zero and unknown outcomes.
  if (["/api/workbench/teams/100/four-factors", "/api/workbench/teams/200/four-factors", "/api/workbench/teams/1610612760/four-factors", "/api/workbench/teams/1610612738/four-factors"].includes(url.pathname)) {
    const isBos = url.pathname.includes("/200/") || url.pathname.includes("/1610612738/");
    return json(response, 200, {
      team:workbenchTeamDetail.team,context:workbenchContext,games_played:72,pace:99.4,off_rating:isBos ? 118.2 : 115.4,def_rating:isBos ? 108.5 : 110.2,net_rating:isBos ? 9.7 : 5.2,
      ratings:[["off_rating","Offensive Rating",115.4,113.0],["def_rating","Defensive Rating",110.2,113.0],["net_rating","Net Rating",5.2,0]].map(([key,display_name,value,league_avg]) => ({key,display_name,value,league_avg,unit:"rating",formula:"Synthetic UI fixture",total_teams:30})), shooting_percentages:{opp_fg_pct:0.437},league_averages:{},warnings:[],
      offense_factors:[{key:"efg_pct",display_name:"Effective Field Goal %",value:isBos ? 0.56 : 0.54,league_avg:0.53,rank:8,percentile:74,total_teams:30,good_direction:"high",unit:"percentage",formula:"Synthetic fixture",weight:0.4}],
      defense_factors:[{key:"opp_efg_pct",display_name:"Opponent eFG%",value:isBos ? 0.5 : null,league_avg:0.53,rank:isBos ? 4 : null,percentile:isBos ? 88.3 : null,total_teams:30,good_direction:"low",unit:"percentage",formula:"Synthetic fixture",weight:0.4}],
      three_point_scenario:{observed_fg3m:12,observed_fg3a:32,observed_3p_pct:0.375,league_3p_pct:0.375,hypothetical_fg3m:12,delta_points:0,actual_ppg:115.4,hypothetical_ppg:115.4,delta_off_rating:0,delta_net_rating:0,disclaimer:"Synthetic what-if accounting fixture, not a causal effect."}
    });
  }
  if (["/api/workbench/teams/100/schedule", "/api/workbench/teams/1610612760/schedule", "/api/workbench/teams/200/schedule", "/api/workbench/teams/1610612738/schedule"].includes(url.pathname)) return json(response,200,{
    team:workbenchTeamDetail.team,context:workbenchContext,overall_record:{...workbenchTeamDetail.record,current_streak:"W2",differential:5.2},
    home_split:{games_played:36,wins:24,losses:12,win_pct:0.667,ppg:115.4,opp_ppg:110.2,differential:5.2},away_split:{games_played:36,wins:21,losses:15,win_pct:0.583,ppg:115.4,opp_ppg:110.2,differential:5.2},
    rest_splits:[],back_to_back_summary:{},longest_homestand:4,longest_road_trip:3,warnings:[],
    games:[{game_id:"fo10-unknown",game_date:"2026-03-01",opponent_tricode:"BOS",opponent_name:"Boston Celtics",side:"home",team_points:0,opponent_points:null,is_win:null,rest_days:0,is_back_to_back:true,rest_bucket:"0_days_rest"}]
  });
  if (url.pathname === "/api/workbench/teams/100/peers") return json(response,200,{team:workbenchTeamDetail.team,context:workbenchContext,dimensions:[],warnings:[],peers:[{team_id:"200",tricode:"BOS",name:"Boston Celtics",similarity_score:0.95,distance:0.1,conference:"Eastern"}]});
  if (url.pathname === "/api/workbench/teams/six-factors") return json(response, 200, workbenchSixFactors(url));
  if (url.pathname === "/api/workbench/teams") return json(response, 200, { ...workbenchTeams, teams: workbenchTeams.teams.map((team, index) => ({ ...team, table_percentiles: { wins: index ? 75 : 25, win_pct: index ? 75 : 25, ppg: index ? 75 : 25, opp_ppg: index ? 75 : 25, net_margin: index ? 75 : 25 }, table_cohort_sample_sizes: { wins: 2, win_pct: 2, ppg: 2, opp_ppg: 2, net_margin: 2 } })) });
  if (url.pathname === "/api/workbench/teams/1610612761") return json(response, 200, { ...workbenchTeamDetail, team: { ...workbenchTeamDetail.team, id: "1610612761" } });
  if (url.pathname === "/api/workbench/teams/1610612760") return json(response, 200, { ...workbenchTeamDetail, team: { id: "1610612760", tricode: "OKC", name: "Oklahoma City Thunder" } });
  if (url.pathname === "/api/workbench/teams/1610612738") return json(response, 200, { ...workbenchTeamDetail, team: { id: "1610612738", tricode: "BOS", name: "Boston Celtics" }, record: { games_played: 72, wins: 55, losses: 17, win_pct: 0.764 }, player_cohort: [{ player_id: "24", player_name: "Fixture Guard", games_played: 68, min_per_game: 33.5, total_minutes: 2278, points: 1500, pts_per_game: 22.0, reb_per_game: 4.5, ast_per_game: 6.0 }] });
  // FO11: one deliberately missing-data opponent for descriptive comparison guards.
  if (url.pathname === "/api/workbench/teams/200") return json(response,200,{
    ...workbenchTeamDetail,team:{id:"200",tricode:"BOS",name:"Boston Celtics"},production:{pts_per_game:null,fg_pct:0,fg3_pct:null,ft_pct:null},allowance:{pts_allowed_per_game:null},player_cohort:[]
  });
  if (url.pathname === "/api/workbench/teams/100") return json(response, 200, workbenchTeamDetail);
  if (url.pathname === "/api/workbench/schedule/dates") {
    // FO08 date strip: deterministic counts, with every fifth day of the month empty except the focus.
    const start = new Date(`${url.searchParams.get("start")}T12:00:00Z`), end = new Date(`${url.searchParams.get("end")}T12:00:00Z`);
    const focus = url.searchParams.get("focus") ?? url.searchParams.get("start");
    const days = [];
    for (let day = start; day <= end; day = new Date(day.getTime() + 86400000)) {
      const iso = day.toISOString().slice(0, 10);
      const games = day.getUTCDate() % 5 === 0 && iso !== focus ? 0 : 3;
      days.push({ date: iso, scheduled: games, finals: games });
    }
    const shift = n => new Date(Date.parse(`${focus}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const nearest = { before: shift(-1), after: shift(1) };
    return json(response, 200, { release_id: workbenchContext.release_id, dataset_id: "fixture-dataset", start: url.searchParams.get("start"), end: url.searchParams.get("end"), phase: url.searchParams.get("phase"), before_date: url.searchParams.get("beforeDate"), focus, days, nearest_scheduled: nearest, nearest_finals: nearest, warnings: [] });
  }
  if (url.pathname === "/api/workbench/playoffs") {
    return json(response, 200, playoffBrackets[url.searchParams.get("season")] ?? mockPlayoffBracket);
  }
  if (url.pathname === "/api/workbench/playoffs/series/2026-r1-okc-phx") {
    return json(response, 200, okcPhx);
  }
  if (url.pathname.startsWith("/api/workbench/playoffs/series/")) {
    return json(response, 200, mockPlayoffSeriesDetail);
  }
  // Careers through the comparison cutoff (alignment row 3, 21): the fixture's season rows doubled.
  if (url.pathname === "/api/workbench/compare/career") {
    const entry = id => {
      const row = workbenchPlayers.items.find(item => item.player_id === id);
      return { player_id: id, seasons: row ? ["2024-25", "2025-26"] : [], item: row ? { ...row, games_played: row.games_played * 2,
        metrics: Object.fromEntries(Object.entries(row.metrics).map(([key, value]) => [key, typeof value === "number" && !/pct|per_game|ftr/.test(key) && key !== "gp" ? value * 2 : key === "gp" && typeof value === "number" ? value * 2 : value])) } : null };
    };
    return json(response, 200, { season: url.searchParams.get("season"), phase: url.searchParams.get("phase") ?? "regular_season",
      before_date: url.searchParams.get("beforeDate"), player_a: entry(url.searchParams.get("playerA")), player_b: entry(url.searchParams.get("playerB")) });
  }
  // Compare's grid (alignment row 3, 64): the two fixture rows plus a synthetic third player.
  if (url.pathname === "/api/workbench/compare/group") {
    const ids = url.searchParams.getAll("playerId");
    const known = { "23": "Fixture Star", "24": "Fixture Guard", "1627751": "Fixture Shooter" };
    if (ids.some(id => !known[id])) return json(response, 404, { detail: "player not found in snapshot" });
    const career = url.searchParams.get("span") === "career";
    const row = id => {
      const base = workbenchPlayers.items.find(item => item.player_id === id);
      if (base) return base;
      const guard = workbenchPlayers.items[1];
      return { ...guard, player_id: id, player_name: known[id], games_played: 60,
        metrics: Object.fromEntries(Object.entries(guard.metrics).map(([key, value]) => [key, typeof value === "number" ? value * 0.9 : value])) };
    };
    return json(response, 200, {
      context: { release_id: workbenchContext.release_id, season: url.searchParams.get("season") ?? "2025-26", phase: url.searchParams.get("phase") ?? "regular_season",
        before_date: url.searchParams.get("beforeDate") ?? "2026-04-13", window: url.searchParams.get("window") ?? "season" },
      span: career ? "career" : "season",
      players: ids.map(id => { const item = row(id); return { player_id: id, name: known[id], item, seasons: career ? ["2024-25", "2025-26"] : null,
        teams_chronological: id === "24" ? ["BOS"] : ["TOR"], championships: { seasons: [], coverage_from: "2015-16", complete: true },
        availability: { games: item.games_played, team_games: 82 } }; })
    });
  }
  if (url.pathname === "/api/workbench/compare") {
    const pA = {
      id: "23",
      name: "Fixture Star",
      teams: ["TOR"],
      games_played: 70,
      total_minutes: 2500
    };
    const pB = {
      id: "24",
      name: "Fixture Guard",
      teams: ["BOS"],
      games_played: 68,
      total_minutes: 2278
    };
    return json(response, 200, {
      player_a: url.searchParams.get("playerA") === "24" ? pB : pA,
      player_b: url.searchParams.get("playerB") === "23" ? pA : pB,
      context: { ...workbenchContext, season:url.searchParams.get("season") || workbenchContext.season,phase:url.searchParams.get("phase") || workbenchContext.phase,before_date:url.searchParams.get("beforeDate") || workbenchContext.before_date,window:url.searchParams.get("window") || "season" },
      no_forced_winner_notice: "CourtLens displays descriptive differences and prediction intervals without declaring an automated start/sit decision or forced winner.",
      aligned_metrics: [
        {
          metric: "pts_per_game",
          display_name: "Points Per Game",
          unit: "pts/g",
          value_a: 28.0,
          value_b: 22.0,
          diff: 6.0,
          n_a: 70,
          n_b: 68
        },
        {
          metric: "reb_total",
          display_name: "Rebounds Total",
          unit: "reb",
          value_a: 560,
          value_b: 306,
          diff: 254,
          n_a: 70,
          n_b: 68
        }
      ]
    });
  }
  if (url.pathname === "/api/workbench/portrait-credits") return json(response, 200, { commons: [{
    player_id: "2544", name: "LeBron James", season: "2010-11", team: "MIA",
    credit: "Photo: Keith Allison from Owings Mills, USA, CC BY-SA 2.0, via Wikimedia Commons (Dwyane Wade and LeBron James.jpg)",
    source_url: "https://commons.wikimedia.org/wiki/File:Dwyane_Wade_and_LeBron_James.jpg"
  }] });
  if (url.pathname === "/api/workbench/metrics") return json(response, 200, { version: "courtlens-stats-v3", metrics: ["pts","reb","ast","stl","blk","tov","pf","min","gp","ts_pct","efg_pct","ftr"].flatMap(key => {
    const count = !["gp","ts_pct","efg_pct","ftr"].includes(key);
    return [key, ...(count ? [`${key}_per_game`] : [])].map(name => ({ key:name, version:"courtlens-stats-v3",short_name:key,category:count ? "counting" : "efficiency",formula:"Synthetic UI fixture",denominator:null,phase_scope:["regular_season"],default_sort_direction:"desc",limitations:["Synthetic UI fixture"],validity_definition:"Observed synthetic appearances", display_name:({pts:"Points",reb:"Rebounds",ast:"Assists",stl:"Steals",blk:"Blocks",tov:"Turnovers",pf:"Fouls",min:"Minutes",gp:"Games Played",ts_pct:"True Shooting Percentage",efg_pct:"Effective Field Goal %",ftr:"Free Throw Rate"})[key]+(name.endsWith("_per_game") ? " Per Game" : count ? " Total" : ""), unit:["ts_pct","efg_pct","ftr"].includes(key) ? "percentage" : "",good_direction:["tov","pf"].includes(key) ? "low" : ["min","gp"].includes(key) ? null : "high" }));
  }) });
  if (url.pathname === "/api/workbench/analyses") return json(response, 200, []);
  if (url.pathname === "/api/workbench/jobs") return json(response, 200, [workbenchStatus.worker.latest_job]);
  if (url.pathname === "/api/workbench/lineage") {
    return json(response, 200, {
      release_id: workbenchContext.release_id,
      dataset_id: workbenchContext.dataset_id,
      semantic_signature: workbenchContext.semantic_signature,
      source_namespace: "sportsdataverse",
      contributing_facts: [
        {
          kind: "player_game",
          fact_id: "fact-001",
          source_version_id: "ver-001",
          source_observation_id: "obs-001",
          observation_id: "obs-001",
          source_file: "nba_player_box_2025.csv.gz",
          content_sha256: "mock-sha256-obs",
          game_id: "0022500001",
          game_date: "2026-04-12",
          player_id: "23",
          minutes: 36.5,
          points: 32
        }
      ],
      transform_path: [
        "stg_workbench_player_games",
        "fct_workbench_player_game",
        "mart_workbench_player_season_stats"
      ],
      warnings: []
    });
  }
  if (url.pathname === "/api/analytics/catalog") return json(response, 200, catalog);
  if (url.pathname === "/api/analytics/players") {
    const query = url.searchParams.get("query") ?? "";
    return json(response, 200, {
      snapshot_id: snapshotId,
      dataset_id: catalog.dataset_id,
      query,
      season: "2022-23",
      players: query.toLowerCase().includes("fixture")
        ? [
            { id: "23", name: "Fixture Star", last_observed_date: "2023-01-08" },
            { id: "24", name: "Fixture Guard", last_observed_date: "2023-01-09" }
          ]
        : []
    });
  }
  if (url.pathname === "/api/analytics/players/23/games") {
    return json(response, 200, {
      ...catalog,
      replay_date: url.searchParams.get("date"),
      player_id: "23",
      games: url.searchParams.get("date") === "2023-01-02" ? [] : games,
      next_cursor: null
    });
  }
  if (url.pathname === "/api/analytics/players/23") {
    const date = url.searchParams.get("date") ?? catalog.default_replay_date;
    if (!catalog.supported_replay_dates.includes(date)) {
      return json(response, 422, {
        detail: {
          reason: "unsupported_replay_date",
          nearest_supported_dates: ["2023-01-10", "2023-01-02"]
        }
      });
    }
    const empty = date === "2023-01-02";
    return json(response, 200, {
      ...catalog,
      replay_date: date,
      cutoff_utc: empty ? null : "2023-01-10T05:00:00Z",
      player: { id: "23", name: "Fixture Star", season: "2022-23" },
      last_observed: empty ? null : { team_id: "100", date: "2023-01-08", association: "last_observed_team" },
      summaries: empty ? { last_5: null, last_10: null, season: null } : { last_5: summary, last_10: summary, season: summary },
      target: empty ? null : { game_id: "4", date: "2023-01-11", team_id: "100", team: "TOR", opponent_id: "200", opponent: "BOS", side: "home", lead_days: 1, rest_days: 2, reconstruction: "last_observed_team" },
      opponent_context: empty ? null : { eligible_games: 7, values: { points_allowed_per_game: 112.4, rebounds_allowed_per_game: 43, assists_allowed_per_game: 25.1 }, max_history_date: "2023-01-08" },
      estimate: { status: "insufficient_history", history_n: empty ? 0 : 3, point: null, interval: null }
    });
  }
  if (url.pathname === "/api/analytics/compare") {
    const date = url.searchParams.get("date") ?? catalog.default_replay_date;
    const a = url.searchParams.get("playerA");
    const b = url.searchParams.get("playerB");
    if (a === b || !catalog.supported_replay_dates.includes(date)) return json(response, 422, { detail: { reason: "invalid_comparison" } });
    if (!["23", "24"].includes(a) || !["23", "24"].includes(b)) return json(response, 404, { detail: "player not found" });
    const first = fixtureProfile(a, date);
    const second = fixtureProfile(b, date);
    return json(response, 200, { ...catalog, replay_date: date, player_a: first, player_b: second, estimate_gap: first.estimate.point != null && second.estimate.point != null ? first.estimate.point - second.estimate.point : null });
  }
  if (url.pathname === "/api/analytics/evaluations") {
    if (url.searchParams.has("snapshotId") && url.searchParams.get("snapshotId") !== snapshotId) return json(response, 404, { detail: { reason: "evaluation_snapshot_mismatch" } });
    const metric = (mae, rmse) => ({ forecast_rows: 39988, mae, rmse });
    const interval = (coverage, mean_width) => ({ coverage, mean_width, rows: 39988 });
    return json(response, 200, { ...catalog, run_id: "fixture-run", report_sha256: "fixture-hash", validation: {
      baseline_validation: { pooled: metric(7.71, 9.90) }, variants: {
        player_only: { selected_config: "selected", configs: { selected: { pooled: metric(7.83, 9.95) } } },
        player_plus_context: { selected_config: "selected", configs: { selected: { pooled: metric(7.83, 9.94) } } }
      }
    }, final_test: { metrics: { ewma_20_hl5: metric(7.82, 10.06), player_only: metric(7.97, 10.15), player_plus_context: metric(7.96, 10.12) }, intervals: { ewma_20_hl5: interval(0.802, 24.79), player_only: interval(0.806, 25.26), player_plus_context: interval(0.805, 25.21) }, counts: { candidate_rows: 73506 }, paired_uncertainty: { lower: 0.108, upper: 0.175 }, prespecified_slices: {} }, promotion: { decision: "do_not_promote", gates: { validation_improvement: { passed: false }, final_paired_superiority: { passed: false }, supported_slices: { passed: false }, interval_guardrails: { passed: true } } }, serving_policy: { historical_s3_primary: "ewma_20_hl5", challenger_is_serving: false }, limitations: ["Historical reconstruction"], record_counts: {}, latest_build: { status: "failed", created_at: "2026-09-21", finished_at: "2026-09-21" } });
  }
  if (url.pathname === "/api/workbench/forecasts/evaluation") {
    return json(response, 200, {
      available: true,
      run_id: "b0e4bb3300011b5a3499",
      task: "conditional next-team-game basketball points estimation",
      limitations: [
        "Revised historical NBA Stats mirror data; original real-time publication timestamps unavailable.",
        "Schedule and opponent context are reconstructed from prior regular season outcomes strictly.",
        "Conditional on confirmed recorded appearance; does not estimate availability, injuries, or team placement."
      ],
      active_policy: {
        id: "bbf90110-097c-4421-8658-41b158c83b8b",
        policy_name: "points-v1-prior_blend",
        target_metric: "points",
        estimator_identity: "prior_blend",
        calibration_identity: "order_statistic_80pct",
        eligibility_criteria: { min_history: 1 },
        activated_at: "2026-10-01T12:38:00Z",
        experiment_run_id: "b0e4bb3300011b5a3499"
      },
      promotion: {
        decision: "do_not_promote",
        gates: {
          validation_improvement: {
            passed: false,
            pooled_relative_improvement: -0.0043,
            fold_differences: { v1: 0.0165, v2: -0.0527 }
          },
          final_paired_superiority: {
            passed: false,
            mae_difference: -0.0154,
            lower: -0.0522,
            upper: 0.0135,
            estimand: "player_only_MAE - prior_blend_MAE"
          },
          supported_slices: {
            passed: true,
            supported_count: 19,
            regressions_over_limit: []
          },
          interval_guardrails: {
            passed: true,
            challenger_coverage: 0.8036,
            width_ratio: 0.985
          }
        }
      },
      final_test: {
        split: {
          season: "2025-26",
          start: "2025-10-21",
          end: "2026-04-12",
          role: "final_test"
        },
        metrics: {
          prior_blend: { mae: 4.643, rmse: 6.071, player_balanced_mae: 4.505, forecast_rows: 48870, players: 530, target_dates: 162, unique_player_games: 24519 },
          player_only: { mae: 4.628, rmse: 6.027, player_balanced_mae: 4.476, forecast_rows: 48870, players: 530, target_dates: 162, unique_player_games: 24519 },
          player_plus_context: { mae: 4.625, rmse: 6.025, player_balanced_mae: 4.476, forecast_rows: 48870, players: 530, target_dates: 162, unique_player_games: 24519 }
        },
        intervals: {
          prior_blend: { core: { coverage: 0.8059, mean_width: 14.81, rows: 41806 }, early_season: { coverage: 0.7966, mean_width: 14.39, rows: 7064 } },
          player_only: { core: { coverage: 0.8036, mean_width: 14.59, rows: 41806 }, early_season: { coverage: 0.8212, mean_width: 14.57, rows: 7064 } }
        },
        prespecified_slices: {
          location_slice: {
            home: {
              prior_blend: { mae: 4.630, forecast_rows: 24435, players: 528 },
              player_only: { mae: 4.615, forecast_rows: 24435, players: 528 }
            },
            away: {
              prior_blend: { mae: 4.657, forecast_rows: 24435, players: 528 },
              player_only: { mae: 4.641, forecast_rows: 24435, players: 528 }
            }
          },
          team_rest_slice: {
            "1_day": {
              prior_blend: { mae: 4.636, forecast_rows: 30301, players: 526 },
              player_only: { mae: 4.613, forecast_rows: 30301, players: 526 }
            },
            back_to_back: {
              prior_blend: { mae: 4.729, forecast_rows: 4384, players: 502 },
              player_only: { mae: 4.750, forecast_rows: 4384, players: 502 }
            }
          }
        }
      },
      model_card_markdown: "# CourtLens model card: basketball-points-v1 evaluation\n\nRun `b0e4bb3300011b5a3499`. Promotion Decision: **do_not_promote**.\nServing policy: `prior_blend`."
    });
  }
  if (url.pathname === "/api/workbench/forecasts") {
    return json(response, 200, {
      items: [
        {
          id: "fc_iss_001",
          policy_id: "bbf90110-097c-4421-8658-41b158c83b8b",
          player_id: "23",
          player_name: "Fixture Star",
          team_id: "100",
          team_tricode: "TOR",
          target_game_id: "0022600001",
          target_game_date: "2026-10-21",
          target_opponent_id: "200",
          target_opponent_tricode: "BOS",
          issued_at_utc: "2026-10-01T12:00:00Z",
          dataset_id: "ds_wb_mock",
          features_hash: "mock_feat_hash_1",
          point_estimate: 25.4,
          interval_lower: 18.0,
          interval_upper: 32.8,
          availability_reason: "eligible_core",
          issuance_status: "issued",
          latest_score: null
        }
      ],
      summary: {
        total_issued: 1,
        total_scored: 0,
        total_pending: 1,
        total_unscored_dnp: 0,
        total_unscored_cancelled: 0,
        prospective_accuracy_status: "not_yet_observed",
        accuracy_metrics: null,
        active_policy: {
          policy_name: "points-v1-prior_blend",
          estimator_identity: "prior_blend"
        },
        message: "Prospective accuracy not yet observed: Awaiting 2026-27 regular season tipoff."
      },
      page: 1,
      page_size: 50,
      total_items: 1,
      warnings: []
    });
  }
  return json(response, 404, { detail: "not found" });

}).listen(Number(process.env.PORT || 4100), "127.0.0.1");

function fixtureProfile(id, date) {
  const guard = id === "24";
  const empty = date === "2023-01-02";
  return { ...catalog, replay_date: date, player: { id, name: guard ? "Fixture Guard" : "Fixture Star", season: "2022-23" }, last_observed: empty ? null : { team_id: guard ? "200" : "100", date: "2023-01-08", association: "last_observed_team" }, summaries: empty ? { last_5: null, last_10: null, season: null } : { last_5: { ...summary, reference_points_per_game: guard ? 31.5 : 45.5 }, last_10: summary, season: summary }, target: empty ? null : { game_id: guard ? "5" : "4", date: guard ? "2023-01-12" : "2023-01-11", team_id: guard ? "200" : "100", team: guard ? "BOS" : "TOR", opponent_id: guard ? "100" : "200", opponent: guard ? "TOR" : "BOS", side: "home", lead_days: guard ? 2 : 1, rest_days: 2, reconstruction: "last_observed_team" }, opponent_context: guard ? null : { eligible_games: 7, values: { points_allowed_per_game: 112.4 }, max_history_date: "2023-01-08" }, estimate: { status: empty ? "insufficient_history" : guard ? "artifact_not_available_for_cutoff" : "available", history_n: empty ? 0 : 10, point: empty || guard ? null : 42.4, interval: empty || guard ? null : { lower: 30, upper: 54.8, nominal_coverage: 0.8 } } };
}
