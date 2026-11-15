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

## 2026-11-15 — SP04 built: cold path (page waves and slow reads)

The owner's G1 decisions are recorded under "Decided (owner, G1, 2026-11-15)" in the plan.

### Local stack and what "cold" means here

Same recipe as SP00–SP03: production build (Turbopack) on :3180, the API on :8180 on the PC's
database copy (release `71639af2…`, scope 2026-27 before 2026-11-13). "Before" is a build of
`HEAD` (24e5a998) with its API run from a worktree of `HEAD` on the same data. "After" is this
block. Server reads were captured through `capture_reads.py`'s recording proxy, which now records
each read's start and end from the page request.

- **Cold (a)**: `courtlens bump-data-stamp` on a running API (cache on). The cache is empty and
  the memos are warm, as after a job. Each run: bump, wait for the generation to move, then load
  the page once with curl (HTML complete). Five runs per page.
- **Cold (a), idle**: the same, after 32 s with no request, so the 30 s source-facts memo has
  expired. This is what a visitor meets after a quiet spell.
- **Cold (b)**: a fresh API process per page (as after a deploy), with the dashboard warmed.

### Dependency maps (server reads, `waves-before.txt`, `waves-after.txt`)

Before:

| Page | Read | Waits for | Why |
| --- | --- | --- | --- |
| Player | catalog | — | release, default scope |
| | career | catalog | needs the release id; without a season in the link, the season depends on it |
| | profile, game log | career | season (true only for the fallback) |
| | impact, hero query, bio, metric catalog | profile, game log | written after them; none uses their answer |
| | impact fallbacks (up to 3) | each other | read one after another |
| Team | catalog | — | |
| | detail, schedule, peers, three six-factor reads | catalog | scope |
| | Stats table: catalog again, workspace | the six team reads | `StatsWorkspace` renders after the page's awaits; `wbFetch`'s timeout signal opts out of Next's fetch memoization, so the catalog is read twice |
| | draft classes, metric catalog, table query | workspace, catalog | query needs workspace preferences; the other two need nothing |
| Compare | analytics catalog | — | |
| | workbench catalog | analytics catalog | written after it; independent |
| | comparison | workbench catalog | scope |
| | cohort query | comparison | written after it; needs only the two ids in the URL |
| | bios, played seasons, metric catalog | cohort query | written after it; need only the ids and scope |
| Stats | catalog, workspace | — | |
| | latest catalog (pinned links: the canonical Stats URL is pinned) | catalog | written after it; independent |
| | draft classes, metric catalog, query | catalog, workspace | the first two need nothing |
| Players | catalog, then the carousel query | catalog | scope (true dependency) |

Waves before → after (uncached reads, memos warm; one capture each):

| Page | Before | After |
| --- | --- | --- |
| `/players/2544` | 5 waves, 9 reads, 331 ms | 2 waves + impact fallback, 11 reads, 374 ms |
| `/players/1643411` | 4 waves, 8 reads, 254 ms | 2 waves, 8 reads, 148 ms |
| `/players/1449` (no season in the link, never played the default) | 7 waves, 11 reads, 279 ms | 3 waves + impact fallback, 16 reads, 285 ms |
| `/teams/1610612747` | 4 waves, 12 reads, 333 ms | 2 waves, 11 reads, 268 ms |
| `/teams/1610612738` | 4 waves, 12 reads, 281 ms | 2 waves, 11 reads, 218 ms |
| `/compare?…` | 5 waves, 8 reads, 304 ms | 2 waves, 8 reads, 311 ms |
| `/stats` | 2 waves | 2 waves (draft classes and metric catalog moved to the first) |
| `/players` | 2 waves | 2 waves (no change: a true dependency) |

Single captures are noisy; the cold (a) medians below are the measure. With six reads in flight
the API's handler times grow (career 85 → 205 ms, profile 50 → 133 ms in the LeBron capture):
one API process, and the Python parts of concurrent reads share one interpreter lock, so a
parallel wave saves only the database and network part of each read.

After, by page:

- **Player.** Wave 1: catalog and metric catalog. Wave 2: career, profile, game log, impact, hero
  query and bio. Without a season in the link, the default season's reads start beside the career.
  For a player who did not play it (Bird), the page reads again for his latest season. That is
  the third wave, and the one dependency left: the season depends on the career. The discarded
  guess's impact fallbacks are not fired (they wait for the season decision), but its other
  reads are: Bird's page makes 16 reads instead of 11. Current players gain the career round trip.
- **Impact fallback.** When the scope's impact read comes back empty, the up to three earlier
  seasons are now read together, and the newest with a fit wins, as before. It still waits for
  that first read, because whether a fallback is needed depends on its answer. Starting the
  fallbacks with it would triple impact reads and cache entries for every current player live,
  where 2026-27 fits exist. On the PC there are no 2026-27 fits, so every current player takes
  the fallback here.
- **Team.** Wave 1: catalog, workspace, draft classes, metric catalog. Wave 2: the six team reads
  and the Stats table's query, through `preloadStatsWorkspace` and a per-render cached loader (the
  bundled docs' preload pattern with `React.cache`).
- **Compare.** Wave 1: both catalogs and the metric catalog (started before the default pair's
  query). Wave 2: the comparison, and beside it the cohort query, bios and played seasons for the
  two ids in the URL. These are used only when the comparison answers for the same ids and phase,
  and are read again otherwise.
- **Per-render sharing.** `getWorkbenchCatalog`, `getMetricCatalog`, `getDraftClasses`,
  `getAnalyticsCatalog` and `getWorkspace` are wrapped in `React.cache` (one read per server
  render; a pass-through in the browser).

### Browser reads

| Page | Read | Waits on | Outcome |
| --- | --- | --- | --- |
| Team | roster board: `GET /teams/<id>` | mount; the server already made the identical read | **Fixed.** `RosterAllocationView` takes the server's response (`initial`) and reads only on Retry or a scope change. The browser no longer makes this read. |
| Player | 6 × `POST /query` hero ranks (`useCohortRanks`), 155–250 ms each uncached | mount; the server has their inputs | **Recorded, not moved.** Each response is about 860 KB (every item carries every metric), so about 5 MB per player page. Moving them to the server would make the dashboard fetch and parse 5 MB on every player render, warm ones included, and break "warm no worse than SP03". They are shared by every player of a scope, so only the first visit per scope after a data change misses. For SP05: the 5 MB the browser downloads per player page. |
| Every page | `GET /catalog` (header route tabs, `getSharedCatalog`); `GET /catalog?releaseId=…` (`ContextBar`) | mount | Recorded. Header and context bar are shared components outside this block's pages; a cache hit after the first visitor. |

### What made the first career read take 3.4 s

`stats_cohort_store.source_facts` fingerprints the tracking mart before any persisted cohort key
can be computed. It ran `count(*), md5(string_agg(DISTINCT dataset_id::text, ','))` over all
2,050,202 rows of `analytics_marts.mart_stats_player_tracking` (391 MB, no index; a dbt table),
which sorted to disk (137 MB external merge): **1,043–1,131 ms on the PC**. Live runs 3–4× slower,
which matches 3.4 s. It lands on whichever read first needs a cohort: career on player pages, the
Stats query on team and Players pages. The memo holds the facts for **30 s** (`SOURCE_TTL_SECONDS`),
so the cost recurred after every quiet spell. That is SP00's "the slow first request recurs".

Fix: the same facts from a two-level aggregate (hash the ~300 (season, type, dataset) triples,
then aggregate them with `string_agg(… ORDER BY dataset_id::text)`). It gives **identical**
counts and md5s (0 mismatches over 26 seasons on the PC; a Postgres test also covers several
datasets per season, NULL ids and a NULL season) in **104–125 ms**, with no sort to disk. Because
the values are identical, every persisted cohort key stays valid. No index: one created by
Alembic on a table dbt rebuilds would vanish at the next dbt run. The 30 s memo is unchanged.

The other first-request cost on a fresh process was the catalog: **2.0 s**, of which 0.96 s
decodes the 47 MB impact store and 0.62 s decodes all 21 DARKO bundles to find the newest. These
are loaded once per process, plus the facts and the finance book (below), now at API start (see
warm start).

### Slow reads (`slow-reads-before.json`, `slow-reads-after.json`)

`scripts/speed/slow_reads.py` (new): each read of the snapshot sample (now including the six hero
rank queries), five times against the API with `COURTLENS_READ_CACHE=false`. It records the
median handler total, database time and query count from Server-Timing (memos warm). Reads under
20 ms both times are left out.

