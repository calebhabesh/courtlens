CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# B26 input readiness and first experiment

Subsequent measured work: [strict shot adapter and real-game/season reconciliation](b26-shotchart-admission.md). The real game passes; the complete recent season is blocked by event-clock-order checks and one player/team attempt discrepancy. This original inventory remains historical evidence.

Measured 2026-10-03. This is the input-gate slice of B26, not a completed research experiment. Parent contracts: [replica analytics](../design/replica-analytics-contract.md), [frozen preregistration](../design/research-preregistration-v1.md), and the [B25 registrations](../evidence/b25-registration-manifest.json).

**Decision:** investigate expected shots first. Its standalone shot-chart source can preserve exact NBA event identities without requiring lineup reconstruction, complete foul trips or provider forecasts. This is the first feasible **admission target**, not a fit-ready experiment. All four v1 experiments remain source blocked; no exact memberships are bound and no fitting occurred.

## Actual retained inputs

The [fresh PostgreSQL inventory](../evidence/b26-input-readiness.json) reads dataset `17251a08-a4eb-4f46-b356-999fcf37c65d`, bound to release `5bbb6035-6794-4bb0-b894-7208f52ef7ad`, regular-season games strictly before `2026-10-03`. The utility uses a repeatable-read, read-only transaction, statement timeouts and rollback. It aggregates facts in SQL and does not load all shots/events into memory. It does not combine unrelated candidate/test datasets, infer readiness from `ready`/`valid` labels or use future scheduled games as outcomes.

| Retained season | Finalized schedule games | Games with reciprocal final team boxes | Games with valid shots | Games with valid possessions | Games with valid stints |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2023–24 | 1,230 | 1,230 | 0 | 0 | 0 |
| 2024–25 | 1,230 | 1,230 | 0 | 0 | 0 |
| 2025–26 | 1,230 | 1,230 | 0 | 0 | 0 |

Reciprocal team-box checks require both final home/away rows, matching dataset/game/date/season/phase, matching team/opponent identities and equal reciprocal scores. This proves those joins and score relationships, not source-byte verification or FGA/FGM/3PA/3PM reconciliation. Schedule denominators still require independent whole-season validation before experiment binding.

The selected dataset retains two shot rows, one possession, one matchup, four PBP events, two imported lineup rows and zero reconstructed stints. All shots/possessions/matchups lie outside the finalized regular-season scope. Two PBP events and one imported lineup row join one 2023–24 game; they cannot establish a complete game. Existing admission metadata reports tiny 153–874-byte sources and at most one admitted game per family; it is not full-season evidence. No model values were computed from these rows.

## Experiment comparison

| Frozen experiment | Required evidence | Current missing work | Priority |
| --- | --- | --- | --- |
| Expected shots | Three complete reconciled shot seasons; unique game/event IDs; observed make/type/distance/location; final boxes; exact validation selection/calibration halves | Event-preserving source adapter, strict field checks, all-attempt team/player reconciliation before location exclusions, complete season manifests, chronology amendment | First admission target |
| RAPM | Three complete seasons of constant five-versus-five stints, event points, fractional possession exposure; minute/score/clock conservation | Admit PBP/possessions/lineups, validate reconstruction and overrides across real games/seasons, retain all reconciliation/exclusions | After populated B19/B20 |
| Six-factor | RAPM evidence plus jointly valid event-to-stint shooting, turnover and rebound opportunities | New target-specific opportunity attribution/denominators and team-box reconciliation; existing stint points alone are insufficient | After RAPM input readiness |
| Adjusted shooting | Three complete versioned playtype seasons and unique scoring opportunities including exact foul/FT trips | Admitted playtype taxonomy, terminal-opportunity/and-one/technical-FT policy and >=95% supported playtype coverage | Independently source blocked |

DARKO import is independent of these CourtLoad experiments. No vendor forecast is needed to train a properly admitted own expected-shot model. Its version/identity/observation/reuse gates remain unchanged.

## Source route

The [primary-source spike](b26-shot-source-readiness.md) verified bounded samples for three SportsDataverse seasons and three alternative ShotChartDetail seasons. SportsDataverse shots drop the source action/event IDs. In the latest 209-row sample, 28 declared distances were zero and some differed substantially from coordinate geometry; the existing parser accepted all rows without an event-identity gate. These are admission diagnostics, not fitted errors or evidence about whole-season frequency.

