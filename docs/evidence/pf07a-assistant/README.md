# PF07a — hybrid assistant execution contracts

Completed at the bounded PF07a criterion on 2026-10-05. Starting revision:
`daedc03c66e7142c5a23ef918193e86e1b86af1a`, with pre-existing dirty work retained.
Available Codex session implemented the backend/shared contracts sequentially; no delegation
or runtime-model substitution. Read root/dashboard instructions, workbench/replica/freeze
handoffs, search/analytical/assistant contracts and PF01/PF06 prerequisite records.

## Implemented boundary

- Explicit `POST /api/workbench/assistant/v2/turn`, preserving v1 routes, plans, saved readers,
  manifests and evidence. The original 160KiB pre-parsing request limit now includes v2.
- Typed local analysis, site guidance, explanation, discussion, clarification and inability
  routing. Mixed clauses retain separate origins and the applicable interpreted scope.
  Up to four clauses and one analytical plan share the existing 45-second deadline,
  eight-operation/200-row budgets and bounded provider adapter. No independent retry loop,
  arbitrary tool, paid fallback or provider-written local finding was added.
- Exact local claims use the executed row/entity/name/metric/unit/sample/context/result cell;
  equal values from another row cannot substitute. Equivalent actions use executed operation
  identity and the existing shared serializer. Local operation/result versions remain v1;
  the containing conversational answer is explicitly v2.
- Ten small packaged Markdown knowledge entries cover players/comparison, teams, WOWY, scope,
  metrics, forecasts, saved findings, settings, pick and roll and defensive criteria. Entries
  have versioned identities, content hashes, update dates and route references. Guidance
  observes release-bound box-score coverage; absent source families remain undeclared.
  Pure explanations and discussion have no fabricated research context. Criteria-based
  discussion does not invent a named player's superiority or factual examples.
- Server-side, injectable America/New_York civil-date interpretation. Relative seasons take
  precedence over stale page/catalog labels; explicit season/phase/window/cutoff changes
  preserve release identity. Follow-up execution accepts inherited scope/plan from its
  server caller; old response objects remain immutable. Recently uses last ten appearances
  and the registered disjoint preceding-ten change definition. Calendar-year ambiguity asks
  one material question.
- Versioned APG eligibility policy separates official qualification from research minimums.
  Decimal arithmetic checks the minimum and strict season-end exception. Team-game exposure
  must be supplied from verified evidence; the helper does not certify whole-league coverage.
  Exact historical PG membership is never inferred from a broad G label, names or assists.
- Distinct readable failures for no observations, insufficient sample, unsupported operations,
  unavailable context/calendar/position/qualification/external retrieval, provider disabled,
  quota, busy, timeout, malformed output and backend execution. Original questions are not
  relabelled as a generic AI outage. Private exception text is excluded.
- Frozen request/response/source-fact/action/accounting and durable thread/header/turn/history
  payload schemas. Cross-record validators reject wrong local cell identity, invented prose,
  source/entity/value/position/period/locator mismatches, unsafe equivalent links and retained
  input/answer digest or terminal-state mismatches. Verified external tuples are adapter-owned;
  the client request cannot supply sources or findings.

Owned paths: [file inventory](owned-files.json). Shared-contract writer: this Codex session.
The original replica coverage ledger and source gates remain unchanged.

## Measured checks

