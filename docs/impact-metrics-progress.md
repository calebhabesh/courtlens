CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# CourtLens impact metrics progress

Parent: [impact metrics handoff](impact-metrics-plan.md). Plans are not runtime evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`, `source_blocked`,
`verification_blocked`.

## Planning baseline: 2026-10-07

- The owner confirmed M1–M6 (build from public inputs, patch-not-quarantine, archive first then
  direct NBA.com, CourtLens names).
- Checked during planning: `stats.nba.com` timed out and `cdn.nba.com` returned 403 from this
  machine. `shufinskiy/nba_data` has full 2025-26 regular-season and playoff `nbastatsv3`,
  `cdnnba`, `matchups` and `shotdetail` (last commit 2026-07-17), and `pbpstats` through 2024-25.
  Nothing has been downloaded yet.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| IM01 | verified | [Acquisition and measured checks](evidence/im01/README.md): 37 assets / 28 archives, unchanged hashes and coverage; two IM02 audits reverified all retained inputs. QA01 prerequisite cleared. Latest full suite: 1,646 passes / 0 failures / 0 errors, with the documented browser skip and published-data deselections. Repository Ruff/format/mypy clean. |
| IM02 | verified | [Repair policy and measured evidence](evidence/im02/README.md): all 23 B19d starter disagreements repaired; 3,941 games audited twice with identical content hash. 21 clean / 3,880 patched / 40 explicitly excluded. Every candidate and 472,716 repair envelopes independently verified. 24 unit and 65 targeted checks pass; two full runs each 1,646 passed / 0 failed / 0 errors. Ruff/format/mypy clean. Plus-minus discrepancies and unavailable period-minute cross-checks retained. |
| IM03 | verified | [Revised event acceptance and measured evidence](evidence/im03-event-gate/README.md): 3,901 games independently source/event/public verified and read back from isolated PostgreSQL. Six new ready datasets; 202,063 stints, 775,941 records, 2,020,630 player-stint rows, six sealed replays. 1,684 full-suite passes, 83 dbt passes; Ruff/format/mypy clean. Owner-authorized event gate v1 supersedes the raw ±2 acceptance requirement; unchanged estimate remains diagnostic (46.744% within two). Original six candidates retained. |
| IM04 | verified | [Ratings and measured evidence](evidence/im04/README.md): 12 phase-separated 1Y/2Y/3Y artifacts reproduce identical hashes; all 202,063 accepted stints checked against PostgreSQL read-only. RAPM, six factors, on/off and historical BPR; four available BPR windows, explicit historical-source/sample limitations elsewhere. 1,707 full-suite passes; Ruff/format/mypy clean. Descriptive diagnostics and qualified top-20 lists retained; no serving or publication. |
| IM05 | verified | [Defense/shooting definitions and measured evidence](evidence/im05/README.md): six identical replayed artifacts, 38 defined/tested columns across all 3,901 admitted games; independent arithmetic/box/matchup verification, explicit source gaps and play-type analogues. 1,766 full-suite passes; Ruff/format/strict mypy clean. Offline only; serving remains IM06. |
| IM06 | verified | [Serving and UI evidence](evidence/im06/README.md): identical immutable bundle from 18 sealed artifacts; 68 metrics joined before SQL filters/paging/cohorts, pinned saved replay, ungated presets, profile/research cards. 166,260 real values/nulls match source artifacts across six scopes. 1,778 Python, 285 Vitest, 229 fixture + 12 real browser passes; 14 desktop/mobile screenshots; Ruff/format/mypy/lint/types/build pass. |
| IM07 | verified | [Agent/eval evidence](evidence/im07/README.md): v3 catalog through existing tools, warehouse-first prompt, pinned impact evidence/units and bounded conflict audits. New development revision preserves every frozen holdout; 48/48 real-data exact replays, zero missed overrides. 1,795 Python, 286 Vitest, 231 browser passes; two Ask screenshots. Live Gemini stopped on quota; no language-quality claim. |
| IM08 | verified | [Browser fetcher/source assessment](evidence/im08/README.md): 18 fixed targets accounted for; 15 Stats timeouts, two CDN HTTP/2 protocol failures, terms HTTP 403. All direct capabilities remain `source_blocked`, with a separate consent gate. Two exact readbacks, independent 1,230-game/582-player scope, 10 actual Chromium controls; 1,844 Python and 286 Vitest passes. Ruff/format/mypy/lint/types pass. No data admission, provider call or deployment. |
| SB01 | verified | [Stint box evidence](evidence/stint-box-v1/README.md): per-player stint box for all 3,901 accepted IM03 games (alignment row 13). Replay reproduces every sealed stint's player points; each field conserves to the box score in ≥ 99.6% of team-games, the rest unknown. Six IM03 datasets admitted to the owner database; shared-floor v2 serves them. |

## IM01 — 2026-10-07

- Added `ingestion/impact_archive.py`, a bounded offline acquisition/verification CLI, and the
  [v2 source review](design/research-source-admission-v2.md). No source policies, frozen inputs,
  existing datasets, forecasts or publication pointers were modified by IM01.
- Acquired all 28 requested phase-separated archive assets at full revision
  `e829d4678be1e075f99e5d41a1c5f97089be446b`, three independent SportsDataverse schedules and six
  source notices. Actual receipt times, SHA-256 addresses, observation/content-version UUIDs,
  attribution and complete missing-game lists are in the [machine report](evidence/im01/acquisition-and-coverage.json).
- Two final completed acquisitions fetched every URL and matched all 37 bytes/hash/version
  records. Offline verification independently rehashed the files and reproduced every coverage
  report and content signature. Coverage is acquisition evidence, not reconstructed admission.
- v3/CDN/shot-detail cover all 1,230 regular games per season. Matchups miss three games in
  2023–24 and one in 2024–25; 2023–24 pbpstats misses two. Playoff denominators are 82, 84 and
  85 games. Only 2025–26 CDN playoff coverage is partial (60/85); the other three families
  cover all 85. No 2025 pbpstats source exists.
- 23 new tests plus 80 related/frozen regressions pass. Strict mypy checks 184 source files.
  The complete disposable PostgreSQL run measured 13 failures, 1,561 passes, zero setup errors,
  two documented skips, 20 published-data deselections and the existing SDK warning. All
  failing IDs and traces are retained; none is an IM01 test. Concurrent QA/DL edits are not a
  clean-checkout baseline. IM01 stays `verification_blocked` until the whole-suite/static gate
  is green; IM02 also requires measured QA01 completion. Later Lane 3 and final-lane blocks
  remain pending. No other lane's files were edited or committed by this block.

## IM01 continuation — 2026-10-07

- Hardened offline verification of attribution, admission scope, unavailable-family declarations,
  bundle UUID and completion/asset observation times. Tampered metadata now fails verification.
  Reverified the retained acquisition without fetching or modifying any original object.
- [103 targeted checks](evidence/im01/verification/targeted-continuation.log) pass; scoped Ruff,
  formatting and [strict mypy](evidence/im01/verification/mypy-continuation.log) pass. The
  [offline check](evidence/im01/verification/offline-continuation.log) reproduces the same content
  signature, all 37 asset hashes and all 28 coverage reports.
- The [fresh disposable full-suite run](evidence/im01/verification/python-continuation.log)
  measured **9 failed, 1,570 passed, 0 errors, 1 skipped, 19 deselected, 1 existing SDK warning**
  in **303.47 s**. Failing IDs are the rich-admission report case, two assistant unit cases
  and six entity-lookup unit cases; none is an IM01 test. Repository-wide Ruff/format still
  report the other lane's `split_css.py` and `verify-contrast.py`; those were not edited here.
- QA01 remains planned in the refresh log and its clean-checkout verification is running.
  IM02 implementation did not begin. [Read-only preflight](evidence/im01/im02-preflight.md)
  confirms the four retained B19d games contain all **23** starter disagreements and records
  the override, immutable membership, event-identity and exclusive-cutoff integration points.

## IM02 — verified 2026-10-07

- QA01 now records two clean disposable PostgreSQL runs (1,556 passes each), Ruff,
  formatting and strict mypy at detached commit `18b76e0`; its required IM02 gate
  is satisfied. The prior IM01 continuation remains historical evidence.
- Implemented [possession policy v2](design/possession-policy-v2.md) as a separate
  explicit domain path; v1, original B19/B20/B26 evidence, forecast inputs and
  publication pointers remain unchanged. The existing override helper now supports
  caller-owned transactions; verified v2 envelopes use the existing registry path
  and a distinct type. PostgreSQL tests round-trip all seven actual repairs from
  B19d game `0022500007`, enforce sealing, idempotence and rollback, and reject
  tampering before writes.
- Rehashed every original B19d observation, reproduced all four retained v1 content
  hashes and resolved all **23** starter disagreements (6/8/5/4). V2 starter sets
  agree with the independent native rotation evidence; known player minutes agree
  within 0.5 s. The observed `25:60` carries to 1,560 s. Native replay is
  byte-identical on repetition.
- [Two full archive audits](evidence/im02/README.md) bind actual v3/CDN, schedule,
  player/team box receipts, method code and policy hashes. Both reproduce
  `c657a3c63929476fa60004be2e428d1310f771ebce6840e537aa6d61d38512cb` in
  **200.646 / 204.171 s**. An independent check verifies all **3,941** retained
  candidates, **472,716** repair envelopes and regenerated summaries.
- [Per-season/phase coverage and every exclusion](evidence/im02/coverage-summary.md):
  **21 clean, 3,880 patched, 40 excluded**. Regular seasons admit **1,216 / 1,212 /
  1,227** of 1,230; playoffs **81/82, 83/84, 82/85**. Patch counts include explicit
  source arbitration, separately counted from missing substitutions. All 25
  unavailable 2025–26 CDN playoff cross-checks remain unavailable, never agreement.
- Every nonexcluded known player-minute comparison in 2024–25 and 2025–26 is within
  0.5 s. Four 2023–24 games use the <=30 s tolerance (maximum 23.2 s). Full-period
  box minutes are unavailable in the season archive audit; this is disclosed rather
  than inferred. Box plus-minus exact agreement is **48.71–56.24%**, p95 absolute
  error **2–3 points**, maximum **9**. These discrepancies remain diagnostics and
  must accompany later IM03/ratings data; no lineup tuning or agreement threshold
  was applied.
- [24 new unit tests](evidence/im02/verification/unit-final.log) cover all rule
  families with real archive examples and adversarial cases, including the legacy
  2023 shot-value schema, missing substitutions, minute tolerance, same-clock
  shooter re-entry and between-attempt substitution runs. The forecasting guard
  verifies that impact readers/catalog entries do not enter forecast features.
  [65 targeted checks](evidence/im02/verification/targeted-accepted.log) pass.
- Full disposable PostgreSQL runs each measured **1,646 passed, 0 failed, 0 errors,
  1 documented isolated-Next-browser skip, 19 explicit published-data deselections,
  1 existing SDK warning**, in **308.97 / 304.50 s**. The final run includes the
  strengthened real-envelope PostgreSQL fixture. Repository Ruff/format and strict
  mypy pass (187 source files). This also closes IM01's prior shared-suite gate.
- IM03 remains planned. No production stints/possessions or owner database were
  populated here. IM03 must bind the accepted candidate hashes, preserve ordered
  event identities and same-clock scoring, add sealed append-only membership, and
  use exclusive cutoff conditions through the existing warehouse orchestrator.

## IM03 — implemented, verification blocked 2026-10-08 UTC

- Extended the existing season warehouse orchestrator with an explicit IM03 bundle
  path, ordered domain reconstruction, complete append-only season/phase membership
  and shared dbt factor/exposure marts. V1 behavior, B26 experiments, forecasting
  inputs and the owner's publication pointers remain unchanged.
- Prepared **all 3,901** nonexcluded games from the accepted IM02 candidate hashes,
  with the original **40 exclusions** in coverage. The accepted report signature
  remains `c657a3c63929476fa60004be2e428d1310f771ebce6840e537aa6d61d38512cb`.
  Original repair/normalization/policy hashes remain exact; IM02's warehouse service
  fingerprint is historical because this block extends that file.
- Populated a fresh disposable PostgreSQL 17 database in required order: 2025–26
  first, then 2023–24 and 2024–25. [Receipts](evidence/im03/population-receipts.json.gz)
  retain six dataset IDs, hashes, method/schema signatures and **406.737 s** runtime.
  Measured rows: **202,063 stints**, **775,916 possession records** (including explicit
  noncount FT records), **2,020,630 player-stint rows**, **458,987 repair overrides**.
- An [independent read-only check](evidence/im03/independent-verification.json.gz)
  compares membership to the external accepted IM02 report, rehashes every stored
  stint/possession body and every repair, and verifies independent schedule points,
  shooting makes/attempts and accepted player seconds. Clean-game known minutes
  remain within one second. Four 2023–24 tolerance cases remain (maximum 23.2 s).
  IM02 plus-minus diagnostics remain attached, without fitting or a new threshold.
- Migration `10b810a4f008` enforces transaction sealing, including inserts and
  truncation after admission, and rejects updates/deletes even under admin bypass.
  The admitting transaction is stored in a small nullable column; a development
  JSON guard bottleneck was corrected before the final migrated proof. Derived
  observations use actual admission times, with source observation time retained
  separately. Both legacy rebuild entry points reject IM03 data. IM03 exposure uses
  exclusive `game_date < cutoff`; forecasting isolation has its own regression.
- [Six complete replays](evidence/im03/idempotence.json.gz) reuse the original IDs
  and leave all 12 populated table counts unchanged in **33.712 s**. Candidate
  artifacts remain content addressed. No owner database/schema, data release or
  metrics serving was changed.
- [Conservation distributions](evidence/im03/coverage-summary.md) retain every
  per-game delta: **3,736 / 7,802 team-games (47.885%)** within ±2 of
  `FGA + 0.44*FTA - player ORB + box TOV`; maximum absolute difference **11.28**.
  No fabricated possessions, additional exclusions or threshold change was used.
  Player ORB differs by one in nine comparisons; explicit PBP team turnovers and
  box turnover differences remain documented. All six datasets are `candidate`.
- Public pbpstats repeated event rows are deduplicated into explicit possession-text
  groups. **2,433 / 4,852** regular-season team comparisons are exact; **4,826** are
  within two, maximum four. Source hashes and all differences/unavailable games are
  retained. No playoff/2025–26 comparison is assumed. In `0022400001`, both CourtLens
  and public groups count **99 per side**, while Atlanta's estimate is **101.72**.
  This is evidence for clarifying the estimate gate, not a waiver of it.
- [112 targeted checks](evidence/im03/verification/targeted-final-accepted.log) pass.
  The [final full disposable run](evidence/im03/verification/python-final.log) has
  **1,659 passed, zero failures/errors**, one documented isolated-Next-browser skip,
  19 published-data deselections and one existing SDK warning, **318.10 s**.
  [dbt](evidence/im03/verification/dbt.log) has **83 passes**, zero warnings/errors,
  in **8.60 s**. Repository Ruff/format and strict mypy pass (189 source files).
- The additive migration exposed RN02's fixture selecting the newest revision for
  its rename round-trip. It now selects named RN02 revision `09b810a4f007`; original
  OID/body/trigger assertions stay intact. Development aborted runs remain separate
  historical logs. No dashboard or other lane implementation was edited.
- **IM03 remains `verification_blocked` on the explicit ±2 estimate gate. IM04 stays
  planned.** The implementation and all independent technical checks are reviewable;
  the gate has not been silently relaxed or marked satisfied.

### IM03 gate decision — owner confirmed 2026-10-08 UTC

The owner selected the recommendation to **keep ±2 as a hard acceptance gate**.
The measured estimate discrepancies are not waived or relabeled as sufficient
verification. IM03 stays `verification_blocked`, its six datasets stay `candidate`,
and IM04 stays planned. No additional games are excluded or possession counts
manufactured to meet the estimate. The remaining work is resolving this conservation
requirement against the observed event/box discrepancies under the preserved rules.

### IM03 next-block dependency diagnosis — 2026-10-08 UTC

- Started dependency work with the owner's hard ±2 gate intact. IM04 cannot consume
  verified IM03 inputs while that gate fails; its status remains `planned`.
  [Read-only diagnosis and evidence](evidence/im03/gate-diagnosis/README.md) add no
  production source, admission or publication changes.
- The actual `0022500007` fixture replays the retained game exactly in under one
  second and returns exit 1 for the ±2 failure: 104 possessions per side, estimates
  107.88 / 107.40. Hash/accounting errors are distinct from gate failure.
- Rehashed **3,901** retained game bodies against signed IM03 membership and
  reconciled all **7,802** team deltas exactly using Decimal arithmetic. The
  original **3,736 within / 4,066 outside ±2** reproduces. **1,171 / 2,433**
  comparisons with exact retained public pbpstats group agreement still fail ±2.
  Public agreement remains a diagnostic, not an official oracle or waiver.
- Independent source/box replay of `0022400001` reproduces the sealed game.
  Atlanta's three explicit team offensive rebounds retain control through later
  shots but are excluded from the agreed player-ORB estimate. These continuations
  contribute −3, FT-containing possessions +0.28: the exact −2.72 failure with all
  box factors agreeing and 99 public/CourtLens possessions. Adding possessions to
  these sequences contradicts the method. Other discrepancies remain unresolved.
- **34** reconstruction/repair tests pass; repository Ruff, formatting and strict
  mypy pass (**189 source files**). Full PostgreSQL/dbt suites were not repeated
  for read-only diagnostics/evidence; preceding results remain historical.
- No compliant count correction is demonstrated. **IM03 remains
  `verification_blocked`; all six datasets remain `candidate`; IM04 remains
  `planned`.** The diagnosis identifies a source-backed incompatibility between
  the preserved event convention and hard estimate gate without changing either.

### IM03 acceptance revision — owner authorized recommended path

The owner authorized the recommended event-based acceptance path after the source
sequence diagnosis: keep the unchanged box estimate and its full distribution as
a diagnostic, introduce an independent event boundary/factor gate, investigate
available public disagreements, and revalidate all admitted games before IM04.
The [versioned acceptance contract](design/impact-event-verification-v1.md) and
[opt-in possession method v2](design/impact-possession-method-v2.md) record this
revision. The preceding hard-gate decision and six sealed candidate datasets remain
historical evidence. Current work is **in progress**; IM03 is not yet verified.

Development replay independently checks all 3,901 selected games and identifies
retained-ball FT context, different-shooter and-one handling, and an anonymous team
turnover repair. Actual-source regressions preserve v1 reproduction and demonstrate
v2 fixes. Available public group review and its admission binding, fresh PostgreSQL
population/read-back/replay, source re-extraction, full regression and dbt validation
remain required. IM04 remains planned until measured completion is recorded below.


### IM03 — revised acceptance verified 2026-10-08 UTC

- Completed the owner-authorized recommended path under [event acceptance v1](design/impact-event-verification-v1.md)
  and explicit opt-in [possession method v2](design/impact-possession-method-v2.md).
  This revises acceptance; the old ±2 hard gate is not marked satisfied. The preceding
  decision, contracts, receipts and all six old candidate datasets remain historical.
- Fixed contextual retained-ball FT classification, retained FT/made-shot merging,
  different-shooter ordinary and-ones and one anonymous Boston team turnover through
  a unique explicit CDN match. Four actual-source v1 counterexamples still reproduce
  their retained bodies and fail the independent event gate; corrected v2 hashes
  match final admitted membership. V1 behavior and accepted IM02 code/policy are retained.
- Independent raw parsing verifies all **3,901** games: exact boundaries, source
  contribution identity/factors, end lineups, stint attribution/scoring/exposure,
  durations and player seconds. All **7,802** Decimal source-ledger discrepancies
  reconcile without residual fitting. **729** games change boundaries; counted
  controls decrease **619**, noncount FT records increase **644**, total records +25.
- [Full source re-extraction](evidence/im03-event-gate/input-reextraction.json.gz)
  rehashes original archives and checks every input row, box receipt, repair excerpt
  and public group against retained proofs in **192.057 s**. Accepted membership
  remains **3,901 / 3,941**, with the same **40** explicit exclusions.
- [Public source sequence review](evidence/im03-event-gate/public-sequence-review.json.gz)
  covers **4,852** comparisons, **zero unresolved**. All available count differences
  have source/group/label evidence. Five conflicting actor/clock classifications
  retain both versions; export update order is not established. Public totals are
  **2,531 exact / 4,839 within two**, maximum 3, and remain diagnostics. All playoffs,
  2025–26 and the two retained missing 2023–24 games remain explicitly unavailable.
- [Population receipts](evidence/im03-event-gate/population-receipts.json.gz): **six
  new ready datasets**, **202,063 stints**, **775,941 records**, **770,161 counted
  controls**, **5,780 noncount FT records**, **2,020,630 player-stint rows** and
  **458,988 overrides**, populated through the shared orchestrator in fresh isolated
  PostgreSQL 17 in **450.791 s**. Admission recomputes event/public proofs and binds
  code plus both new contracts; pass flags alone cannot authorize readiness.
- [Independent stored-row verification](evidence/im03-event-gate/independent-verification-v2.json.gz)
  rehashes and compares every stored body, repair, schedule point and player-second,
  with all per-game event/public proofs reproduced, in **154.315 s**. Clean-game
  known minutes remain within one second; the inherited four patched tolerance
  cases and maximum **23.2 s**, plus IM02 plus-minus/period-minute limitations,
  remain disclosed. [Six sealed replays](evidence/im03-event-gate/idempotence.json.gz)
  reuse IDs/statuses and leave all twelve table counts unchanged in **110.414 s**.
- The unchanged estimate remains **3,647 / 7,802 (46.744%) within ±2**, maximum
  **11.28**. Its complete distribution, ledger terms, exclusions and boundary changes
  are retained in [coverage evidence](evidence/im03-event-gate/coverage-and-conservation-v2.json.gz).
  No new exclusions, coefficient tuning or manufactured possessions were applied.
- [Full Python regression](evidence/im03-event-gate/verification/python-full.log):
  **1,684 passed, zero failed/errors**, one documented isolated-Next-browser skip,
  19 published-data deselections, one existing SDK warning, **395.07 s**. The actual
  source/adversarial tests include independent parser mutation, attribution,
  public conflict, forged-proof and migrated PostgreSQL checks.
- [IM03 dbt validation](evidence/im03-event-gate/verification/dbt.log): **83 passes**,
  zero warnings/errors/skips, nine models / 74 data tests, **7.47 s**. An unscoped
  attempt requiring unrelated archive variables and a partial selector are retained
  as development evidence. Repository Ruff, formatting and strict mypy pass
  (**192 source files**).
- [Sealed acceptance](evidence/im03-event-gate/acceptance-v2.json.gz) binds all six ready
  IDs/admitting transactions, measured checks and artifact/log hashes. Original six
  candidate IDs/hashes/statuses are independently retained. All new writes occurred
  in `courtlens-im03-event-proof` (55434); this work did not write owner data,
  publication pointers, forecast inputs or the old proof database (55433).
- **IM03 is verified. IM04's dependency is cleared and IM04 remains planned.**
  The next ratings block must use the new accepted method/bundle hashes. No rating
  fitting, preset ungating or publication was performed by this acceptance revision.

- Final report encoding audit: numeric histogram keys changed canonical ordering
  after JSON decoding. [Canonical coverage v2](evidence/im03-event-gate/coverage-and-conservation-v2.json.gz)
  and a fresh read-back v2 correct only report encoding; old reports remain retained.
  The final acceptance v2 binds these round-trip-verifiable hashes. Game/proof/bundle
  hashes, dataset IDs, counts and acceptance gates are unchanged.


## IM04 — verified 2026-10-08 UTC

- Implemented [descriptive ratings v1](design/impact-ratings-v1.md) through an
  explicit offline runner, separate from frozen B26 experiments and forecasts.
  Rehashed the accepted IM03 v2 receipt/evidence, all six bundles, every selected
  game and stint; both runs compare all **202,063** stint bodies and ready dataset
  identities to the original proof PostgreSQL instance in read-only transactions.
- [Two complete fits and independent artifact verification](evidence/im04/ratings-verification.json.gz)
  produce **12 identical rating hashes** in **163.421 / 162.109 s**: three 1Y, two
  adjacent 2Y and one 3Y window, separately for regular season and playoffs.
  Content-addressed outputs retain complete coefficients/support, exclusive
  cutoffs, selected game hashes, code/contract/dependency versions, fixed alpha
  grid/folds/scores, qualified percentiles and [top-20 lists](evidence/im04/top20.md).
  Full acquisition/coverage provenance stays in separate receipts, so changing
  future records cannot enter earlier-cutoff semantic hashes.
- RAPM and shared six-factor CV select **alpha 1000** in every window from the
  fixed **10 / 100 / 1000** grid; no outcome-driven grid expansion. Six factors
  use their own denominators and favorable sign conventions, with no additive
  overall factor score or undefined residual/PVAL. Reconstructed-seconds-weighted
  RAPM means have maximum absolute value **1.584e-16**; centering preserves
  predictions. On/off preserves all actual scoring and separate traded-team
  references; zero denominators stay unknown.
- Historical box priors are available for regular-season 2024–25 and 2025–26 1Y,
  regular-season 2Y ending 2025–26, and playoff 2025–26 1Y. Other windows retain
  explicit absent-history or insufficient-historical-sample reasons and null BPR.
  Prior targets, box sources, complete samples, scaler, regression and player
  priors are retained; all prior seasons precede the earliest fitted season.
  Missing rows/nonfinite box counts invalidate prior profiles, never become zero.
- Adjacent regular-season RAPM Pearson correlations are **0.3543 / 0.3766**, with
  **286 / 288** shared qualified players; playoff comparisons lack a supported
  cohort and stay null. Latest 1Y held-out stint margin RMSE is **92.489** versus
  team/context **92.631**, in points per 100 mean controls; 3Y is **93.051 / 93.447**.
  Some windows are worse than baseline. These are descriptive diagnostics, not
  forecasts, causal validation, a promotion threshold or B26 unexposed final tests.
- Zero-control stints remain explicit: 3Y regular-season RAPM omits **171,936** side
  observations / **6,660 points**; 3Y playoffs omit **11,405 / 512**. On/off retains
  those points. All **3,901** admitted games and **40** exclusions are preserved,
  as are the inherited repair/plus-minus/minute limitations and unchanged
  **46.744% within ±2** estimate diagnostic. No manufactured controls or
  analytical/source-policy relaxation was applied.
- [29 targeted checks](evidence/im04/verification/targeted-final-corrected.log) pass:
  22 rating unit cases plus seven warehouse PostgreSQL tests, including the new
  ready-row reader/tamper check. Independent weighted normal-equation tests verify
  ridge and nonzero priors; tests enforce game isolation, unseen-player handling,
  temporal hash invariance, signs/centering, unknown rates/counts and runtime
  forecasting isolation.
- [Final full disposable PostgreSQL regression](evidence/im04/verification/python-final.log):
  **1,707 passed, zero failed/errors**, one documented isolated-Next-browser skip,
  19 published-data deselections, one existing SDK warning, **287.36 s**.
  Repository Ruff/format and strict mypy pass (**195 source files**). An earlier
  1,706-pass development run, targeted harness failures and the explicitly
  interrupted stale-test run remain historical evidence; only the corrected final
  run supplies acceptance. No dbt or dashboard code changed in IM04.
- [Sealed completion](evidence/im04/acceptance.json.gz) binds the measured checks,
  all 12 final artifact hashes and evidence/implementation hashes. No owner data,
  public pointer, original candidate/ready dataset, frozen experiment or forecast
  input was changed. **IM04 is verified; IM05 remains planned.** IM06 serving and
  preset ungating still require IM05.

## IM05 — verified 2026-10-08 UTC

- Implemented [defense and shooting extras v1](design/impact-extras-v1.md) with a
  separately versioned typed stats catalog staged for IM06: **38 columns**, each
  with a formula, unit, source fields, sample rule, limitations and an independent
  numerical test. Eighteen defense/advanced columns and twenty TSA/frequency/TS/rTS
  columns for Create/Space/Trans/Finish/Unknown PBP analogues. Existing measurements
  and IM04 defensive ratings/factors are retained for IM06 reuse.
- [Two complete builds and independent verification](evidence/im05/extras-verification.json)
  reproduce **six identical artifact and fact hashes** in **273.106 / 265.159 s**.
  Both rehash IM03 acceptance/evidence, six bundles, games/candidates, all raw source
  and box bytes, and compare all **202,063** stints plus ready dataset identities
  against the original proof PostgreSQL instance with read-only transactions.
  All **3,901** admitted games and original **40** exclusions remain unchanged.
- **174,559** independent numerical/source comparisons pass: raw matchup identity
  orientation and supplemental coverage, per-player shooting/box conservation,
  selected memberships and Fraction arithmetic for all columns. Retained outputs
  and per-game fact ledgers bind exclusive cutoffs, selected fact hashes, league
  references, definitions, per-metric numerator/denominator/covered games and
  qualification. Acquisition/full-season receipts stay separate from semantic
  artifacts; target-date/future changes are covered by temporal regressions.
- Play-type analogues explicitly preserve Unknown. All FT contributions and
  unavailable joins stay in its denominator; no vendor-equivalence or creation/
  spacing claim is made. Unknown TSA shares are **9.653–10.394%** for regular
  seasons and **9.634–11.458%** for playoffs. All player TSA/points conserve.
- Retained **13** unavailable FG joins, **15** unresolved assisted-make identities,
  **21** unresolved charge actors and **28,465** known individual block recoveries,
  with exact source locators/reasons and conditional samples. Source-specific
  missing games/actors do not enter denominators as zeros. Original matchup gaps
  remain; seven rows in `0022400430` name an actor absent from its independent box
  roster, so that game's supplemental matchup metric is unavailable. The game
  remains admitted for all other metrics; no actor mapping or new exclusion.
- Wave 2 explicitly retains deflections, complete potential assists, OnBall%,
  tracking DFGA and individual rim points saved; STOP%, D-SQI and general FTOV/sTOV
  require defined methods/attribution. Aggregate matchup FGA faced and credited
  forced turnovers have distinct CourtLens definitions, not relabeled tracking
  contests or a complete pressure model. Inherited minute/plus-minus/repair and
  **46.744% within ±2** estimate limitations remain in full provenance.
- **59 new unit checks** cover every column, real source orientation and charges,
  ambiguous joins, conditional recovery, rebound-time substitutions, missingness,
  trade/sample pooling, six-second transition boundaries, conservation, exclusive
  cutoff/hash invariance, append-only artifacts and runtime forecasting isolation.
  [Full disposable PostgreSQL regression](evidence/im05/verification/python-full.log):
  **1,766 passed, zero failed/errors**, one documented isolated-Next-browser skip,
  19 published-data deselections, one existing SDK warning, **291.43 s**. Repository
  Ruff/format and strict mypy pass (**198 source files**).
- [Sealed completion](evidence/im05/acceptance.json.gz) binds final hashes, receipts,
  implementation/contracts/tests and measured evidence. Development failures and
  artifacts remain separate historical evidence. No owner database, public pointer,
  original candidate/ready membership, frozen experiment, forecast input, active
  catalog, dbt or dashboard was changed. **IM05 is verified; IM06 remains planned**
  and now has its IM04/IM05 dependencies cleared for serving and UI work.

## 2026-10-08 — IM06 verified: serving and UI

- [Contract](design/impact-serving-v1.md) and [sealed measured evidence](evidence/im06/README.md)
  implement the bounded IM06 block. IM04 and IM05 are its declared prerequisites;
  IM08 remains a separate refresh block. AG07's live-quality gate is unchanged.
- Two fresh projections of the **12 IM04 + six IM05** sealed artifacts reproduce
  `2cd9c98b2594d948edc2c574e082e1b8b06ff4d6bfeca294f87e8062eae76d48`.
  Every input acceptance/evidence/artifact is rehashed. The supplement is an
  append-only retained file selected by configuration and mounted read-only.
  There is no database migration, source acquisition, fitting or public pointer swap.
- The explicit **courtlens-stats-v3** catalog serves **68 keys**: 18 RAPM/BPR window
  columns, six factor coefficients, six on/off rates/differences and 38 extras.
  SQL integrates values/support before predicates, sorting, percentile cohorts and
  paging. Unmatched rows remain null; extras retain descriptive values and qualified
  percentiles. Traded-team on/off references are separate. Team filters keep the
  full-league rating fit and withhold full-season extras.
- Only fully observable same-phase season scopes select final artifacts. Exclusive
  cutoff, short-window and missing-store gates are explicit. Adding future artifacts
  cannot change prior scoped bindings. Saved impact findings pin the retained bundle;
  replacing the default preserves replay. Custom views opt into v3. Legacy catalogs,
  view definitions, serialized query hashes and frozen assistant provider replay
  schemas remain intact; no IM07 prompt/eval changes were made.
- Impact, On-Off and Six Factor presets display real served values; Defense,
  Advanced and True Shooting include their defined extras. Player impact and
  `/research/rapm` include CourtLens attribution, windows, samples, coverage/patch
  rates and methodology. The B26 experiment panel and source/undefined-metric gates
  remain. **14 real-service screenshots** cover **1440/375 px**, with no document
  overflow. The player trend-card minimum width was corrected with scoped token CSS.
- [Independent source/API comparison](evidence/im06/verification/real-serving.json):
  **166,260 values/nulls match** across **2,445 player cohort memberships** in all six
  season/phase scopes. On/off arithmetic is recomputed from original scoring/control
  totals. Page uniqueness/completeness, full-cohort name-filter percentiles, cutoff
  and short-window gates pass. Wembanyama's 2025-26 1Y RAPM is **9.123015906749517**.
  Measured local full/named presentation calls took **2.163/1.864 s**, without an SLA.
- [Final disposable PostgreSQL Python run](evidence/im06/verification/python-final.log):
  **1,778 passed, zero failed/errors**, **291.11 s**, one documented isolated-browser
  skip, 19 published-data deselections and one inherited SDK deprecation warning.
  Ruff/format and strict mypy pass (**200 source files**). Dashboard lint/types,
  **285 Vitest**, **229 fixture browser** and **12 real browser** cases pass;
  the fixture suite's 15 external skips include those 12 separately executed cases.
  An isolated production build and Compose configuration check pass.
- Real serving used PostgreSQL-enforced read-only transactions; tests wrote only to
  disposable databases/artifact directories. Existing Docker services, owner dotenv,
  immutable source datasets, public release/snapshot/dataset/semantic identity,
  earlier sealed evidence, B26 and forecasting inputs are preserved. Historical DL
  screenshot tests ran in an isolated copy. Development failures remain separate
  from final acceptance. **IM06 is verified; IM07 remains planned** with its IM06 and
  AG06 dependencies satisfied. IM08 and AG08 were not advanced.


## 2026-10-08 — IM07 verified: agent and evaluation

- [Contract](design/impact-agent-v1.md) and [measured evidence](evidence/im07/README.md)
  implement IM07 only, using verified IM06 and AG06. The existing six tools remain;
  `query_stats`/`list_metrics` reach the CourtLens impact catalog. The v2 prompt
  names warehouse RAPM/ORAPM/DRAPM, BPR, on/off, six factors and defined extras,
  with explicit windows/cutoffs, qualification, source gaps and descriptive claims.
  DPM stays distinct and external; no Databallr request or metric copy.
- Canonical impact queries pin the retained bundle. Exact cells retain model
  version/unit, player, covered-game sample/support and selected artifact provenance.
  Only requested support columns enter bounded provider payloads. Explicit impact
  windows also set reported scope, including a season fit requested from an
  inherited last-five page/thread. Null coefficients do not become authority from
  nonzero support. The web-overlap audit preserves phase/cutoff and matches actual
  cells; positive, null, missing, earlier-cutoff and DRAPM/possessive controls pass.
- `ag-v3-im07.json` is a separate revision, SHA-256
  `bf367cbcffd4e8e3a13b3dc074ff76cc98376aa9a49173cf97bf04782225fb2f`:
  **215 cases (191 dev / 24 unchanged holdout)**. Five development web RAPM/DRAPM
  cases now use exact warehouse oracles; eleven new dev cases cover ORAPM, 2Y/3Y
  RAPM, on/off, six factors and BPR. Every unrelated old dev case and every holdout
  object remains unchanged; rehashed holdout edits are rejected. No holdout inference.
- [Final real-data replay](evidence/im07/verification/replay-sealed.json) compares
  **48/48** exact authored transport replays against independent SQL joined to
  original sealed IM04 coefficients/support. On/off is recomputed from original
  scoring/control totals. **Zero unsupported numbers; zero missed warehouse
  overrides.** This is transport/tool correctness, not live language accuracy.
  Wembanyama's 2025-26 1Y RAPM remains **9.123015906749517**, rendered **+9.1230**
  with a CourtLens warehouse chip. Two **1440/375 px** recorded-response browser
  screenshots verify the visible unit, pinned link and no document overflow.
- [Live development attempt](evidence/im07/verification/real-agent-final/report.json)
  used the unchanged configured Gemini `gemini-3.5-flash-lite` alias. It stopped
  at **1/3 planned turns** with `provider_quota` and a 60-second hint, without retry
  or provider/model substitution. Limited fallback is excluded from provider
  accuracy; no completed three-run live question, usage/cost or quality baseline.
  AG07's quality/cleanup gate and AG08 remain unchanged.
- [Full final Python](evidence/im07/verification/python-sealed.log): **1,795 passed**,
  zero failed/errors, **279.74 s**, one inherited isolated-browser skip, 19 published
  deselections and the existing SDK deprecation warning. Ruff/format/strict mypy
  pass (**202 source files**). Dashboard lint/types, **286 Vitest**, **231 browser**
  cases, isolated webpack build and Compose validation pass. Browser regression
  retains 15 external-only skips and the existing standalone startup notice. Ask's
  evidence-label lookup now resolves `/items/…` paths to their actual supplied units.
- [Preservation](evidence/im07/verification/preserved-state.json): **2,878** prior
  evidence/corpus/fixture files unchanged; v1 prompt byte-identical; public release,
  snapshot, dataset and semantic identity unchanged from IM06. Real SQL uses
  PostgreSQL-enforced read-only connections, including spawned workers. Relational
  tests write only to disposable databases; build/browser work uses an isolated
  dashboard copy. Owner dotenv, source/model artifacts, frozen experiments and
  forecasts are preserved. Existing Docker services were not redeployed.
  **IM07 is verified and sealed; IM08 remains a separate planned block.**

## 2026-10-08 — IM08 verified: direct browser fetcher/source assessment

- The owner's lane revision selects IM08 independently of Gemini. IM01 is verified;
  DL/QA and IM01–IM07 are already measured. This block does not rerun final-lane
  IM06/IM07, accept AG07's quality gap, clean up the legacy agent or advance AG08.
- Added `ingestion/nba_browser.py`, the installed-Playwright Chromium transport
  `scripts/fetch_nba_browser.cjs`, read-only verification and
  [NBA direct admission v1](design/nba-direct-admission-v1.md). Operator-only fixed
  URLs, serial ten-second start spacing, 30-second deadlines, bounded 8 MiB decoded
  streams, no retries and raw-root concurrency lock. Exact complete bodies use
  SHA-256 objects, deterministic content UUIDs and separate actual observations;
  partial streams do not become assets. No source dump through the API.
- The actual observation
  `21d1c8da-6cd7-4d61-87e2-0e0155ef2ba2` accounts for **18 targets**: terms,
  hustle, Overall/Less Than 6Ft defense, Passing, all eleven offensive play types,
  current CDN scoreboard and one explicitly scheduled final-game PBP resource.
  **15 Stats requests timed out**; both CDN requests failed with Chromium
  **`net::ERR_HTTP2_PROTOCOL_ERROR`**; the terms page returned **HTTP 403**,
  including the separate browser bootstrap. One complete denial body is retained,
  never classified as statistical data. The semantic receipt hash is
  `9fe6464d31fe321ec35e29d30c41f2c6d8687b6eba5e477d3ed91cb047123532`.
- **Every direct capability remains `source_blocked`.** The official terms review
  also records a prior-consent admission gate and separate play-by-play restrictions.
  Accessible diagnostic bytes would not automatically admit a database source.
  The terms body available through primary-source web retrieval and the local
  browser's denial are separate observations. No new wave-2 values, current-season
  freshness or changing in-game success is claimed.
- Two exact offline readbacks rehash the object/observation and reproduce the
  independent retained **1,230-game / 582-appeared-player** 2025–26 regular scope.
  Measured request starts are **10.001–30.003 seconds** apart. Failed-source coverage
  stays unknown; season-total presence never certifies per-game completeness.
- **1,844 Python tests passed** in **288.83 s**, including **49 new IM08 cases**,
  zero failures/errors. One inherited isolated-Next browser skip, 19 published-data
  deselections and the inherited google-genai Python 3.14 deprecation remain.
  **10 actual Chromium controls** pass against a disposable local server: exact
  bytes, denial, stream bounds, timeout, redirect, CORS, empty and endpoint budgets.
  **286 Vitest tests** pass; Ruff, formatting (**628 files**), strict mypy
  (**203 source files**), dashboard lint/types and Compose configuration pass.
  No dashboard source changes; UI browser/build evidence remains IM07's execution.
- **3,130 pre-existing evidence/corpus/fixture/archive/settings files** rehash
  unchanged. Public release `5bbb6035-6794-4bb0-b894-7208f52ef7ad`, dataset
  `17251a08-a4eb-4f46-b356-999fcf37c65d` and semantic signature
  `67c5a695749aa4303c1fafefa1f4d43c5ff39539dd78af0466592cd8f6040666` match sealed
  IM07. The original shared progress bytes are retained and match IM07's binding;
  this entry appends the new block. No memberships, ratings, forecast inputs,
  holdout, provider keys or owner settings changed. No provider calls, production
  migrations, publication or existing Docker redeployment occurred.
- [Evidence and commands](evidence/im08/README.md) and the
  [acceptance seal](evidence/im08/acceptance.json.gz) bind the measured boundary.
  **IM08 is verified as a source assessment; all direct-source data gates remain
  blocked. AG07 and AG08 are unchanged.**

## Owner retirement: PBP play-type analogues (2026-10-13)

- Owner instruction: the Create / Space / Trans / Finish / Unknown play-type analogue stats
  (TSA, frequency, TS, rTS; 20 keys) are not trustworthy (bucket TS above 100%, an
  "Unknown" bucket holding free throws and unresolved joins) and are purged from the site.
- `RETIRED_METRICS` in `impact_extras_catalog.py` names the 20 keys. The served
  `IMPACT_CATALOG` excludes them, so the metrics API, Stats views, preview rail, glossary,
  column picker, percentiles and the assistant's `list_metrics`/`query_stats` no longer
  carry them. `impact_for_query` drops them from sealed rows before serving, and saved custom
  views drop retired columns and sort fields on load instead of failing validation.
- Sealed extras artifacts are not rewritten: the producer still computes the keys so
  existing content addresses stay reproducible. No artifact, manifest, release, dataset or
  semantic signature changed. `dashboard/lib/impact-metrics.json` was regenerated.
- Measured: **2,064 Python tests passed** (1 inherited browser skip, 24 deselected), including
  the new retirement test; Ruff, format and strict mypy (241 source files) pass. **460 Vitest
  tests** pass; dashboard lint and typecheck pass. The live API catalog lists 0 retired keys
  and still lists the observed extras; the True Shooting view renders only box-score columns.
- Follow-up audit (owner: "make sure everything is solid"): every served extra was checked
  against the installed 2025–26 regular-season store. Four more are retired, for 24 in total:
  `pbp_block_recovered_pct` (0 of 512 players reach its qualification, so it never ranks),
  `pbp_credited_ftov_per100` (median 1.69 against STL/100 1.62: steals plus charges labelled as
  forced turnovers), and `impact_ts_pct` / `impact_ftr` (PBP-sample duplicates of box TS% and
  FTR, measured up to 0.53 and 0.81 points apart over the top-100-minute players). Kept extras
  have plausible ranges (e.g. STL/100 p5–p95 0.96–2.83, DRB% 8.1–26.2%, foul rate 2.4–6.0 per
  100); `impact_rts` (Overview rTS%) and `impact_ast_per100` (possession denominator for
  offensive load, cTOV% and rim AST/100) stay. Re-measured: 2,064 Python and 460 Vitest tests
  pass; Ruff, format, mypy, dashboard lint and typecheck pass; the live API lists 0 retired keys.

## Per-team extras for split seasons (2026-10-17)

- Owner instruction: fill the team rows under a split season (Stats and player career tables)
  wherever per-team data can be fitted.
- `aggregate_by_team` in `domain/impact_extras.py` keys the committed IM05 per-game facts by
  (player, team) and runs the unchanged `aggregate`; league references (league TS% for rTS)
  still come from every player. `scripts/build_impact_team_splits.py` first checks that the
  facts reproduce each sealed extras artifact (players and league) exactly, then writes a
  separate content-addressed sidecar, `data/derived/impact-team-splits-v1/b78075aa….json`
  (11.9 MB, 6 season-phases, built in about 5 s). No sealed artifact or serving manifest changed.
- `impact_for_query` serves the sidecar's rows for the selected team instead of dropping extras
  under a team filter, and binds `team_split_sha256` into the query's artifacts, so cohort and
  cache keys change with it. A missing or altered sidecar leaves team-filtered extras unknown.
  Ratings (RAPM, BPR, six-factor) stay full-league fits and team rows leave them blank; on/off
  was already per team.
- Not fillable: NBA tracking (OnBall%, PTS Created) has no free per-team source. hoopR mirrors
  only league-wide `leaguedashptstats` files, and stats.nba.com is not admitted (it times out
  here). DARKO is one rating per player, so DPM stays blank on team rows.
- Measured: Harden 2025-26 rim assists split 91 (CLE) + 142 (LAC) = 233, the season value; rTS%
  +5.7 / +1.6 against +2.9 for the season; cTOV% 10.2% / 9.7%. 2,128 Python tests pass (1
  inherited skip, 24 deselected); Ruff, format and strict mypy pass; 565 Vitest tests pass
  (the 4 animation errors from `header.test.tsx` predate this change); dashboard lint and
  typecheck pass. The hosted demo needs the sidecar directory synced (added to
  `scripts/deploy-vps.sh`, both Compose files and `deploy/pinned.env`).

## 2026-10-19 — SB01 verified: stint box for Stat Line Shift

Alignment row 13 needed per-player shots, free throws, rebounds, assists and turnovers per stint;
the sealed IM03 stints carry player points only. The owner chose to derive them
([stint box v1](design/stint-box-v1.md)) and to admit the six IM03 bundles to the owner database.
Evidence: [stint box](evidence/stint-box-v1/README.md). Consumer: [shared-floor v2](design/shared-floor-v2.md).
