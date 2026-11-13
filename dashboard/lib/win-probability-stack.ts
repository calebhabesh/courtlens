/**
 * Round 3: the technical facts the "How the model works" section quotes. Each number is checked
 * against the frozen manifests in `win-probability-stack.test.ts`, so the prose cannot drift from
 * the models that are actually served. Method words follow the registrations
 * (`courtlens-win-probability-v2`, `courtlens-win-probability-v4`).
 */

/** The in-game boosters' inputs, grouped for display (the manifest's `main_features`). */
export const ENGINE_INPUTS: readonly { label: string; features: readonly string[] }[] = [
  { label: "Score and clock", features: ["margin", "seconds_left", "fraction", "overtime"] },
  { label: "Pregame margin", features: ["mu", "mu_fraction"] },
  { label: "Possession", features: ["possession", "possession_age", "pending_own", "pending_opp"] },
  { label: "Fouls and bonus", features: ["fouls_own", "fouls_opp", "bonus_own", "bonus_opp"] },
  { label: "Timeouts", features: ["timeouts_own", "timeouts_opp"] },
  { label: "Pregame context", features: ["home", "strength", "form", "rest", "b2b_own", "b2b_opp", "games7", "travel_own", "travel_opp", "denver", "utah"] },
];

export const MODEL_STACK = {
  /** Pregame coefficients in the own read (`pregame.coefficients`). */
  ownInputs: 11,
  ownFitSeasons: "2015-16 to 2021-22",
  formRidgeLambda: 20,
  recentAppearances: 10,
  /** `main_features` and `end_game_features`. */
  engineInputs: 27,
  endGameInputs: 16,
  /** `mean_start_shrink`. */
  startShrink: 0.7,
  stateSeconds: 15,
  endGameSeconds: 120,
  endGameClip: 12,
  /** v4: `market.w_fit_games`, `market.w_fit_seasons`. */
  weightFitGames: 4883,
  weightFitSeasons: "2022-23 to 2025-26",
} as const;
