# Speed plan

Make CourtLens feel instant, the way Basketball-Reference does: a click on a player, team or page
shows its content with no visible wait. It keeps every analytical, identity, data and source
contract, the control kit and the approved page layouts; no number on any page changes.
Work one block at a time, in order. Record measured evidence in the
[speed progress log](speed-progress.md). Only the owner marks a block ✅.

**Status: plan written 2026-11-14; SP00 built 2026-11-14, SP01–SP06 built 2026-11-15, all ✅ owner 2026-11-15 (SP03 records a floor for two prefetched journeys, SP05 floors for Stats HTML and the player page's first-load JS and CSS, SP06 a floor for layout shift: two small shifts from page elements, none from an image). The G1/G2 stop ran 2026-11-15: suites green but for known failures, draft PR #110, G2 ✅ owner; the deploy and its live checks move to SP08. SP07 built 2026-11-15 (Smart Tiered Cache and Early Hints on). SP08 built 2026-11-16: merged (#110), deployed (fd416ef0), final live table recorded. G1 ✅ owner 2026-11-15 after trying the live site; SP07 and SP08 ✅ owner 2026-11-15. The plan is finished.**

## Where the time goes (measured 2026-11-14)

Full numbers are in the progress log. The short version:

- The page shell reaches the browser in 40–90 ms and static JS, CSS and fonts are already cached
  at Cloudflare. The wait is the data that streams in behind the skeletons: 1.1–1.8 s for a player
  page (up to 4.9 s), 1.4–6.1 s for a team page, 3.5 s for Compare.
- Nothing is cached. All 27 pages are `force-dynamic`, every dashboard fetch is `no-store`, and
  every API read runs its queries again, although served data changes only when a job finishes
  (about seven times a day).
- A player page makes about eight API reads in three or four sequential waves, each 150–400 ms.
- Every link is `prefetch={false}`, so a click starts from zero.
- Pages are heavy: Stats is 2.2 MB of HTML for 50 rows, a player page 1.1 MB, and a player page
  loads 488 KB of compressed JS and CSS.
- Player portraits are not cached at Cloudflare (`DYNAMIC`, about 135 ms each).

## Budget

The plan is finished when these hold. *Warm* means the read cache holds the page's data; *cold*
means it does not (first visit after a data change, on a page the warm crawl does not cover).
Live numbers are medians of five runs of `scripts/speed/measure.py` from the owner's PC.

| Measure | Baseline | Budget |
| --- | --- | --- |
| Player page, warm, HTML complete (live) | 1.1–1.8 s | ≤ 300 ms |
| Team page, warm, HTML complete (live) | 1.4–6.1 s | ≤ 300 ms |
| Stats, warm, HTML complete (live) | 0.83 s | ≤ 400 ms |
| Player page, cold (live) | up to 4.9 s | ≤ 800 ms |
| Click to content, link prefetched on intent | about the page time | ≤ 100 ms |
| Click to content, no prefetch (tap, keyboard), warm | about the page time | ≤ 300 ms |
| API read served from the cache (live; network floor is 40 ms) | 40–400 ms | ≤ 60 ms |
| Stats HTML, uncompressed | 2.2 MB | ≤ 1.1 MB |
| Player page first-load JS and CSS, compressed | 488 KB | ≤ 350 KB |
| Player portrait at Cloudflare | `DYNAMIC` | `HIT` |

When a block cannot meet its budget, record the measured floor and what sets it, and stop for the
owner; the budget is changed by the owner, not by the block.

## Decided (plan defaults, 2026-11-14)

The owner asked for this plan and was not asked these one by one. D6 is put to the owner at
gate G2; any other may be overturned at gate G1.

- **D1 One read cache, in the API process.** An in-memory, byte-bounded cache of API read
  responses. In the API it serves the dashboard's server reads, the browser's own reads (search,
  grids) and prefetch renders alike, and a hit never enters the thread pool where slow queries run.
- **D2 The data stamp invalidates it.** The API derives a *stamp* from what the jobs write
  (publication pointers and job-health records) and empties the cache when the stamp changes. It
  is checked lazily, so no job has to notify anything and a missed notification cannot leave
  stale pages.
- **D3 Pages stay `force-dynamic`.** Next's fetch cache and Cache Components are not used.
  `force-dynamic` forces every fetch to `no-store`, the image build must never need the API, and
  migrating 27 pages to Cache Components buys little once D1 makes each render cheap.
- **D4 Prefetch on intent.** A link fetches its page when the pointer rests on it, when it gets
  keyboard focus, or on touch start. Nothing prefetches on entering the viewport. This refines
  the site links rule ("a 30-row table must not send 30 requests") instead of dropping it.
- **D5 Warm by crawling pages.** After each data change the jobs service requests the pages
  people open most, through the dashboard, so the cache is filled by the same code visitors use.
- **D6 HTML is not cached at Cloudflare in this plan.** Dynamic pages send `no-store`, a deploy
  renames every script chunk, signed-in views differ by cookie, and purging needs a Cloudflare
  token on the VPS. Revisit at G2 with the measured numbers.
- **D7 No new services, no paid features.** No Redis, no extra API workers (the impact bundle
  peaks near 2.3 GB of the API's 3 GB), Cloudflare Free only.

## Decided (owner, G1, 2026-11-15)

- Run SP04, SP05 and SP06 before any deploy. G1 and G2 become one stop after SP06: the full
  suites, the owner's deploy, then `docker stats` and `measure.py` live, then SP07 and SP08.
- The two prefetched journeys over budget (player → team 230 ms, nav → Stats 179 ms) are accepted
  for now. SP05 works on the render cost behind them.
- No block for warming browser-side reads. SP04 shortens those reads instead.
- The ~30 files that still use Next's default viewport prefetch are converted to `IntentLink` in
  SP05, not SP04.
- The team six-factor last-digit jitter stays as it is. Compare those reads at 12 significant
  digits.
- D1–D5 stand.
- The stale `player-career.spec.ts:83` assertion (expects `2018 · R1 #9 · TOR`; the page has shown
  the full team name since 5ace395a) is fixed in SP04's commit.

## Decided (owner, G2, 2026-11-15)

- The branch is pushed and its PR (#110) stays a draft: the owner finishes the whole plan before
  the merge. The one deploy is SP08's, and the stop's checks after a deploy (the Cloudflare `.webp`
  check, `docker stats` during the warm start and the first crawl, `measure.py` live) move there.
- SP07: the owner left the zone settings to the agent ("Choose the optimal settings for
  courtlens"). Chosen: Smart Tiered Cache and Early Hints on; 0-RTT stays off (zone-wide replay
  exposure for the other sites); the browser cache TTL stays at 4 hours (reasons in the progress
  log).
- D6 stays closed: no HTML or API responses cached at Cloudflare.
- The recorded floors are accepted as they are: SP03's two prefetched journeys, SP05's Stats HTML
  and player first load, SP06's two non-image layout shifts. No further work on them before SP08.
- G2 passes now; G1 is marked after the SP08 deploy, once the owner has tried the live site.

## Rules every block follows

- **Speed never changes a number.** Before a block that touches an API read or a page's data
  flow, save responses with `scripts/speed/snapshot.py`; after it, compare. Any difference is a
  defect in the block.
- **Scope is part of the key.** A cached response is stored under the method, path and every
  query parameter (and the body, for a read-only POST), so `season`, `phase`, `beforeDate` and
  `releaseId` can never be mixed. A request carrying credentials is never cached or served from
  the cache.
- **Measure with the same tool before and after.** Each block records before and after numbers
  from `scripts/speed/measure.py` and the navigation spec under `docs/evidence/speed/<block>/`.
- **Read the bundled Next.js docs first** (`dashboard/node_modules/next/dist/docs/`) for any Next
  API a block uses; this version differs from older ones.
- **The VPS is shared.** The cache is capped at 128 MiB, the warm crawl runs at most two requests
  at a time, and no block raises a container's memory or CPU limit.
- **Local runs.** The owner's panes own `:8000` and `:3100`. Run a production build and its API
  on other ports from a workspace under `$TMPDIR`, and stop and delete them afterwards. Prefetch
  only runs in a production build.
- **Cloudflare is read-only until G2.** The zone also serves the owner's other sites; every rule
  created later is scoped to `courtlens.calebhabesh.com`.
- **Checks.** Targeted pytest, Vitest and the touched Playwright specs per block; the full
  suites once before each gate. Commit each block separately; push, merge and deploy only on the
  owner's word.

| Block | What | Status |
| --- | --- | --- |
| SP00 | Measuring tools and baseline | ✅ owner, 2026-11-15; built 2026-11-14 |
| SP01 | API read cache and data stamp | ✅ owner, 2026-11-15; built 2026-11-15 |
| SP02 | Warm crawl after each data change | ✅ owner, 2026-11-15; built 2026-11-15 |
| SP03 | Prefetch on intent; skeletons that do not flash | ✅ owner, 2026-11-15; built 2026-11-15 |
| G1 | Owner gate: deploy, try the site | ✅ owner, 2026-11-15, after the SP08 deploy |
| SP04 | Cold path: page waves and slow reads | ✅ owner, 2026-11-15; built 2026-11-15 |
| SP05 | Page weight: HTML and JS | ✅ owner, 2026-11-15; built 2026-11-15 |
| SP06 | Images and static files | ✅ owner, 2026-11-15; built 2026-11-15 |
| G2 | Owner gate: Cloudflare changes | ✅ owner, 2026-11-15 |
| SP07 | Cloudflare settings | ✅ owner, 2026-11-15; built 2026-11-15 |
| SP08 | Close: suites, deploy, final numbers, docs | ✅ owner, 2026-11-15; built 2026-11-16 |

## SP00 Measuring tools and baseline

No behaviour change. Build the tools every later block is judged with.

- `scripts/speed/urls.json`: the fixed set. Pages: `/`, `/stats`, `/players`, `/teams`,
  `/standings`, `/compare` with two players, three player pages (a current star, a current
  rookie, a pre-2000 player), two team pages, one Research page. API reads: every read those
  player and team pages make.
- `scripts/speed/measure.py`: GET each URL five times; record first byte, total, wire bytes,
  decoded bytes, `x-cache` and `cf-cache-status`; write JSON to the evidence folder. GET only, so
  it is safe against the live site.
- `scripts/speed/snapshot.py`: fetch a fixed sample of API reads with `releaseId` and
  `beforeDate` pinned, store a SHA-256 of each canonical JSON body, and with `--compare` exit
  non-zero on any difference. The sample covers every endpoint behind the pages above.
- `dashboard/e2e/speed-navigation.spec.ts`: click-to-content time for four journeys (Stats row →
  player, player header → team, nav → Stats, Back), logged as `SPEED_NAV {json}` in the style of
  `site-links-prefetch.spec.ts`. Against the mock API it asserts request counts only; with
  `SPEED_REAL=1` it reports timings from a real stack.
- API `Server-Timing` header on every response: total handler time, database time and query
  count (SQLAlchemy cursor events). Add it where `observe_request` already wraps the request.

**Done when:** the baseline for the whole set is recorded for the live site and for a local
production build on the PC's data copy; the snapshot tool passes against itself twice in a row;
`Server-Timing` shows on a local API response; lint, typecheck and targeted tests pass.

## SP01 API read cache and data stamp

- **Cache.** A module in `src/courtlens/api/` holding response bodies in an LRU bounded by total
  bytes (`COURTLENS_READ_CACHE_MAX_BYTES`, default 128 MiB), behind `COURTLENS_READ_CACHE`
  (off by default so existing tests are untouched; on in `deploy/compose.prod.yml`). It stores
  only status 200 JSON responses up to 4 MiB. A hit returns the stored bytes and headers with a
  fresh `X-Request-ID`. Every response from a classified route carries `X-Cache: hit`, `miss` or
  `bypass`.
- **Key.** Method, path, query parameters sorted by name, and for a read-only POST the SHA-256 of
  the body.
- **Classes.** One registry gives every route a class:
  - `stamp`: reads of published or job-written data. Cached until the stamp changes, at most 6 hours.
  - `short`: reads whose data moves between jobs (Win Probability, job and data status). Cached
    30 seconds.
  - `never`: auth, account, favourites, Ask, conversations, jobs, workspace and saved analyses,
    finance import, Live, and anything that reads a credential header. When unsure, `never`.

  The read-only POSTs Caddy already allows (`/api/workbench/query`, which is the Stats and player
  hero read, and `/api/workbench/operations/*`) are classified like GETs. A test walks the app's
  routes and fails on any GET or allowed POST without a class, so a new endpoint cannot ship
  unclassified.
- **Bypass.** A request with `Authorization`, `Cookie` or `X-Operator-Token` is `bypass` whatever
  its route's class.
- **Stamp.** A SHA-256 over: the `published_snapshots` pointers and the other release pointers
  the API serves from; each job's `last_finished` in `data/derived/job-health`; and a manual bump
  file in that directory, written by a new `courtlens bump-data-stamp` command for hand-run
  writes. Recomputed at most every 5 seconds. Before choosing the inputs, list every writer of
  served data (each job in `scheduled_jobs.JOBS`, the Win Probability seal service, the demo
  reset, hand-run CLI commands) in the progress log with how each one changes the stamp or why
  its reads are `short` or `never`.
- **Status.** `GET /api/cache/status` (class `never`): entries, bytes, hits, misses, the current
  stamp and a generation id that changes with the stamp and with each API start.

**Done when:** pytest covers a hit returning identical bytes, a stamp change emptying the cache,
the credential bypass, the byte bound evicting the least recently used entry, a non-200 response
not being stored, and the unclassified-route failure; `snapshot.py --compare` passes with the
cache off, on and cold, and on and warm; on the local production stack every `stamp` read in the
set reports `X-Cache: hit` with `Server-Timing` total ≤ 5 ms on its second request, and the three
warm player pages complete in ≤ 300 ms; the API's resident memory with the cache filled to its cap
is recorded and stays under the container limit with the impact bundle loaded.

## SP02 Warm crawl after each data change

- `courtlens warm-site`: request pages from the dashboard (`COURTLENS_WARM_BASE_URL`,
  `http://dashboard:3000` in `deploy/compose.prod.yml`) two at a time: the top-level pages, all
  30 team pages, and the page of every player on a current roster, each in the default scope.
  It waits for the dashboard to answer, stops after repeated 5xx responses, and writes a health
  record (pages, failures, median and slowest time, the generation it warmed).
- It runs when the generation at `/api/cache/status` differs from the one in its last health
  record. Call it from the jobs loop after `run-jobs` so a deploy (new API process) and every job
  that changes the stamp are both followed by a crawl. `run-jobs --next-wake` keeps printing only
  the wake seconds on stdout.
- A failed or skipped crawl only leaves pages on the cold path; it never fails a job.

**Done when:** pytest covers the URL list (teams, roster players, top-level pages), the
generation check and the failure stop; on the local stack, bumping the stamp and running
`warm-site` leaves `/api/cache/status` reporting no new misses while `measure.py` loads the
warmed pages; the crawl's duration and the dashboard's and API's peak CPU and memory during it
are recorded.

## SP03 Prefetch on intent; skeletons that do not flash

Read `01-app/02-guides/prefetching.md` and the `Link` reference in the bundled docs first. These
pages are dynamic with a `loading.tsx`, so default prefetching fetches only the shell; this block
needs the prop value that fetches the whole page.

- One hook in `dashboard/lib/` that turns intent into a full prefetch: pointer resting on the
  link for 80 ms, keyboard focus, or touch start. A pointer sweeping across rows triggers nothing.
- `EntityAnchor` in `dashboard/components/entity-link.tsx` uses it, so `PlayerLink`, `TeamLink`,
  `GameLink` and `SeriesLink` call sites do not change. The header navigation and the kit's
  `ButtonLink` use it too. No link prefetches on entering the viewport.
- Update the words that state the old rule: the Links section of
  [Design Language](design/design-language-v1.md), the site links paragraph in `AGENTS.md`, and
  the comment at the top of `entity-link.tsx`.
- `site-links-prefetch.spec.ts`: keep the zero-requests-on-load-and-scroll assertion; add one
  request after a resting hover, none after a fast sweep over 20 rows, and no further page
  request on the click that follows a prefetch.
- Loading skeletons become visible only after 120 ms, so a response faster than that never shows
  one. Use the motion tokens; reduced motion keeps working.

**Done when:** the updated spec passes against a production build; `speed-navigation.spec.ts`
with `SPEED_REAL=1` on the local stack reports click to content ≤ 100 ms for the prefetched
journeys and ≤ 300 ms for an unprefetched warm one; lint (including the entity-link rule),
typecheck and Vitest pass.

## G1 Owner gate

Run the full pytest, Vitest and Playwright suites. Report the before and after table. The owner
merges and deploys (`scripts/deploy-vps.sh`), or tells the agent to. Then run `measure.py`
against the live site, record it, and wait for the owner's verdict on how the site feels before
SP04.

## SP04 Cold path: page waves and slow reads

For pages the crawl does not cover, and for the first minutes after a data change.

- **Two waves at most.** A page reads the catalog, then starts every other read together. The
  player page today waits for the catalog, then the career, then profile and game log, then
  impact, hero, bio and metric catalog; only the season fallback truly depends on the career.
  Apply the same rule to the team, Compare, Stats and Players pages.
- **Slow reads.** With `Server-Timing` on the local stack and the cache off, list each read
  behind those pages by uncached time, database time and query count. Fix the slowest first:
  missing indexes (Alembic migration), repeated queries, files parsed on every request, and
  facts recomputed per request that depend only on an immutable release id (memoise those by the
  id). Find what made the first career read take 3.4 s and load it at API start.
- Each fix passes `snapshot.py --compare`.

**Done when:** every read behind the player and team pages takes ≤ 150 ms uncached on the local
stack, or its floor is recorded with the reason; a cold player page completes in ≤ 800 ms on the
local stack; the snapshot comparison passes; the migration, if any, applies and downgrades
cleanly on a scratch database.

## SP05 Page weight: HTML and JS

- **HTML and the data that rides with it.** Find what makes Stats 2.2 MB for 50 rows, the
  Players index 0.8 MB and a player page 1.1 MB: props sent to client components that the client
  never reads, the same object serialised more than once, columns rendered but hidden. Send each
  client component only what it uses.
- **JS.** Produce a bundle report for the production build (see the bundled docs for this
  version's analyzer) and move code that is not needed for first paint behind `next/dynamic`:
  the Ask panel, the sign-in dialog, image export, and charts below the first screen. Check that
  `lucide-react`, `motion` and the `d3-*` packages are imported by name.
- Every layout and behaviour stays as approved; the touched Playwright specs prove it.

**Done when:** Stats HTML is ≤ 1.1 MB uncompressed and a player page's first-load JS and CSS is
≤ 350 KB compressed, or the floor and its cause are recorded; `measure.py` shows the new sizes;
the navigation spec's timings are no worse than at G1.

## SP06 Images and static files

- **Portraits.** Serve the portrait at a path ending in `.webp` (keep the old path working) so
  Cloudflare's default file caching applies with the existing one-day lifetime and no zone
  change. Confirm `cf-cache-status: HIT` on the second request after deploy.
- **Hashed files.** `/team-logos/<id>-<hash>.svg` carries a content hash: send
  `public, max-age=31536000, immutable` from `next.config.ts`. `/flags/*` gets 30 days.
- **The hero portrait** on a player page loads eagerly with high fetch priority; every other
  image is lazy with explicit width and height, so nothing shifts as images arrive.

**Done when:** response headers for a portrait, a logo and a flag are recorded from the local
production build; the player page's largest-contentful-paint element and time are recorded
before and after from a Playwright trace; no layout shift is reported on the player and team
pages.

## G2 Owner gate

Report SP04–SP06 numbers against the budget. Ask the owner two things: which zone settings in
SP07 to change (the zone also serves their other sites), and whether to open D6 (HTML or API
responses cached at Cloudflare) given the numbers. Change nothing in Cloudflare before the answer.

## SP07 Cloudflare settings

With the `cf` CLI, for the settings the owner approved at G2. Candidates, all on the Free plan:
Early Hints, 0-RTT, Smart Tiered Cache. Record each setting's value before and after. If the
owner opened D6, write that work as a new block in this plan first, with its own done-when
covering signed-in pages, deploys and purging.

**Done when:** each approved setting is changed and recorded; `measure.py` against the live site
is recorded before and after; the owner's other hostnames on the zone answer as before.

## SP08 Close

- Full pytest, Vitest and Playwright suites.
- Deploy on the owner's word; run `measure.py` and the navigation spec against the live site and
  record the final table beside the baseline and the budget.
- A "Speed" section in [the deployment guide](deployment.md): the read cache, its classes, the
  stamp, the warm crawl, `bump-data-stamp`, the memory cap, and how to turn the cache off. One
  line in [Running the hosted demo](operations/hosted-operations.md) for the crawl and for
  hand-run writes.
- Guards that stay in CI: the route classification test, the prefetch request counts, and byte
  ceilings for Stats and player page HTML against the mock API. Timings are not asserted in CI.

**Done when:** the final table is recorded; every budget row is met or carries its recorded
floor; the docs are updated; the owner marks the blocks.

## Left alone

- Cache Components, Partial Prerendering and Next's fetch cache (D3).
- Redis or any other cache service, and extra API workers (D7).
- Live, Ask and account requests: always fresh.
- Cloudflare Speed Brain and speculation rules: the site navigates through the Next router, which
  SP03 already prefetches for.
