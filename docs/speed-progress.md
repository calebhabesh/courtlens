# Speed progress

Measured evidence for the [speed plan](speed-plan.md). Newest last.

## 2026-11-14 — Plan written; first measurements of the live site

No code changed. Timings are `curl --compressed` from the owner's PC against
`https://courtlens.calebhabesh.com` (Cloudflare edge YYZ), one to three runs each. They are a
first look, not the SP00 baseline: SP00 repeats them with `scripts/speed/measure.py`, five runs
each, and adds the local production build.

### Pages

| Page | First byte | HTML complete | Wire | Uncompressed |
| --- | --- | --- | --- | --- |
| `/` | 0.10 s | 0.10 s | | 49 KB |
| `/stats` | 0.05–0.08 s | 0.83–0.84 s | 118 KB | 2.2 MB |
| `/players` | 0.06–0.10 s | 0.63–0.65 s | 102 KB | 0.8 MB |
| `/players/2544` | 0.07 s | 1.1–1.8 s typical; 2.7 s and 4.9 s seen | 101 KB | 1.1 MB |
| `/players/1629029` | 0.07 s | 1.6 s, then 1.1 s | | |
| `/teams/1610612747` | 0.05–0.06 s | 1.4 s; 6.1 s on the first request | 77 KB | |
| `/compare` | 0.09 s | 3.5 s | 46 KB | |
| `/research/rapm` | 0.08 s | 0.30 s | 58 KB | |
| `/standings`, `/contracts` | 0.07–0.09 s | 0.07–0.09 s | 9 KB | |
| `/healthz` (network floor) | | 0.04–0.05 s | | |

Every page answers `cache-control: private, no-cache, no-store` and `cf-cache-status: DYNAMIC`.

### API reads behind a player page (second request unless noted)

| Read | Time |
| --- | --- |
| `/api/workbench/catalog` | 0.26–0.64 s |
| `/api/workbench/players/2544/career` | 3.4 s first request, 0.32 s after |
| `/api/workbench/players/203999/career` | 0.50 s first request, 0.23 s after |
| `/api/workbench/players/2544` (profile) | 0.19 s |
| `/api/workbench/players/2544/games` | 0.19 s |
| `/api/workbench/players/2544/bio` | 0.33–0.38 s |
| `/api/workbench/impact` (one player) | 0.42 s |
| `/api/workbench/metrics` | 0.05 s |
| `/api/workbench/teams/1610612747` | 0.14 s |
| `/api/workbench/teams/1610612747/schedule` | 0.14 s |
| `/api/workbench/teams` | 0.27 s |

### What the code does today

- 27 pages export `dynamic = "force-dynamic"`; `safeFetch`, `analyticsFetch` (`dashboard/lib/api.ts`)
  and `wbFetch` (`dashboard/lib/workbench-api.ts`) all pass `cache: "no-store"`. No `use cache`,
  `unstable_cache` or React `cache` anywhere in the dashboard.
- `dashboard/app/players/[id]/page.tsx` reads in waves: catalog; career (when the link has no
  season); profile and game log; then impact, hero (a `/api/workbench/query` POST), bio, career
  and the metric catalog. `dashboard/app/teams/[id]/page.tsx` reads the catalog, then six reads
  together.
- The API is one `uvicorn` process; all 261 route functions are synchronous. The engine uses
  SQLAlchemy's default pool with `pool_pre_ping` and `REPEATABLE READ`. Several services already
  memoise loaded files with `lru_cache`; no response is cached.
- `deploy/compose.prod.yml`: API 3 GB and 2 CPUs, with the note that the impact bundle peaks near
  2.3 GB while serving; dashboard 768 MB and 1 CPU; database 2 GB and 3 CPUs.
- `EntityAnchor` (`dashboard/components/entity-link.tsx`) passes `prefetch={false}`;
  `dashboard/e2e/site-links-prefetch.spec.ts` asserts zero entity prefetch requests. About 62
  other `<Link>` uses keep Next's default, which for these dynamic pages fetches only the shell.
- The catalog's `default_before_date` comes from the data (the season's last game date plus one
  day), not from the clock, so the catalog changes only when the data does.
- Jobs: `scheduled_jobs.run_job` writes a health record under `data/derived/job-health` when a
  job finishes; the API container mounts that directory read-only.

### Page weight

- `/stats`: 2,217,717 bytes of HTML for 52 `<tr>`, of which 916,163 bytes are inline script
  (the data repeated for React), in 29 script tags.
- `/players/2544`: 1,121,632 bytes of HTML; 19 JS files and 5 CSS files totalling 488,193 bytes
  compressed; 58 `<img>` tags, 55 lazy.

### Static files and images

- `/_next/static/*`: `public, max-age=31536000, immutable`, `cf-cache-status: HIT`.
- Portrait (`/api/workbench/players/2544/portrait?size=288&crop=face-v6`): `public, max-age=86400`
  but `cf-cache-status: DYNAMIC`, 0.14 s, 20.6 KB WebP.
- `/team-logos/<id>-<hash>.svg` and `/flags/us.png`: `public, max-age=14400` although the logo
  name carries a content hash.

### Cloudflare

Read with the `cf` CLI, nothing changed. The zone is `calebhabesh.com` on the Free plan and
holds only Cloudflare's managed rulesets (normalisation, managed firewall, DDoS): no cache rules.
Responses advertise HTTP/3 and arrive `zstd`-compressed. Early Hints, 0-RTT and tiered cache
settings were not read; SP07 records them.

### Not looked at

Query plans and indexes (no database was queried), real browser timings (curl only, one
location), the dashboard's render time on its own, and requests from far regions.


## 2026-11-14 — SP00 built: measuring tools and baseline

### What was built

- `scripts/speed/urls.json`: the fixed set. 12 pages: `/`, `/stats`, `/players`, `/teams`,
  `/standings`, `/compare?playerA=2544&playerB=203999`, three player pages (LeBron James 2544,
  current star; 1643411, the 2026-27 rookie with the most points; Larry Bird 1449, a career wholly
  before 2000), two team pages (Lakers, Celtics) and `/research/rapm`. Each page that renders data
  names an `expect` marker (the release id, or the impact serving version on RAPM) that measure.py
  requires in the HTML. 32 API GETs (`api`): every GET the player and team pages make, exactly as
  the dashboard sends them. 46 reads (`snapshot`): every read behind all 12 pages, with the 7
  `/api/workbench/query` POST bodies. `{releaseId}`, `{season}` and `{beforeDate}` stand for the
  target's release and default scope.
- `scripts/speed/measure.py`: GETs each URL five times in a row, one request at a time, through
  `curl --compressed` (a new connection per run). Records first byte, total, connect and TLS time,
  wire bytes, decoded bytes, status, `x-cache`, `cf-cache-status`, `cache-control`,
  `server-timing` and whether the page's `expect` marker is present; writes
  `docs/evidence/speed/<block>/measure-<label>-<UTC stamp>.json` and prints the median table. A
  missing marker or failed run is flagged in the table and makes it exit 1.
