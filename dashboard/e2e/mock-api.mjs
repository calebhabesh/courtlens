import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { pc11Response, sixFactor } from "./pc11-fixtures.mjs";

// Recorded real retained finding, no question/provider prose. Other public examples stay
// unavailable in this fixture, exercising the partial-library state without fabricated results.
const retainedDistribution = JSON.parse(readFileSync(new URL("./fixtures/pc12-retained-distribution.json", import.meta.url), "utf8"));

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
      metrics: playerMetrics,
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
      metrics: { ...playerMetrics, pts: 1500, pts_per_game: 22.0 },
      portrait_available: false,
      lineage_url: "/api/workbench/lineage?playerId=24"
    }
  ],
  next_cursor: null,
  has_more: false,
  warnings: ["Historical reconstruction from completed records."]
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

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4100");
  if (url.pathname === `/api/workbench/assistant/investigations/${retainedDistribution.id}`) return json(response, 200, retainedDistribution);
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
    const players = [["23","Fixture Star"],["24","Fixture Guard"],["1627751","Fixture Shooter"],["1630567","Scottie Barnes"],["1628389","Bam Adebayo"], ...[1,2,3,4,5].map(n=>[String(n),`Fixture Player ${n}`])];
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
  if (url.pathname === "/api/workbench/catalog") return json(response, 200, {
    ...workbenchContext, snapshot_id: snapshotId, seasons: ["2025-26"], phases: ["regular_season"],
    default_season: "2025-26", default_phase: "regular_season", default_before_date: "2026-06-30",
    stats_scopes: [{ season: "2025-26", phase: "regular_season", coverage_start: "2025-10-21", coverage_end: "2026-04-12", default_before_date: "2026-06-30" }],
    stats_windows: ["season", "last_10", "last_5"], stats_normalizations: ["raw", "per_game", "per_36"],
    stats_sort_fields: Object.keys(workbenchPlayers.items[0].metrics), warnings: []
  });
  if (url.pathname === "/api/workbench/query" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const query = body.query;
    const rows = workbenchPlayers.items.map((row, index) => ({ ...row,
      percentiles: Object.fromEntries(Object.keys(row.metrics).map((key) => [key, index === 0 ? 75 : 25])),
      ...(body.presentation?.table_percentiles ? {
        table_qualified: true,
        table_percentiles: Object.fromEntries(Object.keys(row.metrics).map(key => [key, index === 0 ? 75 : 25])),
        table_cohort_sample_sizes: Object.fromEntries(Object.keys(row.metrics).map(key => [key, 2]))
      } : {})
    }));
    const selected = rows.filter((row) => (!query.name || row.player_name.toLowerCase().includes(query.name.toLowerCase())) &&
      (body.presentation?.player_ids == null || body.presentation.player_ids.includes(row.player_id)));
    const sort = query.sort?.[0];
    if (sort) selected.sort((a, b) => (sort.field === "player_name" ? a.player_name.localeCompare(b.player_name) : (a.metrics[sort.field] ?? 0) - (b.metrics[sort.field] ?? 0)) * (sort.direction === "asc" ? 1 : -1));
    return json(response, 200, { context: workbenchContext, query, total_eligible_players: rows.length,
      total_output_players: selected.length, output_offset: 0,
      cohort: { version: "pf01a-v1", scope_hash: "fixture-cohort", eligible_players: rows.length, formula: "midrank", good_directions: {} },
      ...(body.presentation?.table_percentiles ? { table_cohort: { version: "courtlens-table-percentiles-v1", scope_hash: "fixture-table-cohort", qualified_players: 2, min_season_minutes: 500, reference: "League", formula: "midrank" } } : {}),
      items: selected, next_cursor: null, has_more: false, warnings: [] });
  }
  if (url.pathname === "/api/workbench/status") return json(response, 200, workbenchStatus);
  if (url.pathname === "/api/workbench/players") {
    const q = (url.searchParams.get("name") ?? "").toLowerCase();
    let filtered = q ? workbenchPlayers.items.filter(p => p.player_name.toLowerCase().includes(q)) : [...workbenchPlayers.items];
    if (url.searchParams.get("sortMetric") === "min") filtered.sort((a,b) => b.total_minutes-a.total_minutes || a.player_id.localeCompare(b.player_id));
    // Dedicated observed-team duo fixture; kept out of the normal two-row Stats cohort.
    if (url.searchParams.get("teamId") === "TOR") filtered = filtered.map(player => ({...player,teams:["TOR"]}));
    return json(response, 200, { ...workbenchPlayers, items: filtered, total_eligible_players: filtered.length });
  }
  if (url.pathname === "/api/workbench/players/23") return json(response, 200, workbenchPlayerProfile("23"));
  if (url.pathname === "/api/workbench/players/24") return json(response, 200, workbenchPlayerProfile("24"));
  if (url.pathname === "/api/workbench/players/23/games") return json(response, 200, workbenchPlayerGames("23"));
  if (url.pathname === "/api/workbench/players/24/games") return json(response, 200, workbenchPlayerGames("24"));
  // FO10: bounded synthetic detail fixtures cover tabs, known zero and unknown outcomes.
  if (["/api/workbench/teams/100/four-factors", "/api/workbench/teams/200/four-factors"].includes(url.pathname)) return json(response, 200, {
    team:workbenchTeamDetail.team,context:workbenchContext,games_played:72,pace:99.4,off_rating:115.4,def_rating:110.2,net_rating:5.2,
    ratings:[["off_rating","Offensive Rating",115.4,113.0],["def_rating","Defensive Rating",110.2,113.0],["net_rating","Net Rating",5.2,0]].map(([key,display_name,value,league_avg]) => ({key,display_name,value,league_avg,unit:"rating",formula:"Synthetic UI fixture",total_teams:30})), shooting_percentages:{opp_fg_pct:0.437},league_averages:{},warnings:[],
    offense_factors:[{key:"efg_pct",display_name:"Effective Field Goal %",value:0.54,league_avg:0.53,rank:8,percentile:74,total_teams:30,good_direction:"high",unit:"percentage",formula:"Synthetic fixture",weight:0.4}],
    defense_factors:[{key:"opp_efg_pct",display_name:"Opponent eFG%",value:url.pathname.includes("/200/") ? 0.5 : null,league_avg:0.53,rank:url.pathname.includes("/200/") ? 4 : null,percentile:url.pathname.includes("/200/") ? 88.3 : null,total_teams:30,good_direction:"low",unit:"percentage",formula:"Synthetic fixture",weight:0.4}],
    three_point_scenario:{observed_fg3m:12,observed_fg3a:32,observed_3p_pct:0.375,league_3p_pct:0.375,hypothetical_fg3m:12,delta_points:0,actual_ppg:115.4,hypothetical_ppg:115.4,delta_off_rating:0,delta_net_rating:0,disclaimer:"Synthetic what-if accounting fixture, not a causal effect."}
  });
  if (url.pathname === "/api/workbench/teams/100/schedule") return json(response,200,{
    team:workbenchTeamDetail.team,context:workbenchContext,overall_record:{...workbenchTeamDetail.record,current_streak:"W2",differential:5.2},
    home_split:{games_played:36,wins:24,losses:12,win_pct:0.667,ppg:115.4,opp_ppg:110.2,differential:5.2},away_split:{games_played:36,wins:21,losses:15,win_pct:0.583,ppg:115.4,opp_ppg:110.2,differential:5.2},
    rest_splits:[],back_to_back_summary:{},longest_homestand:4,longest_road_trip:3,warnings:[],
    games:[{game_id:"fo10-unknown",game_date:"2026-03-01",opponent_tricode:"BOS",opponent_name:"Boston Celtics",side:"home",team_points:0,opponent_points:null,is_win:null,rest_days:0,is_back_to_back:true,rest_bucket:"0_days_rest"}]
  });
  if (url.pathname === "/api/workbench/teams/100/peers") return json(response,200,{team:workbenchTeamDetail.team,context:workbenchContext,dimensions:[],warnings:[],peers:[{team_id:"200",tricode:"BOS",name:"Boston Celtics",similarity_score:0.95,distance:0.1,conference:"Eastern"}]});
  if (url.pathname === "/api/workbench/teams") return json(response, 200, { ...workbenchTeams, teams: workbenchTeams.teams.map((team, index) => ({ ...team, table_percentiles: { wins: index ? 75 : 25, win_pct: index ? 75 : 25, ppg: index ? 75 : 25, opp_ppg: index ? 75 : 25, net_margin: index ? 75 : 25 }, table_cohort_sample_sizes: { wins: 2, win_pct: 2, ppg: 2, opp_ppg: 2, net_margin: 2 } })) });
  if (url.pathname === "/api/workbench/teams/1610612761") return json(response, 200, { ...workbenchTeamDetail, team: { ...workbenchTeamDetail.team, id: "1610612761" } });
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
    return json(response, 200, mockPlayoffBracket);
  }
  if (url.pathname.startsWith("/api/workbench/playoffs/series/")) {
    return json(response, 200, mockPlayoffSeriesDetail);
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
