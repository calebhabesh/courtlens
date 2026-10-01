# Real-Data Research Workbench Case Studies

Status: **P9 Flagship Workbench Case Studies Complete**, 2026-10-01.  
Authoritative evidence for CourtLoad research workbench milestones P0–P9. All metrics, player stints, forecasts, and query responses are produced from real PostgreSQL records, SportsDataverse box scores, and scikit-learn offline evaluation artifacts.

---

## Case Study 1: Mid-Season Trade & Stint Tracking — Pascal Siakam (2023–24)

### 1.1 Context and Problem Statement
In professional basketball analytics, players traded mid-season pose severe data integrity challenges. Naive analytical systems either:
1. Attribute a traded player's full-season statistics exclusively to their latest team, distorting team-level historical research.
2. Cross-wire games across different team contexts, invalidating opponent allowance and pace adjustments.
3. Fail to reconcile the player's individual jersey stints with their whole-season totals.

During the 2023–24 season, forward **Pascal Siakam** (`person_id: 1627783`) played 39 games for the **Toronto Raptors** (`team_id: 1610612761`, TOR) before being traded on January 17, 2024 to the **Indiana Pacers** (`team_id: 1610612754`, IND), where he appeared in 41 games.

### 1.2 Observed Real-Data Evidence
CourtLoad models player participation at the granular player-game level (`WorkbenchPlayerGame`) and materializes distinct jersey stints alongside full-season aggregations:

| Scope | Team | Games | Min/G | PTS/G | REB/G | AST/G | FG% | 3P% | FT% |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Stint 1** | TOR | 39 | 34.7 | **22.23** | 6.33 | 4.87 | 52.2% | 31.7% | 75.8% |
| **Stint 2** | IND | 41 | 31.8 | **21.27** | 7.80 | 3.68 | 54.9% | 38.6% | 69.9% |
| **Season Total** | **TOT** | **80** | **33.2** | **21.74** | **7.09** | **4.26** | **53.6%** | **34.6%** | **73.2%** |

### 1.3 Invariants and Architectural Guarantees
1. **Zero Cross-Wiring:** A query for the Toronto Raptors' 2023–24 roster (`/api/workbench/teams/1610612761`) includes Pascal Siakam, but only counts his 39 games, 867 points, and 247 rebounds recorded while wearing a Raptors uniform. His subsequent 41 games for Indiana never appear in Toronto team totals.
2. **Single-Formula Arithmetic Reconciliation:**
   $$\text{Total Points} = 867 \text{ (TOR)} + 872 \text{ (IND)} = 1,739 \text{ PTS}$$
   $$\text{Points Per Game} = \frac{1,739 \text{ PTS}}{80 \text{ Games}} = 21.7375 \approx 21.74 \text{ PPG}$$
   The API, dbt warehouse marts, and export tools share the identical canonical metric formula from `src/courtload/domain/metrics.py`.
3. **Descriptive Discipline (No Inferred Claims):** CourtLoad displays Siakam's increased three-point accuracy in Indiana (38.6% vs. 31.7% in Toronto) as an empirical fact. It does not synthesize an unsupported causal narrative (e.g., claiming "Tyrese Haliburton's spacing caused Siakam's shooting improvement").

---

## Case Study 2: Prospective Points Forecasting & DNP Conditionality — Scottie Barnes (2025–26)

### 2.1 Context and Problem Statement
A core tenet of CourtLoad is temporal discipline: an analytical model must never look ahead in time, and missing observations must never be fabricated into false numeric values. In sports forecasting, injured or rested players who do not dress for a game (Did Not Play, DNP) are frequently misrepresented as "predicted 20 points, scored 0 points" or vice versa, corrupting scoring error distributions.

### 2.2 Model Architecture and Promotion
Following the Milestone P6 offline points forecasting protocol (`evaluation/config/points-v1.yaml`), CourtLoad evaluated:
- Fixed rolling baselines (`last_5`, `last_10`, `ewma_20`).
- Early-season carryover prior blend (`prior_blend`: blending prior-season rate with in-season observations).
- Small Gradient Boosted Trees (GBDT) challenger.

On the chronological holdout season, the carryover baseline achieved an out-of-time MAE of **4.72 PTS** and an empirical 80% interval coverage of **79.6%** (calibrated against nominal 80.0%). The GBDT challenger did not beat the baseline within the preregistered non-inferiority margin, resulting in the registered promotion and activation of policy `points-v1-prior_blend` (`ModelPolicyActivation.id: bbf90110-097c-4421-8658-41b158c83b8b`).

### 2.3 Real Forecast Issuance and Scoring Lifecycle
For **Scottie Barnes** (`person_id: 1630567`):

1. **Genuine Prospective Issuance (`ForecastIssuance`):**
   - **Target Game:** TOR vs. CLE (`game_id: 0022500624`, 2026-01-20).
   - **Issuance Cutoff:** 2026-01-19 23:59:59 UTC (prior day cutoff strictly enforced; $game\_date < replay\_date$).
   - **Input Release:** Pinned to immutable dataset `17251a08-a4eb-4f46-b356-999fcf37c65d`.
   - **Point Estimate:** **19.4 PTS**
   - **80% Prediction Interval:** **[12.0, 26.8] PTS** (calibrated dispersion).
   - **Conditionality Notice:** *Prospective points forecasts are strictly conditional on appearing in the target game.*

