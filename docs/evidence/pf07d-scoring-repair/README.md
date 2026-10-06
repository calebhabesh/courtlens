# PF07d scoring-only planning repair and language acceptance

2026-10-06. Owner requested the next bounded block after the quota-policy measurement.
**PF07d meets its bounded backend integration/language gate.** PF08 remains an opt-in
prototype awaiting full UI acceptance; PF09 and original replica source/model/finance/Live
gates remain open. Codex implemented sequentially without delegation, preserving dirty work.

## Repair and feedback loop

The three captured scoring-table plans already contained an unrequested `min_per_game`.
Reexecuting them against read-only retained inputs reproduces all three canonical mismatches,
with readable, evidence-safe answers. [Corrected red replay](repro-red-main-guarded.log),
[reproducer](repro.py.txt). Its initial missing main guard was a harness error, retained in
[classifications](classified-checks.json); it is not product evidence.

Ranked hypotheses were overly narrow named-ranking guidance, generic query defaults and
canonicalization inserting minutes. Captured plans and the replay establish that the extra
metric precedes canonicalization. The prompt applied metric-only instructions to rankings
while advertising scoring/minutes as generic table defaults.

- Extend explicit named-metric selection to tables/lists/rankings and mixed analytical clauses.
  Scoring defaults to PPG; totals retain their requested definition. Explicit scoring/minutes
  selects both, while games/minutes thresholds remain sample filters. Metric-free query
  defaults and all analytical formulas/canonicalization remain unchanged.
- The first prompt candidate repairs all three tables but adds a minutes distribution to one
  scoring-only variability request: **9/10 model-planned cases**, **47/48 overall**. Preserve
  [that run](real-provider-regression.json). Clarify single-metric distribution selection;
  explicit scoring-and-minutes variability still requests two independent distributions.
- Three PostgreSQL regressions prove that the actual captured extra-column plans still fail
  the unchanged scorer. No output trimming, weakened comparison or frozen-expectation edits.

## Independent evidence and measured gate

Before the first prompt edit, freeze [12 fresh cases](../../../tests/fixtures/assistant/pf07d-scoring-holdout-v1.json)
and their checksum. [Freeze timestamp and original prompt-file hash](holdout-freeze.json).
Cases cover scoring paraphrases, explicit counts, game/minute eligibility, requested dual
metrics, total points, minutes rankings, variability, similarity and reversed comparison.
All twelve traverse fixture-planned durable PostgreSQL HTTP/manual equivalence checks first.
They receive **one real-model evaluation after the final prompt**, with no subsequent tuning.
They are now observed evidence, not an untouched holdout for future changes.

The original 49-case corpus and checksums remain unchanged. Its original held-out flags are
historical labels: later runs are regressions. The synthetic empty-scope case remains separately
verified in PostgreSQL, excluded from retained inputs and never counted as a language success.
The runner adds `--corpus`, checksum validation for that path, corpus/evidence-role/prompt hashes,
and completion counts based on actual exclusions rather than assuming every corpus excludes one.

| Measurement | Final regression | Fresh holdout |
| --- | --- | --- |
| Actually model-planned canonical accuracy | **10/10 (100%)** | **12/12 (100%)** |
| Applicable cases correct | **48/48** | **12/12** |
| Readable / exact evidence-safe | **48/48** each | **12/12** each |
| Critical inability/clarification | **16/16** | Not in this supported-analysis holdout |
| Answer-required external facts | **4/4** | Not in this supported-analysis holdout |
| Provider errors / retries / fallback | **0 / 0 / 0** | **0 / 0 / 0** |

[Final regression](real-provider-regression-final.json), [holdout](real-provider-holdout.json),
[usage/version/input/prompt/latency aggregates](measurements.json). Final regression has
32 answers, 15 honest inability responses and one clarification. Its deterministic paths do
not enter the language-accuracy denominator. The two final runs use the same prompt hash and
unchanged configured/observed model `gemini-3.5-flash-lite`. This repair block makes **32 actual
calls**: ten first-candidate regressions, ten final regressions, twelve fresh holdouts. The
previous quota-policy run remains separate and unchanged.

The owner's same-day confirmed Free-project evidence remains authoritative for this run;
credentials and configuration are unchanged. [Google's project quota rules](https://ai.google.dev/gemini-api/docs/rate-limits)
were rechecked: actual limits depend on project/model and cover RPM, input TPM and RPD.
No separate call allowance, retries, model switch, paid grounding, billing activation or paid
fallback. Existing payload, execution, source, concurrency and deadline bounds remain.

## Verification and preservation

- **356 backend/PostgreSQL checks pass**, zero failures/skips/warnings: the preceding 341
  plus twelve fresh fixture cases and three captured-plan rejection checks.
  [Backend log](backend-tests.log), [65 corpus checks](corpus-tests.log).
  After the final prompt clarification, **95 planner/conversation checks pass** again.
  [Final prompt log](final-prompt-tests.log).
- **188 dashboard tests pass**. [Log](dashboard-tests.log). Full Ruff/format, strict mypy
  and generated-contract drift pass. [Ruff](ruff-final.log), [format](format-final.log),
  [mypy](mypy.log), [contract](contract.log), [diff](diff-check.log).
- **185 retained reproduction outcomes unchanged**, including the same 48 existing mismatches;
  **33/33 saved v1 conversations reproduce**. [Retained report](retained.json), [log](retained.log).
- **316 retained artifact hashes unchanged**. [Artifacts](artifact-preservation.json).
  [Starting revision](starting-revision.txt), [dirty tree](starting-status.txt),
  [file hashes](starting-files.json), [owned files](owned-files.json),
  [boundary preservation](preservation.json), [environment](environment.json).

All runtime analytical reads use read-only retained transactions. Relational tests mutate
only isolated generated schemas in the disposable baseline database. No retained transcript
mutation, analytical acquisition/admission/publication, training, migration or dashboard change.
No new browser/build/UI acceptance or general-purpose NBA language accuracy is claimed. Twelve
supported analytical paraphrases establish this bounded gate, not arbitrary-question reliability.
Current roster/injury, dated positions and official whole-league leader gaps remain explicit.

## Reproduction

Use a new output filename; the evaluator refuses evidence overwrite. The commands preserve
provider failures and stop without retry. Original and supplementary checksums gate execution.

```bash
.venv/bin/python scripts/evaluate_pf07d_hybrid.py /tmp/pf07d-scoring-regression-new.json \
 --real-provider --free-project-evidence docs/evidence/pf07d-quota-policy/free-project.json
.venv/bin/python scripts/evaluate_pf07d_hybrid.py /tmp/pf07d-scoring-holdout-new.json \
 --corpus tests/fixtures/assistant/pf07d-scoring-holdout-v1.json \
 --real-provider --free-project-evidence docs/evidence/pf07d-quota-policy/free-project.json
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
 .venv/bin/pytest tests/integration/test_hybrid_evaluation_postgres.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard test
```

The red replay can be copied from `repro.py.txt` to an importable Python main file; its
assertion intentionally fails on the unchanged captured plans. Retained reproduction reuses
`verify_pf07a_assistant.verify_retained` with `DIRECTORY` set here from a main-guarded wrapper.
Next dependency: **PF08 full threaded UI acceptance**, followed by PF09. Stop at this boundary.
