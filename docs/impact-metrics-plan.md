CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

After RN01, translate `src/courtload/` paths below to `src/courtlens/`.

# CourtLens impact metrics: build Databallr-class data from public inputs

Prepared 2026-10-07. **The owner confirmed the decisions below on 2026-10-07. Blocks IM01–IM08 are
pending until the [progress log](impact-metrics-progress.md) records measured evidence.** A plan is
not runtime evidence.

This handoff replaces the "Databallr" section (AD01–AD04) of the
[assistant agent handoff](assistant-agent-plan.md). That section planned to import Databallr's
published values with permission. The owner clarified that the goal is to **have the same kind of
data Databallr has**, built by CourtLens from the same public inputs, not to copy Databallr's
outputs. No Databallr request, import or permission is needed or planned. **Never fetch from
`databallr.com` or `api.databallr.com`**: their terms forbid copying their materials and reverse
engineering their software.

It unblocks, under a newly documented policy, the population gates of B19/B20 (stints and
possessions), B21/B22 (WOWY/on-off, already verified as operations) and the gated Impact, On-Off and
Six Factor Stats presets. It does **not** complete or alter the B26 preregistered experiments
(`courtload-rapm-v1`, `courtload-six-factor-v1`). Those stay their own out-of-time experiments and
may later bind to IM03 data through a new preregistration binding.

Still in force: temporal discipline, append-only hashed acquisitions and memberships, sealed
evidence, no causal "isolated skill" claims, unknown is not zero, local non-commercial use of NBA
data with attribution, and the [AGENTS.md](../AGENTS.md) verification commands.

## Why Databallr has these numbers and CourtLens does not

Databallr's inputs are public NBA data (play-by-play, box scores, shot locations, matchups, hustle,
tracking, draft combine), mostly from NBA.com. Their value is the modelling (RAPM fits, DPM,
six-factor decomposition, play-type classification). CourtLens was blocked by plumbing, not rights:

1. **NBA.com does not answer this machine's scripted requests.** Checked 2026-10-07: `stats.nba.com`
   timed out (with and without browser headers), and `cdn.nba.com` live-data play-by-play and
   boxscore returned 403. B19d recorded the same timeouts.
2. **B19/B20 quarantine any game whose sources disagree** (23 starter disagreements in four
   candidate games, one malformed minute, rotation files for only 165 of 1,230 games). No
   population was ever admitted, so RAPM, on/off and six-factor have no rows.
3. **A complete public archive exists.** `shufinskiy/nba_data` (Apache 2.0, already admitted for
   shots under [research-source-admission-v1](design/research-source-admission-v1.md)). Checked
   2026-10-07, last commit 2026-07-17 "add full nba PO 2025/26":
   - `nbastatsv3_2025` (8.97 MB xz) and `cdnnba_2025` (19.3 MB): full 2025-26 regular-season
     play-by-play. The archive labels seasons by start year.
   - `nbastatsv3_po_2025`, `cdnnba_po_2025`: 2025-26 playoffs.
   - `matchups_2025` (4.15 MB): defensive matchups.
   - `shotdetail_2025`: shot detail.
   - `pbpstats_2024` and earlier: pbpstats possession data. **No `pbpstats_2025`**, so 2025-26
     possessions must be built by CourtLens from v3/cdn play-by-play.
   - Same families exist for earlier seasons (stats.nba.com from 1996-97, data.nba.com from 2016-17,
     matchups from 2017-18).

## Locked decisions (owner, 2026-10-07)

| # | Decision |
| --- | --- |
| M1 Goal | Compute Databallr-class metrics from public inputs. Do not import, scrape or compare in bulk against Databallr. |
| M2 Disagreeing sources | **Patch, don't quarantine.** Deterministic, documented, pbpstats-style repair rules. Each repair is an override row with a rule ID. Each game gets a quality flag (`clean`, `patched`, `excluded`). Exclude only when unrecoverable. Report coverage and patch rates; no threshold is required to ship, but the rates are shown with the metrics. |
| M3 Sources | The shufinskiy archive first. A direct NBA.com browser-based fetcher later (IM08) for hustle, tracking, play types and in-season freshness. |
| M4 Names | CourtLens names and documented methods. "RAPM", "ORAPM", "DRAPM", "On/Off" and the six factors are generic method names and may be used with a "CourtLens" source badge. Databallr's own model name **DPM is not used**: the box-prior analogue is called **Box-Prior RAPM (BPR)**. No Databallr branding, labels or values. |
| M5 Agent | The metrics enter the stats catalog, so the agent reaches them through `query_stats` and `list_metrics`. There is no separate tool. The warehouse then outranks the web for RAPM (agent plan D8). |
| M6 Features | No IM output is ever a forecasting/model feature. A test enforces this. |

## Coverage map against the owner's Databallr screenshots

Waves: **1** = buildable from archive play-by-play, matchups, shots and existing measurements.
**2** = needs IM08 direct NBA.com data. **A** = CourtLens analogue, not the same model.

