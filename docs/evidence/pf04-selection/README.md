# PF04 — shared entity selection

Completed 2026-10-05 at the bounded PF04 criterion. Prerequisites: PF02 shared visual foundation and PF03 scoped team identity. Gemini Flash was unavailable; Codex performed its presentation ownership as an explicit substitution. Existing dirty work was preserved.

## Implemented boundary

- Added one form-safe lookup engine with separate navigation and entity-field adapters. Results are locally bounded, scope/cache keyed, cancellable, stale-response safe and expiry bounded. Canonical selections are emitted as IDs plus display identity; draft text cannot submit an old selection.
- Added single and multiple committed pickers with named chips, duplicate prevention, remove/clear behavior, ambiguity handling, aliases and diacritics, team city/tricode matching, no-data availability, loading/no-match/error/retry states, keyboard/IME/pointer/touch behavior and unique per-instance ARIA IDs.
- Migrated comparison, team comparison, WOWY/stat shifts, shooting/matchups/aftermath, trends, distributions, similarity, roster shapes, learning, recent games, showcase, ranking boards, tier lists, Ask manual entity arguments, planner roster/watchlist candidates and shared global navigation. Ordinary filters, dates, finance artifact IDs, notes, JSON advanced arguments and user-assigned positions remain their distinct roles.
- Preserved canonical IDs and full scope parameters through comparison/navigation and Back/Forward. Local planner candidates never call the public lookup API. Team and player identity rendering reuses PF03 assets.

## Verification

| Check | Result |
| --- | --- |
| Lookup/API/PostgreSQL regressions | **28 passed**, zero skips |
| Lookup unit regressions | **15 passed** |
| Dashboard unit tests | **179 passed** |
| Dashboard lint/typecheck | Pass, zero diagnostics |
| Ruff/format/strict mypy | Pass, zero diagnostics |
| Isolated production webpack builds | Pass for real-service and fixture copies |
| Fixture browser workflows | **48 passed** in final broad run; the retained planner-only rerun was unavailable after its isolated server exited and is recorded as harness-limited |
| Real-service PF04 browser checks | **15 passed**, zero page errors; comparison, WOWY, shooting, research, learning, team comparison, recent-games/showcase and error/ambiguity paths |
| Actual 200% browser zoom | **2 checks passed**, DPR 1→2; CSS viewport 1279×676 and document width 1272 |
| Settled lookup input budget | **p95 126.7 ms** across 20 warm alias alternations, target ≤200 ms |
| Warm lookup HTTP budget | **p95 2.61 / 3.92 / 8.86 ms** at 1/2/4 clients; 20 rows, 17,402 bytes |
| Retained investigations | **185 unchanged**: 137 matching hashes and the same 48 existing mismatches |

Raw records: [route inventory](route-inventory.md), [fixture browser](fixture-production.log), [production browser](production-browser.log), [navigation](navigation.json), [zoom](zoom.log), [input budget](input-budget.json), [lookup budget](lookup-budget.json), [PostgreSQL tests](python-postgres.log), [unit lookup tests](python-lookup.log), [retained comparison](retained-comparison.json), and [starting state](starting-state.json).

The planner picker is implemented with bounded roster/watchlist candidates and was verified in the rendered component path during the personal-picker probe for ranking and tier lists. Its isolated final rerun could not obtain the fixture page after the temporary server exited; no planner pass is claimed from that rerun. No provider call, acquisition, publication, migration or persistent analytical mutation occurred.

Next dependency: **PF05 table structure and interactions**. PF06–PF09 and the original replica source gates remain open.