| Read | Pages | Before: total / db / queries | After | Fix that moved it |
| --- | --- | --- | --- | --- |
| workbench-compare | compare | 145 / 102 ms / 22 | 125 / 88 ms / 22 | fingerprint memo |
| player-bio-203999 | compare | 122 / 35 ms / 18 | 21 / 10 ms / 16 | finance book memo |
| player-bio-2544 | compare, player | 122 / 35 ms / 18 | 22 / 11 ms / 16 | finance book memo |
| player-bio-1643411 | player | 120 / 36 ms / 18 | 19 / 10 ms / 16 | finance book memo |
| player-career-2544 | player | 106 / 66 ms / 12 | 79 / 40 ms / 11 | fingerprint memo |
| query-hero-rank-ts_pct | player (browser) | 89 / 58 ms / 11 | 84 / 57 ms / 11 | — |
| player-career-1449 | player | 84 / 60 ms / 12 | 56 / 33 ms / 11 | fingerprint memo |
| query-team-lal | team | 80 / 57 ms / 11 | 72 / 54 ms / 11 | — |
| workbench-catalog | every page | 80 / 50 ms / 5 | 52 / 24 ms / 4 | fingerprint memo |
| query-players | players | 64 / 29 ms / 9 | 87 / 28 ms / 9 | — (noise: first run 153 ms) |
| workbench-teams-six-factors (+ home, away) | team | 60–61 / 48 ms / 6 | 46–58 / 33–45 ms / 6 | — |
| player-career-1643411 | player | 60 / 52 ms / 12 | 35 / 28 ms / 11 | fingerprint memo |
| query-hero-rank-* (other five) | player (browser) | 57–59 / 30 ms / 9 | 54–55 / 28 ms / 9 | — |
| query-stats, query-player-* | stats, player | 43–58 ms | 39–56 ms | — |
| team-peers-* | team | 53 / 45 ms / 4 | 38–50 / 31–43 ms / 4 | — |
| player-profile-2544 | player | 50 / 28 ms / 8 | 40 / 20 ms / 8 | fingerprint memo |
| every other player and team read | | 22–48 ms | 22–43 ms | |

**Done-when met:** every read behind the player and team pages is ≤ 150 ms uncached (largest
after: 87 ms; Compare's own read 125 ms). Compare's remaining cost is `season_champions`
(78 ms, two scans of playoff team games). It depends on team-game rows, which can be appended,
so it is not memoised by id. Recorded only.

The fixes:

1. **Tracking fingerprint query** (`stats_cohort_store.tracking_facts_sql`), above.
2. **Finance book memo** (`player_contracts.book_rows`): the player bio parsed and validated
   every row of the latest finance book (3,987 pydantic rows, about 0.15 s) to read one player's
   guarantees. Finance books are append-only (ORM guard and Postgres seals), and a release's
   members are written in its one admission transaction. So the parsed rows are memoised by
   release id, grouped by player, at most 4 books (LRU). Tests: once per id, ids never share
   rows, the bound evicts the least recent. The memo is cleared between tests (`conftest.py`), as
   the cohort cache is.
3. **Dataset fingerprint per transaction** (`workbench_analytics.dataset_fingerprint`): the
   `count(*), max(game_date)` over a dataset's 1.29 M rows is already an index-only scan (28 ms;
   EXPLAIN in `tools/`), and the comment there says ready datasets may still be appended to, so
   it cannot be memoised by id. A career resolved its context three times per read. It is now
   remembered on the connection for the rest of its transaction (REPEATABLE READ: a repeat could
   not see another answer). Any statement other than a SELECT on that connection drops it, so a
   writer appending rows in the same transaction sees the new count. Tests: once per read-only
   transaction, recounted in a new one, dropped after an ORM insert and after raw SQL.
4. **Warm start** (`src/courtlens/api/warm_start.py`, `COURTLENS_WARM_START`, off by default, on
   in `deploy/compose.prod.yml` beside the read cache). As the API starts, a daemon thread runs the
   catalog route function, `source_facts` for the published context and the finance book memo,
   each in its own session. A failed step is logged and the others still run. The API answers at
   once; the report is in `GET /api/cache/status` under `warm_start`. It only fills memos the reads
   fill anyway, stores no response and changes none. Tests: every step runs and a failure is
   recorded, the thread does not block, and the app starts it only when configured.

Snapshot after each fix: `snapshot-compare-api-fixes.txt` (fixes 1–3, cache off: no differences;
the three six-factor reads equal at 12 digits).

### Snapshot and page text

- `snapshot.py` gained a second hash per read, at 12 significant digits. `--compare` accepts a
  difference that vanishes at 12 digits only for the reads in `--digits-only`, by default the
  three team six-factor reads (owner, G1). The sample gained the six hero-rank queries (52 reads).
- **Final code, cache off, against the saved `snapshot-before.json`:** one difference. The away
  six-factor read differed even at 12 digits. That is the same read's order jitter (SP01) caught in
  another state, not this block: eight fetches from the changed API and six from an API run from
  `HEAD` on the same data all returned byte-identical canonical bodies (0 differing fields), and
  all differed from the saved hash in the same way. A new snapshot from the `HEAD` API
  (`snapshot-before-head2.json`), compared with the final API three times: **no differences**
  (`snapshot-compare-final-vs-head2.txt`). With the cache and warm start on, cold and then warm
  (51 hits): **no differences** (`snapshot-compare-final-cache-on.txt`).
- **Page text** (`page-text.json`, `tools/page-text.mjs`): each of the 12 pages' `main` innerText
  after network idle, on real data. Two before captures agree with each other (the capture is
  deterministic), and the after capture equals them on all 12 pages: **0 differences**. The
  per-page SHA-256s are recorded.

### Cold and warm page times (HTML complete, curl; `cold-a.txt`, `cold-b/`)

| Page | Cold (a) before: median (min–max) | Cold (a) after |
| --- | --- | --- |
| `/players/2544` | 412 ms (411–651) | **281 ms** (276–522) |
| `/players/1643411` | 328 ms (307–1,333) | **156 ms** (147–248) |
| `/players/1449` | 320 ms (265–1,327) | **266 ms** (264–379) |
| `/teams/1610612747` | 332 ms (314–346) | 252 ms (228–280) |
| `/teams/1610612738` | 283 ms (266–294) | 217 ms (215–446) |
| `/compare?…` | 525 ms (459–740) | 250 ms (241–261) |
| `/stats` | 189 ms | 159 ms |
| `/players` | 163 ms | 140 ms |
| `/players/2544`, idle (facts expired; 3 runs) | 1,466 ms (1,456–1,668) | **384 ms** (372–421) |

**Done-when (≤ 800 ms cold player page, definition (a)): met**, worst single run 522 ms. The
before runs' 1.33 s outliers are the facts memo expiring.

Cold (b), one fresh API process per page (one run each):

| Page | Before | After, warm start off | After, warm start on, request as the API first answers | After, warm start on, after it finishes |
| --- | --- | --- | --- | --- |
| `/players/2544` | 3.87 s | 2.81 s | 3.07 s | **0.63 s** |
| `/players/1643411` | 3.68 s | 2.76 s | | **0.55 s** |
| `/players/1449` | 3.53 s | 2.62 s | | **0.68 s** |
| `/teams/1610612747` | 3.50 s | 2.74 s | 3.19 s | **0.65 s** |
| `/compare?…` | 3.85 s | 2.93 s | | **0.81 s** |

The warm-up takes 2.5 s on the PC (catalog 2.2–2.35 s, facts 0.12 s, finance book 0.10 s) and
starts as the API starts. The warm crawl waits for readiness and a settled generation (at least
6 s), so its first page arrives after it. A request that races the warm-up computes the same
loads itself, so it gains nothing. The remaining ~0.35 s over cold (a) is other first-call work:
free-agency rosters in the bio, loading the stored cohort into memory for the query, position
estimates in the career. Recorded, not warmed: (b) already meets 800 ms after the warm-up.

**Warm** (cache on, after one warm-up pass; `measure-local-warm-*.json`, plus four alternating
9-run passes of the pages): no worse. Player pages before / after 14–35 / 14–37 ms, team pages
32–38 / 32–38 ms, Stats 48–50 / 47–52 ms, every API read 0.4–0.6 ms (hits) both times.

Navigation (`SPEED_REAL=1`, five runs, medians; same session, cache on):

| Journey | Before | After |
| --- | --- | --- |
| Stats row → player | 170 ms | 145 ms |
| Player header → team | 295 ms | **136 ms** |
| Header nav → Stats | 210 ms | 186 ms |
| Back (Stats → team) | 181 ms | 136 ms |
| Stats row → player, prefetched | 78 ms | 72 ms |
| Player → team, prefetched | 228 ms | **115 ms** |
| Nav → Stats, prefetched | 189 ms | 171 ms |

The team journeys gain most because the roster board no longer reads after mount. Prefetched
player → team (230 ms at SP03, accepted at G1) is now 115 ms. Nav → Stats remains SP05's render
cost.

### API start time and memory (`api-starts.txt`)

| | Start (launch to first answer) | RSS at first answer | After warm-up | After the first `/players/2544` | + a team page |
| --- | --- | --- | --- | --- | --- |
| Before (`HEAD`) | 1.53–1.61 s | 256 MB | | 1,081 MB | 1,095 MB |
| After, warm start off | 1.56–1.70 s | 261 MB | | 1,116 MB | 1,138 MB |
| After, warm start on | 1.56–1.65 s | 261 MB | 940–943 MB (2.46–2.58 s) | 980 MB | 993 MB |

The warm-up loads at start what the first catalog read loaded anyway (about 680 MB: the impact
store and DARKO bundle). It adds nothing to the memory after the first page, which stays far
under the API's 3 GB limit. The finance memo holds at most four parsed books (a few MB). The VPS
bundle is larger (2026-27 fits), so the post-deploy `docker stats` at the G1/G2 stop should
include the warm-up.

### Migration

None. The one index candidate (the tracking mart) is a dbt table that is rebuilt by the jobs, so
an Alembic index would not survive; the query rewrite removed the need. The dataset fingerprint
query is already an index-only scan. No other read in the table spends its time in an
unindexed scan.

### Where this differs from the plan and the handoff