The alternative `shufinskiy/nba_data` archives retain `GAME_EVENT_ID`, NBA player/team IDs, binary attempted/made flags, shot type, distance, coordinates and game date. Their **starting-year** `shotdetail_2023/2024/2025` names correspond to **ending-year** 2024/2025/2026. A source-specific adapter can explicitly restore ten-digit NBA game IDs and preserve `(game_id, GAME_EVENT_ID)`. Do not guess event identity from clock, names or coordinate proximity. Full asset bytes, key uniqueness, coordinate/distance consistency, completeness and applicable use/attribution evidence are not yet admitted.

## Separate chronology blocker

The readiness utility inspects only run manifests and preopen registration metadata; it does not reopen final predictions, labels or error reports. Their exact hashes and boundaries appear in the inventory:

- Legacy run `6f7af9e63f27aada910d`: `final_test_opened=true`, final season 2023–24; registration hash matches its run manifest.
- Points run `b0e4bb3300011b5a3499`: `final_test_opened=true`, final season 2025–26 (`2025-10-21` through `2026-04-12`); registration hash matches its run manifest.

This confirms prior final exposure in retained research, not that expected-shot candidate errors have already been evaluated. The frozen v1 rule requires an independent exposure audit and forbids claiming these historical seasons untouched or substituting an older final. An absent run record cannot prove no exposure.

**Recommended next chronology:** preserve all four v1 designs and preregister a separately identified retrospective-only expected-shot amendment before any comparison. It can evaluate historical holdout performance with explicit exposure disclosure and no untouched-final or prospective claim. A genuinely unexposed future-season final requires a separate preopen protocol and later completed outcomes. No amendment was registered in this slice, and no existing acceptance rule was relaxed.

## Next bounded implementation

1. Implement and verify the event-preserving ShotChartDetail adapter on one complete real game using revision-pinned source bytes, use/attribution evidence and a new transform identity. Reject unknown flags, nonfinite values, missing event/player/team keys and duplicate event grains. Preserve genuine zero coordinates; do not turn unknown distance/outcome/type into zero/miss/two-point values.
2. Independently reconcile every observed attempt against final player/team FGA/FGM/3PA/3PM and exact schedule identities before excluding geometry from model eligibility. Report geometry exclusions separately; use frozen documented tolerances before full-season expansion. Never fill shot distance from geometry under the current recipe.
3. Expand to a complete recent season only after that game passes, then the three required seasons. Retain exact bytes/source revisions, whole-game exclusions and full denominator evidence. Implement append-only admission on a new dataset identity; the current B19 service deletes/replaces family rows and admission reports, so it must not be used to overwrite retained memberships.
4. Preregister the honest chronology amendment before candidate comparison, freeze exact game/row and validation-half manifests, then implement process/child resource enforcement and the offline experiment runner. No source adapter or metadata boolean alone authorizes fitting.

## Reproduction and verification

```bash
.venv/bin/python -m courtload.evaluation.research_readiness \
  --dataset-id 17251a08-a4eb-4f46-b356-999fcf37c65d \
  --before-date 2026-10-03 \
  --output /tmp/courtload-b26-new-inventory.json

.venv/bin/pytest tests/unit/test_research_readiness.py \
  tests/integration/test_research_readiness_postgres.py \
  tests/unit/test_research_registration.py tests/unit/test_shooting.py \
  tests/integration/test_b23_api.py -q
```

Choose a new output filename for each observation; exclusive creation refuses overwrites. [Verification evidence](../evidence/b26-readiness-verification.json): 64 tests passed, zero skips, existing Starlette/httpx deprecation warning; Ruff check/format passed (238 files), strict mypy passed (105 source files), all 26 retained historical checksums passed and all four B25 protocol/retained registration hashes match. Seven tests are new. Full backend/dashboard/browser checks were not rerun for this offline inventory addition. The existing seven browser failures, warning gate and verified-video absence remain separate.

No full source acquisition, database admission/publication, exact split binding, model fitting, final-error inspection or policy activation occurred. Full B26 remains **source_blocked**.
