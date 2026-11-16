# Site links progress

Measured evidence for the [site links plan](site-links-plan.md). Newest last.

## 2026-11-14 — Plan written; survey of the current links

No code changed. Counts are from `grep` over `dashboard/app`, `dashboard/components` and
`dashboard/lib`, tests excluded, on `feat/site-improvements`.

- 54 files hold a hand-built `/players/…` or `/teams/…` href: 44 with templated player links, 9
  with templated team links. There is no shared builder or link component.
- Player link shapes: 31 `?season=`, 29 bare, 8 with a spread scope, 2 `&phase=playoffs`, 2
  `&tab=tracking`, 2 carrying `beforeDate` (Team Compare), 1 carrying `date` and `snapshotId`
  (`player-search.tsx`).
- Team links use the tricode in `standings-view.tsx` and `team-division-standings.tsx` and
  `team_id` in `teams-six-factor-view.tsx`, `playoffs-bracket-view.tsx`, `playoffs-series-view.tsx`
  and `team-profile.tsx`.
- Games: Live pages take ESPN's id (`live-workspace.tsx`, `team-schedule.tsx`,
  `win-probability-v4.tsx`); the Team Game Log goes through `/live/open` (`team-profile.tsx`).
- `prefetch={false}` appears 3 times (`team-schedule.tsx`, `team-profile.tsx` twice); every other
  link uses Next's default.
- Live: `GameCard` and the rail card are each one `<Link>`; no team name is a link on the board or
  the game page. Players are linked in the leaders, box score and injuries when `canonical_id` is
  set.
- 54 files render `TeamLogo` or `TeamCode` with no team link in the file, and 16 render a player
  portrait with no player link. Both lists include pickers and other controls that stay plain;
  SL04 gives each a verdict.
- The player page consults played seasons only when the link has no season
  (`app/players/[id]/page.tsx`).
- Ask: result rows carry `player_id` (9 places in `agent/tools.py`) and `team_id` (1); result
  tables and prose render names as plain text.

## 2026-11-14 — Decisions confirmed

