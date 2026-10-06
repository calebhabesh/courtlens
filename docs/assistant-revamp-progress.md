# CourtLens assistant revamp progress

Parent: [assistant revamp handoff](assistant-revamp-plan.md). Plans are not runtime evidence.

## Planning baseline: 2026-10-06

- Starting revision: 70d12e4.
- The owner confirmed every decision in the handoff through a grilling interview.
- Root cause of the owner's failing example was reproduced against the live DB and the real Gemini
  planner. See the handoff's "Why" section.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| AR01 | verified checkpoint | Live Gemini, 2026-10-06: 9/9 answered (3 questions × 3 runs: APG/PPG/RPG leaders last season, each resolved to 2025-26, one provider call each). 4 new Postgres integration tests (scope conflict, repair, give-up, execution error); independently rerun before AR02: 84 integration + 728 unit tests pass; ruff/mypy clean. Dashboard and browser tests not run. |
| AR02 | verified checkpoint | [Baseline and artifacts](evidence/ar02-evaluation/README.md): 120 dev × 3 live runs, 253/360 exact answers (70.28%), 254/279 canonical plans (91.04%), 3/120 flaky questions, 394 provider calls. 150-question final v2 corpus: 120 unchanged dev + 30 fresh holdout targets, frozen before tuning after correcting v1 setup overlap; v2 holdout not evaluated. Independent SQL oracles, 24 recorded Gemini turn replays in pytest, live `make eval-assistant`, inference-free rescoring. 780 unit + 87 assistant integration tests pass; ruff/mypy clean. Broader API suites need admitted baseline data; dashboard/browser not run. |
| AR03 | verified checkpoint | [Routing and general-knowledge evidence](evidence/ar03-routing/README.md): final fixture dev general/mixed 72/72; live general 48/48, mixed 17/18 acquired, stopped on quota at 66/72 planned runs (incomplete, no retry). Visible label and number rejection at the typed response boundary; bounded general provider fallback, current-fact gates, mixed sentence plus exact data cells. 882 unit + 138 assistant integration tests pass; Ruff/mypy/schema and 188 dashboard tests/lint/types pass. Threaded browser 25/26 initially; unrelated drawer case passes targeted rerun, both desktop/mobile label cases pass. Holdout sealed; broader API/full browser acceptance not claimed. |
| AR04 | implemented; live fallback rate not measured | [Narrative and checker evidence](evidence/ar04-narrative/README.md): narrative call, `narrative-check-v1` numeric checker (display rounding, same-metric sum/difference/ratio, scope seasons/dates, in-row ranks) re-run at the v2 wire boundary, template fallback that never fails a turn, eval `narrative` summary with fallback rate. Live acquisition 2026-10-06: two attempts stopped on the first call with `quota_exceeded`, 0 narratives, so **fallback rate unmeasured**. Full-dev fixture 345/360 with no regression against the AR02 fixture baseline, after fixing an AR03 routing regression ("Now show the top 5…" routed to external; 48 follow-up runs). 948 unit + 140 assistant integration tests pass; Ruff/mypy/schema and 188 dashboard tests/lint/types pass. Threaded browser 27/27 with one worker; parallel runs flake in existing reload cases. Holdout sealed. |
| AR05 | pending | |
| AR06 | pending | |
| AR07 | pending | |
| AR08 | pending | |