- **Player pages are two waves except where the career decides the season.** With no season in
  the link, the default season's reads start beside the career. A player who did not play it
  gets a third wave and up to 5 wasted reads. The impact fallback is a further wave only when the
  scope's impact read is empty.
- **First attempt reverted:** starting the career beside the catalog, without `releaseId`, took
  **28–32 s** on a fresh process (236 queries). That read misses the persisted cohort store and
  recomputes every season. The career is read with the catalog's release, as before.
- **Side effect on the owner's database:** the API persists the cohorts it computes (it always
  has, and SP00–SP03 runs did too). This session's reads wrote 57 `stats_cohort_entries` (17,786
  rows), most of them from that reverted attempt. They are the store's recomputable serving rows
  and were left in place.
- **Hero rank reads stay in the browser** (above).
- **Six-factor snapshot:** the saved before snapshot needed a second, `HEAD`-API snapshot to
  settle the jitter question (above).
- **`player-career.spec.ts`:** the draft assertion now checks `2018 · R1 #9` and
  `Toronto Raptors` separately (the team's full name sits on the fact's detail line since
  5ace395a).
- **New tools:** `scripts/speed/slow_reads.py`; `capture_reads.py --only` and read start and end
  times; `snapshot.py`'s 12-digit hash and `--digits-only`. The ad hoc scripts (page text, waves,
  cold runs, profilers, the facts SQL) are in `tools/`; they use the scratch paths of this run.
- **During the run the disk filled once** while docs/ was being copied into two Playwright
  sandboxes (1.3 GB each). The copy was stopped and removed; the owner's database container
  logged no error. `scripts/clean_scratch.sh` was changed in the working tree during the session,
  by someone else; it is not part of this block's commit.

### Checks

- `ruff check .`, `ruff format --check .`: pass. `mypy src/courtlens`: no issues (411 files).
  `mypy --strict scripts/speed/*.py`: no issues.
- pytest (`scripts/test_python.py`, disposable Postgres 17):
  - `tests/unit/test_cold_path_memos.py` (new, 10) and the Postgres equivalence test in
    `test_player_career_postgres.py`;
  - every suite touching the catalog, career, bio, finance, cohort store, read cache, stats feeds
    and workbench API (19 files): **247 passed**;
  - `test_bbref_marts_postgres`, `test_agent_tools_postgres`, `test_cli`,
    `test_deploy_job_inputs`: 38 passed;
  - `test_agent_providers.py`: 35 passed, **8 failed**, the 8 `[anthropic]` cases, red before SP00.
- Dashboard: lint (ESLint and Stylelint) and typecheck pass. Vitest: 148 files, **1,073 passed**,
  including the new `components/roster-allocation-view.test.tsx` (the seeded board makes no read;
  without a server read it reads once).
- Playwright, webpack production build, fixture API :4180, dashboard :3181. 23 specs covering the
  player, team, Compare, Stats and Players pages, links, prefetch and navigation (player-profile,
  player-career, player-reference, player-dashboard, players-fo09, teams, compare-overhaul,
  comparison-evaluation, entity-selection, workbench, the eight stats-* and table specs,
  site-links-gate/crawl/prefetch, speed-navigation, dl08-evidence): **118 passed, 28 skipped,
  0 failed**.
- `speed-navigation.spec.ts` with `SPEED_REAL=1` on the local stack, before and after: passed.
- Full pytest, Vitest and Playwright suites not run (the owner's stop after SP06). Not deployed;
  nothing ran against the live site. Servers, Playwright browsers, the mock API, the `HEAD`
  worktree and the scratch workspace were stopped and removed, and `data/derived/job-health/` (the
  bump file) was deleted.

## 2026-11-15 — SP05 built: page weight (HTML and JS)

Done-when: **two floors recorded** (Stats HTML, player page first-load JS and CSS), the rest met.
Evidence: `docs/evidence/speed/sp05/`. Scratch tools are in its `tools/`.

### Local stack, and a second session in the same tree

Same recipe as SP00–SP04: Turbopack production builds on :3180, the API on :8180 (cache and warm
start on) on the PC's copy, release `71639af2…`, scope 2026-27 before 2026-11-13.

- **Before** is `HEAD` (dda031e4): a sandbox copy of `dashboard/`, and an API run from a
  `git archive HEAD src` (`PYTHONPATH`).
- **Another session (courtlens-91) edited the same working tree during this block.** It added
  numbered paging (`page_cursors` in the query response, a Stats pager, some icons and CSS).
  - So **after** is an isolated tree: `HEAD` plus this block's changes only, for both the
    dashboard and the API.
  - It differs from the working tree only by that session's files and hunks (checked file by
    file). The commit stages only this block's hunks.
  - Every number below comes from builds of those two trees on one stack, run back to back.

### Where the bytes went (before), `html-weight/*-before.json`

`tools/html_weight.py` splits each page's HTML into markup and the inline RSC payload
(`self.__next_f.push`). It walks the payload's element tree and adds up each client component's
props.

| Page | HTML | Markup | RSC scripts | Largest client props |
| --- | --- | --- | --- | --- |
| Stats | 2,170,376 | 1,350,761 | 816,678 | `WorkbenchPlayerExplorer.data` 622,259; `ContextBar.catalog` 58,399; `metricHints` 20,190 |
| Players | 748,179 | 148,902 | 596,410 | `PlayerDashboardView.carousel` 453,839; `catalog` 58,399 |
| LeBron (2544) | 1,130,892 | 581,629 | 546,326 | `WorkbenchPlayerProfile.career` 229,624; `bio` 98,623; `catalog` 58,399; `impact` 24,562 |
| Bird (1449) | 738,546 | 367,583 | 368,026 | `career` 111,870; `catalog` 58,399; `bio` 55,459 |
| Lakers | 1,346,254 | 864,731 | 477,245 | Stats table `data` 250,670; `RosterAllocationView.catalog` 58,399 |
| Celtics | 1,219,314 | 780,591 | 434,445 | Stats table `data` 214,020 |
| Compare | 532,509 | 109,073 | 420,499 | `bios` 146,558; `metricDefinitions` 106,758; `workbenchCatalog` 58,399 |
| RAPM | 667,982 | 197,019 | 467,758 | `RapmRatingsTable.players` 391,248 |

What made them heavy:

- **Query rows carry every metric four times over.**
  - Each Stats row has `metrics`, `sample_sizes`, `percentiles` and `cohort_sample_sizes`, plus
    `table_percentiles` and `table_cohort_sample_sizes`: six maps over about 120–200 keys, about
    12 KB a row.
  - The table reads percentiles only for its view's columns, and one sample size (the drawer's
    games line). Nothing on any page reads `percentiles` or `cohort_sample_sizes`.
  - `metrics` must stay whole: the scatter view plots any catalog metric without a new read.
- **Why every metric when `view_state.columns` names six:**
  - `view_state.columns` only chooses which joins the cohort runs (impact, tracking: the cohort
    cache key, `stats_cohort_cache.py`).
  - The base metric map always comes back whole, and the route copies each row as it is.
- **Career and bio.**
  - The career table switches views and counting modes in the browser, so it needs every view's
    columns in every mode, but no sample sizes.
  - Basketball-Reference game highs come per season and for the career. Only the career rows
    are read (the Game Highs table). LeBron's 44 rows were 81 KB.
- **Stats markup** (1.35 MB for 50 rows, before):
  - metric cells 563 KB (1,050 cells of about 536 B, mostly accessible text: `aria-label`,
    `title`, `sr-only`);
  - guide-cell portraits 263 KB (250 `img` with five-width `srcSet`);
  - name cells 186 KB; row actions 90 KB (kit icon buttons, about 1.1 KB of class each);
  - the loading skeleton 71 KB;
  - React text separators (`<!-- -->`) in every cell's screen-reader text, about 50 KB.
- **Duplicates.** The catalog (58 KB) goes once per page; the explorer's `catalog` prop is a
  reference to it, not a copy. No other object was serialised twice. No column is rendered and
  hidden: hidden empty columns are left out of the markup.

### Changes and their effect

1. **`lib/client-props.ts`** (new). Each helper copies values as sent and never computes; Vitest
   covers each one (`client-props.test.ts`, 10).
   - `statsTableData`: the Stats and team-roster table's rows with whole `metrics`, the view's
     own columns' percentile, cohort size and impact support, and `sample_sizes.pts`.
   - `careerTableData`: every view's columns in every counting mode, no sample sizes.
   - `playerBioData`: career game highs only; Compare uses it too.

   Effect: Stats `data` 622 → 182 KB; Lakers and Celtics `data` 251 / 214 → 76 / 65 KB; LeBron
   `career` 230 → 150 KB and `bio` 99 → 19 KB; Bird 112 → 71 and 55 → 9 KB; Compare `bios`
   147 → 30 KB.
2. **API: `presentation.metrics: "sort"`** (`StatsPresentation`, query route).
   - Each item's metric maps keep only the query's sort fields. Rows, order, counts, cohort and
     cursors are unchanged.
   - It is not part of the presentation hash, and the cohort cache ignores it. The default is
     `"all"`, so every existing body answers as before.
   - Used by the hero ranks (`useCohortRanks`) and by the Players carousel, which reads DPM
     only. Players `carousel` 454 → 35 KB.
   - Postgres test `test_sort_metrics_presentation_keeps_rows_order_and_cursor`: same ids,
     order, values, counts, cohort and `next_cursor` in both directions; an unknown value is 422.
