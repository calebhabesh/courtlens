# Site links: handoff for SL05 (and SL06)

You are continuing the [site links plan](site-links-plan.md). SL01–SL04 are built and the SL04 gate
is decided (D7–D13 in the plan). Read in this order: the plan (decisions D1–D13, rules, SL05 and
SL06 "Done when"), then the newest entries of the [progress log](site-links-progress.md) (SL03,
the SL04 audit, SL04, gate decided). Don't reopen D1–D13.

## Where things are

Branch `feat/site-improvements`, nothing committed. Commit or push only when the owner asks. The
working tree also holds the **owner's** unfinished work (player pages, contracts, Wikipedia
contracts, college schools, deploy files, `player-bio-header.*`, `player-reference-sections.*`,
`win-probability-v4.*`, `e2e/mock-api.mjs`, `lib/types.ts`). The owner edits some of these while
you work. Leave them alone and keep them out of any commit.

What the site-links work added (all uncommitted):

- `dashboard/lib/entity-links.ts`: `playerHref`, `teamHref` (franchise id, D6), `gameHref`
  (ESPN id or `/live/open`), `seriesHref`, `scopeFromQuery`, `scope.params` (navigation markers
  such as `from=stats`), `isSelfLink`, `ENTITY_ROUTES`.
- `dashboard/components/entity-link.tsx` + `.css`: `PlayerLink`, `TeamLink`, `GameLink`,
  `SeriesLink`, `EntityAnchor`; variants `entity`, `prose`, `block` (only `.entity-link-text`
  takes the hover), `stretched` (card primary link inside `.has-stretched-link`). Resting look in
  the components layer, hover/focus in the **foundation** layer (page CSS is in `pages`, which
  beats `components`).
- `dashboard/lib/link-scope.ts`, `components/scope-fallback-note.*`: SL02 season fallback and the
  `asked` note; `app/players/[id]` and `app/teams/[id]` render their `not-found.tsx` directly.
- `components/scroll-memory.tsx` + `lib/scroll-memory.ts`: Back restores scroll (root layout).
- ESLint rule bans literal `/players/`, `/teams/`, `/live/games/`, `/live/open`, `/playoffs/`
  outside `lib/entity-links.ts`; the pending list is empty.
- Shared cells link by default (`href={null}` / `link={false}` opts out): `PlayerIdentity`,
  `TeamIdentity`, `GridPlayer`, series `TeamCode`. `MenuItem` takes `href`.
- Specs: `e2e/site-links-crawl.spec.ts` (real data: landings, crawl, nested-interactive over 45
  pages, Live card mouse/keyboard/touch/axe, Back), `e2e/site-links-gate.spec.ts` (real data,
  screenshots), `e2e/site-links-prefetch.spec.ts` (suite; `SITE_LINKS_PREFETCH_REAL=1` adds
  Standings). Evidence in `docs/evidence/site-links/`.

## First tasks, before SL05 proper

1. **D9: re-baseline `pc12-c-public-390.png`** (`e2e/pc12-demo-hygiene.spec.ts`). Run that spec
   with `--update-snapshots` in a production sandbox (recipe below), copy only that PNG back into
   `dashboard/e2e/pc12-demo-hygiene.spec.ts-snapshots/`, and check that the diff is the 20 px taller
   name and nothing else.
2. **D10: Live phase.** Check whether the Live read (`/api/live?slate_date=…`, the
   `LiveGame`/`LiveSlateData` types in `lib/live.ts`) exposes ESPN's season type. If it does, pass
   `phase: "playoffs"` from Live team links (`live-board.tsx`, `live-game.tsx`,
   `live-game-extras.tsx`, `live-prediction.tsx`). If it doesn't, leave them and say so. Never
   infer the phase from dates.
3. **D11** only if the owner has committed the player-page work by then: link the header team and
   the draft team in `player-bio-header.tsx` and the team cells in `player-reference-sections.tsx`.

## SL05 Related row

