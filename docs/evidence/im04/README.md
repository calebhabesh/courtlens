# IM04 descriptive ratings

Status: **verified**, 2026-10-08 UTC. Parent:
[impact progress](../../impact-metrics-progress.md),
[rating method v1](../../design/impact-ratings-v1.md).

The offline runner consumes exactly the six ready IM03 event-gate v2 datasets.
It rehashes sealed acceptance, its evidence, bundle membership, every game and every
stint, then compares all **202,063** stint bodies and ready dataset identities to
the accepted PostgreSQL proof instance in read-only transactions. It fits all
**3,901** admitted games, retaining the same **40** exclusions, repair coverage,
plus-minus/minute limitations, and unchanged **46.744% within ±2** diagnostic.
No original candidate, ready dataset, B26 experiment, owner database, publication
pointer, forecasting feature or dashboard is changed by IM04.

## Outputs and measured diagnostics

Twelve artifacts: 1Y for each of three seasons, 2Y for both adjacent pairs, and 3Y
for all three; each independently for regular season and playoffs. Every artifact
contains ORAPM/DRAPM/RAPM, three offensive/defensive factor regressions, player/team
on/off, alpha-selection evidence, support, percentiles and qualified top-20 lists.
All twelve choose **alpha 1000** for RAPM and the shared six-factor fit from the
unchanged [10, 100, 1000] grid. No larger grid was tried to improve the results.

BPR is available in four windows: 2024–25 and 2025–26 regular-season 1Y, regular-season
2Y ending 2025–26, and 2025–26 playoff 1Y. Windows beginning in 2023–24 have no
admitted earlier targets. The other unavailable playoff windows have fewer than
20 qualified complete historical samples. Their artifacts have null BPR plus a
reason. Available BPRs record prior target artifacts, actual box-source hashes,
training samples, standardized regression, latest complete historical box vectors,
zero-prior flags and refitted coefficients. Current-window outcomes never train
the box prior.

Adjacent regular-season Pearson correlations among shared qualified players:

| Seasons | Shared players | ORAPM | DRAPM | RAPM |
| --- | --- | --- | --- | --- |
| 2023–24 / 2024–25 | 286 | 0.2794 | 0.3784 | 0.3543 |
| 2024–25 / 2025–26 | 288 | 0.3445 | 0.4187 | 0.3766 |

No shared qualified playoff cohort supports these comparisons; correlations are
explicitly null. These are stability diagnostics, not causal validation.

Chronological held-out stint margin RMSE, points per 100 mean offensive/defensive
counted controls, with alpha selected using training-only game CV:

| Regular-season window | Player ridge | Team/context baseline | Omitted RAPM points |
| --- | --- | --- | --- |
| 2023–24 1Y | 90.197 | 90.500 | 2,116 |
| 2024–25 1Y | 91.029 | 91.004 | 2,044 |
| 2025–26 1Y | 92.489 | 92.631 | 2,500 |
| 2023–24 / 2024–25 2Y | 91.964 | 92.146 | 4,160 |
| 2024–25 / 2025–26 2Y | 93.217 | 93.450 | 4,544 |
| 2023–24 through 2025–26 3Y | 93.051 | 93.447 | 6,660 |

The errors are close to the baseline, and player ridge is sometimes worse.
Small stints produce noisy per-100 margins; these are not game forecasts or B26
unexposed final tests. Every phase/window retains full dates, memberships,
training CV, unknown-player and omission counts. Centering leaves predictions
unchanged; reconstructed-seconds-weighted means are approximately zero.

Zero-control observations cannot define RAPM rates. The 3Y regular-season fit
reports **171,936** omitted side observations and **6,660 points**; 3Y playoffs
report **11,405** observations and **512 points**. No controls are manufactured.
On/off includes all actual points, including instantaneous and noncount FT scoring.
The ending-lineup exposure convention and event-lineup scoring remain explicit.
Factor regressions independently report their own zero-denominator omissions.

[Readable latest top-20 lists](top20.md) identify players, values, games and minutes.
Complete top lists for offense, defense, factors and available BPR belong to the
artifact evidence; the research sample rule is not NBA leader qualification.

## Reproduce

Run from the repository root, with pinned dependencies. This command reads the
existing accepted proof database; the URL is optional for fitting from sealed
retained bodies and mandatory for the measured read-back check:

```bash
.venv/bin/python -m courtlens.evaluation.impact_rating_runner \
  --cutoff 2026-07-01 \
  --database-url postgresql+psycopg://courtlens:courtlens@127.0.0.1:55434/courtlens_im03_event
```

Each completion prints a new run receipt under `data/derived/impact-ratings-v1/runs`.
Rating paths are content addressed and exclusive-created. Repeating identical
inputs verifies/reuses their bytes; changed existing bytes fail. Runtime/observed
time stay in run receipts, outside semantic rating hashes. Completed-season
cutoffs cap at July 1 after that season; earlier requested cutoffs remain exclusive.

Use the two printed receipts for independent artifact/evidence verification:

```bash
mkdir -p '<new-evidence-directory>'
.venv/bin/python scripts/verify_im04_ratings.py \
  --first '<first-run-receipt>.json' --second '<second-run-receipt>.json' \
  --output '<new-evidence-directory>/ratings-verification.json.gz'
.venv/bin/python scripts/test_python.py -ra
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtlens
```

Verification must use a new output path. Full coefficients, samples, input hashes,
folds and priors are retained in compressed artifact copies; no raw archive dumps
are exposed by an API. Source lineage and inherited coverage remain in run receipts.

No dbt model or dashboard changes belong to this block; their IM03 gates remain
historical evidence. Metric catalog integration and preset ungating belong to IM06.

## Final validation and sealed evidence

- [Independent artifact verification](ratings-verification.json.gz): **12 identical
  hashes** from two complete fits, **163.421 / 162.109 s**. Both read back all
  202,063 PostgreSQL stints in read-only transactions. Semantic artifacts bind
  the current method contract and all three rating implementation files.
- [Full regression](verification/python-final.log): **1,707 passed, zero failures
  or errors**, one documented isolated-Next-browser skip, 19 published-data
  deselections, one existing google-genai SDK warning, **287.36 s**.
- [29 targeted checks](verification/targeted-final-corrected.log) pass, including
  **22 rating unit cases** and the new actual-source PostgreSQL reader test.
  Independent weighted normal-equation tests verify zero and nonzero priors,
  centering, sign conventions and predictions. Game-fold/chronological tests
  check unseen players, future-mutation invariance, missing counts, qualified
  rankings, zero-denominator omissions and forecasting isolation.
- Repository [Ruff](verification/ruff-accepted.log),
  [formatting](verification/format-accepted.log) and
  [strict mypy](verification/mypy-final.log) pass (**195 source files**).
- [Sealed completion receipt](acceptance.json.gz) inventories final artifacts,
  receipts, implementation, test and evidence hashes. Complete compressed copies
  live in `artifacts/`; input lineage and inherited coverage live in the
  [fit receipt](fit-receipt.json.gz) and [replay receipt](replay-receipt.json.gz).
- Development runs remain retained. The first full development run had 1,706
  passes before the added box-missingness case. An incorrect three-value feature
  API unpack in the new isolation test caused a targeted harness failure; its
  in-flight full run was explicitly interrupted (435 passed). The corrected
  final targeted and full runs above supersede those attempts. No failed or
  interrupted attempt is counted as accepted validation.

**IM04 is verified.** IM05 remains planned; IM06 still depends on IM05. No
metric serving, preset ungating or publication was performed by this block.
