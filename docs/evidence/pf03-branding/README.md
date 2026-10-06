# PF03 — team branding and scoped identity

Completed 2026-10-05 at the bounded PF03 criterion. Parent: [freeze handoff](../../polish-freeze-implementation-plan.md); [UI contract](../../design/polish-ui-contract.md). Prerequisites: [PF01](../pf01b-dashboard/README.md), [PF02](../pf02-foundation/README.md). Starting revision `daedc03c66e7142c5a23ef918193e86e1b86af1a`; pre-existing work preserved. Codex performed backend and presentation sequentially; Gemini 3.8 Flash was unavailable, so its presentation ownership was explicitly substituted. No delegation or concurrent shared-file writers.

## Implemented boundary

- Retained **30 official NBA SVG assets**, **194,444 bytes total**, in the dashboard public directory. The [catalog](../../../dashboard/lib/team-branding.json) binds canonical NBA IDs and exact tricodes to source URLs, SHA-256 hashes, acquisition date, asset sizes, attribution and reuse notes. [Explicit acquisition/offline verifier](../../../scripts/team_branding_assets.py) validates content/size and rejects active/external SVG references. Application reads and builds perform no asset acquisition.
- Shared TeamLogo/TeamLogoStack render actual local artwork in player/team lookup, Stats rows, team rows/cards/profile and comparison cards. Every represented team is visible and named; sets are deduplicated/sorted without choosing `teams[0]`. Missing/failed artwork keeps the abbreviation, identity and fixed dimensions. Unknown historical codes such as NJN remain literal; no BKN mapping is invented. Current-franchise artwork is decorative, with its meaning identified in the catalog and image title; it does not establish an era-specific name or roster.
- Additive `team_association` in lookup describes selected season/phase/exclusive cutoff or explicitly **Last observed** when unscoped. Only observed appearances count. No selected-scope appearances yields an empty association, never the future/latest team. Existing latest-team fields remain legacy metadata; rendering consumes the new association. Suggestions and matched results follow the same policy. Canonical destination URLs retain release/season/phase/cutoff.
- Scope associations query at most the 20 returned players, use the dataset/player/date index and a bounded 1,024-entry entity/scope cache. Metadata-only release resolution removes existing per-keystroke coverage scans. Publication pointer resolution still occurs on each server request; explicit invalid releases return 404. Warm typing performs no player-fact query, statistical computation, provider call or download.
- Client cache keys include the new identity version, phase and cutoff. Scope changes discard displayed associations; cache hits invalidate obsolete requests. This is the identity prerequisite, not PF04's complete picker/lookup-engine acceptance.
- The comparison API previously omitted the `teams` field consumed by the UI. API-only enrichment now binds teams to the selected season/last-five/last-ten appearance window. Analytical services and saved-result serializers remain unchanged; tests verify the enrichment does not mutate the legacy payload.

Owned existing seams: lookup domain/service, additive schemas/router and TS contracts/client/cache; global lookup and Stats explorer; global CSS identity rules; team explorer/profile and player comparison rendering; lookup/cache tests and bounded fixture readiness waits; freeze progress. New files: branding catalog/assets/component, explicit setup/verifiers, PostgreSQL identity tests and this evidence. No stats arithmetic, data migration, ingestion/publication, assistant or personal persistence changes.

## Measured verification

| Check | Result |
| --- | --- |
| PostgreSQL/API identity + existing Stats SQL/contracts | **28 passed**, zero failures/skips/warnings |
| Dashboard Vitest | **177 passed**, 27 files |
| Fixture Playwright Workbench/conversation workflows | **21 passed**, zero skips/page failures in final run |
| Ruff / format / strict mypy | Pass, zero diagnostics |
| Dashboard lint / TypeScript | Pass, zero diagnostics/warnings |
| Isolated production webpack build | Pass; installed Next.js 16.3.5, unchanged dependencies |
| Production real-service browser checks | **17 passed**, zero page exceptions; **112 local branding requests**, no branding CDN request |
| Actual 200% browser zoom | **2 checks passed**, DPR 1→2; CSS width 2559→1279, 1272px document width |
| Independent real-source lookup reconciliation | **12 scopes passed**, plus unscoped association and invalid-release checks |
| Offline branding integrity | All 30 SHA-256 hashes and sizes match |
| Retained investigations | **185 unchanged outcomes**: 137 matching hashes, same 48 pre-existing mismatches |
| Preservation | **1,833 outside-scope starting files**, **1,160 prior evidence files**, **316 artifacts** unchanged |

Raw records: [PostgreSQL tests](python-targeted.log), [dashboard units](dashboard-unit.log), [fixtures](fixture-browser.log), [production build](build-webpack.log), [browser](browser.json), [zoom](zoom.json), [independent identities](identity.json), [retained outcomes](retained-comparison.json), [preservation](preservation.json), [starting status/hashes](starting-state.json). The existing lookup unit suite also runs in an isolated SQLite fallback; its result is separately logged in [lookup regression tests](python-lookup-unit.log), not counted as PostgreSQL acceptance.

