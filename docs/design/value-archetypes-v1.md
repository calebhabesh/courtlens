# Value metric and derived archetypes v1 (PC09)

Status: contract for [presentation clarity](../presentation-clarity-plan.md) PC09 (C16, C17).
Code: `src/courtlens/evaluation/value_archetypes.py` (pure),
`src/courtlens/evaluation/value_archetype_runner.py` (offline run),
`src/courtlens/services/value_archetypes.py` (read-only serving).
Evidence: [PC09 evidence](../evidence/pc09/README.md).

Both outputs are descriptive. They never enter forecasting features, B26 experiments or the
assistant's frozen replay schemas, and they carry no verdict, "best player" or winner label.

## Value metric (C16): Box-prior RAPM

The value metric is the **Box-Prior RAPM (BPR)** already fitted and sealed by IM04
([impact ratings v1](impact-ratings-v1.md#on-off-and-box-prior-rapm-bpr)): a box-score regression
trained only on earlier seasons' RAPM is the ridge prior, and the current window's RAPM is refit
around it. PC09 adds no new fit; it selects and serves.

- **Selection rule (fixed before evaluation):** among the 12 sealed IM04 artifacts, the
  regular-season artifact whose window ends in the latest completed season, and among those the
  longest window with an available BPR. With the sealed set this is the 2Y regular-season window
  2024-25 + 2025-26 (cutoff 2026-07-01). The rule is not chosen by evaluation scores.
- **Per player:** BPR total (`value`), offense, favorable-sign defense, qualified percentile,
  reconstructed seconds, games, `qualified` (IM04 rule: 20 games and 1,000 controls each side) and
  `prior_available`. Unqualified players keep their coefficient with a small-sample flag and no
  percentile.
- **Unknown, not zero:** a player with no stints in the window (for example a 2026 rookie) has no
  value. Serving returns null with a reason, never 0 or a league-average stand-in.
- **Units:** points per 100 possessions relative to a minutes-weighted average player.
- **Label:** "Box-prior RAPM (BPR), regular season 2024-25 – 2025-26". The C16 interim
  (sealed RAPM, else box composite) is not needed because BPR covers every player with stints.

### Out-of-time evaluation

Each fold predicts a season's **1Y regular-season RAPM** for qualified players using only
artifacts whose windows end in an earlier season, plus that season's own box prior (trained on
earlier targets and earlier box vectors only). Predictors: earlier RAPM (each window ending in
the previous season), earlier BPR where available, the box prior, and a zero baseline. Scores are
seconds-weighted RMSE and Pearson correlation on the cohort where every predictor is defined;
coverage and exclusions are reported. Missing predictors are never filled with zero.

With three admitted seasons there are two folds (targets 2024-25 and 2025-26); BPR itself can
only be scored in the 2025-26 fold. The report is a diagnostic, not a promotion gate or a
forecast. Its numbers are in the evidence README.

## Derived archetypes (C17)

A Gaussian mixture over nine per-player-season rate features, regular season only, pooled over
the admitted seasons 2023-24, 2024-25 and 2025-26 (no new fetch; D5).

| Feature | Definition (summed over games, each game with its own team context) |
| --- | --- |
| `usg_pct` | 100 · (FGA + 0.44 FTA + TOV) / Σ share · (team FGA + 0.44 FTA + TOV) |
| `ast_pct` | 100 · AST / Σ (share · team FGM − player FGM) |
| `three_rate` | 3PA / FGA |
| `rim_rate` | Restricted Area FGA / zone-known FGA (admitted research shot dataset) |
| `oreb_pct` | 100 · ORB / Σ share · (team ORB + opponent DRB) |
| `dreb_pct` | 100 · DRB / Σ share · (team DRB + opponent ORB) |
| `blk_pct` | 100 · BLK / Σ share · (opponent FGA − opponent 3PA) |
| `stl_pct` | 100 · STL / Σ share · opponent possessions (FGA + 0.44 FTA − ORB + TOV) |
| `ft_rate` | FTA / FGA |

`share` = player seconds / (team seconds / 5) for that game. Inputs: the single served workbench
dataset (`fct_workbench_player_game`, `fct_workbench_team_game`) and the single admitted research
shot dataset, read in one read-only transaction; both content hashes are recorded. A team-game
with any unknown-appearance or unknown-minutes row is excluded entirely (counted). A zero
denominator leaves the feature null and the sample incomplete; it is never 0.

- **Training sample:** complete player-seasons with at least 500 minutes (C10 minimum).
- **Model:** standardize on the training sample; scikit-learn 1.6.1 `GaussianMixture`, full
  covariance, `n_init` 10, seed 2509. K is the BIC minimum over {6, 7, 8} (fixed grid). Clusters
  are reordered by mixture weight, largest first, so labels do not depend on EM initialization.
- **Membership:** soft probabilities for every complete player-season, including unqualified ones
  (flagged small sample). Primary archetype = highest probability; color = primary.
- **Names:** clusters are named by hand after inspecting means and exemplars, in
  [archetype-names-v1.json](archetype-names-v1.json), bound to the archetype artifact hash. Names
  start as `proposed` and become `confirmed` only after owner review. Renaming never changes the
  fitted artifact.
- **Label:** always "derived archetype". It describes statistical style in one season, not a
  listed position (positions come from the NBA player index) or a role claim.
- **Refit:** each new completed season is a new hashed artifact; earlier artifacts never change.

## Artifacts and serving

The runner writes canonical JSON to exclusive-created, content-addressed paths under
`data/derived/value-archetypes-v1/{value,evaluation,archetypes,runs}`. Semantic artifacts exclude
wall time; the run receipt records runtime. Two independent runs must reproduce every hash.

The serving manifest (`serving/<sha256>.json`) is a bounded projection: the value rows, the
evaluation folds, cluster means and weights, names, and each player's **latest** complete
regular-season membership with its minutes and features. It holds no game rows or shots.
The API verifies the file name equals the SHA-256 of its bytes and returns 503 on mismatch.
`GET /api/v1/workbench/value-archetypes` serves it with player names; a missing manifest reports
`unavailable` with a reason.