| Databallr view | Columns | Wave |
| --- | --- | --- |
| Impact | 2Y/3Y ORAPM, DRAPM, RAPM; Age | 1 |
| Impact | DPM, ODPM, DDPM | A (BPR, OBPR, DBPR) |
| On-Off | Net on, Net on/off, ORtg on, ORtg on/off, DRtg on, DRtg on/off | 1 |
| Six Factor | RAPM, ORAPM, DRAPM, oTS, oTOV, oREB, dTS, dTOV, dREB | 1 |
| Six Factor | Residual, PVAL | A (document what CourtLens computes; omit if undefined) |
| Defense | Height, wingspan | 1 (existing measurements) |
| Defense | DDPM, DRAPM, dTS/dTOV/dREB | 1 / A |
| Defense | STL, BLK, DRB%, FOUL%, BLK recovered %, opponent FGA faced (DFGA/100), rim points saved/100 | 1 (play-by-play, matchups, shot detail with zone expectation) |
| Defense | STOP%, D-SQI, OFFD (charges drawn), FTOVs | 1 where play-by-play defines it, otherwise 2 |
| Defense | DEFL (deflections) | 2 (hustle) |
| Advanced | TS%, rTS%, TSAdd/100, 3PR, FTR, AST, potential assists, rim assists, PASSTOV, self/team-miss ORB% | 1 (potential assists = 2) |
| Advanced | OnBall%, sTOV% | 2 or A (needs tracking or play-type data) |
| True Shooting / Playtype | Create/Space/Trans/Finish frequencies with TSA, TS, rTS each | A from play-by-play (assisted/unassisted, shot zone, possession start time); 2 for Synergy play types |
| Shooting / Overview | Rim/SMR/LMR/3P/FT splits, counting stats | Already in CourtLens |

## Blocks

Execute in order. Each block records measured evidence in the
[progress log](impact-metrics-progress.md). "Sol" means the stronger model, "Flash" the faster one.