3. **`lib/team-branding.client.json`** (new). The browser's copy of the branding catalog without
   provenance (source URLs, SHA-256s, byte counts): 130 KB → 41 KB, 30.2 → 7.1 KB gzip, on every
   page.
   - All 13 dashboard importers use it.
   - `scripts/team_branding_assets.py` writes it beside the full file.
   - `lib/team-branding-client.test.ts` fails when the two disagree.
4. **Lazy overlays** (`next/dynamic`, mounted on first opening with `lib/use-opened-once.ts`,
   then kept mounted so their state carries over as before):
   - the command palette, the Ask panel (`AskDrawer` → `ThreadedAssistant`/`AskCourtLens` and the
     answer components), the shortcuts sheet (header and Stats);
   - the sign-in dialog (layout, `components/account/lazy-sign-in-dialog.tsx`);
   - on Stats: the detail drawer, Manage Views and the trend dialog, plus the scatter and lines
     views (loaded when chosen);
   - the career table's trend dialog and the profile's lineage drawer;
   - image export as `import()` on click.

   **Every `dynamic()` passes `loading: () => null`.** This version adds a Suspense boundary
   only when `ssr: false` or `loading` is set (`shared/lib/lazy-dynamic/loadable.js`). The first
   build had none, and 11 focus specs failed:
   - while a chunk loaded, the overlay suspended the layout's boundary around the header;
   - the header blanked, and the button that opened it lost focus.

   With `loading`, each overlay waits alone. `use-opened-once.test.tsx` (4) covers mounting on
   first opening, state kept after closing, starting open, and the page (and focused button)
   staying on screen while the code loads.
5. **Screen-reader text as one string** in `PercentileCell`: the same words, without React's
   text separators. Stats markup −42 KB, LeBron −26 KB.

### HTML after (`html-weight/*-after.json`, `measure-final-summary.txt`)

| Page | Before | After | Change | What moved it |
| --- | --- | --- | --- | --- |
| Stats | 2,170,376 | **1,631,968** | −538,408 | table rows (1), sr-only text (5) |
| Players | 748,179 | 280,081 | −468,098 | carousel sort-only (2) |
| LeBron | 1,130,892 | 924,091 | −206,801 | career and bio (1), sr-only (5) |
| Rookie 1643411 | 343,878 | 332,774 | −11,104 | career (1) |
| Bird | 738,546 | 624,342 | −114,204 | career and bio (1) |
| Lakers | 1,346,254 | 1,131,898 | −214,356 | roster table rows (1) |
| Celtics | 1,219,314 | 1,036,875 | −182,439 | roster table rows (1) |
| Compare | 532,509 | 397,645 | −134,864 | bios (1) |
| `/`, Teams, Standings, RAPM | 35–668 KB | about −1.2 KB each | | fewer client references in the layout (4) |

**Floor, Stats ≤ 1.1 MB: not met (1.63 MB).** The markup alone is 1.31 MB for 50 rows of 21
columns, and the RSC payload is now 320 KB. Reaching 1.1 MB would need one of these, and each
changes something the plan keeps:

- shorter accessible text: the cells' `aria-label`, `title` and screen-reader text are about half
  of the 563 KB of cells, and the page-text rule counts them;
- the guide-cell portraits (263 KB), a layout and image matter for SP06 or the owner;
- the control kit's class output for icon buttons (108 KB in the table).

These are the owner's call.

### JS and CSS (`transfer-*.json`, `brotli.txt`, `bundle-report-*.txt`)

Measure: Playwright resource timing (`tools/transfer.mjs`), fresh context, `encodedBodySize` of
the JS and CSS the HTML names, as the local server sends them (gzip). Nothing else loaded before
network idle, except a 2 KB chunk on Stats before (none after). `brotli.txt` gives the same files at brotli
quality 11, as an upper bound for what Cloudflare could send.

| Page | Before (gzip) | After (gzip) | JS | CSS | After, brotli 11 |
| --- | --- | --- | --- | --- | --- |
| Player 2544 | 469,684 | **406,945** | 355,929 → 293,190 | 113,755 | 339,759 |
| Stats | 474,261 | 394,818 | 362,587 → 283,144 | 111,674 | 329,406 |
| Lakers | 509,419 | 438,185 | 397,745 → 326,511 | 111,674 | 367,897 |
| Players | 446,876 | 389,720 | 335,202 → 278,046 | 111,674 | 324,702 |

**Floor, player page ≤ 350 KB compressed: not met with the repeatable gzip measure (407 KB).**
It is 340 KB at brotli 11; the live encoding is unknown until a deploy.

- **CSS is one site-wide stylesheet**: 729 KB decoded, 104 KB gzip, 87 KB brotli
  (`css-report.txt`). 549 KB of it is the `pages` layer for every route. AGENTS.md has all
  component and page CSS imported from `app/globals.css`, so every page loads all of it.
  Per-route CSS would cut it most, and that needs the owner to change the rule.
- **The framework** (React DOM, the Next router and runtime) is about 160 KB gzip of the
  remaining JS.
- **motion** (motion-dom and framer-motion, 58 KB in the analyzer's per-module sizes) is
  imported by name (`motion/react`) in the allowlisted files. `LazyMotion` with async features is
  the next lever. It was not done here: it changes when animations can start.
- **Imports by name.** lucide-react: by name, only in `components/ui/icon.tsx` (and optimised by
  default in this Next). motion: by name. `d3-scale`, `d3-shape`, `d3-sankey` and `d3-hierarchy`:
  by name, in the chart components and Contracts; none is in the player or Stats route's first
  load.

Bundle report: `next analyze --output` on the source tree, exported with
`next analyze export` (graph not committed: 37 MB). `tools/bundle_report.py` sums a route's
initial groups (bootstrap and render-dependent, not async) by module, using the analyzer's own
per-module compressed sizes. These over-count the real gzip of whole chunks: 446 KB against
356 KB measured.

| `/players/[id]` | Before | After |
| --- | --- | --- |
| Initial client JS (analyzer sizes) | 445,576 | 376,194 |
| App code | 190,610 | 118,111 |
| `team-branding` JSON | 30,837 | 7,212 (client copy) |
| Loaded on demand | none | 63,224 (9 chunks: palette, Ask panel and answers, sign-in, shortcuts, trend dialog, lineage, …) |

Largest modules after: `react-dom-client` 63,930; the RSC client 7,774; team branding 7,212; the
segment cache 6,401; the motion projection node 6,346; `stats-presets` 6,128; the profile
5,590.

### Hero ranks (`hero-ranks.json`): fixed

- The six hero reads now send `presentation.metrics: "sort"`.
- For each of the six, on the same API:
  - the full and the sort-only responses give the same 100 `(player, value)` pairs in the same
    order;
  - so the same `rankInSortedPage` ranks: 6–28 tied ranks per metric, no nulls on these pages.
    Ranks still come from the server's order; nothing new is computed.
- Bytes: 855–861 KB → 73–77 KB a read, **5.16 MB → 452 KB per player page**.
- The seven new bodies (six hero reads, the carousel) are in `scripts/speed/urls.json` as
  `…-sort-only`. `HEAD`'s API answers them 422, because the model forbids unknown fields. The
  after API answers 200 (`snapshot-after.json`).

### Prefetch: nothing prefetches on entering the viewport

31 files moved from Next's default viewport prefetch to `IntentLink` (`tools/convert_links.py`
plus one by hand). Links that had `prefetch={false}` in those files keep it.

- app: `app/methodology/page.tsx`, `app/players/[id]/page.tsx`;
- Ask: `agent-answer`, `ask-courtlens`, `ask-drawer`, `hybrid-answer`, `threaded-assistant`;
- pages: `compare-grid-view`, `contracts-view`, `defensive-shot-quality-view`,
  `draft-classes-research` (`/stats`), `finance-workspace`, `footer`, `impact-disclosure`,
  `live-board`, `player-compare-view`, `player-feed-panels`, `player-twins-view`,
  `playoffs-bracket`, `playoffs-bracket-view`, `public-investigation-library`,
  `research-operation-view`, `roster-shapes-view`, `save-operation`, `saved-operation-detail`,
  `saved-operation-library`, `stats-workspace` (`/whats-new`), `team-division-standings`,
  `ui/route-tabs`, `win-probability-v4`, `workbench-player-explorer`.

Notes:

- **Live keeps the SP03 rule.** `IntentLink` skips `/live` hrefs, so Live links prefetch
  nothing, not even on intent.
- **The footer is not rendered anywhere** (`components/footer.tsx` has no importer). It was
  converted anyway. The plan's "footer on every page" did not hold.
- **ESLint now rejects a `next/link` `<Link>` without a `prefetch` prop**: one
  `no-restricted-syntax` rule in `baseSyntaxRules`. It found the 31st file.
- **Spec.** `site-links-prefetch.spec.ts` now fails on any `otherPrefetch` on `/stats` and
  `/draft`. It adds load-and-scroll checks on `/live`, `/playoffs`, `/methodology`,
  `/research/ask` and `/whats-new`, which allow no prefetch request at all. Its `/draft` count
  now waits for the first link: `HEAD` showed the race too (63, 183 or 331 links counted).
- **Result (fixture, 3 repeats): 24 of 24 passed**, `otherPrefetch: []` everywhere. `HEAD` on
  `/draft` sent `/stats` three times.

### Navigation and long tasks (`navigation-final-*.json`, `navigation-final-summary.json`)

