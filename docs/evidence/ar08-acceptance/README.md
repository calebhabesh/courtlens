# AR08 — assistant acceptance checkpoint

Measured 2026-10-06 in America/Toronto (2026-10-07 UTC), from `a39d03e` with the
uncommitted AR07 implementation. [Source manifest](source-manifest.json) identifies the
working-tree sources; the acquisition also retains prompt, scorer and implementation digests.

**Final live acceptance is incomplete.** The frozen v2 holdout was opened for this block,
and the live runner stopped on provider quota. No prompt, router, checker, model or scorer
was tuned against these outcomes. No retry, provider switch, fixture holdout run or result
replacement was performed. Prior AR/PF evidence and corpus checksums remain unchanged.

## Live holdout

The [complete acquisition capture](live-holdout.json) retains SQL expectations, typed responses,
provider output, failure reason, token usage and source hashes. [Runner log](live-eval.log).

| Measurement | Observed result |
| --- | --- |
| Frozen corpus | `ar02-v2`: 150 questions, 120 dev / 30 holdout, 3 repetitions each |
| Acquisition | 2/90 planned holdout runs; 0/30 questions fully repeated |
| Exact answers | 0/2 acquired runs |
| Strict canonical plans | 0/2 acquired runs |
| Provider calls | 2 actual live calls; no setup or analytical calls |
| Stop | `quota_exceeded`; runner exit 2 |
| Refusal precision/recall | Unmeasured: no applicable observations |
| Flakiness / answer variation | Unmeasured: no fully repeated questions |
| Narrative fallback rate | Unmeasured: no eligible narrative attempts |
| Observed turn latency | Mean 2,613.81 ms; p95 3,620.06 ms, including pacing |
| Reported token usage | 5,603 total tokens from one successful call; failed call usage unavailable |

The configured provider was `gemini-3.5-flash-lite`, using the retained Free-tier evidence.
The pinned published release was `5bbb6035-6794-4bb0-b894-7208f52ef7ad`; each target retains
its own historical scope. The first target explicitly requested steals per game in 2024-25.
Run one returned `clarification_required` / `defense_metric` instead of the SQL-backed ranking.
Run two returned `failed` / `provider_quota`. Both fail the existing scorer. The third repetition
and the other 29 questions were not acquired.

These two outcomes are not an estimate of accuracy across the whole holdout. The holdout is
now partially exposed, not sealed. Any later acquisition must preserve this attempt and disclose
its coverage; these outputs must not become development tuning examples. There is no accuracy
threshold required by the handoff, but the prescribed full live measurement remains outstanding.

## Verification

- [Python units](unit-tests.log): **964 passed, 2 skipped**. The skips are the existing optional
  PostgreSQL unit cases without their opt-in variable in this unit-only run.
- [Vitest](dashboard-tests.log): **205 passed**.
- [PostgreSQL integration](integration-tests.log): **146 passed** across conversation, hybrid
  assistant, durable history, saved results, retrieval, hybrid evaluation and revamp SQL-oracle
  suites. This is the selected assistant boundary, not a full-project integration-suite claim.
- [Full mocked browser suite](browser-full-suite.log): **149 passed, 3 skipped, 0 failed** at
  two workers. Skips: the existing real-workspace test and the two opt-in panel cases.
- [Real-service panel browser](real-browser.log): **2 browser tests passed**, driven by one
  passing pytest harness. At 1440 and 375 px, each verifies player “his” and “this team” through
  real PostgreSQL, FastAPI, Next proxy, SSE and durable history with a deterministic fixture
  planner and synthetic admitted facts. These do not establish live Gemini accuracy.
- [Ruff check](ruff-check.log), [Ruff format](ruff-format.log), [strict mypy](mypy.log),
  [dashboard lint](dashboard-lint.log), [TypeScript](dashboard-types.log) and
  [generated-contract check](schema.log) pass.

## Screenshots

Fresh screenshots from this checkpoint, with explicit mocked/fixture responses:

- Chat at 1440 px: [empty](ask-desktop-empty.png), [answer](ask-desktop-answer.png),
  [panel](ask-desktop-panel.png).
- Chat at 375 px: [empty](ask-mobile-empty.png), [answer](ask-mobile-answer.png),
  [panel](ask-mobile-panel.png). The mobile transcript scrolls independently of the composer;
  the captured long answer is at its table/actions, with prose above the visible area.
- Real-service fixture panel: [player 1440](ar07-real-player_id-1440.png),
  [player 375](ar07-real-player_id-375.png), [team 1440](ar07-real-team_id-1440.png),
  [team 375](ar07-real-team_id-375.png). The AR07 filenames identify the reused browser scenarios;
  these are fresh AR08 runs, not copied prior-block screenshots.

The screenshots show presentation and referent execution, not live inference results.

## Case study and resume evidence

The [root README](../../../README.md#assistant-case-study-server-owned-answers-measured-language-planning)
describes the scope-conflict failure, the server-owned planning/execution boundary, checked narrative,
streaming, contextual UI and independent evaluation. Its resume line uses the completed
[AR02 live development baseline](../ar02-evaluation/README.md): **253/360 exact answers (70.28%)**
and **3/120 flaky questions (2.5%)**, explicitly labelled as the initial development baseline.
Those numbers predate AR03–AR07 and are not the current implementation's final accuracy.

## Reproduction and remaining boundary

Ordinary checks run from the root with `.venv/bin/pytest tests/unit -q`, `.venv/bin/ruff check .`,
`.venv/bin/ruff format --check .`, `.venv/bin/mypy src/courtload`,
`.venv/bin/python scripts/generate_hybrid_contract.py --check` and the dashboard's
`test`, `lint`, `typecheck` scripts. PostgreSQL fixtures create/drop unique schemas when
`COURTLOAD_TEST_POSTGRES_URL` is supplied.

The selected PostgreSQL run used `test_conversation_postgres.py`,
`test_hybrid_assistant_postgres.py`, `test_assistant_history_postgres.py`,
`test_saved_conversation_postgres.py`, `test_assistant_retrieval_postgres.py`,
`test_hybrid_evaluation_postgres.py` and `test_revamp_evaluation_postgres.py` in `tests/integration`.
Browser checks used an isolated dashboard copy at `/tmp/courtload-ar08-acceptance/dashboard`,
with copied dependencies and the same application/test files, on port 3209. Only the copied mock
server's bind port changed to 4209. Run with `PLAYWRIGHT_EXTERNAL_SERVER=true`,
`PLAYWRIGHT_BASE_URL=http://localhost:3209` and `npm run test:browser -- --workers=2`.
For the real-service run, restart that isolated Next server targeting 4208, then use the
[AR07 harness instructions](../ar07-side-panel/README.md#reproduction) with the AR08 directory
and port 3209. The harness starts/stops its own API and disposable schema.

Isolated servers were stopped after verification. The owner's 3100 server and existing
`dashboard/next-env.d.ts` diff were preserved.

The live command used was:

```sh
make eval-assistant ASSISTANT_EVAL_ARGS='--split holdout --open-holdout --output docs/evidence/ar08-acceptance/live-holdout.json'
```

That path now contains immutable evidence: never rerun into it. The runner refuses to overwrite it.
Future live acquisition requires restored provider capacity and a new evidence path, preserving the
frozen inputs, previous attempt and no-holdout-tuning discipline. Current-model holdout accuracy,
flakiness and narrative fallback measurement remain open. Replica source gates and sealed PF
measurements are unaffected. Changes remain uncommitted.