- `scripts/speed/snapshot.py`: `--out` pins the API's current release and default scope, fetches
  the 46 reads and stores status, SHA-256 of the canonical JSON (sorted keys, no whitespace) and
  SHA-256 of the raw bytes; `--compare` reuses the stored pins and exits 1 on any status or
  canonical difference (`--bytes` also on raw bytes). Each read carries the release (`releaseId`,
  `snapshotId`, or the query body's `release_id`/`before_date`) wherever its endpoint accepts one;
  the tool refuses an entry that is neither pinned nor explains why.
- `scripts/speed/capture_reads.py` (not in the plan; added): a recording proxy that lists the
  API reads each page's server render makes. The `api` and `snapshot` sections came from it, and
  SP04 needs the same list. Output: `page-reads-local.json`.
- `dashboard/e2e/speed-navigation.spec.ts`: four journeys (Stats row → player, player header →
  team, header nav → Stats, Back), timed in the page from the click's (or popstate's) event time
  to the first animation frame where the destination shows: its URL, no `aria-busy` skeleton, no
  hidden staged copy, a filled `main h1` and the journey's own content. Logs `SPEED_NAV {json}`.
  Against the fixture API it asserts today's request counts: no document load, one RSC request
  per click, none for Back. With `SPEED_REAL=1` it runs the journeys `SPEED_RUNS` times (default 5),
  logs `SPEED_NAV_SUMMARY` and writes `SPEED_NAV_OUT`. Timings are never asserted.
- API `Server-Timing` on every response (`src/courtlens/api/server_timing.py`, wired in
  `observe_request`): `total;dur=…, db;dur=…, queries;desc="N"`. The middleware binds a mutable
  holder to a ContextVar before calling the route; the route's worker thread runs in a copy of that
  context and SQLAlchemy cursor events (installed on `Engine` once, in `create_app`) add to the
  holder. `total` stops when the response starts, so a streamed body's later queries are not in it.
  Example from the local API on real data:
  `GET /api/workbench/catalog` → `server-timing: total;dur=2742.7, db;dur=444.6, queries;desc="10"`
  (first request after start).

### Baseline

Live: `https://courtlens.calebhabesh.com` from the owner's PC, two full passes
(2026-11-15 04:43 and 04:45 UTC), release `a8e9ec80…`, scope 2026-27 before 2026-11-14. Every
response `cf-cache-status: DYNAMIC`. Local: production build (`next build`, Turbopack, as the
image builds) of this branch on :3180 and its API on :8180 on the PC's database copy, release
`71639af2…`, scope 2026-27 before 2026-11-13; the API process had already served the set (no
response cache exists, but its file memoisation was warm, as on the long-running live API).
Medians of five runs; "slowest" is the worst of all ten live runs.

| Page | Live total, run 1 / run 2 (median) | Live slowest of 10 | Live first byte | Live wire / decoded | Local total (median) | Local decoded |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 50 ms / 45 ms | 63 ms | 50 ms | 7.7 KB / 49 KB | 4 ms | 36 KB |
| `/stats` | 0.69 s / 0.80 s | 4.49 s | 68 ms | 118 KB / 2,218 KB | 0.17 s | 2,170 KB |
| `/players` | 0.51 s / 0.52 s | 1.18 s | 69 ms | 102 KB / 793 KB | 0.16 s | 748 KB |
| `/teams` | 0.29 s / 0.28 s | 0.64 s | 62 ms | 20 KB / 159 KB | 72 ms | 248 KB |
| `/standings` | 51 ms / 61 ms | 89 ms | 50 ms | 9.0 KB / 58 KB | 7 ms | 190 KB |
| `/compare?playerA=2544&playerB=203999` | 1.78 s / 1.78 s | 2.13 s | 64 ms | 54 KB / 535 KB | 0.46 s | 533 KB |
| `/players/2544` | 1.59 s / 1.61 s | 4.45 s | 56 ms | 100 KB / 1,122 KB | 0.40 s | 1,131 KB |
| `/players/1643411` | 0.81 s / 0.81 s | 3.87 s | 66 ms | 40 KB / 362 KB | 0.30 s | 344 KB |
| `/players/1449` | 1.36 s / 0.97 s | 9.10 s | 65 ms | 62 KB / 743 KB | 0.28 s | 739 KB |
| `/teams/1610612747` | 1.73 s / 1.77 s | 1.98 s | 54 ms | 77 KB / 1,195 KB | 0.38 s | 1,308 KB |
| `/teams/1610612738` | 1.33 s / 1.31 s | 4.81 s | 60 ms | 74 KB / 1,081 KB | 0.35 s | 1,198 KB |
| `/research/rapm` | 0.16 s / 0.16 s | 0.31 s | 45 ms | 58 KB / 645 KB | 40 ms | 668 KB |

| API read | Live total, run 1 / run 2 (median) | Live decoded | Local total (median) | Local db time (median) | Queries |
| --- | --- | --- | --- | --- | --- |
| workbench-catalog | 0.29 s / 0.25 s | 66 KB | 78 ms | 48 ms | 6 |
| player-career-2544 | 0.32 s / 0.30 s | 235 KB | 0.11 s | 65 ms | 12 |
| player-profile-2544 | 0.18 s / 0.17 s | 5.5 KB | 50 ms | 27 ms | 9 |
| player-games-2544 | 0.17 s / 0.16 s | 8.6 KB | 47 ms | 28 ms | 8 |
| workbench-metrics | 45 ms / 37 ms | 107 KB | 1 ms | 0 ms | 0 |
| workbench-impact-2544 | 78 ms / 77 ms | 25 KB | 2 ms | 0 ms | 1 |
| workbench-impact-2544-2025-26 | 74 ms / 68 ms | 25 KB | 12 ms | 0 ms | 1 |
| player-bio-2544 | 0.51 s / 0.39 s | 92 KB | 0.12 s | 34 ms | 18 |
| player-career-1643411 | 0.21 s / 0.19 s | 15 KB | 60 ms | 52 ms | 12 |
| player-profile-1643411 | 0.11 s / 0.12 s | 5.5 KB | 30 ms | 24 ms | 9 |
| player-games-1643411 | 0.18 s / 0.16 s | 9.3 KB | 46 ms | 26 ms | 8 |
| workbench-impact-1643411 | 65 ms / 72 ms | 24 KB | 2 ms | 0 ms | 1 |
| player-bio-1643411 | 75 ms / 68 ms | 1.3 KB | 0.12 s | 34 ms | 18 |
| player-career-1449 | 0.27 s / 0.24 s | 113 KB | 81 ms | 57 ms | 12 |
| player-games-1449-1991-92 | 0.12 s / 0.12 s | 33 KB | 35 ms | 26 ms | 7 |
| player-profile-1449-1991-92 | 0.14 s / 0.13 s | 5.5 KB | 37 ms | 25 ms | 9 |
| workbench-impact-1449-1991-92 | 41 ms / 42 ms | 1.6 KB | 2 ms | 0 ms | 1 |
| workbench-impact-1449-1990-91 | 49 ms / 46 ms | 1.6 KB | 2 ms | 0 ms | 1 |
| workbench-impact-1449-1989-90 | 43 ms / 41 ms | 1.6 KB | 2 ms | 0 ms | 1 |
| workbench-impact-1449-1988-89 | 47 ms / 38 ms | 1.6 KB | 2 ms | 0 ms | 1 |
| player-bio-1449-1991-92 | 0.25 s / 0.24 s | 54 KB | 38 ms | 26 ms | 15 |
| team-schedule-1610612747 | 0.11 s / 0.11 s | 6.5 KB | 30 ms | 26 ms | 4 |
| team-detail-1610612747 | 0.14 s / 0.12 s | 5.9 KB | 34 ms | 27 ms | 5 |
| team-peers-1610612747 | 0.18 s / 0.16 s | 9.2 KB | 53 ms | 45 ms | 4 |
| workbench-teams-six-factors | 0.21 s / 0.18 s | 50 KB | 62 ms | 47 ms | 6 |
| workbench-teams-six-factors-away | 0.18 s / 0.19 s | 43 KB | 61 ms | 47 ms | 6 |
| workbench-teams-six-factors-home | 0.21 s / 0.20 s | 44 KB | 61 ms | 47 ms | 6 |
| workbench-workspace | 41 ms / 41 ms | 1.1 KB | 2 ms | 0 ms | 1 |
| workbench-draft-classes | 40 ms / 49 ms | 0.8 KB | 2 ms | 1 ms | 1 |
| team-schedule-1610612738 | 0.11 s / 0.10 s | 6.1 KB | 29 ms | 26 ms | 4 |
| team-peers-1610612738 | 0.18 s / 0.17 s | 9.2 KB | 55 ms | 46 ms | 4 |
| team-detail-1610612738 | 0.12 s / 0.12 s | 5.5 KB | 33 ms | 27 ms | 5 |

