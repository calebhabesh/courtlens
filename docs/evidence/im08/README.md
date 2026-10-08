# IM08 — direct NBA browser fetcher and source assessment

**Verified at the fetcher/source-assessment boundary. All direct capabilities remain
`source_blocked`.** The IM08 handoff explicitly accepts a measured endpoint failure;
this block admits no new statistical data or wave-2 metrics. IM01–IM07 remain sealed.
AG07's separate live-quality gate and AG08 acceptance are unchanged.

## Implementation

[`ingestion/nba_browser.py`](../../../src/courtlens/ingestion/nba_browser.py) invokes
[`fetch_nba_browser.cjs`](../../../scripts/fetch_nba_browser.cjs) using the installed
Playwright **1.63.0 / Chromium 153.0.8010.12**. Requests execute through ordinary
Chromium `fetch`: normal TLS/CORS/user agent, serial requests, ten-second minimum
start spacing, 30-second deadlines, no retries, fixed official URLs and one optional
explicit PBP game. A raw-root file lock prevents concurrent observations at that root.
Streams reject declared or actual decoded bodies over 8 MiB. Complete bytes retain
IM01-style SHA-256 addresses, URL/hash content UUIDs and separate actual observations.
Exclusive writes recheck existing objects; partial bodies are never retained.

Named tables, counts, source IDs, duplicate grains, nulls, season/group/play-type
identity, scoreboard phase/status and PBP action structure are checked. Season-total
coverage is player presence, with all missing/unexpected IDs, never invented game
completeness. Missing counts remain null. The independent retained 2025–26 regular
scope has **1,230 finalized games and 582 appeared player IDs**; schedule and box
bytes/receipts are rehashed. Other seasons without admitted denominators report
unknown coverage. No API, catalog, feature, rating, membership or publication writes.

## Actual source outcomes — 2026-10-08 UTC

The [complete observation](source-observation.json) is a byte-identical copy of
`data/raw/nba-direct/observations/21d1c8da-6cd7-4d61-87e2-0e0155ef2ba2.json`.
Its semantic hash is
`9fe6464d31fe321ec35e29d30c41f2c6d8687b6eba5e477d3ed91cb047123532`.
The [live transport log](verification/browser-live-first.log) records every target:

| Target scope | Requests | Observed outcome |
| --- | --- | --- |
| NBA terms | 1, plus separate page bootstrap | HTTP **403**; exact complete denial body retained locally |
| Hustle totals | 1 | **30-second timeout** |
| Overall and Less Than 6Ft defense | 2 | **30-second timeout** each |
| Passing / potential assists | 1 | **30-second timeout** |
| Offensive play types, all 11 named categories | 11 | **30-second timeout** each |
| Current CDN scoreboard | 1 | Chromium **`net::ERR_HTTP2_PROTOCOL_ERROR`** |
| CDN PBP, explicitly scheduled game `0022500001` | 1 | Chromium **`net::ERR_HTTP2_PROTOCOL_ERROR`** |

All **18 target observations** are accounted for. Statistical coverage is unknown
for every failed resource; no absent rows became zeros. The retained denial body is
not a statistics asset or a copy of the terms document. No changing in-game,
current-season freshness or end-to-end ingestion success is claimed.

The separate [terms/admission review](../../design/nba-direct-admission-v1.md) cites
the official terms checked through web retrieval; this machine's browser denial is
recorded independently. Prior-consent and play-by-play restrictions prevent direct
database admission here even if a future diagnostic request succeeds. Every target
retains admission reason `nba_terms_prior_consent_required`; no consent toggle exists.

## Verification

- [Full Python](verification/python-first.log): **1,844 passed**, zero failures/errors,
  **288.83 s**. Includes **49 new IM08 cases**. One inherited isolated-Next-browser
  skip, 19 explicit published-data deselections and the inherited google-genai
  Python 3.14 deprecation warning remain; no xfails or weakened assertions.
- [Actual Chromium controls](verification/browser-controls-first.json): **10 passed**
  against a disposable local HTTP server: exact Unicode/whitespace bytes, HTTP
  denials, declared/chunked byte bounds, deadline abort, redirect refusal, CORS,
  empty bodies, URL restrictions and request budgets. No NBA traffic in these tests.
- [Source read-back](verification/source-readback-final.json): two identical offline
  verifications of the complete observation and retained asset/observation bytes;
  independent schedule/box scope reproduces. Measured request start gaps are
  **10.001–30.003 seconds**, concurrency one, retries zero.
- [Ruff](verification/ruff-final.log), [formatting](verification/format-final.log)
  (**628 files**) and [strict mypy](verification/mypy-final.log)
  (**203 source files**) pass.
- [Dashboard lint](verification/dashboard-lint.log),
  [types](verification/dashboard-types.log) and [Vitest](verification/vitest.log)
  (**286 tests / 39 files**) pass. Dashboard sources are unchanged; UI browser and
  production-build checks retain their IM07 evidence rather than a new execution.
- [Compose configuration](verification/compose.log) passes. Existing services were
  not redeployed. Python regression uses a disposable migrated PostgreSQL container.
- [Preservation](verification/preservation.json) rehashes **3,130 pre-existing
  evidence/corpus/fixture/archive/settings files**, with zero changes. Public release,
  dataset and semantic identities match the sealed IM07 pointer. The shared progress
  log is appended; its [original bytes](inputs/impact-metrics-progress-before.md)
  remain retained and match IM07's bound hash. No holdout inference or provider call.

Development failure logs remain retained separately. The [acceptance seal](acceptance.json.gz)
binds final code/contracts/tests, the source receipt, verification and preserved inputs.

## Reproduce locally

From the repository root, with Python and dashboard dependencies plus installed
Playwright Chromium:

```bash
# Offline: no NBA requests, models, database writes or deployment.
.venv/bin/python -m courtlens.ingestion.nba_browser --verify \
  data/raw/nba-direct/observations/21d1c8da-6cd7-4d61-87e2-0e0155ef2ba2.json
node scripts/verify_im08_browser.cjs /tmp/im08-browser-controls-new.json

# Explicit new low-rate observation; always diagnostic and source_blocked.
.venv/bin/python -m courtlens.ingestion.nba_browser --season 2025-26 \
  --phase regular_season --game-id 0022500001
```

An inaccessible source does not revoke the historical warehouse's 68 served metrics.
Wave-2 data and fresh direct PBP remain unavailable; retrying Gemini is unrelated.
