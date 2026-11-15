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