Local db time and query counts come from the new `Server-Timing` header; the live API does not
send it until SP00 is deployed.

Click to content on the local stack (`SPEED_REAL=1`, five runs, Chromium 1440×900):

| Journey | Median | Min to max | RSC requests after the click |
| --- | --- | --- | --- |
| Stats row → player | 665 ms | 459 ms to 1,523 ms | 1 |
| Player header → team | 605 ms | 569 ms to 659 ms | 1 |
| Header nav → Stats | 444 ms | 410 ms to 475 ms | 1 |
| Back (Stats → team) | 193 ms | 185 ms to 204 ms | 0 |

The navigation spec was not run against the live site.

### Snapshot tool checks

- Snapshot, then `--compare --bytes` twice in a row against the same API process: no
  differences both times (46 reads, all 200).
- A snapshot with one hash altered: `--compare` reports that read and exits 1.
- Server-Timing changes no body: an API built from `HEAD` (no Server-Timing) and one with it, both
  `PYTHONHASHSEED=0`, on the same database: `--compare --bytes` finds no differences, raw bytes
  included.
- **Found:** two API processes of the *same* code return the same canonical JSON but different raw
  bytes for the 4 query reads whose rows carry `table_percentiles`, because that object's key order
  follows set iteration, which changes with Python's per-process string hash seed. So compare
  across API restarts with the default canonical check; `--bytes` holds only within one process (or
  with a fixed `PYTHONHASHSEED`). It matters for SP01: a cached body is byte-stable, a recomputed
  one after a restart is not.
- 16 of the 46 reads take no release: workspace, metric catalog, draft classes and
  `/api/six-factor` take neither release nor date; bio and impact take `beforeDate` (pinned) but no
  release. A data refresh between two snapshots could change those 16. The tool lists them on every
  run.

### Where this differs from the first look and the plan

- **Compare is 1.78 s, not 3.5 s** (both passes, all ten runs 1.71–2.13 s). RAPM is 0.16 s, not
  0.30 s. Stats (0.69–0.80 s), the Players index (0.51 s), LeBron's page (1.59–1.61 s) and the
  catalog (0.25–0.29 s) match the first look.
- **The Lakers page is 1.73–1.77 s, not 1.4 s**; Celtics 1.31–1.33 s.
- **Team pages make 12 reads in two waves, not "the catalog, then six reads together".** After the
  six team reads, the embedded roster table runs the Stats path: workspace, the catalog a second
  time, the metric catalog, draft classes and a `/api/workbench/query` POST.
- **Player pages make 8 to 11 reads, not about eight.** Bird's makes 11: impact once per season
  shown (four seasons).
- **The slow first request recurs.** Slow runs are mostly a URL's first: LeBron's career read
  took 1.10 s in the first pass and 3.44 s at the start of the second, two minutes later; Bird's
  page took 9.1 s then 3.2 s in the first pass. So the 3.4 s "first career read" is not only once
  per API start. Not diagnosed (SP04).
- **Live reads cost 3–4× their local time.** About 40 ms of that is the network floor (the 2 ms
  workspace read takes 41 ms live). The rest points at the VPS's slower CPU and disk; locally the
  database is most of each read (career 1643411: 52 of 60 ms).
- **Standings is 58 KB decoded, 9 KB on the wire.** The first look's 9 KB was the wire size.

### Limits of this baseline

- Local and live do not run the same code or data. This branch is 14 commits ahead of the
  deployed `main` (site links, loading skeletons, player-page changes), so `/teams` and
  `/standings` are heavier locally. The PC's copy is a day older, and its impact bundle has no
  2026-27 fits, so local current-season impact reads return the 1.6 KB "unavailable" body
  (live: 25 KB); `player-bio-1643411` also differs (live 1.3 KB, local 7.4 KB). Compare blocks
  against their own target, never local against live.
- curl negotiates HTTP/2; browsers use HTTP/3 on the live site.
- Evidence file names carry UTC stamps (2026-11-15T04…Z = the evening of 2026-11-14 local).

### Rerun

```bash
scripts/speed/measure.py --base https://courtlens.calebhabesh.com --label live --out-dir docs/evidence/speed/<block>
scripts/speed/measure.py --base http://localhost:3180 --api-base http://localhost:8180 --label local --out-dir docs/evidence/speed/<block>
scripts/speed/snapshot.py --api http://localhost:8180 --out "$TMPDIR/before.json"
scripts/speed/snapshot.py --api http://localhost:8180 --compare "$TMPDIR/before.json"
# dashboard server reads through a recording proxy on :8181:
scripts/speed/capture_reads.py --api http://localhost:8180 --listen 8181 --dashboard http://localhost:3180 --out <file>
# in a sandbox copy of dashboard/ with a production build on :3180:
SPEED_REAL=1 SPEED_NAV_OUT=<file> PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3180 \
  npx playwright test e2e/speed-navigation.spec.ts
```

### Checks

- `ruff check .`, `ruff format --check .`: pass. `mypy src/courtlens`: no issues (408 files);
  `mypy --strict scripts/speed/*.py`: no issues.
- `npm --prefix dashboard run lint` (ESLint + Stylelint) and `run typecheck`: pass.
- Vitest: 146 files, 1,061 tests passed.
- pytest: `tests/unit/test_server_timing.py`, 6 passed (sync route query count, no leak between
  requests, zero for routes without queries and unknown paths, failed statement, queries outside a
  request, header format). Every unit test file that drives the app through a TestClient (25
  files): 365 passed, 8 failed. The 8 are the `[anthropic]` cases in `test_agent_providers.py`,
  and they fail the same way with `HEAD`'s source.
- Playwright (production webpack build in a sandbox, fixture API :4180, dashboard :3181):
  `speed-navigation.spec.ts` and `site-links-prefetch.spec.ts`, `--repeat-each=3`: 9 passed.
  `speed-navigation.spec.ts` with `SPEED_REAL=1` on the local real-data stack: passed.
- Full pytest and full Playwright suites were not run (plan: once before each gate).