2. **Scoring Observation (`ForecastScore`):**
   - In the target game, Barnes dressed, played 35:12, and scored **22 PTS**.
   - **Absolute Error:** $|22.0 - 19.4| = 2.6 \text{ PTS}$.
   - **Interval Result:** $22.0 \in [12.0, 26.8]$ (Covered).
   - **Status:** `scored_appearance`.

3. **Handling of Non-Appearance (DNP):**
   - In a later game (TOR vs. ORL, 2026-03-03), Barnes was sidelined with a hand injury.
   - CourtLoad's scoring pipeline (`courtload score-forecasts`) matched the schedule to the official box score. Barnes was absent from the box score.
   - **Recorded State:** `status: unscored_dnp`, `reason: absent_from_box_score_unknown`.
   - **Guaranteed Invariant:** The forecast is **not** scored with an observed value of 0 PTS (which would have produced a spurious error of $|0 - 19.4| = 19.4$). It is cleanly segregated from empirical scoring accuracy metrics.

---

## Case Study 3: Defensive Box Statistics vs. Inferred Impact & Conference Placement Guardrails — Toronto Raptors

### 3.1 Context and Problem Statement
Users frequently ask natural language inquiries that exceed what available box-score data can substantiate:
1. *"Who is the best defender on the Raptors?"*
2. *"Will the Raptors win the Eastern Conference or make the playoffs?"*

Many commercial LLM integrations hallucinate synthetic numbers, fabricate advanced defensive metrics (e.g., claiming a player has a "+3.8 D-LEBRON" when no tracking data exists), or make unfounded probabilistic playoff forecasts. CourtLoad enforces domain guardrails through server-side verification and typed fallback responses.

### 3.2 Inquiry 1: "Who are the best defenders on the Raptors?"
When submitted to `/api/workbench/assistant/query`:
- **Allowed Tools Called:** `get_team_summary(team_id="1610612761", season="2023-24")`, `search_players(team_id="1610612761", sort_metric="stl", season="2023-24")`, `search_players(team_id="1610612761", sort_metric="blk", season="2023-24")`.
- **Server-Side Enforcement:**
  1. The assistant is strictly prohibited from declaring an overall composite "defensive rating" or "best defender".
  2. The response presents verified, named box-score event counts:
     - **Steals Leaders:** Scottie Barnes (1.29 SPG, 78 steals), Gary Trent Jr. (1.07 SPG, 76 steals).
     - **Blocks Leaders:** Scottie Barnes (1.47 BPG, 88 blocks), Jakob Poeltl (1.52 BPG, 76 blocks).
     - **Defensive Rebounds:** Scottie Barnes (6.02 DRPG, 361 DREB), Jakob Poeltl (5.80 DRPG, 290 DREB).
  3. Every number in the narrative is verified against an `EvidenceCellRef` in the server's `EvidenceLedger`.
  4. The response appends the mandatory domain limitation:
     > *CourtLoad does not provide an inferred composite "best defender" rating. Defensive production is presented as factual box-score event totals (steals, blocks, rebounds).*

### 3.3 Inquiry 2: "Can Toronto win the Eastern Conference or what seed will they be?"
When submitted to `/api/workbench/assistant/query`:
- **Server Guardrail Triggered:** Inquiry targets conference placement, seeding, or playoff probability.
- **Typed Response:** `status="model_not_available"`.
- **Verified Alternative Provided:**
  - Regular Season Record: **25 Wins, 57 Losses** (Win Percentage: **30.5%**).
  - Points Per Game: 112.4 PPG | Points Allowed: 118.8 PPG.
- **Mandatory Limitation Notice:**
  > *Conference placement and playoff projection models are deferred in this release. Presenting factual regular season record (25-57, 30.5% win rate) as an alternative. Ties in record ordering do not establish official conference placement.*

---

## Summary of Empirical Verification Across Case Studies

| Case Study | Entity | Key Invariant Demonstrated | Verification Mechanism |
| :--- | :--- | :--- | :--- |
| **Case Study 1** | Pascal Siakam (`1627783`) | Stint separation (TOR vs. IND) and exact arithmetic `TOT` reconciliation | `tests/integration/test_workbench_api.py::test_workbench_player_profile_stints` |
| **Case Study 2** | Scottie Barnes (`1630567`) | Out-of-time prospective forecast logging, empirical 80% interval calibration, DNP separation | `tests/unit/test_prospective_forecasts.py::test_scheduled_zero_scores_never_become_labels` |
| **Case Study 3** | Toronto Raptors (`1610612761`) | Named box stats defense, refusal of composite defense, conference placement deferral | `tests/unit/test_assistant.py::test_curated_benchmark_questions` |
