import { describe, expect, it } from "vitest";
import {
  dimensionLabel, eligibilityText, estimandModels, gainFromDifference, gainTone, insideSplit, issueTiming, ledgerSpan, modelOrder, orderedDimensions, orderedSubgroups,
  outcomeOf, seasonOf, subgroupLabel, timingCounts, visitorText,
} from "./points-forecasts";
import type { ForecastIssuanceItem, PointsForecastEvaluation } from "./types";

const item = (over: Partial<ForecastIssuanceItem>): ForecastIssuanceItem => ({
  id: "x", policy_id: "p", player_id: "1", player_name: "A", team_id: "DEN", team_tricode: "DEN", target_game_id: "g", target_game_date: "2026-01-17",
  target_opponent_id: "WAS", target_opponent_tricode: "WAS", issued_at_utc: "2026-10-01T17:14:19Z", dataset_id: "d", features_hash: "h", point_estimate: 10,
  interval_lower: 3, interval_upper: 17, availability_reason: "eligible_core", issuance_status: "issued", latest_score: null, ...over,
});

describe("RD16 points forecasts rules", () => {
  it("turns a served A − B difference into A's gain, swapping the bounds", () => {
    // player_only_MAE - prior_blend_MAE = −0.0154 (−0.0522 to +0.0135): player-only missed by less, interval across zero.
    expect(gainFromDifference(-0.0154, -0.0522, 0.0135)).toEqual({ value: 0.0154, low: -0.0135, high: 0.0522 });
  });

  it("colours a gain only where its 95% interval excludes zero", () => {
    expect(gainTone(gainFromDifference(-0.0154, -0.0522, 0.0135))).toBeUndefined();
    // The archive: context − EWMA = +0.142 (+0.108 to +0.175), so context's gain is wholly below zero.
    expect(gainTone(gainFromDifference(0.142, 0.108, 0.175))).toBe("bad");
    expect(gainTone(gainFromDifference(-0.2, -0.3, -0.1))).toBe("good");
    expect(gainTone(null)).toBeUndefined();
  });

  it("reads the two models from a served estimand", () => {
    expect(estimandModels("player_only_MAE - prior_blend_MAE")).toEqual(["player_only", "prior_blend"]);
    expect(estimandModels("player_plus_context_MAE - ewma_20_hl5_MAE")).toEqual(["player_plus_context", "ewma_20_hl5"]);
    expect(estimandModels(undefined)).toBeNull();
  });

  it("tells a back-dated forecast from one issued before its game", () => {
    expect(issueTiming(item({}))).toBe("after");
    expect(issueTiming(item({ target_game_date: "2026-10-21" }))).toBe("before");
    expect(issueTiming(item({ target_game_date: "2026-10-01" }))).toBe("same_day");
    expect(timingCounts([item({}), item({ target_game_date: "2026-10-21" })])).toEqual({ before: 1, same_day: 0, after: 1 });
  });

  it("finds the span of a ledger page and whether it sits inside the test split", () => {
    const span = ledgerSpan([item({ target_game_date: "2026-01-16" }), item({})]);
    expect(span).toEqual({ issued: ["2026-10-01", "2026-10-01"], games: ["2026-01-16", "2026-01-17"] });
    expect(insideSplit(span.games, { start: "2025-10-21", end: "2026-04-12" })).toBe(true);
    expect(insideSplit(span.games, { start: "2026-10-21", end: "2027-04-12" })).toBe(false);
    expect(insideSplit(null, { start: "2025-10-21", end: "2026-04-12" })).toBe(false);
  });

  it("gives a game date its season, turning over in August", () => {
    expect(seasonOf("2026-01-17")).toBe("2025-26");
    expect(seasonOf("2026-10-21")).toBe("2026-27");
    expect(seasonOf("2000-01-05")).toBe("1999-00");
  });

  it("keeps an absent box-score row unknown, never zero", () => {
    const score = (score_status: string, reason: string | null = null) => ({ id: "s", issuance_id: "x", scored_at: "t", scoring_policy_id: "p", score_status, reason });
    expect(outcomeOf(item({}))).toBe("pending");
    expect(outcomeOf(item({ latest_score: { ...score("scored"), observed_points: 0 } }))).toBe("scored");
    expect(outcomeOf(item({ latest_score: score("unscored_dnp", "absent_from_box_score_unknown") }))).toBe("absent");
    expect(outcomeOf(item({ latest_score: score("unscored_dnp", "did_not_appear_dnp") }))).toBe("did_not_play");
    expect(eligibilityText("eligible_core")).toBe("10 or more games this season");
  });

  it("labels the served slice keys, including the minute bands the old page missed", () => {
    expect(subgroupLabel("prior_minutes_slice", "<15")).toBe("Under 15");
    expect(subgroupLabel("prior_minutes_slice", ">=28")).toBe("28 or more");
    expect(subgroupLabel("prior_season_eligibility", "not_eligible")).toBe("Fewer than 20 games");
    expect(dimensionLabel("location_slice")).toBe("Location");
    expect(orderedSubgroups("team_rest_slice", ["1_day", "back_to_back", "4_plus_days", "2_to_3_days"])).toEqual(["back_to_back", "1_day", "2_to_3_days", "4_plus_days"]);
    expect(orderedDimensions(["team_rest_slice", "zzz", "current_appearances_slice"])).toEqual(["current_appearances_slice", "team_rest_slice", "zzz"]);
  });

  it("puts the served model first, then the finalist", () => {
    const evaluation = { available: true, validation: { baseline: "prior_blend", challenger_finalist: "player_only", selected_configs: {} },
      final_test: { split: { start: "", end: "", role: "" }, metrics: { player_plus_context: {}, player_only: {}, prior_blend: {} }, intervals: {}, prespecified_slices: {} } } as unknown as PointsForecastEvaluation;
    expect(modelOrder(evaluation)).toEqual(["prior_blend", "player_only", "player_plus_context"]);
  });

  it("drops project codes from served text", () => {
    expect(visitorText("M6 did not count observed S3 appearances")).toBe("did not count observed the final test appearances");
  });
});

