CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# B26 expected-shot experiment: completed negative result

Measured 2026-10-03. The expected-shot sub-block and its admission, binding,
bounded runner, artifact registry, model card, prediction replay and read-only
results API are complete. The registered candidate failed selection. This is a
completed negative experiment, not a trained feature eligible for promotion.
Full B26 still includes three separately gated experiments; the shot discrepancy
no longer blocks any of them.

## Complete source admission

[Shot admission v2](../design/shotchart-admission-v2.md) treats event IDs as
identities. Reversed clocks remain diagnostics. Malformed clocks, duplicate IDs
and exact all-attempt count mismatches still reject admission. Independently
validated possession/aftermath sequence is a separate requirement. The official
[Denver–Minnesota book](https://statsdmz.nba.com/pdfs/20251027/20251027_DENMIN_book.pdf)
and retained full PDF corroborate the Gordon 3:26 / Jokić 2:50 ordering.

All observed attempts reconcile with independent schedule, player and team
boxes before geometry eligibility:

| Season | Reconciled games | Observed attempts | Model-eligible attempts |
| --- | ---: | ---: | ---: |
| 2023–24 | 1,230 / 1,230 | 218,702 | 218,700 |
| 2024–25 | 1,230 / 1,230 | 219,527 | 219,527 |
| 2025–26 | 1,230 / 1,230 | 219,159 | 219,159 |
| Total | 3,690 / 3,690 | 657,388 | 657,386 |

Six explicit correction operations were reviewed against retained complete
official observations, under separately registered ledger versions:

- Houston **at Charlotte**, `0022500792`: exclude extra missed two-point
  event `403`. The full official observation contains 169 field goals, and all
  remaining archived events match identities, results, types and clocks. The
  [official book](https://statsdmz.nba.com/pdfs/20260219/20260219_HOUCHA_book.pdf)
  records substitutions at Q3 4:46 and two Smith attempts that quarter.
- Dallas at Memphis, `0022401194`: event `653` is a missed two-point attempt,
  rather than the archived missed three-pointer.
- Denver at Memphis, `0022300078`: supplement missing official missed event
  `715`; Washington at Cleveland, `0022300465`: supplement missing official
  missed event `499`. Their official PBP geometry is **unadmitted**, so both
  count for reconciliation and are excluded from model rows.
- Indiana at Cleveland, `0022300091`: exclude extra event `351` and correct
  event `346` to the officially observed Q3 11:19 clock.

Exclusions/replacements bind the exact original row hash; supplements bind the
original whole-game membership and explicit official action bytes. Every
corrected game's complete shot membership must match the retained final official
game observation. Original archives, removed rows, v1 evidence and intermediate
v2 attempts remain retained. No correction was inferred from matching totals.
See [full admission and correction evidence](../evidence/b26-three-season-admission-v2.json).

The new dataset `3d64fe04-dc9a-4a45-bf96-182371a94f7b` uses separate PostgreSQL
research tables. SQL UPDATE/DELETE/TRUNCATE and later membership extension are
rejected. [Live sealing probes](../evidence/b26-live-sealing-probe.json) also
verify duplicate admission refusal and unchanged publication pointers. All memberships were admitted in one creation transaction, with
independent original-byte and normalized-row verification. The public snapshot
remains `5bbb6035-6794-4bb0-b894-7208f52ef7ad`. Existing workbench data and policy
were not republished. Reuse scope is local noncommercial research; retain NBA,
archive publisher and SportsDataverse attribution. Raw source dumps are absent
from the results API.

## Registered experiment and result

The original four B25 protocols remain byte-identical. Before comparison,
[retrospective v2](../design/expected-shot-retrospective-v2.md) registered the
chronology amendment: train on 2023–24, select/calibrate on fixed distinct-date
halves of 2024–25, and label 2025–26 as previously exposed retrospective history.
It preserves the candidate, baseline, sample rules and numerical gates.

- Protocol SHA-256: `ce40518f8eebe240db250b60890df1a9f104e442559ce494a77c57cc0e47e805`.
- Binding SHA-256: `78e9ea2a5365206485610dcbfdffd21826f71d6518072bc332dbd9785bc10ad7`.
- Training: 218,700 rows; fit through 2024-04-14.
- Selection: 597 games / 106,080 rows, through 2025-01-15.
- Reserved calibration: 633 games / 113,447 rows. No calibration fit occurred.
- Reserved retrospective final: 1,230 games / 219,159 rows. No final model-error
  report was opened. Original final exposure remains explicitly disclosed.

Run `de8dbe44-daef-4c8b-a36b-527c0a6fd603` fitted the fixed five-feature location/type
logistic candidate once against a training-only zone/type Beta(1,1) baseline.

| Selection metric | Baseline | Candidate |
| --- | ---: | ---: |
| Brier score | 0.233961315 | 0.233771183 |
| Log loss | 0.660348792 | 0.660061313 |
| Expected-point MAE | 1.132032533 | 1.131730666 |
| ECE, 10 fixed bins | 0.005180841 | 0.034815320 |

Relative Brier improvement **0.08127%** is below the registered **1%** selection
gate. Status: `selection_failed_negative_result`. The runner stopped before
calibration/final errors, final slices or final bootstraps. No candidate tuning,
replacement fit, prospective claim or points-policy promotion was performed.

Kernel enforcement covers the full process tree: two CPU affinities and 200%
quota, 4 GiB memory with no swap, 1,800-second wall limit and 16 tasks. Numerical
libraries use two threads. The worker used 39.72 seconds, 2,052,132 KiB peak
process RSS and 2,046,316,544 bytes aggregate cgroup peak, with no OOM events.
An earlier affinity-preflight failure is retained separately. Its run directory
was empty and fitting never began; the verified preflight-only retry corrected
the launcher under the same protocol/budget. A completed-binding rerun is refused.

Saved-model replay reproduced **106,080 / 106,080** predictions with **zero
absolute error and zero fits**, under the same resource caps. Replay checks run
artifact hashes, exact dataset/game/row memberships, outcomes and saved scaler,
weights and baseline. [Result evidence](../evidence/b26-expected-shot-result.json)
contains metrics, resource accounting, manifest/artifact identities and replay.

An [append-only artifact package](../evidence/b26-run-package.json), tied to the
original manifest and binding, supplies the protocol-named baseline/candidate
prediction files, complete exclusions, all six reviewed correction records,
configuration/stop metadata and an expanded attributed model card. All 106,080
prediction pairs match the sealed combined file exactly. It adds zero fits and
zero error evaluations; the original run bytes and evaluation remain unchanged.
The launcher now creates this package after a completed run. Protocol-level
locking also rejects attempts to reset the fit budget by changing the binding.

## Read-only API and reproduction

GET `/api/workbench/research/experiments`, `/runs`, and `/runs/{run_id}` expose
typed summaries, evaluation, model card, actual fit/report horizons and resource
accounting. HTTP fitting is unavailable. Earlier report cutoffs reject with 422;
corrupted artifacts reject with 503. [In-process real-artifact API smoke](../evidence/b26-results-api-smoke.json)
passed all three reads and the earlier-cutoff rejection.

Replay the retained completed experiment without fitting:

```sh
.venv/bin/python -m courtload.evaluation.research_reproduce \
  --run data/artifacts/research-runs/de8dbe44-daef-4c8b-a36b-527c0a6fd603
```

The [admission specification](../evidence/b26-input-specification.json) preserves
exact local source/bundle/ledger paths. Running admission against this database
again refuses replacement. A fresh database also requires retained source bytes,
the migration, original independent-box artifacts and all bound contracts; the
tracked JSON alone does not reconstruct the source observations.

Verification: normal backend suite **448 passed / 74 skipped**, configured
PostgreSQL focused/regression suite **138 passed / zero skips**, Ruff check/format
passed (270 files), strict mypy passed (118 source files), diff check passed.
All 26 historical checksums and all four B25 semantic/byte pairs passed. The
existing Starlette/httpx deprecation remains. An attempted full suite in an empty
migrated scratch PostgreSQL database was interrupted after historical fixtures
failed for absent admitted baseline metadata/published release; that database
was removed. This is not full PostgreSQL suite acceptance. No dashboard changes
were made; prior browser failures remain open.
[Final verification evidence](../evidence/b26-experiment-completion-verification.json)
records the post-packaging checks and unchanged original run/public snapshot.

## Remaining independent B26 gates

RAPM requires complete validated ten-player stints, possession exposure, minutes
and score conservation. Six-factor additionally requires event-to-stint shooting,
turnover and rebound opportunities. Playtype-adjusted shooting requires actual
versioned playtype labels and complete scoring/foul-trip attribution. The
retained workbench has no complete scoped seasons at these grains. The pinned
archive index offers NBA PBPStats through starting-year 2024, not 2025, and is
not evidence of admitted lineup or playtype completeness. Shot event IDs and
shot clocks cannot supply those inputs. Each original v1 chronology gate also
remains independently applicable. These three experiments were not fitted or
claimed complete; their API entries identify their own source requirements.
