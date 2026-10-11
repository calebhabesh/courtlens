# CourtLens presentation clarity progress

Parent: [presentation clarity handoff](presentation-clarity-plan.md). Design contract:
[design-language-v1](design/design-language-v1.md) (v1.2 after PC03). Plans are not runtime
evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`,
`verification_blocked`. A UI block is `verified` only with measured checks **and** a passing
extended glance test (see the handoff) on desktop and phone screenshots taken **with no URL
parameters**. Blocks before each owner gate also need recorded owner approval.

## Planning baseline: 2026-10-11

- The owner confirmed C1–C24 and the source plan through a grilling interview.
- Source reachability was checked from the development machine on 2026-10-11 (see the handoff's
  source plan).

| Block | State |
| --- | --- |
| PC00 Roster Shapes crash fix | implemented_unverified |
| PC01 Source policy v2 | verified |
| PC02 Page audit (G1) | planned |
| PC03 Design Language v1.2, D21, chart kit | planned |
| PC04 Compare and first-load defaults (G2) | planned |
| PC05 Data: rosters, positions, injuries | planned |
| PC06 Data: finance | planned |
| PC07 Data: tracking, play types, matchups, combine, on/off | planned |
| PC08 Contracts and Free Agency views (G3) | planned |
| PC09 Value metric and archetypes | planned |
| PC10 Roster Shapes (G4) | planned |
| PC11 Populate or remove gated pages | planned |
| PC12 Remaining audit batches | planned |
| PC13 Hosting, schedules, Ask demo mode | planned |

## 2026-10-11 — PC00 Roster Shapes crash fix

- Cause: `get_team_detail()` keeps players whose rows for the team are all reported
  non-appearances (`games_played=0`, `total_minutes=null`), while `lib/types.ts` declared
  `total_minutes: number`. The cohort type also named `points`/`points_per_game`, which the API never
  sent (it sends `pts_per_game`/`reb_per_game`/`ast_per_game`).
- Decision: keep those players (they are real roster members, e.g. Damian Lillard POR, Terry Rozier
  MIA) and render unknown minutes as `—`, never 0. Types corrected; the team page's always-empty
  "Stint Points" column now shows PPG/RPG/APG; Team Compare reads `pts_per_game`.
- Real data (local API, 2025-26): 11 regular-season teams carry a null-minutes player (ATL, NOP, DEN,
  GSW, HOU, MIA, IND, POR, UTA, MEM, CHA); playoffs have none. All 11 load in Chromium at 1440×900
  with 0 page errors and the player shown as "— min · 0 GP".
- Checks: dashboard lint 0/0, typecheck clean, Vitest 358 passed (new observed-unknown case),
  Playwright `roster-shapes.spec.ts` 5/5 (new non-appearance case) run against the owner's dev server
  with `PLAYWRIGHT_EXTERNAL_SERVER=true`.
- Not yet run: the production-build visual baselines (port 3100 was held by the owner's
  `next dev`). The team detail baseline will change because of the column fix.

## 2026-10-11 — PC01 Source policy v2

- [Source policy v2](design/nba-direct-admission-v2.md) admits the handoff's source plan for the
  non-commercial demo, with per-host minimum intervals (BRef 3 s, Spotrac 5 s, pbpstats 5 s,
  GitHub mirrors 1 s), robots.txt obedience, scheduled fetches only, retained raw bytes and
  derived-views-only serving. Direct `stats.nba.com`, Databallr data, paid APIs and RealGM stay out.
- v1 is unchanged: IM08 receipts bind its SHA-256 (`verify_receipt` checks `policy_sha256`), so
  IM08 and `scripts/verify_im08_sources.py` stay a frozen diagnostic.
- Registry `src/courtlens/domain/source_policy.py`; a unit test checks that every registered host
  appears in the doc table. The workbench catalog now declares `player_index`, `injuries`,
  `play_types`, `tracking`, `defensive_tracking`, `hustle` and `combine` as `not_yet_observed`,
  with "Source admitted (…); not yet ingested in this release." Measured entries always take
  precedence (`setdefault`).
- Left for measured coverage: `shots` (657,432 research shot members exist), `on_off`, `matchups`,
  contracts and free agency (finance releases exist). PC02 audits them; PC05–PC07 declare them.
  Data-gap `source_blocked` results (for example zero reconciled stints) are data status, not
  policy, and stay until PC07/PC11 populate them.
- AGENTS.md already carried the Databallr sentence; it now links v2.
- Checks: Ruff and format clean, strict mypy clean, full Python suite 1,854 passed / 1 skipped
  (disposable PostgreSQL, including the catalog integration assertion). Dashboard lint 0/0,
  typecheck clean, Vitest 359 passed (new route-availability case). Real-database catalog:
  0 `source_blocked` capabilities.