describe("RD16 round 2", () => {
  it("labels a tree setting from its served parameters or its key", async () => {
    const { settingLabel } = await import("./points-forecasts");
    expect(settingLabel("leaves_15__l2_0")).toBe("15\u00a0leaves, L2\u00a00");
    expect(settingLabel("leaf_31__l2_1", { max_leaf_nodes: 31, l2_regularization: 1 })).toBe("31\u00a0leaves, L2\u00a01");
  });

  it("builds every candidate and checks the chosen ones had the lowest pooled miss", async () => {
    const { pointsSelectionRows, chosenByLowestPooled } = await import("./points-forecasts");
    const m = (mae: number) => ({ mae, forecast_rows: 10 });
    const results = {
      baseline_validation: { folds: { v1: { a: m(5), b: m(4) }, v2: { a: m(5), b: m(4) } }, pooled: { a: m(5), b: m(4) } },
      challenger_validation: { t1: { configs: { leaves_15__l2_0: { pooled: m(3.9) }, leaves_31__l2_0: { pooled: m(3.8) } } }, t2: { configs: { leaves_15__l2_0: { pooled: m(3.7) } } } },
      selected_baseline: "b", selected_configs: { t1: "leaves_31__l2_0", t2: "leaves_15__l2_0" }, challenger_finalist: "t2",
    };
    const rows = pointsSelectionRows(results);
    expect(rows.map(r => [r.key, r.chosen, r.finalist])).toEqual([["a", false, false], ["b", true, false], ["t1-leaves_15__l2_0", false, false], ["t1-leaves_31__l2_0", true, false], ["t2-leaves_15__l2_0", true, true]]);
    expect(chosenByLowestPooled(rows)).toBe(true);
    expect(chosenByLowestPooled(pointsSelectionRows({ ...results, selected_baseline: "a" }))).toBe(false);
    expect(chosenByLowestPooled(pointsSelectionRows({ ...results, challenger_finalist: "t1" }))).toBe(false);
  });

  it("finds a slice's best and worst groups without calling either a result", async () => {
    const { slicePattern } = await import("./points-forecasts");
    expect(slicePattern([{ key: "1_to_4", change: -0.245 }, { key: "40_plus", change: 0.021 }, { key: "x", change: null }])).toMatchObject({ best: { key: "1_to_4" }, worst: { key: "40_plus" }, allBetter: false, allWorse: false });
    expect(slicePattern([{ key: "a", change: -0.1 }, { key: "b", change: -0.2 }])).toMatchObject({ allBetter: true, best: { key: "b" } });
    expect(slicePattern([{ key: "a", change: 0.1 }])).toBeNull();
  });
});
