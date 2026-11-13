// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_INPUTS, MODEL_STACK } from "./win-probability-stack";

const ROOT = path.resolve(__dirname, "../..");
const frozen = (name: string) => JSON.parse(readFileSync(path.join(ROOT, "evaluation/research/frozen", name), "utf8"));
const v2 = frozen("courtlens-win-probability-v2.json");
const v4 = frozen("courtlens-win-probability-v4.json");
const range = (seasons: string[]) => `${seasons[0]} to ${seasons.at(-1)}`;

describe("the model facts the page quotes match the frozen manifests", () => {
  it("the own read and the in-game engine", () => {
    expect(Object.keys(v2.pregame.coefficients)).toHaveLength(MODEL_STACK.ownInputs);
    expect(v2.main_features).toHaveLength(MODEL_STACK.engineInputs);
    expect(v2.end_game_features).toHaveLength(MODEL_STACK.endGameInputs);
    expect(v2.mean_start_shrink).toBe(MODEL_STACK.startShrink);
    expect(v2.trained_through).toBe(MODEL_STACK.ownFitSeasons.slice(-7));
  });
  it("every engine input is shown exactly once", () => {
    const shown = ENGINE_INPUTS.flatMap(g => g.features);
    expect([...shown].sort()).toEqual([...v2.main_features].sort());
  });
  it("the line's weight was fitted on the games and seasons quoted", () => {
    expect(v4.market.w_fit_games).toBe(MODEL_STACK.weightFitGames);
    expect(range(v4.market.w_fit_seasons)).toBe(MODEL_STACK.weightFitSeasons);
  });
  it("the registration's method text names the numbers quoted", () => {
    const method: string = JSON.parse(readFileSync(path.join(ROOT, "evaluation/research/registrations/courtlens-win-probability-v2.json"), "utf8")).method.join(" ");
    expect(method).toContain(`every ${MODEL_STACK.stateSeconds} seconds of game clock`);
    expect(method).toContain(`lambda ${MODEL_STACK.formRidgeLambda}`);
    expect(method).toContain(`last ${MODEL_STACK.recentAppearances} appearances`);
    expect(method).toContain(`fitted on ${MODEL_STACK.ownFitSeasons}`);
    expect(method).toContain(`clipped to [-${MODEL_STACK.endGameClip}, ${MODEL_STACK.endGameClip}]`);
    expect(method).toContain(`${MODEL_STACK.endGameSeconds} seconds or less`);
    expect(method).toContain("two LightGBM boosters");
  });
});