## 2026-11-15 — SP01 built: API read cache and data stamp

### Writers of served data (listed before choosing the stamp)

| Writer | Writes | How the cache follows it |
| --- | --- | --- |
| `jobs` service, `rosters` (`refresh-espn-rosters`, every 6 h) | `data/derived/espn-rosters-v1` | job health: start and finish change the stamp; nothing `stamp` is stored while it runs |
| `jobs`, `daily` (`refresh-daily`: player index, season stats + release publication, position estimates, team scoring, contracts, player reference marts, DARKO, Wikipedia transactions, Win Probability ratings, Projected Impact score) | database (statistics release, `published_snapshots`), many `data/derived/*` bundles | job health, as above; the publication also moves `published_snapshots` |
| `jobs`, `lineups` (`refresh-season-lineups`) | stints, stint box, WOWY (`.current` pointers) | job health; `.current` pointers |
| `jobs`, `season-impact` (`refresh-season-impact`, weekly) | impact bundle (`.current`) | job health; `.current` pointers |
| `jobs`, `metric-backtest`, `player-pages` (`acquire-bbref-bios`, about 2 h), `college-schools` | serving JSON, bio tables row by row, college bundle | job health (bios change row by row, hence the running rule) |
| `win-probability-seal` (every 30 min on game days) | `data/derived/win-probability-serving`, `data/raw/espn-wp` | read only by `/api/win-probability*` (`short`, 30 s) and `/api/live*` (`never`); checked by import graph |
| `demo-reset` (08:00 UTC) | demo account favourites | `/api/me*`, account routes: `never`, and credentialed (`bypass`) |
| API writes (Ask, accounts, workspace, saved analyses, fantasy) | their own tables | every read of them is `never` |
| `migrate` (each deploy) | schema | a deploy starts a new API process: new generation, empty cache |
| Hand-run CLI on the VPS (`exec jobs courtlens …`, e.g. `acquire-wikipedia-contracts`), `scripts/restore.sh`, the PC's `worker.py` | anything | `courtlens bump-data-stamp` (new); a publication or rollback also moves `published_snapshots`; else at most 6 h stale |
| `scripts/pull-from-vps.sh` (PC only) | the PC's whole `data/` and database | the cache is off on the PC by default; with it on, restart the API or bump |
| The clock | `contract_spans` (player bio) and free agency compare against `date.today()`; forecasts against the Eastern date; data status, player form and the legacy schedule against `now` | today's date (local and Eastern) is in the stamp; `now` readers are `short` |

**Stamp inputs chosen:** SHA-256 over `published_snapshots` (channel, snapshot, published_at);
every `data/derived/*/.current` and `data/derived/*/*/.current`; each `scheduled_jobs.JOBS` entry's
`last_started` and `last_finished`; the `data-stamp-bump` file in `data/derived/job-health`; and
today's date, local and Eastern. Read lazily, at most every 5 s (one small query plus a few file
reads, in the thread pool, on whichever request finds it due). **Added to the plan:** while any
job's `last_started` is newer than its `last_finished` (and younger than its timeout plus 10 min),
`stamp` reads are served uncached (`bypass`), because jobs write as they go and record their finish
last. A job's start empties the cache (within 5 s) and so does its finish.

### Credential headers

Every header the API reads (grep of `Header(`, `request.headers`, `HTTPBearer`, cookies, plus the
dashboard proxies): `Authorization` (`HTTPBearer`, operator access), `X-Operator-Token`
(workspace, conversations, finance import), `X-CourtLens-Account-Token` and `X-CourtLens-Client`
(account proxy), `X-CourtLens-Ask-Token`, `X-CourtLens-Visitor` and `X-CourtLens-Client` (public
Ask). The API reads no cookie; `Cookie` is bypassed anyway. A request carrying any of the seven is
`bypass`. The dashboard's server reads send none of them (`dashboard/lib/api.ts`,
`workbench-api.ts`). `X-Request-ID` is read but only echoed. `request.client.host` is read only
by operator and account checks (`never` routes).

### What was built

- `src/courtlens/api/read_cache.py`: the classes (`ROUTE_CLASSES`: 125 `stamp`, 10 `short`, 53
  `never`, covering all 188 GETs and Caddy-allowed POSTs), the route walk, the stamp, the LRU store
  and a pure ASGI middleware, plus `GET /api/cache/status` (`never`: entries, bytes, hits, misses,
  bypasses, evictions, stamp, running jobs, generation). Off unless `COURTLENS_READ_CACHE`;
  `COURTLENS_READ_CACHE_MAX_BYTES` (default 128 MiB). On in `deploy/compose.prod.yml` for `api`
  only.
- `courtlens bump-data-stamp`; one line added to the contract-terms hand run in
  `docs/deployment.md`, since that run is still owed on the VPS.
- Stored: complete status-200 `application/json` responses up to 4 MiB whose only headers are
  content headers (so `Cache-Control: no-store` routes never store), and only when FastAPI's
  dispatched route (`scope["route"]`) is the route the class came from and the generation did not
  change during the request. Key: method, root path, path, query pairs sorted by name (repeated
  names keep their order, as Starlette parses them), and for a POST the content type and body
  SHA-256 (bodies over 1 MiB bypass).
- A hit sends the stored body, `content-type`, a computed `content-length` and `X-Cache: hit`;
  `X-Request-ID` and `Server-Timing` are fresh (a hit reads `db;dur=0.0, queries;desc="0"`, except
  the request that rechecks the stamp, which shows its 1 query). Prometheus labels the hit with
  its route.

### Where this differs from the plan and the handoff

- **Position:** a pure ASGI middleware directly around the router, not code inside the
  `@app.middleware("http")` function. Inside the outer function a hit would skip CORS (browser reads
  would lose `Access-Control-Allow-Origin`). Where it sits, a hit still never enters the thread
  pool, and the outer middleware gives it a fresh request id and Server-Timing for free.
- **Store on the last chunk.** The first version stored after `await app(...)` returned. Behind
  the outer `BaseHTTPMiddleware` that runs only after the client has the whole body, so a quick
  second request missed (career reads did, every time). It now stores before forwarding the last
  chunk; `test_entry_is_stored_before_the_client_gets_the_last_chunk` fails on the old code.
- **`GET /api/job-health` is `never`, not `short`:** it sends `Cache-Control: no-store`, which the
  cache honours. The legacy `/api/schedule/week`, `/api/players`, `/api/players/{id}/form` and
  player-game lineage are `short` (clock or tables no job owns). Portrait, media and logo routes
  are `never` (binary).
- **Running-job rule and today's date in the stamp** (above): not in the plan.
- **Route walk:** `app.routes` holds `_IncludedRouter` branches; the walk recurses through
  `effective_candidates()` and finds 232 routes (228 decorated + 4 on the app; 233 with the status
  route), every OpenAPI operation among them. The progress log's "261 route functions" counted
  every module-level function in the routers (266 today), not routes.

### Snapshot comparisons (`snapshot-compare.txt`)

**Found, pre-existing, not fixed:** with the cache off, two runs of the team six-factor reads
(`workbench-teams-six-factors`, `-home`, `-away`) differ in the last digits of `sos` and `adj_net`
(e.g. `12.266686692388026` vs `…030`). `load_context_team_games` orders by
`(game_date, game_id)` with no tiebreak, so a game's two team rows arrive in either order and the
float sums change order. Displayed values are unaffected. SP00's two runs happened to agree. A
cache freezes one of the answers until the stamp changes. Left for SP04 or the owner (fixing the
order changes stored hashes).

