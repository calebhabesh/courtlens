# FO08 evidence: Live (D19)

Captured 2026-10-09 on branch `frontend-overhaul` from the local stack (dashboard `localhost:3100`,
API `localhost:8000`, published release `5bbb6035-…`). Parent:
[frontend overhaul handoff](../../frontend-overhaul-plan.md#fo08-live-d19). Live contract:
[live-ui-v1](../../design/live-ui-v1.md) (FO08 presentation section added).

## What changed

- **One Live board.** `/live`, `/live/[date]`, `/live/games/[id]` and `/playoffs` share the title
  "Live" and **Live · Finals · Playoffs** tabs (`components/live-board.tsx`, `RouteTabs` with an
  explicit selected tab because Live and Finals share `/live`). The Live menu lists the same three
  entries. Live and Finals keep the slate date between them; Live drops a date outside the lease
  window (such a date always opens finalized research).
- **No research form.** The release/season/phase/cutoff form and its "Load finalized research"
  button are gone. Live's filter bar holds the slate date (styled `DatePicker`); Finals uses the
  shared `ContextBar` (Season · Phase) with the date in its filters slot. The resolved release,
  dataset, exclusive cutoff, status and warnings are in Data details. An explicit `beforeDate` still
  applies and is never relaxed (`showThrough={false}` only hides the picker).
- **Date strip with counts.** 15 days centred on the slate (centred inside the strip on phones),
  each with weekday, compact date and a game-count badge. Counts come from a new read-only
  endpoint, `GET /api/workbench/schedule/dates` (`src/courtlens/services/schedule_dates.py`):
  scheduled games from the release's retained `workbench_schedules` rows and admitted finals (the
  same rows the historical slate reads, filtered by phase and explicit cutoff), bounded to 62 days,
  `Cache-Control: no-store`, no Live demand or provider I/O. Archive datasets report scheduled counts
  as unknown (null), and archive non-regular-season finals as unknown, never zero. Zero days are
  dimmed but clickable; unknown counts show no badge.
- **One-line states.** "Scores are provisional until finals are admitted." (contract wording behind
  Why?), "No games on Oct 8." / "No admitted finals on Apr 13." with jumps to the nearest earlier and
  later dates with games, "Awaiting a cached slate." when the feed has not observed the slate (no
  count chip: unknown is not "0 games"), and "Player boxes unknown." with its caveat behind Why?.
  Observation provenance (acquisition and fetch times, namespace, observation ID, SHA-256, HTTP date,
  last poll) moved to Data details; the status line keeps connection state, status, Stale, Shared
  feed idle and the age at last read, after the slate (glance item 3). Errors stay `role="alert"`.
- **Game cards.** Away first, logo (verified canonical IDs only; unmapped ESPN teams get initials,
  so no crosswalk is guessed), name, right-aligned tabular score (em dash when missing), status with
  the live dot and an Eastern tipoff time. Unknown tipoffs are omitted visually and stated in the
  card's accessible name. The selected game keeps actual slate, provisional/finalized label,
  identity, team boxes and source-labelled player boxes; its heading is the matchup instead of the
  source game ID (now in Data details).
- **Playoffs.** The bracket's own season select, native cutoff input, Apply/Clear buttons and the
  "Replay Filtered" badge are gone; the shared bar's Season and Through drive it (`beforeDate`, with
  `cutoff_date` still accepted from old links). Round and conference are segmented filters (the
  duplicate "Finals" conference option is gone); Bracket · Seeds · Coverage is the modes slot.
  Teams have logos. The disclaimer box is one line with Why?; the seed tab's
  `game_date < playoff_start_date` rule is replaced by plain words.
- **Playoff series detail** (`/playoffs/[seriesId]`): `PageHeader` titled with the matchup, Playoffs
  and Compare teams as actions, the shared bar under it (series ID in Data details), a hero with
  `TeamIdentity` logos, seeds and records facing a centre status, game cards with logos and
  "Apr 19, 2026" dates, one-line disclaimer.
- **Schedule** (`/schedule`): "Schedule" title, a filter bar with a "Week of" picker that applies
  immediately (no "Load week"), a game count, data classification and light-slate rule in Data
  details, logos for known teams, a 7-column grid that no longer overflows, and a one-line empty
  state.
- **Fixed along the way.** Decided playoff series showed "SCHEDULED": the API reports `finished`,
  the badge only knew `final` (regression test in `lib/playoffs.test.ts`). The filter bar's modes
  slot clipped long labels on desktop (it now never shrinks; scope and filters wrap first).
  `DataDetails` keyed rows by label, which collides on repeated labels. An unavailable phase showed
  its raw value. Loading states for Live and Playoffs are the Board `TemplateSkeleton`.