| Block | Owner | Depends | Scope | Done when |
| --- | --- | --- | --- | --- |
| IM01 Archive admission | Sol | – | Acquire `nbastatsv3`, `cdnnba`, `matchups`, `shotdetail` for 2023-24, 2024-25 and 2025-26 (regular season and playoffs) plus `pbpstats_2023/2024` for cross-checks. Append-only raw store, SHA-256, `observed_at`, license and attribution record. New admission review `design/research-source-admission-v2.md` (local non-commercial, attribution, no raw dumps through the API). Coverage report against the independent schedule. | Hashes recorded. Per-season game coverage vs. schedule reported (missing games listed). License retained. Re-acquisition is byte-identical or recorded as a new version. |
| IM02 Repair policy | Sol | IM01 | Contract `design/possession-policy-v2.md` with repair rules (below), override rows through the existing `possession_warehouse.record_reconstruction_override` path, game quality flags. Check stints against box scores. | Unit tests per rule on real failing examples, including the B19d four games and their 23 starter disagreements. Report per season: % clean / patched / excluded, and stint +/- vs. box plus-minus agreement. |
| IM03 Stints and possessions | Sol | IM02 | Populate stints and possessions through `possession_warehouse.build_possession_warehouse_for_season` (extend it, don't fork it). Possession outcomes needed by six-factor: TS attempts and points, turnovers, offensive-rebound opportunities and rebounds, per side. Sealed, append-only membership per season. dbt marts. | PostgreSQL integration tests. Conservation: team points, possessions within ±2 of box-score estimates per game (report the distribution), player minutes within 1 s on clean games. 2025-26 complete, then 2023-24 and 2024-25. |
| IM04 Ratings | Sol | IM03 | Contract `design/impact-ratings-v1.md`. Descriptive ridge fits per season and window: 1Y RAPM, 2Y/3Y windowed RAPM (ORAPM/DRAPM per 100 possessions), six-factor RAPM, on/off, BPR. Fixed, documented alpha selection. Versioned, hashed rating artifacts. | Fit reproducibility (same inputs → same hash). Sanity metrics: year-to-year correlation, out-of-sample stint margin error vs. team-only baseline, minutes-weighted mean ≈ 0. Top-20 lists recorded. Stated as descriptive, not causal. |
| IM05 Defense and shooting extras | Sol | IM03 | Wave-1 Defense and Advanced columns from the coverage map, plus play-by-play play-type analogues (Create/Space/Trans/Finish). Each column gets a definition in the stats catalog. | Every new column has a definition, unit, sample rule and test. Unbuildable columns are listed as wave 2 rather than faked. |
| IM06 Serving and UI | Sol (API) + Flash (UI) | IM04, IM05 | Stats engine metrics, ungate Impact/On-Off/Six Factor presets and add Defense columns with a "CourtLens model" badge, coverage/patch-rate disclosure and methodology links. `/research/rapm` shows the served ratings next to the B26 experiment status. Player profile impact card. | Vitest + Playwright at 1440 and 375 px, screenshots. Presets show real values. Uncomputable columns keep the existing gated disclosure. |
| IM07 Agent and eval | Sol | IM06, agent AG06 | Catalog entries reach `query_stats`/`list_metrics`. Prompt states that the warehouse covers RAPM/on-off/six-factor. Agent eval revision moves RAPM/DRAPM web cases to warehouse oracles (new corpus revision; frozen holdout untouched). | "What was Victor Wembanyama's RAPM last season?" answered from the warehouse with a CourtLens chip (replay and, if quota allows, live). Override-missed count reported. |
| IM08 Direct NBA.com (phase 2) | Sol | IM01 (parallel later) | Low-rate local fetcher using a real browser (Playwright Chromium) for hustle (deflections, charges, contests), tracking defense (DFGA, rim protection), play types and in-season play-by-play freshness. Record the NBA.com terms review. Same raw-store/hash rules. | Each endpoint is either admitted with hashes and coverage, or recorded as `source_blocked` with the observed failure. |

## IM02 repair rules (minimum set, all deterministic and versioned)

1. **Period starters:** infer from the first event with a player ID in that period plus
   substitution-out events before any substitution-in, cross-checked with period box minutes.
   If two sources disagree, prefer the one consistent with every later substitution and event,
   then record the override.
2. **Missing substitution:** a player records an action while off the floor → insert a
   substitution at the last dead ball before the action (and remove the player with the fewest
   seconds since their last action), then record the override.
3. **Same-clock events:** order free throws, substitutions, timeouts and rebounds by the documented
   rule in `possession-policy-v2`.
4. **Minutes tolerance:** reconstructed minutes within 1 s are clean, within 30 s are patched,
   anything more is excluded unless rule 1/2 resolves it.
5. **Malformed values** (for example the `25:60` minute from B19d): parse by the documented rule
   if the meaning is unambiguous, otherwise keep it unknown and exclude only that player-game from
   minutes checks.
6. **Cross-source arbitration:** v3 and cdn play-by-play are compared event by event. Agreement is
   recorded. On conflict, the source that conserves box-score totals wins.
7. **Exclusion:** only when no rule yields a five-on-five lineup consistent with the box score.
   Excluded games are listed with reasons. They count against coverage, never silently.

Every rule has a unit test on a real archived example and a counter in the coverage report.

## Rating method (IM04 outline; the contract fixes the details)

- **Design:** one row per stint (or possession group). Offensive and defensive indicator columns per
  player. Home-court column. Target: points per 100 possessions. Weight: possessions.
- **Fit:** ridge regression (scikit-learn 1.6.1, already pinned). Choose alpha from a small fixed
  grid by game-grouped K-fold cross-validation inside the fitted window. Record the grid, folds,
  seed and chosen alpha in the artifact.
- **Windows:** 1Y = the season; 2Y/3Y = pooled seasons with an optional documented decay (fixed in
  the contract, not tuned on outcomes).
- **BPR:** fit a box-score regression of multi-year RAPM on per-100 box stats (prior seasons only),
  then refit RAPM with ridge shrinkage toward that prior instead of toward zero. Document it as a
  CourtLens model in the spirit of box-prior impact metrics, not a reproduction of any third-party
  model.
- **Six-factor:** three rate regressions (TS, turnover share, offensive-rebound share) with
  offensive and defensive coefficients, as in the existing six-factor protocol math. Descriptive,
  full-season fit.
- **On/off:** direct from stints (team net, offensive and defensive rating with the player on vs.
  off), with minute samples.
- **Serving time:** completed seasons have one final artifact. The current season gets dated
  as-of artifacts using only games before the artifact's cutoff (`game_date < cutoff`).
  Recomputing never changes an earlier artifact's hash.
- **Percentiles:** computed locally over the qualified cohort (existing qualification rules).
- **Claims:** "model estimate under lineup confounding". No causal or "isolated skill" wording, and
  no verdicts.
- **Validation without copying anyone:** internal stability and out-of-sample checks. Public
  leaderboards may be glanced at manually as a sanity check, but no third-party values are stored,
  scripted or scored.

## Agent plan changes

These are applied in [assistant-agent-plan.md](assistant-agent-plan.md):

- Source order: (1) warehouse, which includes IM metrics once IM06 lands; (2) web; (3) model
  knowledge without numbers. The Databallr tier is removed.
- `databallr_metrics` tool, `databallr` source origin and Databallr chip are removed. IM metrics
  render as CourtLens warehouse results.
- AD01–AD04 are superseded by IM01–IM08.

## Risks

- **The archive lags NBA.com.** It was last updated 2026-07-17. In-season 2026-27 freshness depends
  on archive updates or IM08. Answers state the cutoff.
- **The patch policy changes the B19/B20 admission rule.** Record it as a new policy version. Sealed
  B19/B20 evidence and the v1 policy stay as recorded.
- **Values will differ from Databallr and other public RAPMs.** That is expected and stated on the
  methodology page.
- **Compute:** 3-season windows with about 600 players are small for ridge. The existing B25
  budget caps apply only to preregistered experiments, not to these descriptive fits. Record
  runtime anyway.
- **The working tree may hold other agents' uncommitted work** (AG05 was in progress at planning
  time). Inspect `git status` and don't touch unrelated files.