| Comparison | Canonical | At 12 significant digits | Raw bytes |
| --- | --- | --- | --- |
| Cache off vs cache-off snapshot (new process) | 1 difference: six-factors jitter | 0 of 46 | |
| Cache on, cold (new process) | 1 difference: six-factors jitter | | |
| Cache on, warm (same process; 45 hits) | 1 difference: six-factors jitter | 0 of 46 | |
| Cache on: hit vs the miss it stored (`--out` cold, `--compare --bytes` warm) | 0 | | 0 of 46 |

### Before and after (local production stack)

Same recipe as SP00: production build of this branch on :3180, its API on :8180 on the PC's data
(release `71639af2…`, scope 2026-27 before 2026-11-13). Before: cache off, API memoisation warm.
After, cold: one run on a fresh API process (empty cache, cold memoisation). After, warm: five runs
after one warm-up pass. Medians.

| Page | Before (cache off) | After, cold (1 run) | After, warm |
| --- | --- | --- | --- |
| `/` | 10 ms | 6 ms | 7 ms |
| `/stats` | 321 ms | 2.34 s | 81 ms |
| `/players` | 286 ms | 334 ms | 47 ms |
| `/teams` | 131 ms | 19 ms | 15 ms |
| `/standings` | 17 ms | 13 ms | 13 ms |
| `/compare` | 806 ms | 1.11 s | 35 ms |
| `/players/2544` | 752 ms | 414 ms | **65 ms** |
| `/players/1643411` | 536 ms | 403 ms | **29 ms** |
| `/players/1449` | 477 ms | 396 ms | **41 ms** |
| `/teams/1610612747` | 436 ms | 263 ms | 65 ms |
| `/teams/1610612738` | 376 ms | 135 ms | 60 ms |
| `/research/rapm` | 40 ms | 49 ms | 40 ms |

API reads: every read in the set fell from 26–135 ms (cache off) to a 1 ms median served from the
cache, except `workbench-workspace` (`never`, 2–4 ms). On the second request every `stamp` read
reported `X-Cache: hit` with `Server-Timing` total 0.1–0.2 ms (`second-request-local.json`; the
stamp recheck adds about 3–4 ms to one request every 5 s).

Today's "before" player pages (0.48–0.75 s) are slower than SP00's local 0.28–0.40 s on the same
code; the machine was busier. The comparison above is within one session.

Click to content (`SPEED_REAL=1`, cache on, five runs; SP00's local numbers beside):

| Journey | SP01 median (min to max) | SP00 median |
| --- | --- | --- |
| Stats row → player | 152 ms (148–463) | 665 ms |
| Player header → team | 290 ms (275–524) | 605 ms |
| Header nav → Stats | 226 ms (213–239) | 444 ms |
| Back (Stats → team) | 199 ms (172–232) | 193 ms |

### Memory (`memory-fill-local.json`)

A fresh API process (cache on) served the page set, every season's impact table (2014-15 to
2025-26, loading the impact bundle), then 11,000 real player reads (profile, game log, impact,
bio, career for every player of 12 seasons), four at a time, until 2,000 evictions:

| Point | API RSS | Cache |
| --- | --- | --- |
| After start | 250 MB | empty |
| After the page set and impact bundle | 1,014 MB | 8 MiB, 58 entries |
| Cap reached (5,500 reads) | 1,168 MB | 127.9 MiB, 4,355 entries |
| End (11,000 reads, 2,199 evictions) | 1,178 MB | 128.0 MiB, 6,332 entries |

The full cache costs about 165 MB of resident memory over the loaded bundle (128 MiB of entries
plus Python overhead, and whatever else 11,000 distinct reads memoised). RSS stayed flat once the
cap held. **Limit:** the PC's impact bundle has no 2026-27 fits, so it is smaller than live; the
VPS measured 2.3 GB peak with its bundle. 2.3 GB + about 0.17 GB ≈ 2.5 GB, under the 3 GB limit by
about 0.5 GB. This is an estimate for the VPS, not a VPS measurement; G1 should read
`docker stats` after the cache fills.

### Checks

- pytest `tests/unit/test_read_cache.py`: 33 passed (hit bytes identical with fresh request id,
  timing and CORS; scope and body keys; stamp change empties; running job stores nothing; stamp
  unreadable serves uncached; each of the seven credential headers bypasses; 30 s and 6 h ages;
  404, `no-store` and non-JSON not stored; oversized served, not stored; LRU byte bound; store
  before the last chunk; the walk finds every OpenAPI operation; every GET and allowed POST
  classified, no stale class; an unclassified route fails the check; allowed POSTs match
  `deploy/Caddyfile`; wiring and off by default; stamp follows each writer; dead job stops counting;
  bump).
- Every unit test file that drives the app (21 files): 330 passed, 8 failed — the 8 `[anthropic]`
  cases in `test_agent_providers.py`, red before SP00.
- `ruff check .`, `ruff format --check .`: pass. `mypy src/courtlens`: no issues (409 files).
- `npm --prefix dashboard run lint` and `run typecheck`: pass (no dashboard file changed).
- Playwright `speed-navigation.spec.ts` with `SPEED_REAL=1` on the local stack: passed. The
  fixture-API runs of it and `site-links-prefetch.spec.ts` were not rerun: no dashboard file changed.
  Vitest not run for the same reason.
- `docker compose -f deploy/compose.prod.yml config`: `COURTLENS_READ_CACHE` set on `api` only.
- Full pytest and Playwright suites not run (plan: before each gate). Not deployed; no live run.


## 2026-11-15 — SP02 built: warm crawl after each data change

### What was built

- `courtlens warm-site` (`src/courtlens/services/warm_site.py`): requests pages from the dashboard
  (`COURTLENS_WARM_BASE_URL`, `http://dashboard:3000` in `deploy/compose.prod.yml`) two at a time,
  with no cookies (a cookie jar whose policy accepts none) and none of the seven
  `CREDENTIAL_HEADERS`, redirects not followed, 30 s per request, 1,200 s deadline. It stops after
  5 server errors (5xx, timeout or refused) in a row. It writes `data/derived/job-health/warm-site.json`
  (outcome, generation before and after, pages, failures, median and slowest time, crawl seconds,
  cache counters before and after, roster source). Reports go to stderr; stdout stays empty. It
  exits 1 unless the outcome is `complete` or `skipped`.
- **URL list: 567 pages** on the PC's data. 16 top-level pages, 30 team pages and 521 roster players:
  - The top-level pages are the header's direct links and the menu pages whose route is
    `force-dynamic`: `/`, `/stats`, `/wowy`, `/stat-line-shift`, `/playoffs`, `/last-games`,
    `/showcase`, `/players`, `/teams`, `/standings`, `/roster-shapes`, `/contracts`,
    `/free-agency`, `/compare`, `/team-compare` and `/methodology`.
  - Team pages are `/teams/<NBA team id>`, as `teamHref(id)` builds with no scope.
  - Player pages are `/players/<id>`, as `playerHref(id)` builds with no scope. The players come
    from the newest sealed ESPN roster bundle (`espn_rosters.load_latest()`, the source Free Agency,
    Live and Win Probability read). The bundle lists 522 players; 521 have a verified NBA id. ESPN
    players without one have no page and are skipped.
  - No URL carries a query string.
