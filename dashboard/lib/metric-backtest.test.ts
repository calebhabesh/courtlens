import { describe, expect, it } from "vitest";
import fixture from "../e2e/fixtures/metric-backtest.json";
import { gainTone, gainText, groupGain, orderings, pairOf, signed, verdictSentences, type MetricBacktestPage } from "./metric-backtest";

const page = fixture as unknown as MetricBacktestPage;

describe("metric backtest helpers", () => {
  it("flips a pair so positive still favours the named candidate", () => {
    const forward = page.results.pairs.find(p => p.candidate === "time_decay" && p.reference === "rapm_1y")!;
    const flipped = pairOf(page.results.pairs, "rapm_1y", "time_decay")!;
    expect(flipped.candidate).toBe("rapm_1y");
    expect(flipped.pooled.rmse.gain).toBe(-forward.pooled.rmse.gain);
    expect(flipped.pooled.rmse.low).toBe(-forward.pooled.rmse.high);
    expect(flipped.verdict).toBe(forward.verdict === "candidate_better" ? "reference_better" : forward.verdict === "reference_better" ? "candidate_better" : "no_ranking");
    expect(flipped.seasons_candidate_lower_rmse).toBe(forward.seasons.length - forward.seasons_candidate_lower_rmse - forward.seasons.filter(s => forward.per_season[s].rmse.gain === 0).length);
    expect(pairOf(page.results.pairs, "time_decay", "rapm_1y")).toBe(forward);
  });

  it("reads a 2026-27 pair served either way round", () => {
    const pair = { candidate: "team_net", reference: "time_decay", rmse: { gain: -0.5, low: -1, high: 0.25 }, accuracy: { gain: 0, low: 0, high: 0 }, brier: { gain: 0, low: 0, high: 0 }, log_loss: { gain: 0, low: 0, high: 0 } };
    const group = { games: 30, pairs: [pair] };
    expect(groupGain(group, "time_decay", "team_net")).toEqual({ gain: 0.5, low: -0.25, high: 1 });
    expect(groupGain(group, "team_net", "time_decay")).toEqual(pair.rmse);
    expect(groupGain(group, "time_decay", "rapm_1y")).toBeUndefined();
  });

  it("colours a gain only when its whole interval is on one side of zero", () => {
    expect(gainTone({ low: 0.1, high: 0.4 })).toBe("positive");
    expect(gainTone({ low: -0.4, high: -0.1 })).toBe("negative");
    expect(gainTone({ low: -0.1, high: 0.4 })).toBeUndefined();
    expect(gainTone(undefined)).toBeUndefined();
  });

  it("formats signs and intervals", () => {
    expect(signed(0.8)).toBe("+0.80");
    expect(signed(-0.311)).toBe("−0.31");
    expect(signed(-0.001)).toBe("0.00");
    expect(gainText({ gain: 0.5, low: 0.25, high: 0.75 })).toBe("+0.50 (+0.25 to +0.75)");
  });

  it("states the verdict only from the served pair verdicts", () => {
    const sentences = verdictSentences(page);
    const best = page.results.verdict.best;
    if (best.length === 1) expect(sentences[0]).toContain(page.metrics[best[0]].label);
    else expect(sentences[0]).toMatch(/No single metric/);
    const unranked = page.results.pairs.filter(p => p.verdict === "no_ranking");
    if (unranked.length) expect(sentences.at(-1)).toMatch(/can't be separated|No ranking/);
    for (const o of orderings(page)) expect(["candidate_better"]).toContain(o.pair.verdict);
  });

  it("serves every candidate a note and the registered test seasons", () => {
    expect(Object.keys(page.metrics)).toEqual(page.results.registration.parameters.candidates);
    expect(page.results.candidates.projected_impact.test_seasons).toEqual(["2024-25", "2025-26"]);
  });
});
