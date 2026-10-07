# AR05 streaming

Measured 2026-10-06 on top of `ffc7174` (AR04). Streaming is implemented and verified at the
unit, Postgres/HTTP, proxy, browser and real-server levels. **No live narrative was streamed:**
Gemini still returned `quota_exceeded`, so the real-server runs show phases and the final
response, but no narrative slices. The AR04 fallback rate is still unmeasured. The AR02 v2 holdout
remains sealed. AR06–AR08 are not implemented here.

## What changed

- **Endpoint.** `POST /api/workbench/assistant/v2/turn/stream` returns `text/event-stream` and
  runs the same durable lifecycle as `POST /v2/turn`. `run_durable_turn` is split into
  `claim_turn` (accept, then pending → running) and `complete_turn` (execute, then publish).
  The stream claims the turn before it opens, so auth (401/403), request-identity reuse (409),
  a running thread (409), an invalid retry (422) and the byte limit (413) stay plain HTTP
  statuses, never a half-open stream. The request-limit middleware covers the new path.
- **Events** (typed in `hybrid_assistant.py` and generated into the v2 schema and TS as
  `TurnStreamEvent`):
  `accepted` (request/thread/turn IDs) → `phase` (`understanding` → `querying` → `writing`,
  forward-only) → `narrative` slices → `final` (the retained `HybridTurnResponse`). A comment
  keep-alive is sent every 10 s while the turn is quiet.
- **Phases come from the real turn path.** `run_hybrid_turn` reports `understanding` on entry.
  `_run_single_turn` reports `querying` before executing typed operations or retrieving external
  sources, and `writing` before narrative composition. A curated guidance turn reports only
  `understanding`. Mixed turns revisit phases per clause, and the stream drops any backward step.
- **Narrative is buffered and checked before it streams.** Slices are cut from the
  `NarrativeBlock` of the response **after** it was checked and published, so streamed prose can
  never differ from what history replays. A template fallback streams no slices.
- **Disconnects.** Execution runs on a worker thread. If the client disconnects, the generator
  waits (in a shielded scope) for the worker to publish before releasing the request session. The
  turn is retained either way.
- **Fallback.** `streamAssistantTurn` (`dashboard/lib/assistant-stream.ts`) falls back to
  `POST /v2/turn` with the **same request_id** when the stream route returns 404 or 5xx, the
  response is not an event stream, the network fails, or the stream ends without `final`. Durable
  idempotency then replays the retained turn. After `accepted`, a 409 means the turn is still
  running, so the client waits 1.5 s and replays. Before `accepted`, a 409 is an acceptance
  decision and is surfaced.
- **Proxy.** The Next route allows `turn/stream`, keeps the same same-origin and byte-bound
  checks, injects the operator token, and passes a successful event stream through unbuffered
  (`no-store`, `X-Accel-Buffering: no`). Errors stay JSON.
- **UI (minimal; the reskin is AR06).** The pending turn and the composer status show the
  current phase ("Understanding the question…", "Querying CourtLens data…", "Writing the
  answer…") and the streamed narrative. History is re-read on `accepted` and after `final`, and
  remains authoritative.

## Evidence

- [Python unit tests: 954 passed, 2 skipped (Postgres-gated)](unit-tests.log). These include 6 new
  `test_assistant_streaming.py` tests: real phase order through the recorded AR04 turn,
  guidance-only phase, event order and forward-only phases, retained-text slices that rejoin to
  the narrative exactly, replay without execution, keep-alive and no `final` on failure, and
  disconnect waiting for publication.
- [141 assistant integration tests pass on Postgres](assistant-integration-tests.log) (AR04: 140).
  The new HTTP test streams a narrated turn and checks: event order, the slices equal the retained
  narrative, `final` equals the same-ID `POST /v2/turn` fallback and history, a second stream
  replays without phases, and auth/409/413 come back as plain statuses.
- [Ruff, format, mypy and contract check clean](python-checks.log).
- [Dashboard: 196 Vitest tests](dashboard-tests.log) (AR04: 188; +2 proxy, +6 stream client),
  [lint](dashboard-lint.log) and [types](dashboard-types.log) clean.
- [Threaded browser suite, serial](browser-threaded-serial.log): the new **streamed turn** test
  passes. It drives the real Next proxy against a paced mock SSE server and sees each phase, the
  streamed narrative, then the retained answer, with no request/response call. It survives
  reload. The **unavailable stream** test passes and proves the fallback reuses the same request.
  Both pass again on the final files [after a type-only tidy](browser-stream-final.log).
  In that run, 3 cases from the existing "retains history and retry" family failed with a
  transient strict-mode match (two `Messages` regions for a moment at about 440 ms). The final
  snapshot shows the answer rendered. That family is flaky before AR05 too. Under
  `--repeat-each=4 --workers=1` on identical servers, HEAD `ffc7174` failed 3 of 108 runs and this
  change failed 4 of 116, all in that family.
- [Real uvicorn server on this branch against the local published DB](live-uvicorn-stream.log):
  - The owner's question streamed `accepted`, `understanding`, then `final` in 0.4 s. The final
    response was `provider_quota`, because Gemini's quota is still exhausted.
  - An explicit-plan APG query streamed all three phases, then `final` with Jokić at 10.7, matching
    AR01.
  - Re-streaming the same request_id replayed `accepted` and `final` only. That `final` was
    byte-identical to the `POST /v2/turn` fallback.
  - The two test threads were deleted afterwards.
- A curl through the Next proxy showed frames arriving at the mock server's pace (700 ms per
  phase, 120 ms per slice), not buffered.

Browser runs used a scratch copy of the dashboard on ports 3200/4100, because a developer
`next dev` already held port 3100.

## Not claimed

- No live streamed narrative or live AR04 fallback rate (quota).
- An explicit-plan turn with no provider still reports `writing` while it composes the template
  answer; there is no narrative call in that case.
- Full browser acceptance across all specs (AR08) was not run.
- The pre-existing threaded reload flake was not fixed.

Also fixed: `test_revamp_routing.py::test_bounded_provider_general_fallback[data3]` checked for
"1891" across the whole response JSON, which includes random UUIDs and `elapsed_ms`. It failed
once by chance during this block. The check now covers only rendered blocks.