| Check | Result |
| --- | --- |
| Scoped backend suite: new v2 + existing v1 conversation/saved unit and PostgreSQL integration files | **202 passed**, zero failures/skips/warnings, final combined run **57.73s**; [log](backend-final.log) |
| New v2 unit checks, including final mixed-scope/storage validation | **50 passed**, zero failures/skips/warnings; [log](unit-final.log) |
| New v2 disposable PostgreSQL integration cases | **15 pass** within combined run: arithmetic, read-only facts, actual FastAPI schemas, v1 compatibility, scope changes, provider branches, malformed output, runtime guidance, mixed results and pre-parsing byte bound |
| Deterministic router corpus | **45 cases**, including **12 separately frozen held-out cases**, pass; these are router fixtures, not measured provider interpretation accuracy |
| Real service HTTP | **10 actual Uvicorn + retained PostgreSQL tasks pass**; readable terminal outputs, zero provider calls; final slowest request **745.1ms**; [responses/timings](http.json), [log](http-final.log) |
| Retained investigations | **185 outcomes identical to PF06/PF00**, including **137 matching hashes and the same 48 pre-existing mismatches**; [report](retained.json) |
| Retained v1 saved conversations | **33/33 reproduce**, verified saved inventory unchanged; [report](retained.json) |
| Starting-file and sealed artifact preservation | **2,137 starting files inventoried**, zero outside-owned changes; **316 artifact hashes unchanged**; [preservation](preservation.json) |
| Full Ruff check / format / strict mypy | Pass; **411 files formatted**, **154 source files typed**, zero diagnostics; [check](ruff-check.log), [format](ruff-format.log), [mypy](mypy.log) |
| Generated schema / TS drift | Pass; [log](contracts.log) |
| Dashboard unit suite | **28 files / 184 tests pass**; [log](dashboard-unit.log) |
| Dashboard lint / TypeScript | Pass, zero warnings; [lint](dashboard-lint.log), [types](dashboard-typecheck.log) |
| Isolated production webpack build | Pass, zero warnings; [log](build.log), [temporary directory](build-directory.txt), [helper](build-helper.py.txt) |
| Diff whitespace | Pass; [log](diff-check.log) |

PostgreSQL tests create isolated synthetic schemas in the disposable
`courtload_pf00_baseline` database and drop them afterward. Real retained-data reproduction
uses read-only transactions; analytical workers use the existing supervised read-only
executor. Fixture planners simulate error/typed-plan branches without contacting a provider.
The external tuple tests use synthetic source facts and prove binding rejection; they do not
establish actual external fact extraction or source accessibility.

Initial integration assertion expected unrounded PPG; the existing operation returns a
one-decimal display value. Expected rounding was corrected without changing arithmetic.
A subsequent mixed-answer scope assertion found and fixed selection of a scope-free
explanation over the external answer's interpreted season. Final checks pass;
[classifications](classified-checks.json) and [initial integration log](integration.log)
retain these distinctions. Existing full-suite freeze failures remain outside this block.

## Frozen handoff

- [Assistant contract](../../design/polish-assistant-contract.md),
  [JSON Schema](../../design/assistant-v2.schema.json),
  [generated TypeScript](../../../dashboard/lib/assistant-v2.generated.ts),
  [measured response fixtures](../../design/assistant-v2-fixtures.json).
- [Knowledge manifest](knowledge-manifest.json); packaged source:
  [guide.md](../../../src/courtload/services/assistant/knowledge/guide.md).
- [12 held-out cases](../../../tests/fixtures/assistant/pf07a-holdout-v1.json) and
  [45-case routing corpus](../../../tests/fixtures/assistant/pf07a-routing-v1.json), each with
  an adjacent SHA-256 file. Original B33/B34c corpora/hashes are unchanged.

PF07a is execution-only. Thread/request IDs provide correlation; durable history,
transport replay/idempotency, concurrent-turn locks, cancellation/restart recovery,
history deletion and restoration are **PF07b**, not implemented here. The server-owned
`inherited_context`/`previous_plan` service seam is for that wrapper; the client cannot
submit a previous response as evidence. The v2 `saveable` flag means local-result eligibility,
not a new save endpoint. Existing v1 saving remains separate and verified.

**PF07c** still needs actual free-source adapters, source accessibility/cost/freshness tests,
verified extraction and bounded retrieval. No server external retrieval is enabled. Current,
leader and position-restricted requests therefore explain their specific gap. Inability
counts for response completeness, not factual-answer accuracy. The exact PG/last-season
question resolves 2025–26 and refuses to invent a position-qualified winner.