- **Ratchets.** `PENDING_NATIVE_DATE` 11 → 8 and `PENDING_RAW_TITLE` 35 → 31 (all FO08 files removed).
  New screenshot baselines: Live Finals on a fixed date and the Playoffs bracket, desktop and phone.

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` | 50 files, 344 tests pass |
| `ruff check`, `ruff format --check`, `mypy src/courtlens` | clean |
| `pytest tests/unit` | 1,324 pass, 10 skipped (5 new in `test_schedule_dates.py`: per-date counts, phase and cutoff, archive unknowns, range bound, HTTP endpoint) |
| Playwright, all 274 tests, serial, production build of an isolated copy | **259 pass, 15 skipped, 0 fail** (an earlier run caught one regression: an invalid date lost its status line when the status moved below the slate; fixed and re-run) |
| Screenshot baselines | 14 (4 new: Live Finals and Playoffs × 1440/390), 28/28 on a repeat run |

`e2e/live.spec.ts` keeps every B32 behaviour test (zero vs missing values and nonappearance, lease
release on pause/hidden/navigation, offline and capacity, historical pinning with no demand, mobile
table regions, stale-response protection, disabled/empty/invalid states). It now finds the release
in Data details, changes the date through the strip, checks that an unobserved slate shows no count,
and adds a board test (one title, tabs, 15-day strip with dimmed zero days, no Load button or native
date input, nearest-date jump, Finals tab, no sideways scroll at 390).

## Screenshots and measurements (real data)

`*-1440.png` and `*-390.png` for Live (today, feed not configured locally), Finals (Apr 12, 2026, 15
admitted finals), a selected final, Playoffs, a series and Schedule. `measurements.json` holds the
per-page values below, measured on visible text only (closed Why? bodies and the drawer excluded).

| Page | h1 | First result top (1440 / 390) | Controls | Load / native date / UUID / `game_date <` / ISO dates / notice boxes | Sideways scroll |
| --- | --- | --- | --- | --- | --- |
| Live | Live | 374 / 400 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Finals | Live | 374 / 370 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Selected final | Live | 374 / 370 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Playoffs | Live | 340 / 336 | 40px (segments 36px inside 40px groups, as on Showcase) | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Series | Detroit Pistons vs Orlando Magic | 235 / 267 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Schedule | Schedule | 243 / 239 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |

No console errors on any page at either width.

## Glance test

| Item | Result |
| --- | --- |
| 1 Header | **pass**: "Live" matches the Live menu; tabs match its three items; series uses its matchup (a detail page has no nav label); one subtitle line; actions on the title row |
| 2 Filters | **pass**: one bar, no Load button, 40px controls, selected states visible. Exception recorded in Design Language v1.1: Live's scope is the slate date |
| 3 First screen | **pass**: main result within 400px at 1440×900 on every page; no paragraph or notice box before it |
| 4 Alignment | **pass**: shared left edges; scores and counts right-aligned with tabular digits |
| 5 Identity | **pass**: logos on game cards (verified IDs), bracket, seeds, series hero and game cards, schedule (known teams) |
| 6 Missing data | **pass**: one line plus Why? everywhere; no UUIDs, hashes or code rules visible |
| 7 Icons | **pass**: wrapper Lucide only |
| 8 States | **pass**: Board skeletons for Live and Playoffs; one-line empty/error states with a useful action |
| 9 Phone | **pass**: no sideways scroll; filters collapse to "Filters"; modes stay visible; 40px targets |
| 10 Dates | **pass**: "Apr 12, 2026" and compact "Apr 12" in the strip; no ISO dates in visible text |

## Findings for later blocks

- `/schedule` reads the legacy fantasy `fct_games` table (14 fixture games, Jan–Feb 2025, fake
  teams). Its structure is rebuilt, but it shows real games only if that table is refreshed or the
  page moves to `workbench_schedules` (a data-source change, outside FO blocks). The owner may drop
  Schedule (FO07 note).
- The Live feed is not configured on this machine, so the Live tab shows "Awaiting a cached slate."
  with real data; populated Live cards are covered by the fixture tests.
- Player box tables keep raw source keys (`MINUTES_SECONDS`, …) because live-ui-v1 requires source
  statistic keys; friendlier labels need a contract change.
- Server components that pass JSX into a client component's prop need an explicit `key` when the
  client renders it beside other children (React 19 dev warning seen on the series page).
- `pkill -f '<pattern>'` from a tool shell matches the shell's own command line; stop scratch
  servers by PID and working directory instead.
