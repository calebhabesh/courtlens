CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# CourtLens assistant agent rework progress

Parent: [assistant agent handoff](assistant-agent-plan.md). Plans are not runtime evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`, `source_blocked`,
`verification_blocked`. `verified` requires the completion evidence named in the handoff's block
table.

## Planning baseline: 2026-10-07

- Starting revision: a39d03e, with an uncommitted working tree (AR07–AR09 and dashboard changes).
  Inspect `git status` before each block.
- The owner confirmed every decision in the handoff through a grilling interview.
- Facts checked during planning: no RAPM anywhere in `src/`; Impact/On-Off/Six Factor presets gated;
  general blocks reject numbers (`TextBlock.authority`); the Gemini-only provider hit
  `quota_exceeded` in AR04/AR05/AR08/AR09; Databallr robots.txt allows `/`, but its Terms of
  Service forbid copying materials and reverse engineering, so AD01 permission is required.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| AG01 | verification_blocked | [Provider foundation and verification](evidence/ag01-providers/README.md): official SDK adapters, current doc/model/tool checks, config/status/env/Compose, price estimates and exact replay. 43 provider/config tests and 1019 unit tests pass; Ruff/mypy clean; 205 Vitest tests and dashboard lint/types pass. Live Gemini smoke stops on `provider_quota` before tools/search; other providers unmeasured without keys. Broader DB/browser gaps recorded separately. Ask routing remains v2 until AG03. |
| AG02 | verified | [Read-only agent tools](evidence/ag02-tools/README.md): six Pydantic-declared tools, canonical warehouse evidence, observed-scope checks, fuzzy candidates, exact book-bound finance and recoverable errors. 53 new tool tests pass (32 PostgreSQL); 109 tool/legacy PostgreSQL regression tests pass at the recorded checkpoint; 1040 unit tests and 205 Vitest tests pass. Ruff/format/mypy clean. Owner authorized continuation despite AG01 quota. Ask routing remains v2; broader AG01 DB/browser gaps are unresolved. |
| AG03 | verified | [Agent loop and v3 durable contract](evidence/ag03-agent-loop/README.md): 60 new tests (43 unit, 17 PostgreSQL), 110 relevant PostgreSQL regressions, 1083 unit tests and 205 Vitest tests pass. Exact owner-example/follow-up replay, limits, numeric repair, limited mode, idempotent v2/v3 history and atomic transcript storage verified. Ruff/format/mypy and dashboard lint/types pass. Backend boundary only; AG04/AG05 streaming/rendering and the AG01 live/DB/browser gaps remain. |
| AG04 | verified | [Live streaming transport](evidence/ag04-streaming/README.md): typed `step`/`delta`/`reset`/v2-v3 `final`, durable callbacks, draft replacement and same-ID fallback. 1089 unit tests, 20 agent PostgreSQL tests, 110 PostgreSQL regressions, 213 Vitest tests and 45 threaded browser tests pass; Ruff/format/mypy and dashboard lint/types clean. Paced synthetic SSE travels through the real Next proxy at 1440/375 px. Live-provider success and the full v3 answer UI remain pending. |
| AG05 | verified | [Answer UI](evidence/ag05-answer-ui/README.md): safe prose/source chips, assumptions, result tables and pinned review actions, follow-ups, trace/accounting, provenance/failure labels, Settings and examples. 223 Vitest tests, 1089 Python units and 169 full-suite browser cases pass; three external-integration browser cases skip. Ruff/format/mypy, dashboard lint/types and contracts pass. Screenshots at 1440/375 px plus keyboard/reduced-motion landscape evidence. Mocked UI boundary only; live-provider and broader acceptance gaps remain. |
| AG06 | verified | [V3 evaluation tooling and measured incomplete dev reports](evidence/ag06-eval/README.md): 204 frozen cases (180 dev / 24 fresh holdout), 33-case exact replay over real fixture SQL, payload-drift control and 6 scorer checks. Clean full Python: 1596 passed / 0 failed / 0 errors, 1 documented skip / 19 published-data checks; Ruff/format/mypy clean. Gemini stopped on quota at 1/540 planned turns; other providers have no key. No complete live quality baseline or holdout inference claimed. |
| AG07 | verification_blocked | QA01 is verified. The separate AG06 quality gate is unmet: no complete measured v3 warehouse baseline to compare with AR02's 255/279 (91.40%), and no recorded owner gap acceptance. Legacy pipeline and its tests remain; no cleanup or dashboard changes occurred. |
| AG08 | planned | Depends on AG07. Live holdout per available provider, three owner examples and measured README update remain pending; the no-Gemini-call continuation does not clear that dependency. |
| AD01–AD04 | superseded 2026-10-07 | Replaced by the [impact metrics track](impact-metrics-progress.md) (IM01–IM08). The owner wants CourtLens-computed metrics, not imported Databallr data. No Databallr access occurred. |

## AG01 checkpoint: 2026-10-07

- Actual starting revision: `06034ed`, clean tree. AR07–AR09 and the handoff were committed
  before this session; the planning baseline above records the earlier state.
- The 60,000-token ceiling is retained as a configurable default. New provider defaults are
  `gemini-3.8-flash`, `claude-sonnet-5-5`, `gpt-6.1-sol`; an explicitly configured legacy Gemini
  model alias is preserved. The owner's `.env` was not changed.
- Completion is **not verified**: the configured Gemini smoke returned quota with a 60-second
  retry hint, without retries; no live tool/search success observed. Absent-key providers are
  unmeasured. Evidence includes a safe failure transcript and exact verification limits.
- Gemini's native search lacks a documented hard per-request query cap. AG03 must account for
  sub-calls/queries, stop further search and expose overshoot rather than claim a hard bound.
- AG02–AG08 were not started. AD01 remains owner action; no request date or permission reply
  was supplied. No Databallr access occurred. Sealed AR/v2 evidence and holdouts are unchanged.

## AG02 checkpoint: 2026-10-07

- Starting revision: `b4ac20d`, clean tree. The owner explicitly directed work on the next block
  despite the free-tier Gemini quota stop. AG01 stays `verification_blocked`; no provider smoke
  was retried, and no live-provider success is claimed by AG02.
- Added `agent/tools.py` with schema-derived declarations and a single dispatcher over existing
  operations, identity lookup, metric catalog, awards, finance and site guidance. Scope checks
  reject unobserved seasons/phases instead of falling back to old data. "Last season" resolves
  to 2025-26 at the measured clock. Long-name typo candidates include "wenbeyama" → Wembanyama;
  legacy matching defaults are preserved.
- Shared helper changes are limited to the optional typo-distance argument and finance-only
  execution/rendering without a basketball context. Warehouse cells, hashes and equivalent
  links are retained server-side; model lists are capped at 25 and carry truncation counts.
  Unknown/malformed arguments, missing sources/observations, sample gaps, timeouts, failed SQL
  reads and worker disconnects become structured recoverable errors.
- Measured: 53 AG02 tests pass, including 32 disposable-Postgres integration cases. A 109-test
  checkpoint includes 57 existing conversation/hybrid/position/rule/finance regressions; the
  later worker-disconnect unit case passes in the final 53-test run. Full unit directory:
  1040 passed, two DB-dependent legacy skips, one existing SDK deprecation warning. Vitest:
  205 passed. Ruff/format and strict mypy pass. Evidence and command details are linked above.
- The future-outcome fixture control confirms prior result/operation/context hashes are stable.
  V2 contract/fixture/generated-type and AR02 corpus hashes match the AG01 inventory. No sealed
  evidence, holdout, dashboard source, production data or owner environment changes occurred.
- AG02 is verified at its fixture-tool boundary. Full database/browser acceptance was not rerun;
  the AG01 gaps remain unresolved. AG03 is next: agent loop, prompt/history/provenance, v3
  contract and durable routing. Ask still uses v2. AD01 remains owner action, and no Databallr
  access occurred.

## AG03 checkpoint: 2026-10-07

- Starting revision: `21d63d5`, clean tree. An unrelated owner edit to `TODO.md` appeared during
  the block and is excluded. AG01 remains `verification_blocked`; no successful live-provider
  tool/search smoke or quality baseline is claimed.
- Ordinary Ask turns now use one typed tool loop and the separate `courtlens-assistant-v3`
  response, or labelled rule-planner limited mode without a key. Explicit manual plans and
  injected legacy providers preserve v2 compatibility. Prompt, compacted v2/v3 memory, scope
  pinning, server page referents, limits, accounting and nonblocking numeric repair are in place.
- The additive transcript table, hashed references and per-result scope preserve durable
  claim/publish, idempotency, restart/follow-up memory, cancellation/deletion fencing and dataset
  input references. Inventory validates transcript digests. Warehouse-backed turns are saveable;
  web-only answers and provenance audits are not saved findings. Existing review/rerun-to-save
  behavior is preserved; AG05 supplies its v3 UI.
- Measured: 60 new tests pass (43 unit, 17 disposable PostgreSQL), including exact replays of
  owner-example/follow-up shapes, step/search/token stops, repair and provider failure, real SQL
  and audit payload drift, v2/v3 history, races, migration parity and page pronouns. Relevant
  PostgreSQL regressions: 110 passed. Full unit directory: 1083 passed, two existing DB skips,
  one existing SDK deprecation warning. Vitest: 205 passed. Ruff/format, strict mypy and dashboard
  lint/types pass. Logs, synthetic transcripts and hashes are linked above.
- Initial compatibility tests still assumed default v2 API routing; four failures were fixed by
  explicitly injecting their legacy fixture provider, keeping their v2 assertions. Exploratory
  tests reached the configured SDK failure path before those fixtures were adapted; no live
  success is inferred. Final verification uses synthetic/replay or injected legacy providers.
- V2 schema, generated TS, fixtures and the frozen AR02 corpus hashes match AG02. Sealed AR/PF
  evidence and holdouts are untouched. The application database and owner's environment were
  not changed. Provenance's numeric-value/linguistic-coverage limits and native search/token
  overshoot are explicitly recorded; they are not broad accuracy or hard preflight guarantees.
- AG03 is verified at the backend boundary. Basic retained v3 final SSE envelopes are supported;
  live step/delta/reset and client parsing remain AG04, which is next. V3 answer UI remains AG05;
  existing v2-only consumers are not yet adapted. Full database/browser acceptance was not rerun,
  and the AG01 gaps remain unresolved. AD01 is still owner action; no Databallr access occurred.

## AG04 checkpoint: 2026-10-07

- Starting revision: `f02470a`; only the owner's unrelated `TODO.md` edit was uncommitted.
  That edit is preserved and excluded. AG01 remains `verification_blocked`; no live-provider
  call or Databallr access was made.
- The additive v3 stream contract includes `step`, live `delta`, `reset` and an authoritative
  v2/v3 `final`, retaining v2 `phase`/checked `narrative`. Durable completion now connects the
  loop callbacks to SSE. Publication, replay, cancellation and disconnect fencing remain.
  Retained v3 replay emits only `accepted` and `final`.
- Each new provider attempt replaces its earlier draft, including preliminary tool commentary,
  busy retry, limit finalization and provenance repair. Provider failure clears provisional prose
  before the limited-mode final. Native search reports completion after SDK usage arrives;
  per-search start notifications are not claimed.
- The client parses both event generations, preserves acceptance before a malformed frame,
  handles split UTF-8/CRLF frames, clears on reset and replaces drafts with the final response,
  including same-request fallback. Shared page/drawer progress uses one accessible status region.
  V3 history renders minimal plain prose with limited/unverified labels and retained scope.
  AG05 still owns source chips, results, detailed provenance styling, banners, follow-ups,
  trace, settings and saved actions.
- Measured: **1089 unit tests**, **20 agent PostgreSQL tests**, **110 relevant PostgreSQL
  regressions**, **213 Vitest tests** and **45 threaded browser tests** pass. New coverage:
  six Python unit cases, three PostgreSQL stream cases, eight parser/transport cases and four
  browser cases. Ruff/format, strict mypy, generated contracts and dashboard lint/types pass.
  Existing unit skips and SDK deprecation warning remain; lint/type checks have no warnings.
- Browser tests observe paced synthetic steps, deltas, reset, final and reload through the real
  Next proxy at 1440 and 375 px, plus v2/v3 fallback. A scratch server on 3200 preserves the
  developer's server on 3100. The initial scratch dependency-symlink failure and recovery are
  recorded. Full-browser/broad-DB acceptance, live-provider quality and AG05 UI acceptance remain
  pending. Sealed v2 contracts, AR/PF evidence and corpora/holdouts are unchanged.
- **AG04 is verified at its streaming boundary. AG05 is next.** AD01 remains unresolved;
  AD02–AD04 remain source-blocked.

## AG05 checkpoint: 2026-10-07

- Starting revision: `a719959`; only the owner's unrelated `TODO.md` edit was uncommitted.
  It is preserved and excluded. AG01 remains `verification_blocked`; no live-provider call or
  Databallr access was made. Backend behavior, provider configuration and pricing are unchanged.
- V3 turns now render through a shared answer-first component in the existing page and drawer:
  safe Markdown/source chips, a direct assumption line, returned results, follow-ups, collapsed
  sources and trace/accounting, sentence-level unverified styling, limited/failure banners and
  linked retries. Code-point position mapping preserves Python provenance offsets across emoji,
  Markdown and CRLF. Source metadata is available on hover or tap/keyboard; Escape restores focus.
- Tables begin with ten rows, expand to all returned rows, join team codes, label rank/units and
  preserve zero versus unknown. Equivalent links keep their retained identity; review/save links
  use each executed result's own scope. Web-only answers do not expose save actions. Settings
  shows provider/model/agent limits/limited mode from the status API, never a key. Empty examples
  include RAPM, defense, MVP, forecast and comparison questions. V2 uses its unchanged renderer.
- Measured: **223 Vitest tests** (ten new component cases), **1089 Python unit tests** and
  **169 full-suite browser cases** pass. All **51 threaded cases** pass, including six new AG05
  browser cases at 1440/375 px and 812×375 keyboard/reduced-motion coverage. The three full-suite
  skips require real external integration fixtures: two AR07 real-server panel cases and one
  workspace persistence case. Python's two existing DB skips and SDK deprecation warning remain.
  Ruff/format, strict mypy, dashboard lint/types and generated contracts pass with no lint/type
  warnings. Verification logs and six screenshots are linked above.
- The isolated browser workspace initially lacked shared evidence fixture paths; a read-only
  parent link fixed collection. Two legacy Settings expectations were updated for the new card.
  A subsequent run hit the documented streamed-HTML staging family in the mobile calculator;
  that test now uses the existing workbench navigation helper. The final full run is green.
  The prior threaded “retains history and retry” strict-locator family also passes serially;
  these measurements do not establish that all timing flakes are eliminated.
- The scratch dashboard uses 3200 and fixture API 4100, preserving the owner's server on 3100.
  No application database, owner environment or production data was changed. V2 contract/corpus
  hashes match AG04, and sealed AR/PF evidence and holdouts have no diff. The screenshots' RAPM,
  blocks and unsupported-number examples are synthetic, not measured basketball claims.
- **AG05 is verified at its mocked UI boundary. AG06 is next.** Live-provider success, provider
  quality, holdout and broader database/external-integration acceptance remain pending. AD01
  permission is unresolved; AD02–AD04 remain source-blocked.


## 2026-10-08 — IM07 impact warehouse/eval integration

- [IM07 evidence](evidence/im07/README.md) and the
  [impact progress entry](impact-metrics-progress.md) record the bounded integration.
  New turns use prompt v2 and the serving catalog through existing read-only tools.
  Historical v1 prompt/catalog requests still replay exactly; AG06's original
  corpus, transcripts and 24-case holdout remain unchanged.
- Separate `ag-v3-im07.json` contains 191 dev / 24 unchanged holdout cases. Five
  development RAPM/DRAPM web cases now use original-artifact/SQL warehouse oracles;
  eleven added impact development cases cover the other declared fit windows,
  on/off, six-factor coefficients and BPR. No holdout inference or scoring/tuning
  revision of the frozen holdout occurred.
- 48/48 real-data authored replays pass, with zero missed overrides and unsupported
  numbers. The owner's Wembanyama RAPM answer renders a CourtLens chip and correct
  unit at 1440/375 px. These replays/screenshots are not language accuracy.
  The configured live Gemini attempt stopped on quota at 1/3 planned turns, with
  no retry, model change or provider substitution. AG07's live-quality gate and
  AG08 acceptance remain unchanged; no legacy cleanup occurred.
- Final regression: 1,795 Python, 286 Vitest and 231 browser passes; Ruff/format,
  strict mypy, dashboard lint/types/build and Compose validation pass. Existing
  skip/SDK/standalone notices are recorded in the evidence. All 2,878 prior
  evidence/corpus/fixture hashes and the public publication identities are retained.

## 2026-10-08 — AG06 continuation under the no-Gemini-call constraint

- [Continuation preflight](evidence/ag06-continuation/README.md) records local
  configuration presence only: Gemini has a key; Anthropic and OpenAI do not.
  Zero provider calls were made. Current quota/access was not probed.
- Independently verified the retained AR02 fixture checksum and warehouse counts:
  **255/279 (91.40%)**. All three original AG06 report checksums match the retained
  summary; none is a complete live baseline. Both corpus checksums and split
  contracts pass; 3,002 existing evidence/corpus files were preserved.
- The current IM07 corpus requires 191 development cases × 3 runs (573 turns),
  including 393 warehouse-category turns. Its 24-case holdout remains unchanged
  and was not inferred. These workload counts are not completed live measurement.
- No implementation block in the requested sequence is eligible under the
  current constraint. AG06 tooling stays verified at its recorded boundary;
  its live measurement continuation is blocked. AG07 remains
  `verification_blocked`, with no owner quality-gap acceptance. AG08 stays
  `planned` until AG07. No pipeline code was removed and no application code was
  changed; regression suites were not repeated for this documentation-only check.
- IM06/IM07 were not repeated. IM08's seal does not satisfy the assistant quality
  prerequisite. Direct NBA source admission remains a separate future gate.