The owner confirmed D1–D4 as recommended ("go with your recommendation/suggestion, and record it
confirmed and decided"): the two link styles with no blue, Live cards with a stretched game link
and separate team links, Ask linking in scope as the last block, and the Related row with no new
endpoints or hover previews. D5 (what a link carries) and D6 (franchise id plus season) are the
plan's technical defaults and were not put to the owner. SL01 is next.

## 2026-11-14 — SL01 built: builders, link components, styles, lint rule

Files: `dashboard/lib/entity-links.ts`, `dashboard/components/entity-link.tsx`,
`dashboard/components/entity-link.css` (imported after `team-logo.css` in `globals.css`, components
layer), `eslint.config.mjs`, Design Language "Links" section (under Pages, after Identity), tests
`lib/entity-links.test.ts`, `components/entity-link.test.tsx`, `eslint/entity-links.test.ts`. No
call site changed; pages look the same.

- **Builders.** `playerHref`, `teamHref`, `gameHref`, `seriesHref` return null without an id.
  Scope follows D5: `season`, `phase` only when `playoffs`, then `beforeDate`, `releaseId`, `tab`
  when given. `teamLinkId` maps a franchise id, tricode or era code to the franchise id (with a
  season, the era covering it; without, `franchiseOf`); a folded era keeps its code; an unknown id
  passes through for the team page. `gameHref` takes `{ espnId, date }` → `/live/games/{id}?date=`
  or `{ gameId, date, teams }` → `/live/open?date=&game=&teams=id:TRI,id:TRI` (the format
  `live/open/page.tsx` parses). `seriesHref` carries no season (the slug names it). `ENTITY_ROUTES`
  exports the prefixes for code that matches pathnames (for SL03's `nav-trail`/`nav-model`).
- **Components.** `PlayerLink`, `TeamLink`, `GameLink`, `SeriesLink` over one `EntityAnchor`:
  `next/link` with `prefetch={false}`, or a `<span>` keeping the caller's class when the href is
  null or a self link. Variants `entity` (default), `prose`, `stretched` (for SL04's Live card;
  the container takes `.has-stretched-link`, entity links inside sit above the `::after`).
- **Prefetch, checked against the installed Next.** `next@16.4.2`,
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`: "`false`:
  Prefetching will never happen both on entering the viewport and on hover." Partial Prefetching
  is not enabled. The production-build measurement is SL04's.
- **Lint.** Two `no-restricted-syntax` selectors (a `Literal`, and the first quasi of a template)
  matching `^/(players/|teams/|live/games/|live/open|playoffs/)`. Off for `lib/entity-links.ts`
  and tests (the tests' rule set is already only the inline-style rule). The linter found **57
  files, 106 literals**, listed as `PENDING_ENTITY_HREF`. The survey's 54 plus three files that
  hold route strings rather than links: `lib/nav-trail.ts`, `lib/nav-model.ts`,
  `app/live/open/page.tsx`.

**Done when, measured:**

| Item | Result |
| --- | --- |
| Unit tests for every builder, incl. Thunder 2005-06 → Sonics, a folded team, null id → span, self link → span | `vitest run lib/entity-links.test.ts components/entity-link.test.tsx eslint/entity-links.test.ts`: 3 files, 22 tests passed. Thunder: `teamHref("SEA"/"OKC"/franchise, {season:"2005-06"})` → `/teams/1610612760?season=2005-06`, and the component renders that href. Folded: `CHS` 1947-48 → `/teams/CHS?season=1947-48`. Null id → `<span class="cell-name">`, no link role. Self: on `/players/2544`, `PlayerLink id="2544"` → span. |
| Lint fixture goes red on a raw `/players/` literal | `eslint/entity-links.test.ts` lints under the real config: a `` `/players/${id}` `` template and `href="/players/2544"` each give one error, as do `/teams/`, `/live/games/`, `/live/open`, `/playoffs/`; `/api/workbench/players/…`, `"/players"`, `` `${base}/players/` `` and the same template in `lib/entity-links.ts` give none. |
| Lint, typecheck, Vitest pass | `npm --prefix dashboard run lint` exit 0 (ESLint + Stylelint, no output); `run typecheck` exit 0; `npm --prefix dashboard test` 140 files, 993 tests passed. |

**Where the code differs from the plan, for SL03:**

- **Self links compare the path only.** A link to the same player or team in another season also
  renders plain. Reading the query would need `useSearchParams` in a component used everywhere,
  which needs a Suspense boundary on statically rendered routes. No hub page links to its own
  subject in another season today (grep of the player and team page components), so nothing
  changes.
- **Some pending literals are not links.** `team-schedule.tsx` reads the API path
  `` `/teams/${teamId}/schedule` `` through `useLiveRead`, the player and team pages pass
  `route={`/players/${id}`}` to `AssistantPageSelection` and `basePath` to `StatsWorkspace`, and
  `nav-trail`/`nav-model` match pathnames. SL03 moves the route strings onto `ENTITY_ROUTES` and
  builds the API path without a leading entity prefix, so the pending list can empty without
  exempting files.

## 2026-11-14 — SL02 built: entity pages accept any link

Files: `dashboard/lib/link-scope.ts` (+ test), `components/scope-fallback-note.{tsx,css}`,
`app/players/[id]/page.tsx`, `app/players/[id]/not-found.tsx`, `app/teams/[id]/page.tsx`,
`app/teams/[id]/not-found.tsx`, `components/workbench-player-profile.tsx` (a `notice` slot under the
filter bar), `lib/scope-url.ts` (clears `asked`), `e2e/site-links-crawl.spec.ts`. Evidence:
`docs/evidence/site-links/crawl-sl02-{hrefs,counts}.json`.

- **Rule.** `closestSeason`: the season asked for, else the latest at or before it, else the
  earliest. Players: their career seasons for the phase; playoffs they missed open that season's
  regular season, then the season rule. Teams: the release's seasons less `franchiseActive` gaps,
  or a folded team's own era; playoffs missed (absent from the playoff six-factor table the page
  already loads) open the regular season. No seasons at all (a bio-only player) changes nothing.
- **URL and note.** The page redirects to the shown scope with `asked=<season>[:playoffs]`,
  dropping the link's `beforeDate` so the shown season's default cutoff applies; other parameters
  stay. `askedNote` renders one `role="note"` line ("Kobe Bryant has no 2026-27 games; showing the
  2015-16 regular season."). Any filter-bar change (`applyScopeChange`) deletes `asked`, so the note
  never outlives its scope.
- **No added round trip on the player page.** The check runs on the career read the page already
  starts, beside the profile reads; the redirect is issued after them. Only a playoffs link for
  playoffs the player missed makes one extra career read (regular season).
- **Unknown ids.** Player: the workbench and legacy profile reads both 404 → `notFound()`.
  Team: the team detail read 404s → `notFound()`. Each route has its own not-found page with a way
  back ("Return to Players", "Return to All Teams").
- **Status codes.** The root `app/loading.tsx` streams every page, so the redirect arrives as a
  client redirect (`NEXT_REDIRECT;replace;…;307` plus a meta refresh) and not-found pages render
  with HTTP 200. Browsers land correctly (measured below); curl sees 200 without `Location`.

**Done when, measured** (`SITE_LINKS_REAL=1 PLAYWRIGHT_EXTERNAL_SERVER=1 npx playwright test
e2e/site-links-crawl.spec.ts` against the owner's :3100/:8000, real data; 9 passed, twice, 1.6 and
1.5 min):

| Case | Link | Lands on | Note |
| --- | --- | --- | --- |
| 2026-27 link, retired player | `/players/977?season=2026-27` | `season=2015-16&asked=2026-27` | "Kobe Bryant has no 2026-27 games; showing the 2015-16 regular season." |
| Playoffs he missed | `/players/2544?season=2021-22&phase=playoffs` | `season=2021-22` regular, `asked=2021-22:playoffs` | "LeBron James has no 2021-22 playoffs games; showing the 2021-22 regular season." |
| Pre-2002-03 New Orleans | `/teams/1610612740?season=1999-00` | `season=2002-03&asked=1999-00` | "… has no 1999-00 games; showing the 2002-03 regular season." |
| 2005-06 Thunder | `/teams/1610612760?season=2005-06` | unchanged; h1 "Seattle SuperSonics" | none |
| Folded team | `/teams/CHS?season=1947-48` | unchanged | none |
| Folded team, after it folded | `/teams/CHS?season=2024-25` | `season=1949-50&asked=2024-25` | "Chicago Stags has no 2024-25 games; showing the 1949-50 regular season." |
| Unknown ids | `/players/999999999`, `/teams/XYZ` | "Player Not Found" / "Team Not Found" | links to `/players`, `/teams` |

The team page adds its canonical scope parameters to the URL after landing, so the spec checks
path, `season`, `asked` and `phase` rather than the whole string.

**Crawl baseline.** Seeds: Live, Stats, a player, a team, Standings, Playoffs, Draft, Contracts,
then the first game and first series they link. Every `a[href]` grouped by route pattern, up to
five opened per pattern; a failure is a 4xx, a not-found title, the player error page, "Team
details are unavailable", Next's error page or no `h1`. Final run: **17 patterns, 476 distinct
hrefs, 47 opened, 0 failures** (first run: 470 hrefs; Live's links change with the day). Pattern
counts: `/players/:id` 366, `/teams/:id` 43, `/playoffs/:series` 15, `/teams` 12, `/live/games/:id`
11, `/` 10, `/live/:date` 7, `/stats` 2, `/team-compare` 2, and 1 each for `/players`,
`/standings`, `/stat-line-shift`, `/stats/glossary`, `/methodology/learning`, `/whats-new`,
`/wingspan`, `/wowy`. The full href set is in `crawl-sl02-hrefs.json` for SL03's comparison. The
header menus render their items only when opened, so menu routes (`/draft`, `/contracts/:team`,
`/roster-shapes/:team`) are not reached from these seeds; SL04 and SL05 add links that will.

**Other checks.** Vitest `lib/link-scope.test.ts` 11 tests (rule, rewrite URL, note, `asked`
cleared on scope change). `npm --prefix dashboard run lint` exit 0; `typecheck` exit 0;
`npm --prefix dashboard test` 141 files, 1004 tests passed.

**Touched mock specs** (production build in a sandbox under `~/.cache/courtlens-tmp`, fixture API
on 4180, dashboard on 3180; the 14 specs that open player or team pages: advanced-research, f04,
dl07, fo14, player-career, player-profile, player-reference, pc11, players-fo09,
stats-readability-search, workbench, teams, visual-baselines, stats-team-move-dates). The first
run found 12 failures, 8 of them mine: the fixtures name Toronto `100`, which the branding
catalog does not list, and my first unknown-id check read the catalog. Fixed by letting the API's
404 decide. After the fix every functional spec passes. Three failures remain, none from SL02:

- `f04-accounts` resets accounts on the fixed port 4100: a sandbox artefact. With the sandbox copy
  pointed at 4180 it passes 8/8.
- `visual-baselines` phone search modal fails on a sandbox of `HEAD` too (6,276 px): it was
  already failing before this work.
- `visual-baselines` player profile, desktop and phone (23,282 px and 5,959 px): passes on `HEAD`.
  `HEAD` plus only the owner's uncommitted player-page files (`player-bio-header.css`,
  `player-reference-sections.{css,tsx}`, `lib/types.ts`) gives the same pixel counts, so the
  owner's in-progress work causes it.

Sandboxes and their servers were removed afterwards.

**Where the code differs from the plan:**

- **The plan does not say how the page "says once" what was asked.** I added an `asked` URL
  parameter that the redirect writes and any scope change clears. Without it the note could not
  survive the redirect.
- **Unknown team ids are decided by the API, not by the branding catalog**, because a release can
  hold team ids the catalog does not list (the fixtures do).

## 2026-11-14 — SL03 built: the existing links move onto the builders

106 literals in 57 files now come from `lib/entity-links.ts`; `PENDING_ENTITY_HREF` in
`eslint.config.mjs` is `[]` and no file is exempt (only `lib/entity-links.ts` itself and tests,
whose rule set never included the entity rule).

- **Kept the element and classes at every call site.** A `<Link>` keeps its class and gains
  `prefetch={false}`; the six raw `<a>` names (Lineup Model, Projected Impact, Shot Quality, Signal
  vs Noise, zTS, zTS Defense) became `next/link` with the same class. `PlayerIdentity`,
  `TeamIdentity` and `GridPlayer` pass `prefetch={false}`; `ButtonLink` accepts `prefetch` and the
  Stats drawer, Player Showcase and Case Studies buttons pass it. The D1 hover look is SL04's, at
  its gate: nothing in SL03 changes how a page looks.
- **Builders grew two small pieces.** `scope.params` appends navigation markers that are not
  filters (Stats' `from=stats` return marker, Win Probability's `from=win-probability`, the legacy
  `date`/`snapshotId` replay search). `scopeFromQuery` takes a page's `season` and `phase` from
  its scope string, so the `?${scope}` sites apply D5 the same way.
- **Explore menu** on the player page: `MenuItem` takes `href` and renders a real
  `next/link` with `role="menuitem"` (no prefetch); a disabled item or one without `href` stays a
  button. Keyboard movement and close-on-pick already select `[role="menuitem"]`.
- **Route strings, not links.** `nav-model`/`nav-trail` match on `ENTITY_ROUTES`;
  `AssistantPageSelection` gets `playerHref(id)`/`teamHref(id)`; the team page's `basePath` is its
  `teamHref(id)`; `team-schedule` reads the Live API through `LIVE_TEAMS_PATH` (a data path);
  `live/open` redirects through `gameHref`; `roster-shapes/[team]?view=depth` redirects through
  `teamHref`.
- **Unused after the move** and removed: four `buildPreservedContextUrl` imports, the
  `searchParams` prop of Player Showcase's dialog, `RapmRatingsTable`'s `scope` prop.

**Done when, measured:**

| Item | Result |
| --- | --- |
| Pending list empty, lint passes with no file exempt | `PENDING_ENTITY_HREF = []`; `npm --prefix dashboard run lint` exit 0 (ESLint + Stylelint); `typecheck` exit 0; Vitest 142 files, 1,010 tests. |
| Crawl href set differs from the SL02 baseline only by normalised team ids | Crawl on real data: 9 passed; 17 patterns, 463 hrefs, 47 opened, 0 failures (`crawl-sl03-{hrefs,counts}.json`). Of the baseline's 476: **346 unchanged, 35 changed only by the team id** (tricode → franchise id, Standings and Team division standings), **95 changed only by D5 scope** (`phase=regular_season`, `beforeDate`, `window`, `releaseId` dropped; by shape: 70 player links carrying the full Stats scope plus `from=stats`, 20 player links and 6 team links carrying season, phase, cutoff and release), **0 missing**, and **no new href that D5/D6 does not explain**. Normaliser: `team id` → `teamLinkId`, query → `season`, `phase` only if playoffs, plus `tab`/`from`/`date`/`snapshotId`. |
| Touched specs pass three times | 75 specs that open a touched route, `--repeat-each=3`, production build in a sandbox (fixture API 4180, dashboard 3180): 1,936 passed, 25 failed, 6 skipped, 7 did not run (8.0 min). Every failure is accounted for below; after the fixes, the affected specs rerun ×3: DL08, Standings, Teams 81 passed. |
| AGENTS.md standing rule | Added to the site-links paragraph: build every player, team, game and series href with `dashboard/lib/entity-links.ts` (or the link components), `prefetch={false}`; ESLint rejects literal entity paths elsewhere. |

**Where the code differs from the plan:**

- **The plan expected only team-id differences in the crawl; D5 adds scope differences.** The
  plan's own SL03 text says scope follows D5, so the 95 scope changes are that rule, not drift.
  The criterion as written cannot hold together with D5.
- **D5 exception, proposed: the bracket → series link keeps the bracket's `beforeDate` and
  `releaseId`.** The series page reads exactly those two, and the bracket can be viewed at an
  earlier cutoff; dropping them would open a series at a different cutoff from the bracket it was
  clicked on. That is today's behaviour, now limited to those two parameters (it used to carry
  every context parameter). Team Compare also keeps them, as D5 states.
- **The player page's own season links (career table) are scope changes, not entity links,** and
  keep the page's full scope as before; they are built from the current path, not a literal.

**Touched specs ×3, failures accounted for:**

- **Mine, fixed.** `standings.spec.ts` expected `/teams/MIL?season=2018-19` and `teams.spec.ts`
  expected the full scope on the six-factor table's team link; both now assert the D6/D5 shapes
  (`/teams/1610612749?season=2018-19`, `/teams/100?season=2025-26`). `dl08-evidence` (CLS on
  `/players/2544` and `/teams/1610612747`, ids the fixtures lack) failed `waitForStreamedPage`:
  SL02's `notFound()` inside these streamed routes renders the not-found page but leaves a stale
  hidden staging copy (`body > div[hidden][id^="S:"]`, the header) in a production build. The pages
  now return their not-found component directly: same page, no staged copy. Rerun ×3: pass.
- **Not mine.** `player-career.spec.ts:83` expects "2018 · R1 #9 · TOR" and the page now says
  "Toronto Raptors": the owner's uncommitted `player-bio-header.tsx` change. `visual-baselines`
  player profile (owner's work) and phone search modal (fails on `HEAD`), as in SL02.
  `f04-accounts.spec.ts:32` fails in 1 or 2 of 3 serial runs at the Escape that closes the sign-in
  dialog; on a `HEAD` build it fails 1 of 3 too: an existing timing flake.

Sandboxes and their servers were removed afterwards.

## 2026-11-14 — SL04 audit: every logo, code and portrait without a link

Regenerated after SL03 with the survey's test (a file renders `TeamLogo`/`TeamLogoStack`/`TeamCode` with no team link in the file, or a portrait with no player link): **49 team files and 17 portrait files** (the survey's 54 and 16 were counted before SL03 moved links into these files). Live first, as the owner asked.

One rule beyond the plan's list, for the owner at the gate: **a logo-only badge beside a name that already links stays plain** (one target per mention; a badge is not a name). Team codes and names shown as text link.

| File | Team logo or code |
| --- | --- |
| `components/live-board.tsx` | Linked: each team's logo and code on a board card (D2, block link, 44px). Plain: the compact rail cards (single target, D2) and the call row (inside the stretched game link). |
| `components/live-game-extras.tsx` | Linked: GameFlow legend, swing list team, season series teams. |
| `components/live-game.tsx` | Linked: banner name and code, box-score titles, injury report headings. Plain: leader fallback logo, the aria-hidden team-stats header. |
| `components/live-prediction.tsx` | Linked: team rows. Plain: the big logos and the axis labels (chart). |
| `app/compare/page.tsx` | Linked: "Next team game" team and opponent (season from the game date). |
| `app/team-compare/team-comparison.tsx` | Linked: history box headers and the meeting tags. Plain: the 144px subject art (a compare slot). |
| `components/account/favorite-players.tsx` | Plain: the team sits inside the row's player link (anchors never nest). |
| `components/compare-grid.tsx` | Plain: compare slot. |
| `components/compare-player-slot.tsx` | Plain: compare slot. |
| `components/contracts-view.tsx` | Plain: the page's own team in its headings (subject in its own page header). |
| `components/defensive-shot-quality-view.tsx` | Linked: card team code. |
| `components/finance-contract-drawer.tsx` | Linked: the contract's team in the header and the association terms. |
| `components/four-factors-inputs.tsx` | Linked: team cell of the calculator table. |
| `components/free-agency-view.tsx` | Linked: old team (logo) and current team. Plain: the logo badge beside the player name. |
| `components/last-games-view.tsx` | Linked: opponent in the table and the cards. |
| `components/lineup-model-research.tsx` | Linked: slot team. |
| `components/lookup-input.tsx` | Plain: search suggestions. |
| `components/ortg-lab-view.tsx` | Plain: logo beside the team select (picker). |
| `components/player-bio-header.tsx` | Deferred: the owner's uncommitted work is in this file. Verdict once it lands: link the header team and the draft team; the player's own name stays plain (own header). |
| `components/player-career-table.tsx` | Plain: logo stacks in season rows (badges; the row is the season link). |
| `components/player-dashboard-view.tsx` | Linked: each team in the "vs" line. Plain: its logo badge. |
| `components/player-reference-sections.tsx` | Deferred: the owner's uncommitted work is in this file. Verdict once it lands: link the team cells. |
| `components/player-showcase-view.tsx` | Plain: inside the list's open-career button. |
| `components/player-twins-view.tsx` | Plain: logo badges beside the linked name and career seasons. |
| `components/playoffs-bracket.tsx` | Plain: inside the series link (one target per slot). |
| `components/points-forecasts-research.tsx` | Linked: opponent. |
| `components/projected-impact-research.tsx` | Linked: card team logo (the code text shares a sentence with "Not on a roster"). |
| `components/research/research-table.tsx` | Plain: logo-only column beside the linked player (badge). |
| `components/research/stats-grid.tsx` | Plain: logo badge in GridPlayer; the name links by default now. |
| `components/research/team-picker.tsx` | Plain: picker. |
| `components/season-matchups-view.tsx` | Plain: logo badge beside the linked player; the pvp team entry (compare slot). |
| `components/shot-aftermath-research.tsx` | Linked: team table cell, meta team. |
| `components/signal-noise-research.tsx` | Linked: card teams. |
| `components/stats-detail-drawer.tsx` | Plain: logo stack badge. |
| `components/stats-page-controls.tsx` | Plain: team picker. |
| `components/stats-preview-rail.tsx` | Linked: each team code. Plain: the logo stack badge. |
| `components/table-ui.tsx` | Plain: decorative group guide. |
| `components/team-grid.tsx` | Plain: selection buttons. |
| `components/team-logo.tsx` | n/a: the logo component itself. |
| `components/team-schedule.tsx` | Plain: opponent inside the calendar cell's game link. |
| `components/team-stat-shift-view.tsx` | Plain: roster tray head and team button (pickers). |
| `components/ui/command-palette.tsx` | Plain: search suggestions. |
| `components/win-probability-flow.tsx` | Plain: chart and explainer marks (step labels, final split, roster strip). |
| `components/win-probability-research.tsx` | Linked: away and home in the matchup cell. |
| `components/win-probability-v4.tsx` | Plain: inside the card's game link (the owner also has uncommitted edits in this file). |
| `components/workbench-player-explorer.tsx` | Plain: logo stacks and the team-move chip in the Stats name cell (badges; the name is the link). |
| `components/workbench-player-profile.tsx` | Linked: each team in "N games with …". Plain: its logo stack. |
| `components/wowy-view.tsx` | Plain: the tier strip (logo and rank badges), opponent picks (buttons), the page's own team in headings. |
| `components/zts-research.tsx` | Linked: hero team, the Teams column. Plain: the team board cell (inside a team-select button). |

| File | Portrait |
| --- | --- |
| `components/compare-empty-slot.tsx` | Plain: compare slot. |
| `components/compare-season-picker.tsx` | Plain: picker. |
| `components/compare-tray.tsx` | Plain: tray chip. |
| `components/last-games-view.tsx` | Linked: the name heading of the comparison. Plain: the photo (it is the change-player button). |
| `components/live-shot-chart.tsx` | Plain: checkbox labels (control). |
| `components/lookup-input.tsx` | Plain: search suggestions. |
| `components/player-bio-header.tsx` | Plain: the subject in its own page header. |
| `components/player-compare-view.tsx` | Plain: empty-slot silhouettes. |
| `components/roster-shape-box.tsx` | Plain: hover card (hover-only, the tooltip rule). |
| `components/showcase-card.tsx` | Plain: the card is a button that opens the career dialog. |
| `components/stats-preview-rail.tsx` | Linked: the name heading. |
| `components/stats-trend-dialog.tsx` | Linked: the chart's player legend. |
| `components/table-ui.tsx` | Plain: decorative group guide. |
| `components/team-stat-shift-view.tsx` | Linked: the subject's name in the table heading. Plain: the row buttons (pick a subject) and the exported card. |
| `components/ui/command-palette.tsx` | Plain: search suggestions. |
| `components/win-probability-flow.tsx` | Plain: face strip without names (chart). |
| `components/wowy-view.tsx` | Linked: shared-floor mates. Plain: roster rows (selection controls), lineup faces (inside the lineup button), the composition card (exported image). |

Shared cells now link by default from the id and season they receive (`href={null}` opts out): `PlayerIdentity` (name, and its team code), `TeamIdentity`, `GridPlayer` (name; logo is a badge), the series `TeamCode` (`link={false}` inside segmented options; `phase="regular_season"` for the regular-season meetings). Also linked: the multi-player lines legend.

## 2026-11-14 — SL04 built: every remaining name; Live cards; at the owner gate

Work beyond the audit above:

- **Live board (D2).** `GameCard` is an `<article class="live-card has-stretched-link">`; its head
  (status, key cap, chevron) is the stretched game link with the card's old accessible name, first
  in tab order; each team's logo and code is a `TeamLink variant="block"` (44 px tall) to the team
  in the slate's season, by `canonical_id` (verified for every team on 2026-11-13 and 2025-03-10;
  a null id renders plain). The rail cards stay one link. `.has-stretched-link` gets `isolation`
  so the raised links never paint over sticky bars. Number keys are unchanged (they read the games
  list).
- **Live game page.** Team names link in the banner (full name and the phone code), the box-score
  titles and the injury report headings; also the GameFlow legend, the swing list and the season
  series (`live-game-extras`). Live games carry no phase, so a playoff game's team links open the
  regular season (SL02 does not move them).
- **Charts.** Linked: the Stats trend dialog's player legend, the multi-player lines legend, the
  GameFlow legend. Plain: tooltips, the Roster Shapes hover card, the Player Twins map legend
  (`aria-hidden`), axis labels.
- **The D1 look everywhere.** Hover and focus moved to the foundation layer (page link styles sat in
  the later `pages` layer and would have won); `entity-link` added to the 47 SL03 text-name links;
  the Stats name and `GridPlayer` are block links with only the name underlined.
- **Back keeps the scroll position: a fix for something that was already broken.** On `HEAD`,
  Back from a team page left Standings and Live at the top (measured with a `HEAD` dev server on a
  private port: 243 → 0, 232 → 0). Stats already restored through its own code. New
  `components/scroll-memory.tsx` (mounted in the root layout): saves `scrollY` per URL in
  `sessionStorage` on every click and key press, restores after a history traversal once the page
  is tall enough (3 s, cancelled by the reader's own scroll); App Router entries only, so a `#section`
  jump is left to the browser (the first version broke `fo13` settings' table of contents; fixed).
- **Not-found pages render directly** (from SL03) and **phone link heights**: the site's phone rule
  `main a:not(p a):not(li a) { min-height: 40px; display: inline-flex }` (foundation, < 768 px)
  now also applies to new links; inside headings and identity subtitles entity links keep the text's
  flow.

**Done when, measured** (real data on the owner's :3100/:8000 unless stated; `e2e/site-links-crawl.spec.ts`
23 passed together with the gate spec; evidence `docs/evidence/site-links/sl04-checks.txt`,
`crawl-sl04-{hrefs,counts}.json`, `gate/*.png`):

| Item | Result |
| --- | --- |
| Audit table has a verdict for every file | 49 team files and 17 portrait files, each with a verdict and its rule (entry above). Two are **deferred**, not finished: `player-bio-header.tsx` and `player-reference-sections.tsx` hold the owner's uncommitted player-page work. |
| From a Live card each team opens its team page for that season and the rest of the card opens the game, by mouse, keyboard and touch at 390 | Mouse: the away code opens `/teams/<id>?season=2026-27`; a press on the score (under the stretched link) opens `/live/games/<id>?date=2026-11-13`. Keyboard: tab order is game, away, home (hrefs equal in order); Enter on a team opens it; key `1` still opens the first game. Touch (390×844, `hasTouch`): team target 44 px tall; tap on a team opens it; tap on the score opens the game. |
| axe on Live finds no nested-interactive violation | axe-core (`nested-interactive` only, injected from the installed `axe-core`; there is no `@axe-core/playwright` in the repo): `/live/2026-11-13` 0 violations, 30 nodes passed; `/live` 0 violations, 22 passed; a game page 0 violations. A DOM check (`a a, button a, [role=button] a, a button, summary a`) over **45 pages** (every listed route, a game, a series): 0. It caught two before they shipped: WOWY lineup faces inside the lineup button and the series team codes inside segmented options; both are plain. |
| Scrolling Stats in a production build sends zero prefetch requests for entity links | Production build of this branch with the real API: Stats 50 entity links → **0** entity requests while scrolling and hovering; Standings 30 → 0; Draft 63 → 0. Control, the same test on a `HEAD` production build: Stats **18**, Standings **32**, Draft **37** prefetch requests. Fixture build (in the suite, `e2e/site-links-prefetch.spec.ts`): Stats and Draft 0. |
| Back from a player page returns Stats, Standings and Live to the same filters and scroll position | URL query identical and scroll restored: Stats 100 → 100, Standings 240 → 240, Live 240 → 240 (Live and Standings via the new scroll memory). |
| Crawl and full Playwright pass | Crawl: 17 patterns, **497** hrefs (`/teams/:id` 43 → 77), 47 opened, 0 failures. Full Playwright (production build, fixture API): **657 passed, 5 failed**, 40 skipped. Of the 5, four fail without this work: player-profile ×2 (owner's player-page work, shown in SL02), the phone search modal (fails on `HEAD`), `player-career` "TOR" (owner's `player-bio-header.tsx`). The fifth is this block's look change: `pc12-demo-hygiene` at 390 (3 % of pixels): Scottie Barnes's name on Saved Investigations is now a link, and the site's 40 px phone link rule makes it 20 px taller. The baseline is **left for the owner** (gate). The first full run had 14 failures; the rest were spec selectors written for the old card (`a.live-card` → `.live-card`, 9 → 27 links on the board), the finance drawer's "first link" (now the player), a lost `data-team` on Signal vs Noise cards, and the scroll-memory hash bug, all fixed. |

**Other checks.** Lint 0 (ESLint + Stylelint), typecheck 0, Vitest 144 files / 1,018 tests (new:
shared cells link by default, `href={null}`, self link, `TeamCode` phases and `link={false}`, scroll
memory). Sandboxes and their servers were removed.

**Seen, not caused here.** On the dev server `/wingspan` at 1440 logs a hydration mismatch in the
header's `AccountMenu` (`span.account-header-control` on the client, `div.courtlens-more` on the
server); the header is untouched by this plan.

**Owner gate.** Screenshots with a link hovered, real data: `docs/evidence/site-links/gate/`
`stats-1440.png`, `stats-390.png`, `live-card-1440.png`, `live-card-390.png`,
`research-wingspan-1440.png`, `research-wingspan-390.png` (each asserts the hovered name is accent
`rgb(255, 209, 102)` and underlined). Decisions for the owner:

1. The D1 hover look on approved pages (the screenshots).
2. The badge rule: a logo-only badge beside a linked name stays plain.
3. Phone heights: new links follow the site's 40 px phone link rule (rows and cards with a new team
   link get taller at 390; `pc12` baseline), except inside headings and identity subtitles.
4. Live game team links open the regular season even for a playoff game (no phase on Live games).
5. The two deferred files once the owner's player-page work lands.

## 2026-11-14 — SL04 gate decided

The owner delegated the gate ("choose the optimal ones and what you think would be best for
courtlens"). Recorded as D7–D13 in the plan: the D1 look accepted; logo badges stay plain; new links
follow the site's 40 px phone link rule (re-baseline `pc12` 390); Live team links take the phase
only from Live data; the two owner-held files wait for that work to land; the bracket keeps its
cutoff on series links; the SL03 crawl criterion includes D5 scope. Only the owner marks ✅. SL05 is
next: handoff in [site-links-sl05-handoff.md](site-links-sl05-handoff.md).

## 2026-11-14 — SL05 built: Related row on the four hubs; at the owner gate

**First tasks.**
- **D9 done.** `pc12-c-public-390.png` re-baselined in a production sandbox (fixture API 4180,
  dashboard 3180). The diff before updating: the Saved Investigations card's "Scottie Barnes" line
  is 20 px taller (the phone link rule), and everything under it moves down 20 px; nothing else.
  Only that PNG was copied back; `pc12-demo-hygiene` then 6/6.
- **D10: the Live read has no season type**, so Live team links stay season-only (untouched).
  `/api/live?slate_date=…` games carry `status`, `teams`, `odds`, `prediction`; `calendar` is a
  list of dates; `domain/live.py` reads ESPN's season type only for team schedules.
- **D11, half.** `player-bio-header.tsx` is committed (c9f0c676) and clean: the header team (in the
  season it names: today's listing → the current season, "Last with" → the season he last played
  for it, observed → the current season) and the draft team (the season it drafted under) are now
  `TeamLink`s. `entity-link.css` exempts `.player-bio-facts` from the 40 px phone rule.
  `player-bio-header.test.tsx` checks the line text and the link. `player-reference-sections.tsx`
  is still uncommitted owner work: untouched.

**What was built.**
- `lib/related-links.ts`: `playerRelated`, `teamRelated`, `gameRelated`, `seriesRelated` (pure,
  from data each page already has), `availableRelated` (drops a destination `routeAvailability`
  says the release cannot serve in that scope; never shown disabled).
- `components/related-row.{tsx,css}`: one `nav aria-label="Related"`, at the end of each hub's
  content, on the page background with a hairline above; entity links (D1), a team item with its
  logo (logo `aria-hidden`, block variant), 32 px tall. The player page passes its catalog; the team
  page filters on the server (`checked`, so the catalog never ships to the client); the game and
  series pages read the header's shared catalog (cached, no new request).
- `EntityScope.section` → `#section` on player and team hrefs.
- **A section link that lands.** The team page rewrites its URL after landing (`ReplaceUrl` adds the
  canonical scope) and dropped the hash; it now keeps `location.hash`. Next scrolls to a hash when
  the loading screen commits, before the section exists, so `components/hash-target.tsx` (in the
  schedule section) keeps `#schedule` aligned for up to 3 s until the reader scrolls, types or
  presses (the Draft page's `tab=` pattern). Measured: from a game's "NYK Schedule", the schedule's
  top lands at 143 px (was 1,281 px).

| Hub | Related links (real data) |
| --- | --- |
| Player `/players/2544?season=2024-25` | Los Angeles Lakers · Compare · Similar Players · Last Games · Matchups · 2003 Draft Class · PHI Contracts |
| Team `/teams/1610612760?season=2024-25` | 2024-25 Standings · Schedule (`#schedule`) · Roster Shapes · Contracts · Team Compare · 2024-25 Playoffs |
| Game `/live/games/401909296?date=2026-11-13` | New York Knicks · Indiana Pacers · NYK Schedule · IND Schedule |
| Series `/playoffs/2025-r1-okc-mem` | Oklahoma City Thunder · Memphis Grizzlies · 2024-25 Bracket · Game 1–4 |

**Where it differs from the plan.**
- **Team: the season's bracket, not each series.** The team page loads no series ids; a series list
  would need a new read. It links `/playoffs?season=` when the release has that season's playoffs.
- **Game: no series link.** Live games carry no season type (D10), so a playoff game can't be told
  apart without guessing from dates.
- **Player: "his team's contracts" is the team a roster source lists him on today** (Contracts
  shows today's books), so a 2024-25 LeBron page shows Lakers for the season and PHI for Contracts.
  A free agent or retired player gets no Contracts link.
- **Position: the end of each hub's content**, the least change to approved layouts.

**Checks.**
- Vitest: `lib/related-links.test.ts` (7), `components/related-row.test.tsx` (4), a section case in
  `entity-links.test.ts`; full run 146 files, 1,031 tests passed. Lint 0 (ESLint + Stylelint), typecheck 0.
- Real data (:3100/:8000), `site-links-crawl.spec.ts` "Related rows on the four hubs": every one of
  the 21 Related links opened (no 4xx, not-found, error state or nested anchor), both `#schedule`
  targets present (`related-sl05.json`). Run together with the crawl and the nested check (3 passed,
  4.0 min): **crawl 27 patterns, 515 hrefs, 63 opened, 0 failures** (SL04: 17 patterns, 497 hrefs;
  the new patterns are the Related destinations, `/compare`, `/similar-players`, `/last-games`,
  `/matchups`, `/draft`, `/contracts`, `/roster-shapes`, `/team-compare`, `/playoffs`, `/live/open`;
  `crawl-sl05-{counts,hrefs}.json`); **nested anchors over 45 pages: 0** (the player, team, game and
  series hubs among them).
- Full Playwright in the production sandbox (fixture API): **656 passed, 6 failed, 44 skipped**
  (2.6 min). Four are the known ones not caused here: `visual-baselines` player profile ×2 and
  `player-career` "TOR" (owner's player-page work), `visual-baselines` phone search modal (fails on
  `HEAD`). Two failed only under full-suite load: `last-games` trend chart (`:70`) and
  `table-interactions` keyboard sorting (`:63`); rerun alone ×3, 6/6 passed. `pc12` passes with
  the new baseline. Sandbox and its servers removed.

**Owner gate.** Screenshots, real data, first Related link hovered (each asserts accent
`rgb(255, 209, 102)`, underline, 32 px tall): `docs/evidence/site-links/gate/`
`related-{player,team,game,series}-{1440,390}.png`. For the owner:

1. The row's look and position (end of each hub), or under the header instead.
2. The team page's bracket link in place of per-series links.
3. Contracts on a player page names today's team.

## 2026-11-14 — SL05 gate decided

The owner delegated the three questions ("use your best judgment, and choose what you think would
be optimal for the site"). Recorded as D14–D16 in the plan: the Related row stays at the end of each
hub (D14); the team page links the season's bracket rather than guessing series ids (D15); Contracts
on a player page names today's team (D16). The built row already matches all three, so no code
changed. Only the owner marks ✅. SL06 (links in Ask answers) is next: handoff in [site-links-sl06-handoff.md](site-links-sl06-handoff.md).

## 2026-11-14 — SL06 built (links in Ask answers)

Dashboard only. Nothing under `src/courtlens` changed for this block (the diffs there are the
owner's contract work).

**Result rows, from real results.** Ran each warehouse operation through
`POST /api/workbench/assistant/turn` with a hand-written plan (no provider call) on the owner's
:8000 and read the row keys after the dashboard's flattening (`tableRow`):

| Operation | Name cell → id | Links |
| --- | --- | --- |
| `query`, `position_query`, `workload_shifts`, `similarity` peers | `player name` → `player id` | player |
| `profile` (facts) | `player · name` → `player · id`; `latest team · name`/`tricode` → `latest team · id` | player, team |
| `team` (facts) | `team · name`/`tricode` → `team · id` | team |
| `similarity` peers' `team tricode`, query rows' `team tricodes` | no team id in the row | plain |
| `compare`, `compare_periods`, `splits` | metric rows, no entity ids | none |

`team_season` queries and `distribution` came back unsupported for that plan, so their rows were
not read; the rule is the same one regardless of operation: a cell links only when its own row
carries the matching id.

**What was built.**
- `lib/agent-answer.ts`: `entityOfCell` (the pairing above), `resultScope` (the result's season, plus
  `phase=playoffs` only for the playoffs, D5), `answerEntityNames` (every name with its id across
  all of the turn's returned rows, not only the ten shown; a name with two ids is dropped), and
  `proseLinks`. `agentResultView` now returns the whole flattened row for a facts view, so a shown
  name can find its hidden id.
- `components/agent-answer.tsx`: result cells and facts render through `ResultCell` (entity
  variant, `PlayerLink`/`TeamLink`, `prefetch={false}`). `AgentProse` builds its segments once and
  works out the links over the whole answer, then `InlineProse` renders them with the `prose`
  variant inside the existing unverified-marking runs, so the marking stays on the same code-point
  positions.
- Prose rules: the first exact full-name mention of each name, as a whole word (not inside
  "LeBron Jameson"), outside code blocks and inline code, only when the name maps to exactly one id
  among this turn's results. Team codes are never matched in prose; only full names are. Everything
  else stays plain.

**Decisions taken in this block.**
- **A name the unverified marking would split** (a sentence boundary inside the name) is not a link
  candidate: that mention stays plain and keeps its exact marking, and the next exact mention may
  link instead. A name wholly inside an unverified sentence links inside the marked span.
- **Prose scope when results disagree.** A prose name carries a season only when every result
  naming that id has the same scope; otherwise it carries none and SL02 picks one.
- **Streaming.** `AgentAnswer` only ever receives a finished turn: while an answer streams,
  `threaded-assistant.tsx` shows `live.text` as a plain paragraph and mounts `AgentAnswer` when the
  response arrives (its `status` is always terminal: answered, refused, failed or cancelled). So
  links appear only once streaming has finished, with no extra gate needed; recorded in a comment on
  `AgentProse`.
- The assumption line stays plain (it is not the answer prose and has no positions).

**Checks.**
- Vitest `components/agent-answer.test.tsx`: 16 passed, 6 of them new: a linked row (and a row
  without an id stays plain), profile/team facts through nested ids with `phase=playoffs`, the first
  mention linked once (inside bold, not inside inline code, not again in a list), two players
  sharing a name (prose plain, each row still links by its own id), a name with no result and a name
  inside a longer word (plain), an unverified sentence containing a link (link inside the marked
  span, marking unchanged, emoji offsets intact) plus a name split by the marking (plain; the next
  mention links), disagreeing seasons (no season). Full Vitest: 146 files, 1,037 passed.
- Lint 0 (ESLint + Stylelint), typecheck 0.
- Frozen replay tests, unchanged and run after the change:
  `test_assistant.py::test_tool_declarations_allowlisted`, `test_agent_loop.py`,
  `test_assistant_streaming.py`, `test_revamp_routing_replay.py`: **123 passed**. No file they
  read was touched, so the before-state is the same code.
- **Real question on the owner's dev stack** (:3100/:8000, free pool): "LeBron James and Anthony
  Davis points per game 2019-20". Prose: "Anthony Davis" → `/players/203076?season=2019-20` and
  "LeBron James" → `/players/2544?season=2019-20`, accent `rgb(255, 209, 102)`, underlined, first
  mention only (the list's later "Anthony Davis"/"LeBron James" stay plain). Result facts: both
  names link with the entity look (text colour, no underline at rest). "Los Angeles Lakers" and
  "LAL" stay plain: no result row carried a team id. Clicking "Anthony Davis" opened
  `/players/203076?season=2019-20` with h1 "Anthony Davis", no error state. Prose links measure
  18 px tall at 390 (the `p a` exemption keeps them inline). Screenshots:
  `docs/evidence/site-links/sl06/ask-links-{1440,390}.png`.
- Full Playwright in the production sandbox (fixture API): **656 passed, 6 failed, 44 skipped**
  (2.4 min). Four are the known ones (`visual-baselines` player profile ×2, `player-career` "TOR",
  `visual-baselines` phone search modal). `wowy:69` is a flake (passed then failed on two solo
  reruns). **`pc12-demo-hygiene` 390 fails on `pc12-c-saved-390`** (the saved Scottie Barnes
  investigation; baseline from 2026-10-19): the back button reads "Back to Previous Page" instead
  of "Back to Saved Investigations", and the identity block is 20 px taller (the linked name under
  the D9 phone rule). **Not from SL06:** with the three SL06 files reverted to `HEAD` in the
  sandbox and a fresh build, it fails with the same 11,008 px. Left for the owner: re-baseline it
  under D9 as `pc12-c-public-390` was in SL05, after checking the back-label change. Sandbox and
  its servers removed.

SL06 has no owner gate. **The site links plan is finished**: SL01–SL06 are built and await the
owner's ✅. D11's second half (`player-reference-sections.tsx` team cells) still waits on the
owner committing that file.