- **Generation check.** `/api/cache/status` now rechecks the stamp when its last check is more than
  5 s old, as any cached read does. Before this change it returned the last reading, which no
  request had refreshed. The crawl runs only on a settled generation:
  1. If `running_jobs` is not empty, it skips the run (no wait; the next loop retries).
  2. Otherwise it reads the generation again 6 s later. It crawls once two readings agree, with up
     to 10 tries.
  3. It crawls only when that generation differs from its last record's, or when the last outcome
     was not `complete` or `partial`.
  4. After the crawl it waits 6 s and reads the generation again. If the generation moved, the
     outcome is `stale` and the next loop crawls again.
- **The stamp never moves for the crawl.** warm-site is not a `scheduled_jobs.JOBS` entry. Its
  record is `warm-site.json`, which is not a job's file and not the bump file, so `read_data_stamp`
  never reads it. A test runs a whole crawl that writes its record into the stamp's health
  directory (with `last_started`/`last_finished` fields added) and expects the same stamp. On the
  local stack, a second `warm-site` right after a crawl skipped in 6 s with
  `generation already warmed`, and the generation and stamp did not change
  (`warm-site-second-run-skip.txt`).
- **Jobs loop** (`deploy/compose.prod.yml`): after `wait=$(courtlens run-jobs --next-wake | tail -n 1)`
  the loop runs `timeout 1500 courtlens warm-site >&2 || echo …`, takes the crawl's time off the
  sleep, and sleeps at least 1 s, so a crawl never shifts a job's wake time. A stubbed dry run of the
  rendered loop under `sh` gave a wake of 120 s, a 2 s crawl and a 118 s sleep. With the crawl
  failing, the loop logged `warm-site did not complete` and kept going. The jobs service gets
  `COURTLENS_WARM_BASE_URL` and `COURTLENS_WARM_API_URL` (`http://api:8000`).
- `scripts/speed/sample_proc.py` (not in the plan; added): samples VmRSS and CPU from `/proc`, for
  the resource figures below.

### Local run (`docs/evidence/speed/sp02/`)

Same recipe as SP00 and SP01: production build of this branch on :3180, its API on :8180 with
`COURTLENS_READ_CACHE=true`, on the PC's data (release `71639af2…`, scope 2026-27 before
2026-11-13). Both processes were started fresh for the first crawl.

| Run | Pages | Crawl | Whole command | Median page | Slowest page | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Fresh API and dashboard (as after a deploy) | 567, all 200 | 118.9 s | 131.0 s | 0.374 s | `/stats` 4.57 s | complete |
| After `bump-data-stamp` (as after a job) | 567, all 200 | 118.3 s | 130.3 s | 0.392 s | `/players/1631260` 1.67 s | complete |

The extra ~12 s is the readiness check, the 6 s settle and the 6 s final recheck.

**Cache** (`cache-status-*.json`; cap 134,217,728 bytes):

| Point | Entries | Bytes | Evictions | Misses (cumulative) |
| --- | --- | --- | --- | --- |
| Before the crawl after the bump (emptied) | 0 | 0 | 0 | 3,723 |
| After that crawl | 3,716 | 82,958,367 (79.1 MiB, 62 % of the cap) | 0 | 7,444 |
| After `measure.py` loaded every warmed page twice | 3,716 | 82,958,367 | 0 | 7,450 |

The crawl fits with 49 MiB to spare. On the VPS it will be larger: the PC has no 2026-27 impact fits,
so each current player's impact read is 1.6 KB here and about 25 KB live. That adds about
521 × 23 KB ≈ 12 MB, for an estimated 91 MiB, still under the cap. This is an estimate, not a VPS
measurement.

**No new misses** (`measure-local-warmed-…json`): `measure.py --only pages --runs 2` over the 567
crawled pages (`urls-warmed.json`) gave 1,134 loads, all 200. Hits rose from 2,530 to 12,499 and
misses from 7,444 to 7,450. All 6 misses are the 3 reads that return 404 for one roster player,
Richie Saunders (1643563, MEM, matched by unique name). The PC's release has no 2026-27 row for him:
profile, game log and the legacy `/api/analytics/players/1643563?date=1983-10-28…`. A non-200 is
never stored, so those 3 reads miss on every visit. His page still answers 200 with its fallback.
No storable read missed. Page times from the cache:

| Pages | Median | Worst median | Slowest single run |
| --- | --- | --- | --- |
| 521 player pages | 17 ms | 48 ms | 73 ms (`/players/203500`) |
| 30 team pages | 32 ms | 38 ms | 46 ms |
| 16 top-level pages | 8 ms | 55 ms (`/showcase`) | 58 ms (`/stats`) |

**Peak CPU and memory during the crawl** (`resources-*.json`, sampled every 0.5 s; CPU is percent
of one core):

| Run | API RSS start → peak | API CPU peak | Dashboard RSS start → peak | Dashboard CPU peak |
| --- | --- | --- | --- | --- |
| Fresh processes | 250 → 1,678 MB | 118 % | 121 → 493 MB | 68 % |
| After the bump | 1,627 → 1,749 MB | 98 % | 483 → 596 MB | 74 % |

Limits: API 3 GB and 2 CPUs, dashboard 768 MB and 1 CPU. The API stays well inside its limit. The
dashboard is the tight one: 596 MB is 78 % of 768 MB. Its RSS grew from 493 MB to 596 MB on the
second crawl rather than returning to its start, so it is Node's heap settling, not yet a measured
ceiling. The live pages are larger and the VPS is slower, so **G1 should read
`docker stats courtlens-dashboard-1` during the first crawl after deploy.** On the VPS, two requests
at a time will probably keep the dashboard's one CPU busy for the whole crawl. Live reads cost 3–4×
their local time, so the crawl is estimated at 6–8 minutes there, inside the 1,200 s deadline.

### What stays cold