**PF07d** still needs broader language/integration evaluation and eligible-project real-model
acceptance. The lexical router has measured fixture coverage, not arbitrary-language
understanding. Mixed separators are semicolons, question boundaries and “and also”; multiple
local plans require a choice. The existing Gemini typed planner/model is retained, with no
prompt tuning or actual inference in this block. Provider/project eligibility gates remain.

**PF08** can prototype with the frozen v2 fixtures, but real UI/history completion needs
PF07b–d. No frontend route, chat drawer, history browser flow, screenshot, restore or overall
resource/latency gate is claimed here. **PF09** and unresolved source/model/finance/Live gates
remain separate. No acquisition, publication, migration, retained personal mutation, provider
inference, external server fetch or Live demand occurred.

## Calendar and policy sources

The source-referenced calendar retains these final-game dates:

| Season | Final game | Primary reference |
| --- | --- | --- |
| 2018–19 | 2019-06-13 | [NBA Finals Game 6 wrap](https://www.nba.com/2019-finals-game6-the-wrap) |
| 2019–20 | 2020-10-11 | [NBA Finals Game 6 review](https://www.nba.com/news/finals-stat-lakers-heat-6) |
| 2020–21 | 2021-07-20 | [NBA Finals Game 6 box-score review](https://www.nba.com/news/inside-the-box-score-2021-nba-finals-game-6) |
| 2021–22 | 2022-06-16 | [NBA Finals hub](https://www.nba.com/playoffs/2022/the-finals) |
| 2022–23 | 2023-06-12 | [NBA final game](https://www.nba.com/game/mia-vs-den-0042200405) |
| 2023–24 | 2024-06-17 | [NBA final game](https://www.nba.com/game/0042300405) |
| 2024–25 | 2025-06-22 | [NBA playoff results](https://www.nba.com/news/2025-nba-playoffs-schedule) |
| 2025–26 | 2026-06-13 | [NBA playoff results](https://www.nba.com/news/2026-nba-playoffs-schedule) |

With a date-only clock, completion applies the next civil day after the final game. This
avoids claiming completion earlier on that game's date. Delayed pandemic Finals have explicit
boundaries; neither June 30 nor dataset coverage determines “last season.” Unknown earlier
frames and dates beyond the verified validity interval return a calendar gap. The
[next-season official schedule](https://pr.nba.com/2026-27-nba-regular-season-schedule)
establishes opening on 2026-10-20 and regular-season end on 2027-04-11; the latter bounds
how long this registry can safely establish the last completed season without a new Finals
entry. Other materially ambiguous “this season” frames ask a choice. These are curated
calendar references checked during implementation, not proof of an enabled retrieval adapter.

[Official statistical minimums](https://www.nba.com/stats/help/statminimums) support the named
APG qualification policy and missed-games exception. The implementation accepts verified
team-game exposure rather than assuming a season length; shortened-season tests separately
exercise rounding. PG/SG labels may be included only when dated release-bound evidence
supplies them; generic G remains unresolved.

## Reproduction commands

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
 .venv/bin/pytest tests/unit/test_hybrid_assistant.py tests/unit/test_conversations.py \
 tests/unit/test_saved_conversations.py tests/integration/test_hybrid_assistant_postgres.py \
 tests/integration/test_conversation_postgres.py tests/integration/test_saved_conversation_postgres.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
```

Run `.venv/bin/uvicorn courtload.api.app:create_app --factory --host 127.0.0.1 --port 8177`
in another terminal, then `.venv/bin/python scripts/verify_pf07a_assistant.py`. The verifier
checks retained outcomes and sends only explicit local plans or deterministic knowledge/gap
requests, with zero provider calls. `--http-only` rechecks HTTP without repeating retained
reproduction. Build using the recorded isolated helper with
`PF07A_API_URL=http://127.0.0.1:8177`; it preserves the workspace's build declarations.
Temporary verification services were stopped after evidence capture.