Real-source checks reconcile Dončić and Barnes across 2023–24, 2024–25 and 2025–26 regular-season/playoff/cutoff scopes, plus a future empty scope, against independent raw-fact SQL in a read-only PostgreSQL transaction. Synthetic historical NJN, future mutation, release isolation, no-appearance and comparison-window cases use transaction-local temporary tables in the disposable PF00 database; zero DB tests skip. No retained database facts are modified.

Production screenshots use real FastAPI/PostgreSQL through the existing [read-only passthrough](../../../scripts/verify_pf02_proxy.py) on 8154, with no analytical substitutions. Stats captures: [2560×1440](trade-combined-wide.png), [1440×900](trade-desktop.png), [375×812](trade-mobile.png), [team filter](trade-team-filter.png), [pre-trade cutoff](trade-historical-cutoff.png), [last five](trade-last-five.png), [Logos mode](trade-logo-mode.png). Lookup: [pre-trade](lookup-before-trade.png), [combined](lookup-combined.png), [team](team-lookup-combined.png). Additional reuse: [team table](teams-table.png), [cards](teams-cards.png), [comparison](comparison.png). DPR is 1 for these ordinary previews. [Row zoom](trade-zoom.png) and [lookup zoom](lookup-zoom.png) use headed Chromium/Xvfb, OS keyboard events and actual window capture, not CSS scaling. Screenshots were visually inspected; page overflow assertions pass at narrow and zoom viewports.

Two browser cases are explicitly fixtures: [failed asset](asset-failure.png) aborts only local image transport; [historical-code fallback](historical-code-fallback.png) supplies NJN in a lookup response because the real retained dataset covers 2023–26. Neither claims historical source admission. PostgreSQL independently verifies the historical-code preservation rule.

Initial verification failures are retained: accent-sensitive table filtering/overbroad name selector and lazy-image/card selector assumptions in browser probes, missing comparison identity in [the comparison probe](browser-missing-comparison-identity.log), and existing streamed-route/redirect races in [fixture streaming](fixture-browser-streaming.log) / [navigation](fixture-browser-navigation-probe.log). Final table tests target the exact displayed name; lazy images are scrolled into view; fixture tests await hydration/navigation without weakening assertions. PF04 still owns broad alias/picker/stale-response acceptance; PF05 owns recurring table guides and interaction polish.

## Resource measurements and scope limits

[Loopback HTTP measurements](lookup-budget.json) return at most 20 rows and **17,402 bytes**. Final warm HTTP p95 for 1/2/4 concurrent clients is **2.19 / 3.53 / 7.03 ms** (20 requests each); this exact key's first request is **9.66 ms**, not a process-cold benchmark. Independent in-process read-only HTTP warm p95 is **1.52 ms**; SQL instrumentation proves **zero player-fact queries** across 20 warm requests. Existing backend warm ≤50 ms and response ≤25 KiB targets pass these bounded samples. Settled-input end-to-end latency, process-cold and whole-installation memory acceptance remain unmeasured here. Associations and response caches each retain at most 1,024 entries; at most 20 player IDs enter a new association query. Asset bundle size is measured, not compressed transfer or memory usage.

Artwork comes from the [official NBA team directory](https://www.nba.com/teams) and its official `cdn.nba.com/logos/nba/<id>/primary/L/logo.svg` resources. Ownership/reuse information links to [NBA Terms of Use](https://www.nba.com/termsofuse); no open license, historical-era accuracy, public/commercial redistribution permission or NBA affiliation is asserted. This remains the authorized local personal research workbench. No paid source/provider, public hosting, analytical source admission, publication, acquisition of basketball facts, persistent workspace mutation or Live demand occurred.

PF00 full-suite failures and original replica source gates remain open. PF03 does not certify PF04–PF09 or replica completion. Next dependency: **PF04 shared entity selection**.

## Reproduction commands

From the repository root, with the existing `.venv`, dashboard dependencies and retained local PostgreSQL service:

```bash
.venv/bin/python scripts/team_branding_assets.py
# Explicit setup only, if acquiring a new bundle: append --acquire.
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
  .venv/bin/pytest tests/integration/test_lookup_identity_postgres.py \
  tests/integration/test_stats_presentation_postgres.py \
  tests/unit/test_stats_engine.py::TestSQLGenerationAndCompilation -ra
.venv/bin/python scripts/verify_pf03_identity.py
.venv/bin/python scripts/verify_pf03_lookup_budget.py
.venv/bin/python scripts/verify_pf01a_stats.py --output docs/evidence/pf03-branding/real-database.json
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
```

Production preview follows the installed Next.js public-folder/standalone-output guides and PF02 procedure: build an isolated dashboard copy using shared installed dependencies, compile `NEXT_PUBLIC_COURTLOAD_API_URL=http://127.0.0.1:8154 npm run build -- --webpack`, copy public/static into standalone output, then start ports 3154/3155 using internal real proxy/mock API respectively. [Build directory](build-directory.txt) is session-specific. Fixture mock is the repository mock API copied to `/tmp` with listener 4154; no fixture service change is shipped.

```bash
node scripts/verify_pf03_browser.cjs
xvfb-run -a -s '-screen 0 2560x1440x24' node scripts/verify_pf03_zoom.cjs
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3155 \
  npm --prefix dashboard run test:browser -- workbench.spec.ts conversation.spec.ts --workers=1
```
