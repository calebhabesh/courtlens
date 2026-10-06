# AR04 narrative and numeric check

Measured 2026-10-06 on top of the uncommitted AR03 tree (base `a1bc656`). The implementation
and checker tests are verified. **The live fallback rate is not measured:** both live
acquisitions stopped on the first Gemini call with `quota_exceeded`. The final AR02 v2 holdout
remains sealed. AR05–AR08 are not implemented here.

## What changed

- **Narrative call.** After an answered `local_analysis` turn executes, one bounded provider call
  (`GeminiPlanProvider.narrate`, its own prompt and `NarrativeDraft` schema, no tools) receives
  the question, the resolved scope label and the result cells only. It returns 1–3 plain
  sentences or `declined`. The call only starts when at least 4 seconds of the turn deadline remain,
  and the turn-level provider budget (≤4) still holds for mixed turns.
- **Numeric checker** (`courtload/domain/narrative_check.py`, `narrative-check-v1`). Every number
  must equal a result cell at its displayed precision (half-up or half-even rounding of the cell),
  or a server-recomputed sum, absolute difference or ratio of two cells **of the same metric and
  unit**. A `%` may display a percentage-like cell, a difference of those cells, or a ratio, times 100.
  Season labels, ISO dates and years are allowed only when they come from the resolved selections,
  scope dates or result data. Version strings such as the calendar ID are excluded. Ranks (`1st`,
  `No. 3`, `top 5`, `second`) must fall within the returned rows. Number words are checked like
  digits. Digit-bearing names from the result, such as "76ers", are not numbers. The checker also
  rejects
  markup, more than 3 sentences, and unverifiable quantities or verdicts (`twice`, `half`,
  `probability`, `will outscore`, `should start`, `because`…).
- **Template fallback.** If narration is skipped, fails (quota, timeout, busy, malformed,
  declined), or the check rejects it, the turn keeps the existing template claim blocks. Narration
  never changes an answered or saveable turn's status. When accepted, a new `narrative` block
  replaces the template `local_claim` blocks. The `result` block and its evidence cells stay.
- **Re-verification at the wire boundary.** `NarrativeBlock` binds to executed operation hashes.
  `HybridTurnResponse` validation reruns the checker against those results, so a stored,
  replayed or history-loaded turn whose prose no longer matches its cells fails validation.
  This is an additive v2 block kind. Existing records carry no new fields, so digests are unchanged.
- **Eval.** `on_narrative` reports each narrative outcome to the runner. The summary adds
  `narrative`: eligible turns, attempted, accepted, fallback, **fallback rate**
  (fallback/attempted), fallback reasons and skip reasons. The report records the narrative prompt
  hash and checker/narrative source hashes.
- **Dashboard.** `hybrid-answer.tsx` renders `narrative` as prose above the supporting results.
  The full `/ask` reskin is AR06.

Limitation: the checker verifies **values, not attribution**. A correct number attached to the
wrong player passes. Names are not checked against the row that holds the value. Small integers
can also coincide with a legitimate derived value. The prompt forbids both, but the checker
does not prove they are absent.

## AR03 regression found and fixed here

The full-dev fixture run exposed an AR03 routing bug. The new `current|today|now → external` rule
sent all 16 dev follow-ups ("Now show the top 5 instead.") to `external_unavailable`, so 48/48
follow-up runs failed. AR03 only evaluated the general/mixed categories, so it missed this
([log before fix](fixture-eval-before-followup-fix.log)). `route_intent` now ignores a leading
"Now" discourse marker. "Now who is injured?" and "…playing well now?" still route to external.
Regression cases were added to `tests/unit/test_revamp_routing.py`. AR03's recorded
general/mixed evidence is unchanged and still valid. The fix is recorded here rather than by
rewriting the AR03 evidence.

## Measurements

| Run | Result |
| --- | --- |
| Live, dev compare/forecast/mixed, cap 180 calls (2 attempts) | **Not acquired.** Both stopped on the first planner call: `quota_exceeded`, Retry-After 60. 0 narratives attempted. See [live-attempts.json](live-attempts.json). |
| Authored-plan fixture, full dev (360 runs) | 345/360 exact answers, with no regressions against the AR02 fixture baseline (264/360). Leaders, single-player, compare, follow-up, forecast, general and mixed: 100%. Clarify/refuse: 18/33. Narrative: 267 eligible turns, all `skipped: no_narrator`. The fixture provider has no narrator by design. [Summary](fixture-summary.json), [capture](fixture-capture.json.gz), [log](fixture-eval.log). |

The fixture run shows that the narrative path leaves exact answers unchanged. It is not a language or
narrative-quality measurement. The fallback rate must come from a live run:

```bash
make eval-assistant ASSISTANT_EVAL_ARGS='--category leaders --category compare --category forecast --category mixed'
```

Expect about one extra provider call for each answered local turn.

## Verification

- [948 unit tests pass; two legacy PostgreSQL unit cases skipped](unit-tests.log). New:
  `test_narrative_check.py` covers display-rounding tolerance and its limits, sum/difference/ratio
  recomputation, same-metric pairing, percent scaling, null cells, allowed seasons/dates/ranks/
  labels, and every rejection reason. `test_narrative_turn.py` replays the owner's AR02 assists
  turn through the real pipeline with a fake narrator. It covers acceptance replacing template
  claims, tamper detection on stored responses, eight fallback paths (number, season, verdict,
  declined, malformed, quota, busy, timeout), the no-narrator skip, the deadline skip, the
  eval summary and the Gemini adapter's prompt, schema and tool settings. AR02/AR03 provider replays
  pass unchanged.
- [140 assistant/history/retrieval/SQL/hybrid integration tests pass](assistant-integration-tests.log)
  on a disposable PostgreSQL database, which was dropped afterward. Two new HTTP cases cover a checked narrative
  retained through exact replay and durable history with digest checks, plus the rejected-narrative
  template fallback over HTTP.
- [Ruff, strict mypy and the generated v2 schema/TypeScript check pass](python-checks.log).
- [188 dashboard unit tests](dashboard-tests.log), [ESLint](dashboard-lint.log) and
  [TypeScript](dashboard-types.log) pass.
- Threaded browser suite, on the existing dev server with mocked transport:
  [27/27 with one worker](browser-tests-serial.log), including the new narrative render/reload case.
  Parallel runs had 2 and 5 failures in different existing reload/history cases on each run
  ([run 1 tail](browser-tests-run1-tail.log), [run 2](browser-tests-run2.log)). The
  [targeted rerun](browser-rerun.log) passes. These are contention flakes in existing tests, not a
  clean parallel pass.

[Manifest](manifest.json) records evidence file and implementation source hashes.
