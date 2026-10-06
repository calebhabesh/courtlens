# AR03 routing and general knowledge

Measured 2026-10-06, starting from AR02 `a1bc656`. AR03's bounded backend checkpoint is
verified. The final AR02 v2 holdout remains unevaluated. AR04–AR08 are not implemented here.

The assistant now routes concept/help/history questions to labelled general knowledge,
statistical questions to typed local operations, and mixed questions to a general sentence
plus a separately bound analytical answer. Pure general answers require no warehouse release
and cannot be saved as analytical findings. Curated explanations use versioned source identities;
unmatched stable basketball questions can use a single bounded provider call with a strict
schema. Model knowledge has no invented citation or warehouse evidence. Current roster,
injury and trade requests explain that verified information is unavailable; they cannot use
this model-knowledge route, even with a supplied analytical plan.

`TextBlock.origin = general_knowledge` is an additive v2 extension. Its text must contain the
visible **General knowledge, not from CourtLens data** label and must pass the number check.
Digits (including Unicode digits), common number words, ordinal words, percent signs and
fraction symbols and Unicode numeric characters are rejected. Invalid prose is replaced by a readable inability response.
Existing v2 knowledge/discussion turns and v1 readers retain their meaning. Labels use the
existing text renderer; this checkpoint does not reskin `/ask`.

The analytical planner prompt, model, operation registry, formulas, SQL expectations and
frozen development/holdout split are unchanged. Named-player forecast and variability requests
remain data questions. “Current season” does not by itself request a live roster. Narrow
registered source requests, including “an assist according to NBA,” preserve the verified
adapter path. Ordinary assist explanations use curated general knowledge.

## Development measurements

Only `general` and `mixed` categories were selected: 24 development questions × 3 repetitions.
The independent SQL oracle checks mixed answers against the retained published snapshot.
No accuracy threshold is imposed.

| Category | Final authored-plan fixture | Live acquisition |
| --- | ---: | ---: |
| General | 48/48 | 48/48 |
| Mixed | 24/24 | 17/18 completed; 24 planned |
| Total | 72/72 | 65/66 completed; 72 planned |

The [live acquisition](live-summary.json) stopped at the first Gemini quota response after
18 actual provider attempts: 17 successful plans and one quota response. All 17 successfully
planned mixed answers matched SQL cells and canonical plans. The quota turn retained its
labelled general sentence and a specific inability block; it failed exact-answer scoring.
Six planned mixed runs were not acquired. This is an **incomplete live evaluation**, not a
72-run success or a provider-reliability claim. No retry, model switch or paid fallback followed
that quota response.

All 48 general turns used curated prose with zero provider calls. These scores check the
visible label, required relevance terms and absence of numerical claims; they do not establish
arbitrary model-knowledge factual accuracy. The model-knowledge fallback is covered with bounded
SDK/schema and response-validation fixtures, not live semantic evaluation. Overall assistant
accuracy remains the separately sealed AR02 baseline; this category subset cannot replace it.

Full captured responses and provider records: [live capture](live-capture.json.gz),
[final fixture capture](fixture-capture.json.gz). The [fixture summary](fixture-summary.json)
retains SQL expectations and canonical plans. [Manifest](manifest.json) binds archive hashes
and final implementation source hashes. The live acquisition preceded isolated legacy routing
and diagnostic wording refinements; pytest replays every captured development turn through
current code, blocking real provider/source access. The fixture acquisition measures final
source bytes. Original PF07d/PF09 and AR02 evidence is unchanged.

## Verification

- [882 unit tests pass; two legacy PostgreSQL unit cases skipped](unit-tests.log).
  This includes the original 24 AR02 provider replays and 66 AR03 captured-turn replays,
  including the quota failure. New tests cover routing, missing labels, digit/word/fraction
  rejection, current-fact bypass attempts, number-bearing general output and provider schema.
- [73 assistant/history/retrieval/SQL integration tests](assistant-integration-final.log) plus
  [65 hybrid regression tests](hybrid-regressions-final.log) pass against a disposable PostgreSQL
  database. New HTTP tests retain the label across exact replay and history; mixed tests verify
  the general sentence, actual arithmetic, scope and saveable evidence.
- [Ruff check/format, strict mypy and generated schema/TypeScript checks pass](python-checks.log).
- [188 dashboard unit tests pass](dashboard-tests.log);
  [ESLint](dashboard-lint.log) and [TypeScript](dashboard-types.log) pass.
- [Threaded browser suite](browser-tests.log): 25/26 passed on the existing local server.
  Both added label/history checks at desktop and mobile widths passed. An unrelated existing
  drawer reload test failed initially; [its targeted rerun and both label cases pass](browser-rerun.log).
  Do not report a clean full browser-suite pass. This is mocked transport/rendering verification,
  not live-provider browser acceptance or AR06/AR08 UI acceptance.

The initial integration run identified regressions and stale PF07d assertions; its retained
[log](assistant-integration-tests.log) is not the final check. Tests now explicitly map the
revamp's revised expectations without rewriting the sealed PF07d corpus or rescoring its
historical reports. Broader admitted-data API suites and the full dashboard browser suite were
not run. The disposable test database was removed after verification.

## Reproduce

```bash
# Bounded development categories; default v2 corpus, holdout sealed.
make eval-assistant ASSISTANT_EVAL_ARGS='--category general --category mixed'
make eval-assistant ASSISTANT_EVAL_ARGS='--mode fixture --category general --category mixed'

# No provider/network work; replays the preserved acquisition and quota response.
.venv/bin/pytest tests/unit/test_revamp_routing.py tests/unit/test_revamp_routing_replay.py
```

Category selection is recorded in each report; omitted `--category` keeps the whole development
corpus. The runner records separate planner/general prompt identities and implementation hashes.