Spec in the plan. Same component and position on the player, team, game and series pages; built
only from data each page already loads (no new endpoints, no Caddy entries); hide destinations the
release can't serve (`routeAvailability`). Use the builders and `TeamLink`/`PlayerLink`; check every
link with the crawl (add the four hubs' Related links to what it covers) and the nested-interactive
test. Stop for the owner with 1440 and 390 screenshots of all four hubs (extend
`site-links-gate.spec.ts`). Record evidence in the progress log, newest last; only the owner marks ✅.

SL06 (Ask links, dashboard only, replay tests frozen) comes after the owner answers on SL05.

## Things that cost time last session

- **Servers.** The owner's panes own :8000 (API) and :3100 (dashboard dev); use them for real-data
  checks, never restart them. The dev server never prefetches; prefetch only shows in a production
  build.
- **Production sandbox** (needed for the full suite, the prefetch spec and screenshots under
  `next build`): copy `dashboard/` (no `node_modules`, `.next`, `test-results`) and `docs/` into
  `~/.cache/courtlens-tmp/<name>/` (`$TMPDIR` is unset in Claude's shell; never `/tmp`), hard-link
  `node_modules` (`cp -al`), `sed` the sandbox's `e2e/f04-accounts.spec.ts` from 4100 to 4180, build
  with `COURTLENS_API_INTERNAL_URL` and `NEXT_PUBLIC_COURTLENS_API_URL` = `http://localhost:4180`
  (`npm run build -- --webpack`), start `PORT=4180 node e2e/mock-api.mjs` and
  `HOSTNAME=127.0.0.1 PORT=3180 node e2e/start-dashboard.mjs`, run with
  `PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3180 PW_CHROMIUM_PATH=$(command -v chromium)`.
  For real data in a production build, start a second server from the same build on another port
  with `COURTLENS_API_INTERNAL_URL=http://localhost:8000` (server-rendered tables work; browser
  calls to :8000 are rejected by CORS). Stop servers by port (`ss -ltnp`), never `pkill -f` with a
  pattern that matches your own shell. Delete the sandbox when done.
- **To prove something predates your work,** build `git archive HEAD dashboard` the same way (or run
  `next dev -p 3190` from it against :8000) and run the same test there.
- **Real-data specs** need `SITE_LINKS_REAL=1 PLAYWRIGHT_EXTERNAL_SERVER=1`.
- **Playwright traps.** `page.goBack()` and `waitForURL` default to the `load` event, which a client
  navigation never fires: pass `{ waitUntil: "commit" }`. A locator `click()` scrolls its target into
  view first (it breaks scroll tests) and waits forever on an element covered by a stretched link:
  press coordinates with `page.mouse`/`page.touchscreen`. `innerHeight` is not defined in
  test-side code.
- **Phone link rule.** `main a:not(p a):not(li a)` gets `display: inline-flex; min-height: 40px`
  below 768 px (foundation). Any new link inherits it; entity links inside headings and identity
  subtitles are exempt (`entity-link.css`).
- **Nesting.** Shared cells now link by default, so a `PlayerIdentity`/`TeamCode` placed inside a
  button, a segmented option or a card link nests anchors: pass `href={null}`/`link={false}`. The
  crawl spec's `nestedInteractive` check catches it.
- **`notFound()` inside these streamed routes** leaves a hidden staging copy in production; return
  the not-found component instead.
- **Known failures not caused by this work** (don't chase them): `visual-baselines` player profile
  ×2 and `player-career` "TOR" (owner's player-page work), `visual-baselines` phone search modal
  (fails on `HEAD`), `f04-accounts` Escape flake (1 in 3 on `HEAD`), a header `AccountMenu`
  hydration mismatch on the dev server.

## Checks per block

Targeted Vitest and the touched Playwright specs per block; lint (`npm --prefix dashboard run lint`)
and typecheck at zero; the full Playwright suite once before merge (it last ran after SL04: 657
passed, 5 failed as listed above, `pc12` being D9's re-baseline).
