import { createServer } from "node:http";

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

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4100");
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
    const metric = (mae, rmse) => ({ forecast_rows: 39988, mae, rmse });
    const interval = (coverage, mean_width) => ({ coverage, mean_width, rows: 39988 });
    return json(response, 200, { ...catalog, run_id: "fixture-run", report_sha256: "fixture-hash", validation: {
      baseline_validation: { pooled: metric(7.71, 9.90) }, variants: {
        player_only: { selected_config: "selected", configs: { selected: { pooled: metric(7.83, 9.95) } } },
        player_plus_context: { selected_config: "selected", configs: { selected: { pooled: metric(7.83, 9.94) } } }
      }
    }, final_test: { metrics: { ewma_20_hl5: metric(7.82, 10.06), player_only: metric(7.97, 10.15), player_plus_context: metric(7.96, 10.12) }, intervals: { ewma_20_hl5: interval(0.802, 24.79), player_only: interval(0.806, 25.26), player_plus_context: interval(0.805, 25.21) }, counts: { candidate_rows: 73506 }, paired_uncertainty: { lower: 0.108, upper: 0.175 }, prespecified_slices: {} }, promotion: { decision: "do_not_promote", gates: { validation_improvement: { passed: false }, final_paired_superiority: { passed: false }, supported_slices: { passed: false }, interval_guardrails: { passed: true } } }, serving_policy: { historical_s3_primary: "ewma_20_hl5", challenger_is_serving: false }, limitations: ["Historical reconstruction"], record_counts: {}, latest_build: { status: "failed", created_at: "2026-09-21", finished_at: "2026-09-21" } });
  }
  return json(response, 404, { detail: "not found" });
}).listen(4100, "127.0.0.1");

function fixtureProfile(id, date) {
  const guard = id === "24";
  const empty = date === "2023-01-02";
  return { ...catalog, replay_date: date, player: { id, name: guard ? "Fixture Guard" : "Fixture Star", season: "2022-23" }, last_observed: empty ? null : { team_id: guard ? "200" : "100", date: "2023-01-08", association: "last_observed_team" }, summaries: empty ? { last_5: null, last_10: null, season: null } : { last_5: { ...summary, reference_points_per_game: guard ? 31.5 : 45.5 }, last_10: summary, season: summary }, target: empty ? null : { game_id: guard ? "5" : "4", date: guard ? "2023-01-12" : "2023-01-11", team_id: guard ? "200" : "100", team: guard ? "BOS" : "TOR", opponent_id: guard ? "100" : "200", opponent: guard ? "TOR" : "BOS", side: "home", lead_days: guard ? 2 : 1, rest_days: 2, reconstruction: "last_observed_team" }, opponent_context: guard ? null : { eligible_games: 7, values: { points_allowed_per_game: 112.4 }, max_history_date: "2023-01-08" }, estimate: { status: empty ? "insufficient_history" : guard ? "artifact_not_available_for_cutoff" : "available", history_n: empty ? 0 : 10, point: empty || guard ? null : 42.4, interval: empty || guard ? null : { lower: 30, upper: 54.8, nominal_coverage: 0.8 } } };
}
