# AR02 assistant evaluation baseline

Measured 2026-10-06 after AR01 (`520c1d0`), with the configured Gemini flash-lite provider and
the retained [Free-tier confirmation](../pf07d-quota-policy/free-project.json).
No planner prompt, router, narrative, UI or model tuning was performed in AR02.

Both acquisitions completed **120 development questions × 3 repetitions = 360 turns**.
The [live baseline](live-baseline.json) is actual inference; the
[authored fixture baseline](fixture-baseline.json) checks deterministic execution/scoring and is
not language accuracy. Summaries retain every case's SQL expectations, canonical plan, failures,
timing and signature. Full responses and provider-adapter outputs are in the compressed captures.

| Category | Live exact answer | Authored fixture exact answer |
| --- | ---: | ---: |
| Leaders | 64/72 | 72/72 |
| Single player | 74/75 | 75/75 |
| Compare | 48/48 | 48/48 |
| Follow-up | 37/48 | 48/48 |
| General knowledge | 0/48 | 0/48 |
| Mixed | 0/24 | 0/24 |
| Clarify/refuse | 18/33 | 9/33 |
| Forecast availability | 12/12 | 12/12 |
| **Total** | **253/360 (70.28%)** | **264/360 (73.33%)** |

Live strict canonical plan agreement: **254/279 (91.04%)**. The 81 nonanalytical turns have no
plan denominator. Core data categories (leaders/single/compare/follow-up) scored **223/243
(91.77%)** on the selected SQL cells and scope. Refusal precision was **33/60 (55%)**, and refusal
recall **33/33 (100%)**; wrong reasons still fail exact-answer scoring.

Correctness changed between repetitions for **3/120 questions (2.5%)**; answer signatures changed
for **5/120 (4.17%)**. Mean observed time was **5,331.67 ms**, nearest-rank p95 **10,316.54 ms**.
Timing includes pacing and follow-up setup. There were **394 actual provider calls** (342 primary,
52 setup), with reported usage on all calls: 2,193,326 prompt tokens, 88,455 candidate tokens,
2,281,781 total tokens. No quota/provider stop occurred. Original per-call usage/model-version
records remain in the live capture.

## What failed

General and mixed answers lack the new visible general-knowledge label. This is an expected
AR03 capability gap, not a claim that all existing explanatory text is false. Some general
concepts are currently refused. The automated general check tests label, relevance terms and
absence of numbers; it does not fact-check arbitrary prose.

Leader failures include invented metric keys and changed scope inside operation arguments even
after repair. Repairs often recover invented keys, but count as extra calls. Some otherwise
correct queries differ from the authored canonical plan by filters or sort aliases. These are
reported separately from cell accuracy. Total assists/rebounds follow-ups sometimes switch to
per-game metrics, despite the setup plan selecting totals. All failures are retained; no prompt
repair or result trimming was used to improve the baseline.

The forecast cutoff was 2026-01-15. SQL found **zero eligible prior issuances** for these inputs;
the retained records were issued later. All 12 turns correctly report unavailability. This is
**not prediction accuracy or evidence of a working prospective issuance at that cutoff**.
Synthetic Postgres tests cover positive issuance selection, horizon and strict cutoff.

## Scoring correction and final holdout

Initial acquisition scoring expected an answered forecast even when SQL found no issuance.
The scorer now requires the honest `no_observations` refusal and reports availability separately.
Rescoring used zero inference calls, retained the original capture digest, and changed only the
12 forecast failure lists in each acquisition. Original acquisition captures remain intact:
[live](live-capture.json.gz), [fixture](fixture-capture.json.gz).

The baseline used [v1](../../../evaluation/assistant/ar02-v1.json). A final split audit found
reserved leader inputs reused by development follow-up setups. Those reservations cannot serve
as a final holdout. Before any tuning, [v2](../../../evaluation/assistant/ar02-v2.json) retained
the same 120 dev targets and froze 30 replacement targets with fresh historical scope and
general/clarification questions. **No v2 holdout provider call, SQL expectation extraction or
scoring was performed.** Exact primary/setup input overlap is checked with scope and prior-plan
identity. V1's original checksum/capture remains preserved; AR08 must use v2.

## Verification and reproduction

- [780 unit tests passed, 2 legacy Postgres unit cases skipped](unit-tests.log).
- [87 assistant integration tests passed](assistant-integration-tests.log), including the 4 AR01
  regressions and 3 independent SQL-oracle tests. The [oracle tests](oracle-tests.log) were rerun
  after the missing-issuance correction.
- CI's ordinary pytest collection runs 24 actual Gemini turn replays (33 captured calls),
  including recovered invalid metrics and give-up after repair, with network/provider access blocked.
- Ruff check/format and strict mypy pass. No dashboard/browser work was changed or tested.
- A broader Python run against the empty disposable DB was interrupted after 23 failures and
  14 setup errors: older API suites assume admitted baseline metadata/data. This is not a
  full-project test pass. The disposable `courtload_ar02_test` DB was removed after verification.

Reproduce live or fixture acquisition and offline rescoring using the
[runner instructions](../../../evaluation/assistant/README.md). Rescoring automatically selects
the retained corpus by its digest, so the v1 acquisition remains reproducible with v2 as the
default future corpus. [Manifest](manifest.json) records compressed/uncompressed capture hashes,
source hashes and the SDK version measured at archive time. Acquisition began from the AR01
working tree; the source hashes identify the completed harness/scorer committed with this report.
Later metadata/checkpoint/split hardening did not tune the planner or change the captured responses.
