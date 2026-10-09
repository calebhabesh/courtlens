# FO09 evidence: Players

Captured 2026-10-09 on branch `frontend-overhaul` from the local stack (dashboard `localhost:3100`,
API `localhost:8000`, published release `5bbb6035-…`). Parent:
[frontend overhaul handoff](../../frontend-overhaul-plan.md#fo09-players).

## What changed

- **Player profile** (`/players/[id]`, Profile template). `PageHeader` with the player's name, one
  context line (team · season and phase · through date · last game) and right-aligned actions:
  Favorite and Compare as icon buttons with tooltips, an **Explore** menu (recent games, trends,
  distributions, similar players, shot profile, head to head, wingspan) and one **Export** menu
  (PNG/SVG) instead of 11 buttons. The shared filter bar sits under it. The hero has the headshot,
  team identity and team-color accent, and six `StatTile`s (PPG, RPG, APG, MPG, TS%, eFG%) with the
  Stats cohort percentile and rank (same scope resolution and cohort as Stats and Showcase via
  `resolveStatsQuery` + `useCohortRanks`; no new formula). Tabs: **Overview** (impact, production
  splits as one table, stints, career, trends, forecast), **Game Log**, **Measurements**; the tab is
  kept in `?tab=`. The game log's exposure switch is a `SegmentedControl` (it read "Per GamePer 36
  Min" before). Notices (career disclosure, measurement source, forecast condition) are one line
  with Why?. Dates read "Apr 12, 2026". The export card's footer is the shared context line, not
  `game_date < …`. The legacy fixture profile and error views use `PageHeader` too, keeping
  "Change date", "Historical replay" and "Return to player search".
- **Player impact card.** Values lead; the model's fit windows, coverage counts and cutoffs are
  behind Why? (they stay in the DOM for the unit tests). The RAPM page's disclosure is unchanged
  (FO12).
- **Recent Games** (`/last-games`). Title "Recent Games" (the nav label) with the player as the
  subtitle; a player switcher, Favorite/Compare, Profile and one Export menu (CSV, PNG, SVG, copy
  link) on the title row. The window (Last 5/10/20/All) is a filter; exposure (Per Game/Per 36) and
  layout (Table/Cards) are modes, so they stay visible on phones. A hero with `PlayerIdentity` and
  six tiles replaces the four stat cards. The trajectory's average label no longer clips. One-line
  temporal note with Why?.
- **Ranking Boards** and **Tier Lists**: titles match the nav, plain subtitles (the "F16"/"F27"
  block codes are gone), shared buttons, one-line notes with the contract wording behind Why?.
- **Player Directory** (`/players`): titled "Player Directory" to match the nav (the Stats
  workspace body itself is aligned in FO13).
- **Similar Players.** The bespoke filter strip, featured-player pills and method paragraph are
  replaced by the shared `FilterBar` (Season, Window | target player, peers, minimum games and
  minutes | cohort count | Data details). The target picker is a single 40px field in the bar, so
  it stays reachable when the current target has no result. The evidence hash and disclosures moved
  to Data details; the distance formula is behind Why?. The target and every peer show a headshot
  ("TOT" players get no guessed team badge). "Open in Stats" is a readable secondary button that
  keeps the scope. Raw `$\ge 10$` text became plain words.
- **Ratchet.** `PENDING_RAW_TITLE` 31 → 24 (every FO09 file removed).

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` | 50 files, 344 tests pass |
| Playwright, all 282 tests, serial, production build of an isolated copy | **266 pass, 15 skipped, 1 fail** on the final run: `roster-shapes.spec.ts:112` measured a 40px control at 39.99998px (the same sub-pixel settling flake fixed for Showcase in FO07). The same tolerance was applied to its three 40px checks and the spec then passed 16/16. The previous full run (before the shared portrait/logo fallback fix) was 263 pass, 15 skipped, 0 fail |
| Screenshot baselines | 18 (4 new: player profile and Recent Games × 1440/390), 36/36 on a repeat run |

New `e2e/players-fo09.spec.ts`: one `h1`, six hero tiles, tabs kept in the URL across reload, Export
and Explore menus instead of loose buttons, no `game_date <` rule visible, no sideways scroll at
390; Recent Games' three controls are separate radio groups at least 38px tall and change the hero;
Ranking Boards and Tier Lists titles and no notice boxes; Similar Players' filter bar at most 60px
tall with no hash in the visible flow. `workbench.spec.ts` now opens the Game Log tab and expects
"Apr 12, 2026"; `stats-readability-search.spec.ts` exports through the Export menu.

## Screenshots and measurements (real data)

`*-1440.png` and `*-390.png` for the directory, a profile (Overview and Game Log), Recent Games,
Ranking Boards, Tier Lists and Similar Players (Bam Adebayo, 2025-26). `measurements.json` holds the
per-page values, measured on visible text only.

| Page | h1 | First result top (1440 / 390) | Controls | Load / native date / UUID / `game_date <` / ISO dates / notice boxes | Sideways scroll |
| --- | --- | --- | --- | --- | --- |
| Player Directory | Player Directory | 299 / 529 (Stats workspace body, FO13) | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Profile, Overview | Bam Adebayo | 227 / 253 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Profile, Game Log | Bam Adebayo | 227 / 253 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Recent Games | Recent Games | 227 / 353 | 40px (segments 36px inside 40px groups) | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Ranking Boards | Ranking Boards | 198 / 246 | — (no filter bar: personal boards) | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Tier Lists | Tier Lists | 198 / 224 | — (no filter bar: personal lists) | 0 / 0 / 0 / 0 / 0 / 0 | no |
| Similar Players | Similar Players | 268 / 264 | 40px | 0 / 0 / 0 / 0 / 0 / 0 | no |

No console errors on any page at either width.

## Glance test

| Item | Result |
| --- | --- |
| 1 Header | **pass**: titles match the nav (Player Directory, Recent Games, Ranking Boards, Tier Lists, Similar Players); the profile uses the player's name; one subtitle line; actions on the title row |
| 2 Filters | **pass**: one shared bar; no Load button; 40px controls; Recent Games' and Similar Players' controls separated (before: run-together labels and a 120px picker) |
| 3 First screen | **pass** at 1440×900 on every page (directory 299, profile 227) |
| 4 Alignment | **pass**: numbers right-aligned with tabular digits in splits, career and game logs |
| 5 Identity | **pass**: profile and Recent Games hero headshot with team logo and team-color accent; Similar Players target and peers have headshots |
| 6 Missing data | **pass**: impact methodology, career, measurement and forecast caveats are one line plus Why?; the similarity hash is in Data details; no visible UUIDs, hashes or rules |
| 7 Icons | **pass**: wrapper Lucide only |
| 8 States | **pass**: one-line error/empty states (similarity error, missing measurements, unknown team); broken headshots fall back to initials |
| 9 Phone | **pass**: no sideways scroll; filters collapse; modes stay visible; 40px targets |
| 10 Dates | **pass**: "Apr 12, 2026" in game logs, trends, subtitles and the cohort description; no ISO dates visible |

## Findings for later blocks

- `/tmp` on this machine is a RAM-backed tmpfs. With swap full, large isolated copies left in
  `/tmp` by earlier sessions (`courtlens-ag07-browser-*`, `courtload-b36b-production-*`,
  `courtlens-ag05-workspace-*`, `courtload-ar0*`, about 9 GB) made Chromium fail to fork
  ("Zygote could not fork"), so every Playwright test timed out while setting up the page. Trimming
  this session's copy fixed it. Owner: those directories can probably be deleted.
- The mock API keeps assistant threads in memory; run `threaded-assistant.spec.ts` against a fresh
  mock, or a second run fails on inherited state.
- A picker that only exists inside a result card disappears when the result fails; keep entity
  pickers in the filter bar or header.
- The profile's Overview still renders the trend charts and career table built before the overhaul;
  their internals (mono labels, chart sizing) can be aligned in FO14.
- Shared fixes: a headshot whose image failed before hydration now falls back to initials (it showed
  its alt text), and an unknown team code no longer wraps inside the logo box. Both affect every page
  with identities.