`speed-navigation.spec.ts` now records each journey's long tasks, the SP03 §3 method: a
`PerformanceObserver` of `longtask`, `[start, duration]` in ms from the click. The same spec file
ran on both builds. Four runs alternated before, after, before, after on one stack. Medians of
10 runs each:

| Journey | SP04 | Before | After | Longest task before / after |
| --- | --- | --- | --- | --- |
| Stats row → player | 145 | 153 | **136.5** | 72 / 68.5 |
| Player header → team | 136 | 142 | **130.5** | 53 / 56.5 |
| Header nav → Stats | 186 | 191.5 | **170** | 106 / 107.5 |
| Back (Stats → team) | 136 | 137 | **126** | none |
| Stats row → player, prefetched | 72 | 74 | **70** | 52.5 / 25 |
| Player → team, prefetched | 115 | 118.5 | **115** | 69.5 / 68 |
| Nav → Stats, prefetched | 171 | 169.5 | **159.5** | 110.5 / 105 |

- **The prefetched nav → Stats floor is still one long task**, about 105–110 ms here. SP03's
  trace on a busier machine measured 190 ms. It starts about 40–50 ms after the click and
  renders the 1.3 MB of table markup from the cached payload. Removing 500 KB of payload moved
  it by about 5 ms, so the markup sets it, not the data.
- **Player → team** is a 68–70 ms render task, as at SP04.
- An earlier pair (before the `loading` fix, `prelim/`) gave the same picture.

### Warm `measure.py` (cache on, full set, `measure-final-summary.txt`)

| | Before | After | SP04 |
| --- | --- | --- | --- |
| Player pages | 13–33 ms | 14–28 ms | 14–37 ms |
| Team pages | 32–35 ms | 28–30 ms | 32–38 ms |
| Stats | 43 ms | 33 ms | 47–52 ms |
| Players | 24 ms | 9 ms | |
| API reads (all hits) | ≤ 2.6 ms | ≤ 1.3 ms | |

### Snapshot and page text

- **Snapshot: no differences.**
  - Against the before snapshot, with the cache on: two differences.
    - The away six-factor read: the known last-digit jitter, beyond 12 digits this time, as at
      SP04.
    - The workspace read: personal state. Its version moved to 133 during the session, and an
      API run from `HEAD` returns the byte-identical body.
  - So, as SP04 did, a new snapshot from a `HEAD` API (cache off,
    `snapshot-before-head2.json`): the after API compared against it three times, **no
    differences** (`snapshot-compare-after-vs-head2.txt`).
  - The new `…-sort-only` bodies were then snapshotted from the after API
    (`snapshot-after.json`; self-compare: no differences).