The crawl fetches HTML, so it warms only the reads each page's server render makes.
`client-reads-local.json` lists every read the browser made after load on 35 pages (Playwright,
`client-reads.mjs`, with the build's browser API base `localhost:8000` rerouted to the local API).
After the crawl these were still misses, so the first visitor pays for them:

- **Player pages:** 6 `POST /api/workbench/query` reads from the browser. They are shared across
  players of a scope: on `/players/1643411` they were already hits after `/players/2544`.
- **Server-rendered pages:**
  - `/teams`: `teams/six-factors`
  - `/wowy`: `operations/wowy-combos`
  - `/stat-line-shift`: `POST operations/stat-shift-roster`
  - `/last-games`: the default player's game log, team schedule and `teams`
  - `/roster-shapes`: `roster-shapes` (twice) and `teams/six-factors` for 2025-26
  - `/contracts`: `finance/refreshes`
  - `/free-agency`: `operations/free-agency`
- **Static pages** (no server data; left out of the crawl because their HTML warms nothing): every
  Research page, `/forecasts`, `/wingspan`, `/draft`, `/calculator`, `/matchups` and
  `/similar-players`. All of their reads come from the browser (for example `/api/zts*`,
  `/api/shot-aftermath*`, `/api/lineup-model*`, `/api/six-factor*`, `/api/draft*`).
- `never` reads stay uncached by design: account, workspace, Live standings and schedules,
  portraits, college logos.

Warming the browser reads would mean requesting API reads directly, not pages. That is outside the
plan's D5 ("filled by the same code visitors use"); the owner decides at G1 whether it is worth a
block. SP04 (two waves, slow reads) also shortens them.

**Side effect found:** a local production build without `NEXT_PUBLIC_COURTLENS_API_URL` sends the
browser's reads to `localhost:8000`, which is the owner's dev API pane. SP00 and SP01 builds did the
same. The first capture pass sent read-only GETs (portraits) there, before the reroute was added.

### Where this differs from the plan and the handoff

- **`/api/cache/status` rechecks the stamp** (an `async` route awaiting `store.current()`). Without
  this, the generation it reports could be the one before a job finished, until some cached read
  came in.
- **Top-level pages are the 16 server-rendered ones.** The first run crawled 583 pages, including 16
  static ones. They answered in about 1 ms and added no cache entries (3,716 entries either way), so
  they were dropped. A test requires `force-dynamic` on every listed page.
- **Roster source:** the ESPN bundle is read from disk in the jobs container, which mounts `data/`.
  No API route serves it: `/api/workbench/player-context/rosters` is a projected roster from a
  context dataset, and the release lists everyone who played this season, including departed
  players.
- **A job running means skip, not wait.** The loop runs jobs one at a time, so a running job here is
  a hand run or a killed job inside its timeout window. The next loop retries.
- **`partial` counts as warmed** (the crawl finished, but some pages were not 200), so a permanent
  404 does not trigger a recrawl on every loop. `stale`, `stopped`, `not-ready` and `error` crawl
  again.

### Checks

- pytest `tests/unit/test_warm_site.py`: 22 passed. It covers:
  - the URL list: teams, roster players, top-level pages, no query string, unmatched and duplicate
    players, no bundle;
  - top-level pages exist, are `force-dynamic` and are in the navigation;
  - href parity with `entity-links.ts`;
  - the generation check: new, same, job running, settling, moved during the crawl;
  - dashboard not ready and cache off;
  - an unexpected error is recorded, not raised;
  - the failure stop: 5xx in a row, network errors, a 404 resetting the run, the deadline;
  - concurrency at most 2;
  - no cookie or credential header;
  - the stamp unchanged after a crawl writes its record;
  - `run-jobs --next-wake` prints only the wake seconds on stdout, and `warm-site` prints nothing
    there;
  - the compose loop;
  - the status route rechecking the stamp.
- With `test_read_cache.py`, `test_scheduled_jobs.py`, `test_cli.py`, `test_deploy_job_inputs.py`
  and `test_agent_providers.py`: 105 passed, 8 failed. The 8 failures are the `[anthropic]` cases,
  red since before SP00.
- `ruff check .` and `ruff format --check .`: pass. `mypy src/courtlens`: no issues (410 files).
  `mypy --strict scripts/speed/*.py`: no issues.
- No dashboard file changed, so dashboard lint, typecheck, Vitest and Playwright were not run.
- Full pytest and Playwright suites not run (plan: before each gate). Not deployed; no live run.
  The `data-stamp-bump` and `warm-site.json` written to the PC's `data/derived/job-health/` (a
  directory that did not exist before) were deleted, along with the scratch workspace.

## 2026-11-15 — SP03 built: prefetch on intent; skeletons that do not flash

### What was built

- **`lib/intent-prefetch.ts`**, `useIntentPrefetch(href)`. Intent is one of:
  - a mouse or pen resting on the link for 80 ms (`pointerenter` starts a timer, `pointerleave` cancels it);
  - keyboard focus (only when the link matches `:focus-visible`, so the focus a mouse press gives does not count);
  - `touchstart`. The touch's own `pointerenter` is ignored.

  Each href is prefetched at most once in 5 minutes (`PREFETCH_WINDOW_MS`, a per-tab record), which is
  how long the router keeps a full prefetch. Nothing prefetches on entering the viewport. Outside a
  production build it does nothing, as Next's own prefetch does.
- **The mechanism is `router.prefetch(href, { kind: "full" })`.** The bundled Link reference says
  `prefetch={true}` is "the full route ... for both static and dynamic routes". The default (`auto`)
  prefetches a dynamic route only "down to the nearest segment with a loading.js boundary". The
  `staleTimes` reference says full prefetches and `router.prefetch` are kept for `staleTimes.static`
  (5 minutes). The source of this version
  (`client/components/prefetch.js`) shows `router.prefetch` defaults to `PrefetchKind.AUTO`, so the
  kind has to be named. I chose the router call over the documented hover pattern
  (`prefetch={active ? true : false}`) because `links.js` re-prefetches every prefetch-enabled
  Link on screen whenever the router tree changes (`pingVisibleLinks`). That would mean every armed
  header link after each navigation, and every armed row after each Stats filter change. That is
  the per-row traffic this rule exists to stop. The router call is one request per href per window.
  `PrefetchKind` is not exported from a public entry point, so the option type is derived from
  `useRouter`'s own signature and nothing imports from `next/dist`.
- **`components/intent-link.tsx`**, `IntentLink`: `next/link` with `prefetch={false}` plus the hook,
  keeping the caller's own pointer, focus and touch handlers. `prefetch={false}` on it turns intent
  off as well. It is rendered by:
  - `EntityAnchor`, so `PlayerLink`, `TeamLink`, `GameLink` and `SeriesLink` call sites did not change;
  - every link in `components/ui/header.tsx` (direct links, menu items, More, the mobile drawer);
  - `Brand`;
  - the kit's `ButtonLink` and `IconButtonLink`;
  - the Stats table's player link.
- **Live links are not prefetched.** Their reads are `never` (an uncached render every time), and
  the router would keep the prefetched page for 5 minutes, so a click could show an old score. The
  bundled Adopting Partial Prefetching guide says the same: "A prefetch of real-time content would
  be stale by the click."
- **Skeletons.** Every `loading.tsx` root and every in-page loader is `role="status" aria-busy="true"`.
  I checked all 42; each one is a skeleton. Other `aria-busy` uses (live content being refreshed) do
  not carry `role="status"`. One rule in `components/ui/skeleton.css` gives that selector
  `animation: skeletonReveal var(--dur-fast) var(--ease-out) var(--delay-skeleton) backwards`.
  - New token `--delay-skeleton: 120ms` (`tokens.css`), keyframes in `motion.css`.
  - The region is transparent for 120 ms, then fades in over 140 ms, so a response faster than
    120 ms never shows a skeleton. It is CSS only, with no timer.
  - **Reduced motion keeps the delay.** It is a wait, not motion, and a flash of skeleton is the
    thing reduced-motion users least want. The fade stays at `--dur-fast`, the opacity duration that
    Design Language keeps under reduced motion. Checked in the build: same computed animation, opacity
    0 at 60 ms and 1 at 300 ms with `prefers-reduced-motion: reduce` (`traces-local.txt` §4).
- **Words of the old rule** updated:
  - the Links section of Design Language (new "Prefetch on intent" bullet), plus its motion token
    table and Loading row;
  - the site links paragraph in `AGENTS.md`;
  - the `entity-link.tsx` header comment;
  - the ESLint entity-href comment;
  - a pointer under "No viewport prefetch" in the site links plan.

  The entity-href ESLint rule itself is unchanged and passes.