- **Page text: 0 differences** on all 12 pages (`page-text.json`). Compared: two before captures
  (equal to each other and to SP04's counts), the first after build, and the final after build.
  The visible hero ranks are part of the player pages' text.

### Database writes

The API persists the cohorts it computes. 82 `stats_cohort_entries` were created during the
session:

- 42 (17,521 rows) when the `HEAD` API, cache off, read LeBron's and Bird's careers for the
  snapshot (their seasons exactly);
- 1 at the after API's first Stats read;
- 39 at 04:27 and 04:35–04:38 local, while none of this block's APIs had a request in flight.
  They are likely the other session's.

Left in place: they are the store's recomputable serving rows. `data/derived/job-health/` was not
created (no stamp bump, no `warm-site`).

### Where this differs from the plan and the handoff

- **Two floors**, above. The Stats markup and the site-wide stylesheet set them.
- **Not done: trimming the catalog** (58 KB on every page). It flows into many components
  (`ContextBar`, the scope fields, route availability reads `capabilities`), and the saving is
  about 20 KB a page; the risk of a missed reader was not worth it here.
- **The plan's "charts below the first screen"**: only charts the server does not render moved
  behind `next/dynamic`: the Stats scatter and lines views and the trend dialogs. A chart in the
  server HTML still needs its code to hydrate, so `dynamic()` would not take it out of the first
  load, and `ssr: false` would show an empty box at load (a layout change).
- **Overlay first opening waits for its chunk** (one local request, a few ms; a Cloudflare HIT
  live). The overlay then appears with its usual entrance; nothing else on the page changes.
- **`header.test.tsx`**: the palette test now awaits the dialog (`findByRole`), because it loads
  on first opening.
- **Tooling**: the navigation spec gained long tasks; `urls.json` has 7 new snapshot bodies. The
  scratch tools are in `tools/`: `html_weight.py`, `transfer.mjs`, `bundle_report.py`,
  `css_report.py`, `hero_ranks.py`, `longtasks.py`, `convert_links.py`, and the hunk-splitting
  helpers used to isolate this block from the other session's edits.

### Checks

- **Python** (on the isolated tree): `ruff check`, `ruff format --check` (731 files) pass.
  `mypy src/courtlens`: no issues (411 files). `mypy --strict scripts/speed/*.py`: no issues.
- **pytest** (`scripts/test_python.py`, disposable Postgres 17, working tree including the other
  session's change): 7 files on the query route, presentation, read cache and personal state
  (`test_personal_state`, `test_stats_v4`, `test_read_cache`, `test_workbench_api`,
  `test_player_career_postgres`, `test_impact_serving_postgres`,
  `test_stats_presentation_postgres`): **123 passed**, 3 deselected. `test_agent_providers.py`
  was not run: no provider code changed, and its 8 `[anthropic]` cases were red before SP00.
- **Dashboard**: `npm run lint` (ESLint with the new prefetch rule, entity-href and control-kit
  rules; Stylelint) and `typecheck` pass, on the isolated tree and the working tree. Vitest
  (working tree): **152 files, 1,094 passed**, including `client-props.test.ts` (10),
  `team-branding-client.test.ts` (2) and `use-opened-once.test.tsx` (4).
- **Playwright, fixture production build** (webpack, mock API :4180, dashboard :3181): every
  spec except the two real-data ones (`assistant-panel-real`, `im06-real`, and titles matching
  "real"), 4 workers: **646 passed, 13 failed, 27 skipped, 7 did not run**.
  - **11 of the 13 fail the same way on a `HEAD` fixture build**, so they predate SP05:
    `advanced-research:61`, `f04-accounts:32`, `pc12-demo-hygiene:6`, `roster-shapes` ×4,
    `visual-baselines` ×4.
  - The other two pass alone: `live.spec.ts:83` (2 of 2, one worker), and
    `site-links-prefetch` `/draft` after the wait above.
  - `site-links-prefetch` and `speed-navigation`, `--repeat-each=3`: 27 passed.
  - The first fixture run, before the `loading` fix, had 11 more failures (focus return in
    `conversation`, `stats-preview`, `table-interactions` and `threaded-assistant` ×8). All pass
    now.
- `speed-navigation.spec.ts` with `SPEED_REAL=1`, before and after: passed (four runs).
- Full suites not run as suites: the owner's stop after SP06. Not deployed; nothing ran against
  the live site. Servers, Playwright browsers, the mock API, the scratch trees and the workspace
  were stopped and removed.

## 2026-11-15 — SP06 built: images and static files

Done-when: **met, except "no layout shift reported"**: the player and team pages report small
shifts, none from an image, and both builds show them identically (below). Evidence:
`docs/evidence/speed/sp06/`, scratch tools in its `tools/`.

### Local stack, and the pager session's edits

- The pager session's edits (numbered paging, `page_cursors`) were still uncommitted in the tree,
  so every measurement compares two isolated trees, as SP05 did:
  - **before**: `git archive HEAD` (b3367cca) of `dashboard src tests scripts`;
  - **after**: the same plus this block's files only (`tools/mine.txt`). `workbench.py` is shared
    with the pager session, so its two SP06 edits were replayed onto `HEAD`'s copy
    (`tools/replay_workbench.py`; the result equals this block's two hunks exactly).
- Turbopack production builds on :3180 (and :3181 for the A/B runs), the API on :8180 with the
  read cache and warm start on, the PC's copy, release `71639af2…`, scope 2026-27 before
  2026-11-13. A webpack fixture build of each tree against the mock API (:4180) for Playwright.
- ListAgents at the start: two peer sessions, both idle.

### What was built

1. **Portraits at a `.webp` path.** `GET /api/workbench/players/{id}/portrait.webp` is a second
   route on the same handler (`get_player_portrait`): same query parameters, same bytes, same
   `Cache-Control: public, max-age=86400`. The old path keeps working.
   - Read-cache class `never` (binary), like the old path. The route classification test fails
     without it (checked: `unclassified_routes` names the route when its class is removed).
   - `lib/portrait-source.ts` accepts either path and always asks for `/portrait.webp`. The API
     still returns `portrait_url: "/api/workbench/players/{id}/portrait"` (`stats_engine`,
     `entity_lookup`, `workbench_analytics`). Changing those would change API bodies and their
     snapshot hashes; the builder rewrites them instead. The Lineup Model's prebuilt URL and the
     Settings page's "Serving route" line now name `.webp` too.
   - **Caddy needs no change**: `handle /api/*` proxies every method-allowed request to the API,
     and GET is allowed (`deploy/Caddyfile`). Its `header` block adds no `Cache-Control`.
   - Without `size`, both paths serve the original file (PNG) under its own type. The dashboard
     always sends `size`.
2. **Cache headers from `next.config.ts`** (after the security block, so the last-wins rule only
   adds `Cache-Control`):
   - `/team-logos/:file([a-z0-9-]+-[0-9a-f]{16}\.(?:svg|png))`: `public, max-age=31536000,
     immutable`. All 214 files match, and each name's hash is the first 16 hex of the file's own
     SHA-256 (checked, 0 mismatches). The rule is still scoped to the pattern, so a future file
     without a hash keeps the default.
   - `/flags/:file*`: `public, max-age=2592000`.
   - A missing file keeps `no-store` (a 404 on a hashed-shape name is not cached).
3. **Images** (`PlayerPortrait` gains `priority`):

| Image | Before | After |
| --- | --- | --- |
| Player page hero (`player-bio-header`, `xl`) | eager | **eager, `fetchPriority="high"`** (`priority`) |
| Other `lg`/`xl` portraits (Players cards, Compare slots, showcase, matchups, last games, twins) | eager | lazy |
| `sm`/`md` portraits | lazy | lazy (unchanged) |
| `TeamWatermark` (every card and the hero) | eager, **no width/height** | lazy, `width=160 height=160` |
| College logo (bio) | eager, 18×18 | lazy |
| Flag (bio) | eager, 20×15 | lazy |
| Live recap photo | lazy, **no width/height** | `width=640 height=360` |
| Live news photos | lazy, **no width/height** | `width=96 height=54` |
| Live venue photo | lazy, **no width/height** | `width=640 height=360` |
| `TeamLogo` | lazy, size×size | unchanged |
| SVG `<image>` (compare and grid exports, Contracts flow, Live shot chart) | width/height in SVG units | unchanged (SVG has no `loading`) |

   The given sizes change no layout. Page CSS already sets each box: the watermarks are absolute
   with CSS width and height (or width and `aspect-ratio: 1`), and the Live photos have a CSS
   width and an explicit `aspect-ratio: 16 / 9` that the attributes match. srcset candidates
   and `sizes` are unchanged.

### Headers (local production build; `headers-before.txt`, `headers-after.txt`, `headers-after-edges.txt`)

| File | Before | After |
| --- | --- | --- |
| Portrait `/portrait?size=288&crop=face-v6` | 200 `image/webp`, `public, max-age=86400` | the same |
| Portrait `/portrait.webp?size=288&crop=face-v6` | **404** | 200 `image/webp`, `public, max-age=86400`, 20,626 B |
| Team logo `1610612747-5b68f7b92ba7d058.svg` | `public, max-age=0` | **`public, max-age=31536000, immutable`** |
| Era logo `bos-1977-4571e077bce6b1e7.png` | `public, max-age=0` | **`public, max-age=31536000, immutable`** |
| Flag `us.png` | `public, max-age=0` | **`public, max-age=2592000`** |
| `/_next/static/chunks/*.js` | `public, max-age=31536000, immutable` | the same (Next's own) |
| A page (`/players/2544`) | `private, no-cache, no-store, …` | the same |

`X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` are on every path before and
after. The first look's `max-age=14400` on logos and flags was Cloudflare's default browser TTL
over the origin's `max-age=0`; it applies only when the origin's value is lower, so the new
values should pass through.

`scripts/speed/urls.json` has a new `static` section (both portrait paths, a season portrait, the
two logos, the flag), and `measure.py` reports it (`kind` `file`, from the API origin when the
entry says `"origin": "api"`; the table shows `cf-cache-status` and `cache-control` for files).

### Portrait bytes (`portrait-bytes.txt`)

13 queries at both paths (sizes 64–288 and none; LeBron current and 2003-04 CLE, 2011-12 MIA,
2019-20 LAL; Bird current and 1991-92 BOS; the rookie; Jokić 2015-16 DEN; Durant 2007-08 SEA and
2016-17 GSW): **13 identical** in SHA-256, status, `content-type`, `content-length`,
`cache-control` and `x-portrait-season`. pytest covers the same for sizes 64, 128, 288 and none,
the 422 and 404, and a season and team query.

### LCP and CLS (`lcp-*.json`, `summary.json`)

Measure: a `PerformanceObserver` for `largest-contentful-paint` and `layout-shift`, registered
before any page script (`buffered`), in Playwright Chromium, fresh context per load, 1440×900,
no input. This is the same browser measure a trace records; no trace file was kept.

**Interleaved** (`lcp-interleaved.json`): both builds served at once against one API, one load at
a time, alternating ABAB, 10 loads per build and page after a warm-up load:

| Page | LCP element | Before | After |
| --- | --- | --- | --- |
| LeBron 2544 | hero `img.player-portrait` (`portrait?size=192` → `portrait.webp?size=192`, 27,556 px²) | 428 ms (404–468) | **420 ms** (376–472) |
| Bird 1449 | hero portrait | 378 ms (336–404) | **348 ms** (332–440) |
| Lakers | `h1` "Los Angeles Lakers" | 216 ms | 216 ms |

- The hero file arrives at about 49 ms (resource timing) on both builds. The paint waits for the
  streamed hero section to render, about 420 ms locally, so high priority changes little here.
  On the live site the image crosses the network, and there it can matter.
- The **sequential rounds** (`rounds/`; each round restarted the API, after always second) gave
  440 → 464 ms and 390 → 424 ms, and also +20 ms on the Lakers' `h1`, which SP06 does not touch.
  That ordering effect is why the interleaved run is the one that counts.
- In 1 of 5 loads of the first after run, the final LCP entry was the hero's watermark
  (`player-bio-watermark`, 28,223 px², at 320 ms, before the portrait). That happens only when the
  watermark paints first.

**Layout shift**: 0 shifts from an image in any load of either build (70 loads checked source by
source). Two shifts that exist on `HEAD` remain, identical on both builds:

| Page | Shift | Source |
| --- | --- | --- |
| Lakers | 0.00374, every load | the Stats preview rail: the hotkeys card moves up 100 px as the "Hover over a player…" hint and its icon appear |
| Player pages | 0.00021, some loads (Bird 4–7 of 10, LeBron 0–1 of 10) | the header's right group widens from 158 to 206 px when "Sign in" appears, moving the search pill's `⌘K` |

Removing these is a layout or behaviour change outside SP06, so they stay. **This is the floor
for "no layout shift"**, and the owner's call.

### Side effect: React's image preloads (`image-preloads.txt`)

React's server renderer adds `<link rel="preload" as="image">` to `<head>` for every image that is
not lazy. Eager portraits and watermarks were preloaded; now only the hero is:

| Page | Image preloads before | After |
| --- | --- | --- |
| Players | 72 (36,072 B) | 0 |
| Compare | 4 (1,519 B) | 0 |
| Player pages | 3–4 (watermark, hero, flag) | 1 (the hero, `fetchPriority="high"`) |

### HTML (`html-ab-sizes.txt`, `html-ab-normalised.txt`, `portrait-url-growth.txt`)

Both builds at once on one API. Each portrait URL grows by 5 bytes (`.webp`).

| Page | Before | After | Change |
| --- | --- | --- | --- |
| Stats | 1,631,968 | 1,640,968 | +9,000 (1,800 portrait URLs) |
| Players | 280,081 | 247,530 | −32,551 (72 preloads gone, 300 URLs +1,500) |
| Lakers / Celtics | 1,131,898 / 1,036,875 | 1,136,098 / 1,040,445 | +4,200 / +3,570 |
| Compare | 397,645 | 396,337 | −1,308 |
| Player pages | | | −60 to +16 |
| RAPM | 666,800 | 667,550 | +750 |
| `/`, Teams, Standings | | | 0 |

With the intended changes normalised away (the `.webp` suffix, image preloads, `loading` and
`fetchPriority`, the watermark size, and build-specific chunk names), **all 12 pages are
byte-identical** between the builds (`tools/html_ab.py`). RAPM's first fetch differed only in the
order two streamed chunks arrived; four refetches were identical.

**Finding for the owner: the Stats guide-cell portraits** (`guide-cell-weight.txt`). The server
HTML carries 300 portrait `<img>` tags (265,574 B), 250 of them guide cells (220,395 B). At
1440 px none of the 250 is in the DOM after hydration, so they never load an image. Their cost is
all markup, and 7,500 of the 9,000 bytes `.webp` adds to Stats. The 50 primary portraits load 64w
files at DPR 1 and 96w at DPR 2 (39 loaded after scrolling: 90 KB at DPR 1, 148 KB at DPR 2).
srcset and `sizes` were not changed (that changes which file a screen loads).

### Warm `measure.py` and navigation

Today's machine is busier than at SP05 (46 of 60 GB in use), so `HEAD` itself measures slower
than SP05's recorded numbers. As the handoff asks, the comparison is within this session.

**Warm** (`rounds/`, cache on, two rounds per build alternating, median of round medians):

| | Before (`HEAD`) | After | SP05 recorded |
| --- | --- | --- | --- |
| Player pages | 18.3–35.4 ms | **14.3–31.6 ms** | 14–28 ms |
| Team pages | 31.9–36.4 ms | **29.0–33.8 ms** | 28–30 ms |
| Stats | 37.0 ms | **36.4 ms** | 33 ms |
| Players | 11.4 ms | 10.3 ms | 9 ms |
| API reads (all hits) | ≤ 1.6 ms | ≤ 1.5 ms | ≤ 1.3 ms |

**Navigation**, interleaved (`nav-interleaved/`, both builds served at once on one API, spec runs
alternating, 15 runs per journey per build, medians):

| Journey | Before | After | SP05 recorded |
| --- | --- | --- | --- |
| Stats row → player | 160 | **149** | 136.5 |
| Player header → team | 147 | 151 | 130.5 |
| Header nav → Stats | 191 | **186** | 170 |
| Back (Stats → team) | 137 | **135** | 126 |
| Stats row → player, prefetched | 76 | **75** | 70 |
| Player → team, prefetched | 131 | **124** | 115 |
| Nav → Stats, prefetched | 181 | **179** | 159.5 |

The sequential rounds (10 runs each, API restarted per round) gave a mixed picture: after better
on three journeys, equal on one, worse on three (back 144 → 153, prefetched row → player 76 → 84,
prefetched nav → Stats 181 → 189). In the interleaved run, which shares one API and removes the
restart, after is equal or faster on six of seven, and player header → team is +4 ms. SP06
changes no route code and no client JS beyond image attributes, so these differences are noise.

### Snapshot and page text

- **Snapshot**: the after API against the before snapshot (`snapshot-before.json`, `HEAD` API):
  **no differences** (`snapshot-compare-after.txt`). The three team six-factor reads are equal at
  12 significant digits (the known jitter). The workspace read did not move this time.
- **Page text**: **0 differences** on all 12 pages (`page-text-before.json`, `page-text-after.json`).

### Database writes (`db-writes.txt`)

None. `stats_cohort_entries` held 250 rows (newest 10:24 UTC) before the first API start and
still did after the last. `data/derived/job-health/` was not created (no stamp bump, no
`warm-site`).

### For the stop after SP06: the Cloudflare check

After the owner's deploy, run `docs/evidence/speed/sp06/cf-cache-check.sh` (GETs only). It
requests each of these twice, 2 s apart:

```bash
curl -s -o /dev/null -D- 'https://courtlens.calebhabesh.com/api/workbench/players/2544/portrait.webp?size=288&crop=face-v6' | grep -iE '^(HTTP/|cf-cache-status:|cache-control:|age:)'
```

and the same for the old portrait path, the Lakers logo and the US flag. Expected:

- `.webp` portrait: the second answer `cf-cache-status: HIT`;
- the old path: `DYNAMIC`, as before;
- the logo and flag: the new `cache-control`.

`.webp` is in Cloudflare's default cached extensions, and the response is `public` with no
cookie. No zone or Caddy change is needed.

### Where this differs from the plan and the handoff

- **Layout shift**: floor above; the shifts are pre-existing and not from images.
- **LCP from a `PerformanceObserver` in Playwright**, not a saved trace (the handoff allowed
  this).
- **The API's `portrait_url` still names `/portrait`**; the dashboard rewrites it (snapshot hashes
  unchanged).
- **Stats HTML +9,000 B** against SP05's floor (1.63 → 1.64 MB), 7,500 B of it in guide-cell
  portraits that hydration removes. Players −32 KB from the preloads.
- **Settings text**: the "Serving route" line names `/portrait.webp`.
- **`ruff check .` was already red on `HEAD`**: 197 findings, all in the SP04 and SP05 scratch tools
  committed under `docs/evidence/speed/*/tools/`. Not touched here. SP06's own Python tools pass
  `ruff check` and `ruff format --check`.

### Checks

- **Python** (isolated tree): `ruff check src tests scripts` and `ruff format --check` (731 files)
  pass; `mypy src/courtlens`: no issues (411 files); `mypy --strict scripts/speed/measure.py`:
  no issues. Working tree `ruff check .`: red only on the SP04/SP05 evidence tools above.
- **pytest** (`scripts/test_python.py`, disposable Postgres 17), on both the working tree and the
  isolated tree: `test_portrait_derivatives`, `test_season_portraits`, `test_read_cache`
  (route classification), `test_bbref_portraits`, `test_wikidata_portraits`,
  `integration/test_workbench_api`: **85 passed, 3 deselected**, both trees.
  `test_agent_providers.py` not run: no provider code changed (its 8 `[anthropic]` cases were
  red before SP00).
- **Dashboard**: `npm run lint` (ESLint with the prefetch, entity-href and control-kit rules;
  Stylelint) and `typecheck` pass on the isolated tree and the working tree. Vitest: isolated
  **152 files, 1,092 passed**; working tree 153 files, 1,098 passed (with the pager session's
  test). New: `player-portrait.test.tsx`, a hero test in `player-bio-header.test.tsx`, and a
  `.webp` case in `portrait-source.test.ts`.
- **Playwright, fixture production build** (webpack, mock API :4180), every spec except
  title-matched "real", 4 workers: **646 passed, 13 failed, 27 skipped, 7 did not run**
  (`playwright-fixture-after.log`).
  - 11 are SP05's `HEAD` failures: `advanced-research:61`, `f04-accounts:32`,
    `pc12-demo-hygiene:6`, `roster-shapes` ×4, `visual-baselines` ×4. The four visual baselines
    were rerun on a `HEAD` fixture build: the same four fail, with identical pixel counts (25,023;
    7,581; 6,276; 28,552).
  - `live.spec.ts:83`: passes alone (2 of 2).
  - `table-interactions.spec.ts:63`: a focus-return flake on both builds. At 4 workers, 40 runs
    each, alternating: `HEAD` 3 failures, after 2, all the same `toBeFocused` assertion.
  - `f04-accounts.spec.ts:59` (the demo account's favourites; its portrait request now matches `.webp`) passed.
- Full suites not run as suites (the stop after SP06). Not deployed; nothing ran against the live
  site; Cloudflare not touched. Servers, Playwright browsers, the mock API and the scratch trees
  were stopped and removed.

## 2026-11-15 — Owner approves SP00–SP06

The owner, after SP06 and the pager commit: "Alright, you can approve all slices we have worked on
up until now." SP00–SP06 are ✅ in the plan, and Stats follow-up 85 (numbered paging, the other
session's change committed as 75e0b4f4) is ✅ in the alignment catalog.

The approval marks the blocks. It does not change the budget, and the open items for the
G1/G2 stop remain:

- the full suites and the owner's deploy;
- the Cloudflare `.webp` check (`docs/evidence/speed/sp06/cf-cache-check.sh`);
- `docker stats` during the first crawl and the API's warm start, and `measure.py` live;
- the owner's calls on the recorded floors: SP03's two prefetched journeys, SP05's Stats HTML and
  player first load (per-route CSS, the Stats markup, lazy motion), SP06's two non-image layout
  shifts and the Stats guide-cell portraits;
- which of Early Hints, 0-RTT and Smart Tiered Cache SP07 turns on.

## 2026-11-15 — G1/G2 stop: part A (branch mergeable, full suites)

The stop after SP06 (plan, "Decided (owner, G1, 2026-11-15)"). Part A needs no owner input; it ends
at owner point 1 (push and PR). Evidence: `docs/evidence/speed/stop/`. ListAgents at the start:
two peer sessions, both idle; the tree was clean at f7a93fc5.

### Ruff (2abfd9e8)

CI runs `ruff check .` and `ruff format --check .` on the whole repository. Both were red: 197
findings and 13 files to reformat, all in the SP04 and SP05 scratch tools under
`docs/evidence/speed/sp04/tools/` and `sp05/tools/`.

- Fixed in place: `ruff --fix` and `ruff format`, then 42 by hand: `with` blocks for `open()`,
  long f-strings split, ambiguous names renamed, a `def` for one lambda, `contextlib.suppress`,
  an import moved to the top, one unused assignment removed, the loop variable bound in
  `css_report.py`'s nested `walk`. No exclude added to `pyproject.toml`.
- What the tools compute is unchanged. `waves.py`, `longtasks.py`, `transfer_top.py` and
  `css_report.py` give byte-identical output before and after on the recorded evidence;
  `textdiff.py` fails identically on the one pair tried (traceback line only). The others need a
  live API, database or an uncommitted analyzer export; their edits are mechanical.
- `ruff check .`: all checks passed; `ruff format --check .`: 1,185 files formatted (`ruff.log`).

### Live spec fix (53099747)

`live.spec.ts:83` failed 3 runs in 20 on this branch at 1 and 4 workers, with a strict-mode
violation: `.live-banner` resolved to 3 elements. On a fixture build of `main` (bca82d3c) it passed
10 of 10. Cause: the Live game skeleton added on this branch (37775732,
`components/live-skeletons.tsx`) reuses `<header className="live-banner">` inside an
`aria-hidden` `.live-game`, and while the page streams in both are in the DOM. The page itself is
right (the skeleton is hidden); the spec's locator was too wide. Both banner locators now scope to
`.live-game:not([aria-hidden])`. The whole Live spec, 4 workers, 10 repeats: **140 of 140 passed**
(`playwright-live-fixed.log`). So `live.spec.ts:83` was not a worker-count flake on this branch;
it is fixed, not waived.

### Full suites (branch at 2abfd9e8; the live spec rerun at 53099747)

| Suite | Result |
| --- | --- |
| `ruff check .`, `ruff format --check .` | pass |
| `mypy src/courtlens` | no issues, 411 files |
| pytest, `scripts/test_python.py` (disposable Postgres 17), 8 min 24 s | **3,004 passed, 8 failed, 4 skipped, 25 deselected**. The 8 are the `[anthropic]` cases in `tests/unit/test_agent_providers.py`, red since before SP00; not fixed (`pytest-summary.log`) |
| `npm run lint` (ESLint + Stylelint) | pass |
| `npm run typecheck` | pass |
| Vitest | **153 files, 1,098 passed** |
| Playwright, webpack fixture production build (mock API :4180, dashboard :3181), every spec except titles matching "real", 4 workers, 3.1 min | **655 passed, 11 failed, 27 skipped**, none left unrun (`playwright.log`) |

The 11 Playwright failures:

- 10 are the known `HEAD` failures recorded at SP05 and SP06: `advanced-research:61`,
  `pc12-demo-hygiene:6`, `roster-shapes` ×4, `visual-baselines` ×4 (player profile desktop and
  phone, search modal phone, roster shapes depth chart phone).
- `live.spec.ts:83`: above; fixed.
- `f04-accounts:32`, also on the known list, **passed** in this run.
- `table-interactions.spec.ts:63` (the known 1-in-15 focus flake) passed in this run.

Servers, Playwright browsers, the mock API, the test container and the scratch trees (branch and
`main` fixture builds) were stopped and removed. Nothing was pushed, deployed or run against the
live site; Cloudflare was not touched.

## 2026-11-15 — G1/G2 stop: owner's order, zone read, live before any deploy

The owner, at owner point 1: "You will be doing everything. You can push the branch and open a pr,
but I would like to finish everything in this plan first." So the branch is pushed and the PR
is a **draft**, [#110](https://github.com/calebhabesh/courtlens/pull/110), and it is not merged.
The one deploy then comes in SP08, and the stop's live checks after a deploy (the Cloudflare
`.webp` check, `docker stats` during the warm start and the first crawl, `measure.py` live) move
there.

### Zone settings (`zone-settings-before.txt`, cf CLI, read only)

| Setting | Value |
| --- | --- |
| Early Hints | off |
| 0-RTT | off |
| Smart Tiered Cache | off |
| Tiered caching (Argo) | off, not editable on this plan |
| Browser cache TTL | 14400 (Cloudflare's default 4 hours) |
| HTTP/3 | on |
| Brotli | on |
| Cache level | aggressive |

Nothing in Cloudflare was changed.

### Live, still running `main` (`measure-live-predeploy-*.json`, 5 runs)

Same code and data as the SP00 baseline, and it measures the same: player pages 0.75–1.47 s,
team pages 1.46–1.61 s, Stats 0.71 s, Compare 1.63 s, API reads 36–371 ms, every page and read
`DYNAMIC`. This is SP07's "before" reading if SP07 runs before the deploy.

**Finding: Cloudflare caches the `.webp` 404 for now.** `main`'s API has no `portrait.webp` route,
so those URLs answer 404 JSON with no `Cache-Control`. Cloudflare caches the 404 (`HIT`, Age
7–35 s: its short default edge TTL for 404) and sends `max-age=14400` to the browser from the zone's
browser TTL (`webp-404-predeploy.txt`). Only `measure.py` and curl asked for those URLs (`main`'s
pages request `/portrait`). After the deploy, wait a few minutes after the last such request
before `cf-cache-check.sh`, or the first answer may be a cached 404.

## 2026-11-15 — G2: the owner's answers

Asked at the G2 gate with the budget table (baseline, local SP04–SP06, live on `main`):

1. **SP07 zone settings:** "Choose the optimal settings for courtlens." Chosen, after reading the
   live headers:
   - **Smart Tiered Cache on.** Edge locations fetch through one upper tier, so a low-traffic site
     gets more `HIT`s on portraits, logos and chunks. Zone-wide, free, no effect on dynamic
     responses.
   - **Early Hints on.** The pages already send `Link: rel=preload` for the two fonts, so
     Cloudflare can answer with 103 while the page renders.
   - **0-RTT on.** Saves a round trip when a returning visitor resumes a connection. CourtLens's
     GETs are reads, and the POSTs Caddy allows are read-only queries, so a replay cannot write.
   - **Browser cache TTL left at 14400.** It applies only to responses Cloudflare caches (API reads
     carry no `Cache-Control` and are `DYNAMIC`, so it never touches data). The un-hashed public
     files (brand, fonts, icons, `og-image.png`) send `max-age=0`, and the 4 hours is what lets
     browsers keep them; "respect existing headers" would make each visit revalidate them. Hashed
     chunks, logos and flags already send longer values, which pass through.
2. **D6:** stays closed.
3. **Floors:** accepted as recorded.
4. **Gates:** G2 ✅ now; G1 after the SP08 deploy.

## 2026-11-15 — SP07 built: Cloudflare settings

Done-when: **met.** Evidence: `docs/evidence/speed/sp07/`.

### Changed (cf CLI; `zone-settings-before.txt`, `zone-settings-after.txt`)

| Setting | Before | After |
| --- | --- | --- |
| Smart Tiered Cache | off | **on** (22:18:57 UTC) |
| Early Hints | off | **on** |
| 0-RTT | off | off |
| Browser cache TTL | 14400 | 14400 |

Each change was dry-run first (one `PATCH` each).

**0-RTT left off, against the G2 entry above.** It is zone-wide, and the zone's proxied hostnames
include `doorbell`, whose root redirects to an `/access` gate. Whether any of its GETs act (a
sign-in link, say) cannot be seen from here, and early data can be replayed. CourtLens would gain
one round trip on resumed connections only. Not worth the exposure on sites this plan does not
own.

### Early Hints works (`early-hints.txt`)

From the second request on, a player page answers `103` with the two font preloads, then `200`.
After a deploy that renames the font files, the first 103s may name the old files until Cloudflare
sees the new `Link` header; a stale preload only wastes one request.

### Other hostnames (`hosts-check.sh`, `hosts-before.txt`, `hosts-after.txt`)

GET `/` twice on each proxied hostname (`calebhabesh.com`, `www`, `courtlens`, `doorbell`,
`linewatch-dev`), before and after: **same status, redirect, content type, body size and cache
headers on all five.** `linewatch-dev` answered 530 (origin down) before the change too.

### Live `measure.py` before and after (5 runs each; both on `main`'s code)

Before: `docs/evidence/speed/stop/measure-live-predeploy-*.json`; after:
`measure-live-sp07-after-*.json`.

| | Before | After |
| --- | --- | --- |
| Player pages | 0.75–1.47 s | 0.75–1.49 s |
| Team pages | 1.46–1.61 s | 1.26–1.38 s |
| Stats | 0.71 s | 0.65 s |
| Compare | 1.63 s | 1.66 s |
| Static files (logos, flag, portrait) | 42–50 ms | 35–42 ms |

Pages are set by `main`'s render on the origin, which SP07 does not touch; their differences are
noise. Tiered cache and Early Hints show in first visits from cold edge locations and in the
browser's font fetch, which `measure.py` (curl, no browser) does not see. The SP08 deploy brings
the speed work itself.

## 2026-11-15 — SP08 part 1: guards, docs, suites (before the merge)

Evidence: `docs/evidence/speed/sp08/`.

### Guards that stay in CI

- **Route classification:** `tests/unit/test_read_cache.py` (since SP01) fails on any GET or
  allowed POST without a class. CI runs it with the full pytest.
- **Prefetch request counts:** `site-links-prefetch.spec.ts` and `speed-navigation.spec.ts`
  (since SP03 and SP05) run in CI's Playwright job against the mock API.
- **Byte ceilings (new):** `dashboard/e2e/speed-page-weight.spec.ts`, against the mock API:
  - Stats HTML ≤ 340,000 B and player 23 ≤ 230,000 B, about 15% above the fixture build's
    297,085 B and 200,998 B;
  - Stats HTML carries the table's own `table_percentiles` but neither the analytical
    `percentiles` map nor `cohort_sample_sizes` (SP05's `statsTableData`).
  - **Checked that it bites:** with `tableRow` made to return the row unchanged in a sandbox
    build, the Stats test fails on the `percentiles` check (`guard-negative.log`). The player page
    has a ceiling only: the fixture's career rows never carry those maps, so a field check there
    would test nothing.
- Timings are not asserted in CI.

### Docs

- `docs/deployment.md`: a **Speed** section (read cache and its classes, credential bypass, the
  data stamp, `bump-data-stamp`, `/api/cache/status`, warm start, warm crawl, memory, how to turn
  the cache off, prefetch and the Cloudflare settings).
- `docs/operations/hosted-operations.md`: a row for the warm crawl in "What runs", and a line to
  run `bump-data-stamp` after a hand-run write.

### Suites (fixture build of 066c05c7's tree; dashboard checks in the same sandbox)

- Playwright, every spec except "real", 4 workers: **658 passed, 10 failed, 27 skipped**
  (`playwright-fixture.log`). The 10 are exactly the known `HEAD` failures (`advanced-research:61`,
  `pc12-demo-hygiene:6`, `roster-shapes` ×4, `visual-baselines` ×4); `live.spec.ts:83` and the
  new guard pass. On `main`, CI passes all three jobs, so these 10 fail only in local runs.
- `npm run lint`, `typecheck`: pass. Vitest: **153 files, 1,098 passed**.
- Python: unchanged since part A's full run (3,004 passed, the 8 `[anthropic]` cases red); CI
  reruns it on the PR.
- CI on the PR: the runs for superseded commits were cancelled (no `concurrency` group in
  `ci.yml`, so each push started a full run in parallel).

### Left for part 2

The merge, the deploy (inside the deploy log's 9:00 AM to noon Eastern window), and after it: the
`.webp` check, `docker stats` during the warm start and the first crawl, `measure.py` live (five
runs after the crawl, one during it if caught), the navigation spec live, and the final table.