- **`next.config.ts`: no change.** Full prefetches live for `staleTimes.static` (5 minutes default).
  `staleTimes.dynamic` stays 0, so an unprefetched click still fetches fresh.

### Prefetch request counts (production webpack build, fixture API :4180, dashboard :3181; `fixture-prefetch-counts.txt`, 3 repeats)

| Action | Entity page requests |
| --- | --- |
| Load and scroll `/stats` (2 links on fixture data) | 0 |
| Load and scroll `/draft` (183–331 links) | 0 |
| Sweep over 20 rows (`/draft`), ending off every link | 0 |
| Resting hover on one link | 1 page render + 2 route-tree lookups |
| Click after that prefetch | 0 RSC, 0 documents |

A full prefetch is one page render: an RSC request without the prefetch header, the same request a
click makes. It also sends one or two `_tree` lookups (`Next-Router-Segment-Prefetch: /_tree`).
Replayed on real data, a lookup is about 300 B, takes 2 ms and makes **no API read**. The render is
288 KB, takes 9–11 ms warm and makes 9 API reads, all cache hits (`traces-local.txt` §1). The spec
counts renders and lookups separately.

Navigation spec, fixture: every journey is a client transition. Each click-only journey makes 1 RSC
request and Back makes none. Each prefetched journey sends 1 render while hovering and **0 RSC after
the click**.

### Click to content (real data, `SPEED_REAL=1`, five runs, medians; `navigation-before-local.json`, `navigation-after-local.json`)

Same stack and warm cache for both; "before" is a build of `HEAD` (9e926246) with its own spec.

| Journey | SP01 | Before (today) | After, click only | After, prefetched | Budget |
| --- | --- | --- | --- | --- | --- |
| Stats row → player | 152 ms | 171 ms (159–290) | 171 ms (157–202) | **72 ms (66–74)** | ≤ 100 prefetched, ≤ 300 not |
| Player header → team | 290 ms | 298 ms (295–366) | 283 ms (272–283) | **230 ms (207–260)** | |
| Header nav → Stats | 226 ms | 235 ms (214–281) | 201 ms (192–242) | **179 ms (173–188)** | |
| Back (Stats → team) | 199 ms | 194 ms (181–209) | 184 ms (165–191) | n/a | |

- **Met:** prefetched Stats row → player (72 ms), and every unprefetched warm click (≤ 283 ms).
- **Not met: prefetched player → team (230 ms) and nav → Stats (179 ms).** Both make no network
  request after the click. The measured floor (`traces-local.txt` §3) is main-thread work and reads
  made after mount:
  - Rendering the destination from the cached payload: one 190 ms long task for Stats (2.2 MB of
    HTML, 50 wide rows), and 70–90 ms for the team page, starting about 40 ms after the click.
  - On the team page, the roster board ("Loading minutes") reads from the browser after mount
    (team, catalog and eight portraits). Its skeleton clears at 267–386 ms.

  Prefetch cannot remove either. SP05 (page weight) addresses the render, and SP04 or the G1
  question about warming browser reads addresses the reads. Per the plan, the floor is recorded and
  the budget is the owner's.
- The prefetched team journey starts on the player page loaded as a document, so the comparison with
  the click-only journey is not exact. A page loaded as a document is kept by the router, so the
  prefetched block starts on the player page rather than on `/stats`. Otherwise nav → Stats would
  have nothing left to fetch.

### Memory (`resources-navigation-local.json`, sampled every 0.5 s through the after run)

The dashboard went from 195 MB to a peak of 312 MB (CPU peak 38 % of one core) over 5 runs × 7
journeys, with 15 intent prefetches. The API stayed at 1,654 MB. Each prefetch is an ordinary page
render, so the dashboard's working set grows as it does for clicks; SP02's crawl peak of 596 MB
remains the high mark. The before run was not sampled, so this is not a before/after comparison.

### Where this differs from the plan and the handoff

- **More links than the plan names.** `IconButtonLink` is rendered in a row action on every
  Six-Factor and RAPM table row, and it used Next's default viewport prefetch. `Brand` sits in the
  header. The Stats table's player link is a hand-built `Link prefetch={false}` with the
  `entity-link` class, not `EntityAnchor`, and the done-when times its prefetched journey. All
  three now use `IntentLink`. The other `prefetch={false}` links are unchanged, including the
  `ButtonLink`s that pass `prefetch={false}`, which still never prefetch.
- **Default-prefetch links remain.** About 30 files still render `next/link` with Next's default
  (viewport) prefetch: the footer on every page, `/whats-new` on Stats, `/stats` on Draft Classes,
  Live, the playoffs bracket, Ask and methodology links. They were outside the handoff's list. The
  load-and-scroll spec logs them (`otherPrefetch`) but does not fail on them. For a dynamic page
  with a `loading.tsx`, Next prefetches only the shell, so these are cheap but not zero. Converting
  them is a one-line change each if the owner wants "nothing prefetches on entering the viewport"
  to hold site-wide.
- **The once-only window is 5 minutes**, the router's lifetime for a full prefetch, rather than the
  data stamp. The browser cannot see the stamp. A prefetch older than that would be thrown away by
  the router anyway.
- **The hover spec runs on `/draft`.** The fixture's `/stats` has 2 rows, too few for a 20-row
  sweep.
- **Prefetched pages can be up to 5 minutes old at the click**, which is the router's rule for
  any full prefetch. Data changes about seven times a day.

### Checks

- `npm --prefix dashboard run lint` (ESLint, including the entity-href and control-kit rules, and
  Stylelint): pass. `run typecheck`: pass.
- Vitest: 147 files, 1,071 tests passed. The new `lib/intent-prefetch.test.tsx` (10 tests) covers
  the 80 ms timer, cancel on leave, a 20-row sweep, once per window, touch start (and ignoring the
  touch's own `pointerenter`), keyboard focus versus mouse focus, Live hrefs, `prefetch={false}`,
  outside production, and keeping the caller's handlers.
- Playwright, production webpack build, fixture API:
  - `site-links-prefetch.spec.ts` and `speed-navigation.spec.ts`, `--repeat-each=3`: 12 passed.
  - The 18 specs that touch skeletons, links, the header, the kit or motion (live, player-career,
    teams, dl08-evidence, chart-kit, last-games, fo13-pages, r11-learning-patch-notes,
    fo14-accessibility, finance, control-kit, header-command-palette, motion-coverage,
    site-links-crawl, site-links-gate, conversation, threaded-assistant, saved-operations): 202
    passed, 27 skipped, **1 failed**. The failure is `player-career.spec.ts:83`, which expects the
    draft line `2018 · R1 #9 · TOR`. The page shows the team's full name, as commit 5ace395a
    ("draft team by full name") made it. The assertion predates SP03 and SP03 does not touch the bio
    header, so it is left for the owner.
- `speed-navigation.spec.ts` with `SPEED_REAL=1` on the local real-data stack: passed (timings above).
- No Python changed, so ruff, mypy and pytest were not run.
- Full Playwright and pytest suites not run (plan: at G1). Not deployed; nothing ran against the live
  site. `data/derived/job-health/` (written by `warm-site`) was deleted, and the servers and scratch
  workspace were removed.
