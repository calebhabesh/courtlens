# Hosted demo

CourtLens runs as a public demo at <https://courtlens.calebhabesh.com>, linked from the
portfolio site, at zero recurring cost. It began as a read-only frozen snapshot (2026-10-13). Since
Win Probability v4's W7 (2026-11-13) **the VPS is the system of record**: it runs every scheduled
job, holds the only live database and owns `data/`. The owner's PC is for development and only
pulls from it (`scripts/pull-from-vps.sh`). The owner's one-page summary is
[Running the hosted demo](operations/hosted-operations.md).

## Shape

Cloudflare HTTPS → a dedicated `courtlens` Cloudflare Tunnel → `127.0.0.1:8090` on the
shared Oracle VPS (Always Free, arm64) → Caddy → the Next.js dashboard or the FastAPI API
→ Postgres 17. The stack lives at `/home/ubuntu/apps/courtlens` as its own Compose
project, next to LineWatchTO and the portfolio; it shares no network, volume or config
with them. Only the loopback origin port is published.

| File | Role |
| --- | --- |
| `deploy/compose.prod.yml` | Production services with memory/CPU caps, restart policies and rotated logs |
| `deploy/Caddyfile` | Routing and the read-only boundary |
| `deploy/pinned.env` | Third-party image digests and serving manifest paths |
| `.github/workflows/ci.yml` | Tests every pull request and main commit; reuses a pull request's result on main when the tree is identical ([CI](#ci)) |
| `.github/workflows/images.yml` | arm64 API and dashboard images, built after CI passes on main |
| `scripts/deploy-vps.sh` | Pull, migrate, health-check, warm Stats cohorts, prune; copies nothing under `data/` |
| `scripts/vps-backup.sh` | Weekly database dump and nightly records copy, from the VPS crontab |
| `scripts/pull-from-vps.sh` | Copies the VPS's `data/` (and, on request, a database dump) to the PC; never pushes |

### Read-only boundary

The local workbench is single-user: its Next.js route handlers attach the operator token
to writes. The hosted demo removes that in two layers:

1. The dashboard container has no operator token, so its writes fail at the API, which
   runs with `COURTLENS_ENVIRONMENT=production` and unique secrets.
2. Caddy refuses every non-GET request except `POST /api/workbench/query` and
   `POST /api/workbench/operations/*`, which compute results without writing, the four
   public Ask writes below, and the account writes under Accounts and favourites.

Workspace changes (boards, saved views, the compare tray), jobs and saved analyses are therefore
unavailable. Favourite players belong to accounts instead (below). The dashboard image is built with `NEXT_PUBLIC_COURTLENS_HOSTED=true` and an empty
`NEXT_PUBLIC_COURTLENS_API_URL`, so browser calls are same-origin.

### Public Ask (2026-11-10)

Anyone with the link may ask a few questions a day. The image is also built with
`NEXT_PUBLIC_COURTLENS_PUBLIC_ASK=true`, which brings back the Ask button and page.

- **Writes allowed:** `POST /api/assistant-v2/turn`, `/turn/stream`, `/threads` and
  `/threads/{id}/turns/{id}/cancel` reach the dashboard's Ask proxy. Deleting history and every
  other write stay refused, and the API's own `/api/workbench/assistant/...` writes are refused
  at Caddy.
- **Credentials:** the dashboard holds only `COURTLENS_PUBLIC_ASK_TOKEN`. The API accepts it for
  those four endpoints only, and only with `COURTLENS_PUBLIC_ASK=true`. Without both, the proxy
  refuses Ask writes on a hosted build.
- **Visitors:** the proxy forwards two salted SHA-256 hashes. One is the browser (an HttpOnly
  cookie), which owns its conversations. The other is the client address (Cloudflare's
  `CF-Connecting-IP`), which carries the limit. A visitor lists and reads only their own threads.
  Threads without a visitor, such as history copied in a database restore, are never listed.
- **Limits:** `COURTLENS_PUBLIC_ASK_PROMPTS_PER_VISITOR` (3) questions per client a day. The site
  stops taking questions once this process has sent `COURTLENS_PUBLIC_ASK_DAILY_REQUESTS` (480)
  Gemini requests minus one full answer (`assistant_max_steps`). Both reset at midnight Pacific,
  with Gemini's free quota. Counts are in memory (one API worker), so a restart forgets them and
  Gemini's own refusal is the backstop. `GET /api/assistant-v2/limits` reports what is left.
- **Model and time:** `COURTLENS_GEMINI_MODEL=gemini-3.5-flash-lite` (the agent's built-in
  default, `gemini-3.8-flash`, timed out on the first live question) and a 45 s turn limit, inside
  the dashboard proxy's 55 s, so a slow turn returns its partial answer.
- **Keys:** `COURTLENS_GEMINI_API_KEY` (required) and `COURTLENS_GROQ_API_KEY` (optional) in
  `secrets.env`. Both must be free-tier keys on accounts with **no billing attached**, so the
  worst case is "limit reached", never a charge. Google Search grounding is refused on the free
  tier, so answers about very recent news may be missing; the Ask page says so.

### Accounts and favourites (finish plan F04, 2026-11-11)

Invite-only accounts keep favourite players. There is no sign-up: the operator creates accounts in
the API container. Anyone may use the one shared demo account with one click.

- **Writes allowed:** `POST /api/account/session` (sign-in), `/demo`, `/sign-out`, and
  `POST`/`DELETE /api/account/favorites/<player id>`. They reach the dashboard's account proxy.
  The API's own `/api/auth/*` and `/api/me/*` are refused at Caddy, so only the proxy reaches
  them, over the Compose network. `scripts/check_caddy_allowlist.sh` runs the pinned Caddy image
  against stub upstreams and checks every allowed and refused write.
- **Session:** the proxy stores the signed session in an HttpOnly, Secure, SameSite=Lax cookie
  (`courtlens-session`, 12 hours) and forwards it to the API as a bearer token. The browser never
  sees it. Sessions are stateless: nothing is stored per sign-in. `courtlens revoke-sessions`
  signs an account out everywhere.
- **Credentials:** the dashboard holds only `COURTLENS_ACCOUNT_PROXY_TOKEN`, which the API requires
  on every account call in production. It also salts the hashed client address sent for the
  limits. The JWT secret and operator token stay in the API. Without the token the API refuses
  accounts, and `docker compose` refuses to start.
- **Limits:** 5 failed sign-ins per client and 10 per email in 15 minutes (then 429 with
  `Retry-After`); 20 demo sign-ins per client an hour; 120 favourite writes per account and client
  an hour. Counts are in memory (one API worker) and bounded at 10,000 keys each. Each account
  holds at most 100 favourites.
- **Pre-F04 users:** the fantasy-league seed users in the restored database (public fixture
  passwords) are disabled by the migration (`account_enabled = false`). `courtlens set-password`
  enables one deliberately.
- **Operator commands** (in the API container): `courtlens create-user --email … --name …`
  (prompts for the password), `set-password`, `disable-user`, `revoke-sessions`, `list-users`.
  For example:

  ```bash
  docker compose --env-file secrets.env --env-file release.env exec api \
    courtlens create-user --email friend@example.com --name "Friend"
  ```

- **Demo account:** `deploy-vps.sh` runs `courtlens seed-demo-account` after each deploy
  (idempotent). Its favourites are one list shared by every visitor.
- **Nightly reset:** the `demo-reset` Compose service (the API image, 256 MB cap, a quarter CPU)
  sleeps in `sh` until 08:00 UTC (about midnight Pacific), then runs
  `courtlens reset-demo-favorites`. That deletes the demo's rows and inserts the eight seeded
  players in one transaction. Storage stays bounded: no history or log rows, at most 100 rows per
  account, and Postgres reuses the deleted rows' space. Because it ships with the stack, there is
  no host timer to install, and `restart: unless-stopped` brings it back after a reboot. Run it by
  hand with `docker compose … exec api courtlens reset-demo-favorites`, and check the last run
  with `docker compose … logs demo-reset`.

**Before the first deploy with F04:** add `COURTLENS_ACCOUNT_PROXY_TOKEN` (from
`openssl rand -hex 32`) to `secrets.env`. The migration `3c4d9e1f0a21` is additive.

### Accounts: sign-up and Google (accounts plan, 2026-11-16)

The [accounts plan](accounts-plan.md) opened accounts: people create one with a password (confirmed
by an emailed link) or with Google. The operator commands above still work, and Ask now needs an
account or the demo account.

- **More writes allowed:** `POST /api/account/sign-up`, `/confirm`, `/forgot-password`,
  `/reset-password` and `DELETE /api/account/me`. Google sign-in is two GETs,
  `/api/account/google/start` and `/api/account/google/callback`. `check_caddy_allowlist.sh`
  covers them.
- **Google:** `COURTLENS_GOOGLE_CLIENT_ID` and `COURTLENS_GOOGLE_CLIENT_SECRET` in `secrets.env`,
  from the CourtLens Google Cloud project's OAuth client (Web application). Its redirect URIs are
  `https://courtlens.calebhabesh.com/api/account/google/callback` and
  `http://localhost:3100/api/account/google/callback`. The consent screen is published ("In
  production"), asks only for `openid email profile`, and links to `/privacy`. Without both
  values the dialog doesn't offer Google.
- **Email:** `COURTLENS_SMTP_HOST`, `COURTLENS_SMTP_PORT` (587), `COURTLENS_SMTP_SECURITY`
  (`starttls`, or `ssl` for 465), `COURTLENS_SMTP_USERNAME`, `COURTLENS_SMTP_PASSWORD` and
  `COURTLENS_EMAIL_FROM` in `secrets.env`, for any free SMTP provider. Without `SMTP_HOST`
  production turns password sign-up and reset off. Development logs the links instead.
- **Limits:** 5 sign-ups or reset requests per client an hour, 3 emails per address an hour,
  90 emails a day for the whole site (under free-tier sending caps), 30 Google starts per client
  an hour. Like the other limits, they live in memory.
- **Housekeeping:** the nightly `demo-reset` run also deletes sign-ups never confirmed within a
  week and spent or expired links (`courtlens prune-accounts` does it alone).
- **Migration:** `5e6f7a8b9c03` makes passwords optional and adds `user_identities` and
  `account_tokens`. Accounts the operator had enabled count as confirmed.

### Live

Live works on the demo: its endpoints are GETs, and the API container fetches ESPN when a cached
read is stale ([Live service v2](design/shared-live-v2.md)). That needs outbound HTTPS from the API
container. Final games are kept as hashed evidence (about 0.7 MB each, capped at 4 GiB), the one
part of the demo database that grows after deploy.

### Projected Impact

The API reads the frozen projections from `data/artifacts/projected-impact` (1.1 MB, hash-checked at load) and the weekly score from `data/derived/projected-impact-serving` (about 60 KB plus 0.5 KB per game), both made on the VPS and mounted read-only. The weekly score runs in `refresh-daily` in the `jobs` service (below); the VPS rescored the PC's games identically before the move (W7c). The endpoints are GETs, so the Caddy allowlist is unchanged.

### Win probability

The API serves the frozen model on CPU. The model files (`data/artifacts/win-probability`, 8.4 MB)
are mounted read-only. The serving bundle
(`data/derived/win-probability-serving`: seals, scorecard and win probability added, about 10 MB
plus about 6 KB per scored game) is **made on the VPS** from Win Probability v4's W2 cutover; the API
mounts it read-only and a new scorecard appears without a restart.

**The seal service** (`win-probability-seal` in `deploy/compose.prod.yml`): the API image running
`courtlens seal-win-probability --next-wake` in a shell loop, as the `demo-reset` service does. Each
run seals the day's scheduled regular-season games (schema `courtlens-win-probability-pregame-v2`,
a new file only when a game's inputs, line, Out list or tip time changed), scores finished games
from the previous three days that are not yet on the scorecard, and rewrites the summaries. Since
Win Probability v4's W3b it also scores the Market-informed model beside the Original from the same
seal for every game tipping after v4's freeze (`scorecard/head-to-head.jsonl`), writes the
registered 300-game and final reads once (`scorecard/head-to-head-reads.jsonl`), and rewrites
`scorecard/head-to-head.json`, whose `serving_model` the Live chart follows. Seals captured after the
freeze also carry `mu4`, `w` and both models' tip-off probabilities. A head-to-head failure is
reported as `head_to_head_error` and never costs the night's seals. It runs
once when the container starts, at 09:00 US Eastern for last night's scores, then every 30 minutes
from 12:25, at :25 and :55, while a run still lands before the day's last scheduled tip. Tips are on
the hour or half hour, so each game's last seal is taken 5 minutes before it (from 2026-11-12;
before that the runs were at :00 and :30 and the last seal was 30 minutes old). A failed run retries in 30
minutes. It never refits ratings.

- **Mounts.** Read-write: `data/derived/win-probability-serving` and `data/raw/espn-wp` (ESPN's raw
  scoreboards, injury reports and game summaries), as uid 1001, the host's `ubuntu` user, which
  owns them. Read-only: the model files, `derived/win-probability-ratings`,
  `derived/espn-rosters-v1` and `data/raw` (the box scores).
- **Owned by the VPS.** `scripts/deploy-vps.sh` creates those two directories and never rsyncs
  them, so a deploy cannot delete or overwrite a seal made there.
- **Inputs.** The seal fetches ESPN's injury report and line itself at every run. Box scores,
  rating snapshots and the roster bundle are made on the VPS by the `jobs` service (below); from
  W2 to W7 they came from the PC's push, which W7b removed. If a job stops, seals continue on
  older inputs, and each seal records their ages (`ages`: box scores through, roster observed and
  checked, rating snapshot cutoff, injury report time).
- **Grading.** From 2026-11-13 each game is graded on the first run after ESPN calls it final:
  after the day's last tip the service keeps running at :25 and :55 while a game that tipped in
  the last six hours is ungraded (`awaiting_grade` in the report). The 09:00 run is the catch-up.
- **The switch.** `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=false` on the VPS's `jobs` service and on
  the PC: `refresh-daily`'s win-probability step only ensures rating snapshots; sealing belongs to
  the seal service.
- **Measured (PC, 2026-11-11).** One run with nothing to score: 22 s, peak 338 MB. Three nights (21
  games) scored in one run: 127 s, peak 338 MB. The cap is 768 MB and one CPU. Disk: a seal is about
  5 KB per game, and the raw ESPN files about 2 MB a day at most; under 1 GB a year together.
- **Health.** `docker compose … logs --tail 20 win-probability-seal` shows each run's JSON report
  (`seal_sealed`, `seal_changed`, `scored`, `next_run`). Seals are under
  `data/derived/win-probability-serving/pregame/<date>.<sha256>.json`.

Between seals a Live game with no sealed inputs shows ESPN's line alone. No endpoint writes, so the
Caddy allowlist is unchanged. After a deploy, confirm arm64 predictions in the API container:

```bash
docker compose --env-file secrets.env --env-file release.env exec api \
  python -m courtlens.evaluation.win_probability_platform_check check
```

### Player contract terms (Wikipedia)

The player page's Contracts table fills lengths Basketball-Reference leaves out, and signings it
does not list, from the player's Wikipedia article (`services/contract_spans.py`). The API reads the
newest bundle in `data/derived/wikipedia-contracts-v1` (mounted read-only); without one the table
falls back to Basketball-Reference alone. The bundle is filled by an operator run in the `jobs`
container, which owns `data/` read-write:

```bash
docker compose --env-file secrets.env --env-file release.env exec jobs \
  courtlens acquire-wikipedia-contracts --scope all
docker compose --env-file secrets.env --env-file release.env exec jobs courtlens bump-data-stamp
```

`bump-data-stamp` empties the API's read cache (speed plan SP01) after any write run by hand; a
scheduled job does it on its own. Run it in `jobs`, whose `data/` is writable.

One Wikidata query maps Basketball-Reference IDs to articles, then each article is read serially at
5 s: `--scope all` is the 3,297 players with a reported salary, about 4.6 hours the first time. It
seals every 100 players and skips players read within `--max-age-days` (300), so an interrupted run
resumes where it stopped; `--scope active` rereads only players with a current contract. Raw pages
go to `data/raw/wikipedia-contracts` only when an article's revision changed, about 1.5 GB for a
full first run. `--reparse` re-reads them with a newer parser and no network.

### Disk budget

The VPS boot volume is 193 GB, nearly all of the Always Free 200 GB block-storage allowance
(measured 2026-10-19: 21 GB used across CourtLens, LineWatchTO and the portfolio; Docker images
4.8 GB, volumes 8.3 GB). Outbound transfer is free up to 10 TB a month and inbound is free, and
Caddy compresses responses (`encode zstd gzip`). The demo needs about 1.2 GB of images, about 21 GB
of Postgres (with full history and the 12 impact seasons) and about 3.1 GB of serving files;
`data/` is 18 GB in all with the raw evidence (2026-11-13: 124 GB of the disk free). Since W7 the
daily jobs grow both slowly (table below). Deploys never build on the VPS. Each deploy removes CourtLens images other
than the current and previous release. Container logs rotate at 3 × 10 MB, and journald
is capped at 200 MB.

Stored Stats cohorts (`stats_cohort_entries`/`stats_cohort_rows`) add about 120 MB: every
season's whole-league Stats rows and ranks for the served release. After each deploy the script
runs `courtlens warm-stats-cohorts` in the API container, which stores any season the new release
or serving code has not stored yet (about 40 s locally for 62 seasons) and deletes entries of
other releases. If it fails the deploy still completes; each season is then computed and stored
on its first view.

The statistics release refreshes daily (`courtlens refresh-season-stats`, a `refresh-daily` step;
source policy v3, "Daily season statistics"): when hoopR has published new or corrected box
scores, a new full release is sealed (past seasons re-imported unchanged from their frozen
files), published and its Stats cohorts warmed; daily-built releases other than the published
one and the newest two are retired. Measured locally on 2026-10-20: a run takes about 3 minutes
(1 minute of CPU), and each release holds about 920 MB in Postgres, so the database levels off at
two to three daily releases and Postgres reuses retired rows' space rather than growing. The three
full hand-built releases sealed on 2026-10-13 were retired with `courtlens retire-release` (owner
approved, 2026-10-20); it refuses the published release, impact datasets and cited releases.

Operational inputs refresh in the `jobs` service (below): ESPN rosters every 6 hours, and `courtlens refresh-daily` at 13:30 UTC for the hoopR player
index, Basketball-Reference contracts, DARKO's current ratings and Wikipedia's transactions
article (source policy v3, "Daily refresh"). Each stores bytes only when its data changed and prunes unchanged runs' receipts after
30 days. Measured locally on 2026-10-20:

| Run | Disk | Database |
| --- | --- | --- |
| Rosters, changed / unchanged | +2.7 MB / under 4 KB | about 23 KB of receipts |
| Player index, changed / unchanged | +1.1 MB / nothing | +1.7 MB / about 1 KB |
| Contracts, changed / unchanged | up to +5.6 MB / nothing | +8.3 MB / about 23 KB |
| DARKO, changed / unchanged | +3.5 MB bundle, +180 KB raw / under 1 KB | about 1 KB |
| Wikipedia transactions, changed / unchanged | +2 MB raw, +76 KB bundle / nothing | about 1 KB |
| Season stats, games played / none | +25 KB per new game; a new release (about 920 MB, older daily releases retired) / nothing | about 1 KB per game fetched |
| Season impact, weekly | about 58 MB served bundle (3 kept), working files pruned to what they cite; raw per-game documents about 0.6 GB a season (box, play-by-play, matchups) | one provisional dataset kept per run, the newest two retained |

Roster, DARKO and Wikipedia bundles are pruned after 30 days. Impact serving, team splits, WOWY
and stint-box configs name directories that serve their `.current` bundle. Since 2026-11-13
`deploy/pinned.env` names the impact serving and team-splits directories too, so the weekly season
impact moves what the VPS serves; WOWY and value archetypes stay pinned to their sealed files.
Player-index datasets, contract refreshes and
finance books are sealed and never pruned, so they grow only on days the data changes: in the
worst case, every day, about 5 GB a year, roughly 3% of the free disk. Egress is
unaffected because refreshes only download.

## Speed

The [speed plan](speed-plan.md) (2026-11-14 to 2026-11-15) made warm pages render in tens of
milliseconds. Its parts, as they run on the VPS:

- **Read cache** (`src/courtlens/api/read_cache.py`, `COURTLENS_READ_CACHE: "true"` on `api` in
  `compose.prod.yml`). An in-memory LRU of API read responses, capped at 128 MiB
  (`COURTLENS_READ_CACHE_MAX_BYTES`). Every response from a classified route carries
  `X-Cache: hit`, `miss` or `bypass`, and every response a `Server-Timing` header (handler time,
  database time, query count).
- **Classes.** Every GET route and every read-only POST Caddy allows has one, in `ROUTE_CLASSES`;
  `tests/unit/test_read_cache.py` fails on a route without one, so a new endpoint must be
  classified before it ships:
  - `stamp`: published or job-written data, kept until the data stamp changes (at most 6 hours);
  - `short`: data that moves between jobs (Win Probability, data and job status), 30 seconds;
  - `never`: per-viewer, live, written through the API, binary, or unsure.

  A request with `Authorization`, `Cookie` or `X-Operator-Token` (and the other headers in
  `CREDENTIAL_HEADERS`) is never served from the cache or stored.
- **Data stamp.** A SHA-256 over the publication pointers, the bundles' `.current` pointers, each
  scheduled job's start and finish in `data/derived/job-health/`, the manual bump file and today's
  date. The API reads it at most every 5 seconds and empties the cache when it changes, so no job
  has to notify anything. While a job runs, `stamp` reads are not stored.
- **`bump-data-stamp`.** A write run by hand (an operator command in `jobs`, such as
  `acquire-wikipedia-contracts`) does not touch a job record, so follow it with
  `courtlens bump-data-stamp` in `jobs` (whose `data/` is writable). Scheduled jobs need nothing.
- **Status.** `GET /api/cache/status`: entries, bytes, hits, misses, the stamp and a generation id
  that changes with the stamp and with each API start.
- **Warm start** (`COURTLENS_WARM_START: "true"` on `api`). The API loads the catalog's bundles,
  the tracking fingerprint and the finance book in the background as it starts, so the first
  visitor after a deploy does not wait for them.
- **Warm crawl** (`courtlens warm-site`, in the `jobs` loop after each `run-jobs`). When the
  generation at `/api/cache/status` differs from its last run, it requests the top-level pages,
  all 30 team pages and every current roster player's page from `http://dashboard:3000`, two at a
  time, so the cache is filled by the same code visitors use. It stops after 5 consecutive 5xx
  responses, is bounded by `timeout 1500`, and its time comes off the loop's sleep. Its record is
  `data/derived/job-health/warm-site.json`. A failed or skipped crawl only leaves pages cold.
- **Memory.** The cache cap is part of the API's 3 GB limit, beside the impact bundle (about
  2.3 GB at its peak). No container limit was raised.
- **Turning it off.** Set `COURTLENS_READ_CACHE: "false"` (and, if wanted,
  `COURTLENS_WARM_START: "false"`) on `api` in `compose.prod.yml` on the VPS and recreate `api`
  with `--no-deps`. The crawl then only renders pages; it is harmless and can stay.
- **Browser and Cloudflare.** Links prefetch their page on intent (pointer resting 80 ms, focus,
  touch start), never on entering the viewport. Portraits are served at `/portrait.webp` so
  Cloudflare caches them; hashed team logos are `immutable` for a year and flags 30 days. HTML and
  API responses are not cached at Cloudflare (D6, kept closed at G2). Zone settings (SP07): Smart
  Tiered Cache and Early Hints on, 0-RTT off, browser cache TTL 4 hours.

## Scheduled jobs

The `jobs` service (`deploy/compose.prod.yml`) is the API image running
`courtlens run-jobs --next-wake` in a shell loop: it runs every due job, one at a time, each as its
own process with a timeout, then sleeps until the next scheduled time. Cap 4 GiB and two CPUs. A
job seen for the first time (after a deploy that adds it) records a baseline and waits for its
next scheduled time; `courtlens run-jobs --run <job>` runs one now. Schedules
(`services/scheduled_jobs.py`) are the PC's old timers plus the jobs added on the VPS:

| Job | Command | When | Stale after | Measured on the VPS |
| --- | --- | --- | --- | --- |
| rosters | `refresh-espn-rosters` | every 6 hours, Eastern | 13 h | 157 s (W7b) |
| daily | `refresh-daily` | 13:30 UTC | 30 h | 234 s with no new games; 828 s and 1.1 GB peak with a new statistics release (W7b) |
| lineups | `refresh-season-lineups` | 14:05 UTC | 30 h | 52 s, 412 MiB peak, output identical to the PC's; over an hour (timed out) before the `stint_id` index (W7c) |
| season-impact | `refresh-season-impact` | Mondays 14:30 UTC | 8 days | waits until every team has 10 games; first fit expected 2026-11-16 |
| metric-backtest | `refresh-metric-backtest` | 15:00 UTC (scores every 7 days) | 30 h | scoring 174 games takes about 2 s |
| player-pages | `acquire-bbref-bios --active-only --max-age-days 6` | Tuesdays 16:00 UTC | 8 days | Basketball-Reference pages (contracts, transactions, career highs) for every rostered player at about 4 s a page: about 26 index pages plus ~530 players, so ~40 min; not yet run on the VPS. A 403/429 ends the run and records a failure |
| college-schools | `refresh-college-schools` | Tuesdays 17:00 UTC | 8 days | each player's college, "City, State" and logo for the player header: two index requests, then only logos not yet kept (about 260 at 1 s on the first run); writes `data/derived/college-schools-v1` |

Each attempt writes `data/derived/job-health/<job>.json` (last success, last failure, seconds,
exit code, output tail). `GET /api/job-health` returns them all with `stale` set when the last
success is older than the limit. There is no alert channel; the
[operations note](operations/hosted-operations.md) says what to check.

## Backups

The VPS holds the only live copy. `scripts/vps-backup.sh` (copied by each deploy) runs from the
`ubuntu` user's crontab, installed with `scripts/vps-backup.sh install`; output goes to
`~/backups/courtlens/backup.log`.

- **Database, weekly** (Sundays 07:20 UTC): `pg_dump -Fc` without the dbt candidate schemas to
  `~/backups/courtlens/db/`, the newest two kept. Measured 2026-11-13: 1.6 GB in 228 s for a 19 GB database.
- **Records, nightly** (15:10 UTC): the files nothing can recompute (`win-probability-serving`:
  seals, scorecards, head-to-head and its reads; `projected-impact-serving` and
  `metric-backtest-serving`: weekly scores; `job-health`) committed to `~/backups/courtlens/records`
  and pushed to the private repository `calebhabesh/courtlens-records` with a deploy key
  (`~/.ssh/courtlens_records`) that can write to that repository only.
- **Restore** steps are in the [operations note](operations/hosted-operations.md#restoring-a-backup).
  Both were proved on 2026-11-13: a fresh clone of the records repository matched all 60 live record files by SHA-256, and the dump restored into a scratch database in 23 minutes (single stream) with every one of 127 tables' exact row counts, 245 indexes and 313 constraints equal to live.

## CI

`.github/workflows/ci.yml` starts with a `plan` job (`scripts/ci_plan.sh`) that picks one of three
outcomes:

- **Full** (the default): `backend-checks` (Ruff, mypy, migrations, demo seed, dbt),
  `backend-tests` (pytest in two shards, each on four xdist workers with its own database per
  worker cloned from the migrated one; test files are dealt to the shards by the seconds in
  `tests/ci_file_durations.json`, which `scripts/ci_file_durations.py` rebuilds), `coverage` (one
  report from both shards' data), `dashboard-checks` (ESLint, Stylelint, tsc, Vitest, the
  Turbopack build), `browser` (Playwright in four shards of two workers, each with its own
  webpack build; Playwright's Ubuntu packages are cached) and `containers` (Compose build and smoke test), all in parallel.
- **Docs lane**: every changed file is Markdown at the repository root, at the top of `docs/`, or
  in `docs/operations`, `docs/decisions` or `docs/research`. Only the tests that read those files
  run: `tests/unit/test_frozen_identifiers.py` (it scans every tracked file) and Vitest (which
  checks the README's quoted results). `docs/design` and `docs/evidence` are hashed inputs and
  image contents, so a change there runs everything. Such a change needs no deploy.
- **Reuse** (pushes to main only): each pull request run uploads the tree it tested
  (`git rev-parse HEAD^{tree}`, artifact `tested-tree`). When a merge commit's tree is identical to
  the tree its pull request's latest run passed, which holds whenever the branch was up to date with
  main, every job is skipped, CI passes in about a minute and Images starts. If main moved after the
  pull request ran, the tree differs and everything runs. Press "Update branch" before merging to get
  the fast path. Only same-repository pull requests qualify, and the workflow file is part of the
  compared tree.

A newer push to a pull request cancels its older run; main commits are never cancelled.
Locally, `make test-python` runs the same xdist suite with one worker per CPU.

## Deploy

After CI and then Images succeed on a main commit, run this from any checkout:

```bash
scripts/deploy-vps.sh            # latest origin/main
scripts/deploy-vps.sh <sha>      # a specific main commit
```

**When.** Any time. A deploy restarts every service, including `win-probability-seal`, and takes
about 3 to 4 minutes. On a game day the seal service takes each game's last seal at :25 and :55
Eastern, 5 minutes before tip, so a deploy that should not risk a seal starts just after one of
those runs. Earlier deploys used 9:00 AM to noon Eastern only because no game is sealed then.

**Safeguards (since 2026-11-18).**
- **One at a time.** The script takes a lock on the VPS (`.deploy.lock`) before it changes
  anything. A second deploy, from any machine, stops with "Another deploy is running on the VPS"
  and changes nothing.
- **Staged files.** The compose file, `pinned.env`, Caddyfile and backup script are uploaded to a
  staging folder (`.incoming/`) and installed only under the lock.
- **The right images.** The gate accepts only an Images run named `Images <sha>`: the run name
  records the commit it built. GitHub lists a triggered run under main's head when it starts, which
  can be a different commit. Images runs before this change are all named "Images", so a commit
  built before it can't pass the gate; roll back with `release.prev.env` instead (below).
- **Workers stopped first.** `jobs`, `demo-reset` and `win-probability-seal` run a shell loop as
  PID 1, which ignores SIGTERM. They are stopped before the new release starts, so `up --wait` never
  sees a container killed mid-replacement.

Serving files are git-ignored and live only under the VPS's `data/` (`SERVING_DIRS` in the
script). Since W7 a deploy only makes sure those directories exist: nothing under `data/` is
copied, overwritten or deleted from the deploying machine. Before W7 they were rsynced from the
PC.

On the VPS:

```bash
cd /home/ubuntu/apps/courtlens
docker compose --env-file secrets.env --env-file release.env --profile tunnel ps
curl -fsS http://127.0.0.1:8090/api/health
```

To roll back, start the previous release. Migrations are not reversed.

```bash
docker compose --env-file secrets.env --env-file release.prev.env --profile tunnel up -d --wait
```

## Deploy log

### 2026-11-18: release c495f520 (#125: logo beside the wordmark; filter bar fills when pinned)

- **What:** UI work made after #119 merged, until then only uncommitted changes in a local
  checkout. The logo now sits beside the wordmark on every branded card (`CourtLensLockup`). PNG
  exports draw it too. The filter bar is transparent at rest and filled only while pinned. The
  Shrunk % note is one short line. Dashboard only: no migration, and the API image didn't change.
- **CI needed two passes on the PR.** Three visual baselines (Stats desktop and phone, Showcase
  desktop) were refreshed. The Stats ones dated from 2026-10-19 and had drifted just under the 1%
  tolerance. An R03 test still looked for the old Shrunk % copy. Main's CI reused the PR's result
  (37 s). Images: 2 min 12 s.
- **Deploy:** `deploy-vps.sh` took **97 s** (12:12:07 to 12:13:44 UTC), its second run with the
  safeguards above. The Stats cohort warm-up found 171 existing, built 0 and pruned 0. Compose
  recreated `dashboard` and the three workers. `api` kept running, because its image digest was
  unchanged. Disk: 137 GB free of 193.
- **Checked on the public URL:**
  - `/api/health` ok;
  - `/` answers 307 to `/stats`;
  - Stats, Compare, Showcase and Team Compare serve the lockup in their HTML;
  - `release.env` is c495f520 and `release.prev.env` is e6f582f5.

### 2026-11-18: release e6f582f5 (#124: deploy safeguards; dnspython 2.9.2)

- **What:** the safeguards above (VPS lock, staged files, Images runs named after their commit,
  workers stopped first). Dependabot alert 134 fixed (`dnspython` 2.9.1 to 2.9.2). No migration.
- **CI:** main reused the PR's result (25 s).
- **Deploy:** `deploy-vps.sh` took **128 s**, the first run of the new script, with no errors.
  All 8 services were healthy, `/api/health` was ok, and the API container runs dnspython 2.9.2.

### 2026-11-18: release 8526bc02 (#120 faster CI, #123 README, #121 Open Graph image)

- **What:** CI runs once per change, in parallel (#120, [CI](#ci)); new README screenshots and
  overview (#123); a new Open Graph image and site description (#121). No migration.
- **CI:** #120's merge ran the new workflow in full (8 min); #123's merge reused its pull request's
  result (28 s); #121's ran in full after its branch was brought up to date (8 min). Images:
  2.5 min each.
- **Deploy:** two deploys of 8526bc02 ran at once from the owner's PC.
  - The first attempt failed after 42 s: the other deploy replaced the `jobs` container while it
    warmed the site, the old container was killed (exit 137), and `up --wait` aborted and rolled
    back. `jobs`, `demo-reset` and `win-probability-seal` were down for about a minute (1:37 AM
    Eastern, no games).
  - With those three stopped by hand, the retry took 91 s (171 Stats cohorts existing, 0 built).
  - The two deploys' last steps then collided on `release.env.next`, leaving no `release.env`. It
    was restored at 06:41 UTC (`release.env` 8526bc02, `release.prev.env` 03b62cc7).
  - The safeguards above came out of this.
- **Also seen:** Images run 44251620872 was listed under 8526bc02 but built 448a018f (#122), which
  the old gate would have accepted. The pull would still have failed safely, because the
  `sha-8526bc02` tag didn't exist yet.
- **Checked on the public URL:**
  - `/api/health` ok;
  - `/` answers 307 to `/stats`;
  - the page carries the new description and `og-image.png?v=2`, which is served (252 KB);
  - all 8 services are up on the new images.

### 2026-11-18: release 03b62cc7 (#119: site polish; the project's last deploy)

- **What:** the owner's site-polish pass. Stats shows as soon as it arrives (80a7a1ce), and pages
  across the site do too (2af54f00): loaders only on player pages, Data Status, Methodology and live
  games; `/` is a config redirect to `/stats`; no route fade; images start loading once the page is
  idle; header values hydrate as the server rendered them. Also the Deep Navy palette (design
  language v1.4), Stats trend views, Ask's New Chat flow and contract bracket fixes. No migration;
  nothing under `deploy/` changed.
- **CI needed three passes on the PR.**
  - The warm crawl still listed `/` and checked readiness on it. It does not follow redirects, so
    on the VPS it would have waited forever; both now use `/stats` (aac2cd78).
  - The visual baselines now wait for idle image warming.
  - The phone operation-gallery baseline was stale (palette and Shot Aftermath copy; b722a36c).
- **Deploy:** `deploy-vps.sh` took **118 s** (06:05:26 to 06:07:24 UTC), after CI and Images
  passed on the merge commit. The Stats cohort warm-up found 171 existing, built 0 and pruned 3.
  Disk: 136 GB free of 193.
- **Checked on the public URL:**
  - `/api/health` ok;
  - `/` answers 307 to `/stats`;
  - Stats HTML has no skeleton;
  - the warm crawl started on 569 pages for the new generation.
- **Also on 2026-11-17/18:** the six open Dependabot PRs were closed and their branches deleted, and
  so was the branch left from the merged #108. `research-r16` (R16, cut 2026-11-13) was saved to a
  local bundle and deleted.

### 2026-11-16 (evening of 2026-11-15 Eastern): release fd416ef0 (#110: site improvements and the speed plan)

- **What:** search, provisional positions, season impact on the VPS, player-page contracts with
  Wikipedia terms, the player header, site links, loading skeletons, speed plan SP00–SP08 (read
  cache, warm start, warm crawl, prefetch on intent, lighter pages, `.webp` portraits), the Stats
  pager. No migration. Deployed outside the 9:00 AM to noon window on the owner's word (no
  visitors yet).
- **Deploy:** `deploy-vps.sh` took **206 s** (00:51:52 to 00:55:18 UTC). CI and Images passed on
  the merge commit first.
- **Database OOM during the deploy.** The deploy's Stats cohort warm-up, the warm crawl
  (computing the same cohorts on demand) and the API's warm start overlapped; the db container
  reached its 2 GiB limit and the kernel killed one Postgres backend (00:55:13). Postgres
  reinitialised in 3 s, the warm-up step failed, the crawl lost 3 pages to timeouts, and
  `warm-stats-cohorts` was rerun by hand (75 built, 96 existing, 191 s; db peak 0.92 GiB).
  `deploy-vps.sh` now stops `jobs` until the cohorts are stored, then starts it (a trap restarts
  it on any failure), so the crawl never builds cohorts itself.
- **After the deploy:** the API's warm start took 42 s (catalog 29 s); the first warm crawl 438 s
  for 571 pages (568 ok); the read cache then held 3,043 entries, 70 MB of 128 MB. Peak memory:
  api 2.68 of 3 GiB, db 2.04 of 2 GiB (the OOM above), dashboard 164 of 768 MiB, jobs 188 MiB of
  4 GiB. Numbers in the speed progress log (SP08).
- **Wikipedia contract terms:** `acquire-wikipedia-contracts --scope all` started in `jobs` at
  01:08:47 UTC (about 4.6 hours, the first full run), with `bump-data-stamp` chained after it; log
  at `/home/ubuntu/wikipedia-contracts-run.log` on the VPS.
- **Checked on the public URL:** `/api/health` ok; `.webp` portraits `HIT` at Cloudflare; pages,
  reads and click timings in the speed progress log.

### 2026-11-13 (evening): W7c applied by hand; no new release

- **What:** `release.env` and `pinned.env` on the VPS switched to the impact serving and team-splits
  directories (the same bundles served); only `api` and `jobs` recreated with `--no-deps`, so the
  seal service kept running through the slate. `ix_wb_stint_players_stint` built concurrently by
  hand (migration `4d5e6f7a8b92` creates it if missing, so the next deploy only stamps it).
  Backup crontab installed; `courtlens_prev` dropped after the restore test.
- **Next deploy:** any green main commit from 9:00 AM to noon Eastern carries the same settings;
  nothing else changes on the site.

### 2026-11-13: releases 6ad70cbd (#104) and c7d74e8a (#105), W7b on the VPS

- **What:** the own read leads (W-D16), the non-linear test (W-D17), the Win Probability page and Live cards (#101 to #103), the `jobs` service and deploys that no longer copy data (W7), grading right after each game, and the image fixes the jobs needed (the dbt project path, a writable dbt target, the sealed docs the fits check).
- **Images** ran by themselves after CI on both merges; no hand dispatch.
- **Deploy:** no Stats cohorts built at either deploy (171 existing); nothing under `data/` copied. 125 GB free.
- **After the deploy:** the PC's push, roster and daily timers removed; the VPS's daily refresh published a release equal to the PC's (counts in the v4 progress log, W7b entry).
- **Checked on the public URL:** `/api/health` ok, `/research/win-probability` and `/stats` load, `/api/job-health` lists five jobs, `POST /api/win-probability` gets 403.

### 2026-11-12: release ae2bbf12 (seals 5 minutes before tip, #95; legacy-brand test, #94)

- **What:** the seal service runs at :25 and :55 Eastern instead of :00 and :30, so each game's last seal is 5 minutes before its tip, not 30 (a protocol note records it).
- **Why Images was started by hand:** the backend job is green again (#94), but the dashboard job failed on the same 2 R10 Wingspan Playwright tests as the morning run. The hand-started Images run (43272196653) passed.
- **Deploy:** no Stats cohorts built (171 existing); 158 GB free. The seal service's first run (17:45:32Z) sealed nothing new and set its next run to 17:55:00Z; `/api/health` ok.

### 2026-11-12: release 982953a7 (Win Probability v4 W2 part B, the cutover)

- **What:** the `win-probability-seal` service; seals and scoring now run on the VPS (#92). The PC only pushes inputs (`scripts/win-probability-push.sh`) and pulls the bundle back.
- **Why Images was started by hand:** Images runs only when CI succeeds. CI failed on the known legacy-brand test (fixed in #94) and, on the first run, on 2 flaky R10 Wingspan Playwright tests that passed when re-run. The hand-started Images run (43244641923) passed.
- **Before the deploy:** the PC's serving bundle was pushed once, without `--delete`. The deploy ran from the worktree's `scripts/deploy-vps.sh`, which no longer mirrors `derived/win-probability-serving`.
- **Deploy:** no Stats cohorts built (171 existing); 158 GB free.
- **The seal service:** first run at 15:25:07Z sealed all 4 of the day's games (schema v2, each with a line). Re-scoring 2026-11-11's 10 games in a one-off container on copies matched the PC's rows to 1.1e-16; the live scorecard's hash didn't change. Idle at 5 MiB of its 768 MiB cap.
- **arm64:** v4's platform check gave a largest difference of 2.2e-16 over 1,902 states (limit 1e-9).
- **The PC:** `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=false` in `.env`; `courtlens-win-probability-push` installed. Its first run pushed the inputs and pulled the VPS's seal back.
- **Checked on the public URL:** `/api/health` ok; `/api/win-probability` serves the Original with 63 prospective games through 2026-11-11; `/research/win-probability` loads; `POST /api/win-probability` gets Caddy's 403.

### 2026-11-11: release e2d3f353 (finish plan F04 and F05)

- **What:** accounts, the one-click demo account and favourite players (#87), and the published Win Probability upgrade result, not adopted (#88).
- **Why Images was started by hand:** GitHub-hosted runners couldn't resolve Ubuntu's mirrors, so main's CI failed before running tests and Images was skipped. The owner chose to merge on local evidence. The hand-started Images run (43066801122) passed.
- **Deploy script fix:** GitHub's `status=success` filter didn't return that run, so the script now checks each run's conclusion itself (#90).
- **Secret:** `COURTLENS_ACCOUNT_PROXY_TOKEN` was generated on the VPS with `openssl rand -hex 32` and appended to `secrets.env` (still mode 600). It never left the server.
- **Deploy:** migration `3c4d9e1f0a21` applied; the demo account was seeded with 8 favourites; the `demo-reset` service is healthy; Caddy restarted for the new allowlist; 1 Stats cohort built (170 existing); 158 GB free.
- **Checked on the public URL:**
  - Signed out, `/api/account/me` returns no user.
  - Demo sign-in sets an HttpOnly, Secure session cookie and returns no token in the body.
  - The shared list has the 8 seeded players with 2026-27 teams.
  - Adding and removing a favourite works (9, then 8).
  - A cross-site add gets 403.
  - `POST /api/auth/session`, `/api/auth/register`, `/api/me/favorites/…`, `PUT /api/account/favorites/…` and workspace favourite writes all get Caddy's 403.
  - A wrong password gets the generic message.
  - Sign-out clears the session.
  - `/api/win-probability` returns `upgrade.adopted: false`.

### 2026-11-11: releases 5ba841b5 and 20e2af41 (finish plan F00–F02)

- **5ba841b5** (PR #83): pins `gemini-3.5-flash-lite` and a 45 s turn limit for public Ask. Deployed on the owner's instruction although main CI failed three times on URL-timing flakes in unrelated specs; Images had passed.
- **20e2af41** (#84 prompt v3, #85 Shot Aftermath extras): CI and Images green. `deploy-vps.sh` stored no new Stats cohorts (171 existing); 158 GB free.
- **Public Ask check:** one real question answered in 12.7 s, the counter went 3 → 2, the asker lists their own thread and a stranger none, and deletes and cross-site writes get 403.

### 2026-11-10: release 569062bf (RD16, PR #79)

Points Forecasts with the Evaluation Archive as its tab (research through the RD16 approval, c298ff6e),
plus the e2e and frozen-identifier test fixes (#78, #79). Frontend only: same database, serving files
and pins; `deploy-vps.sh` took 57 s and stored no new Stats cohorts (171 existing). Main CI and Images
passed on the merge commit. The old 2026-10-13 database (`courtlens_prev`) was dropped on the owner's
instruction before this deploy.

Verified on the public URL at 1440 and 390 px: 43 pages each, all 200, no page overflow or broken
images, no console errors except the known 1997-98 portrait 404 on Similar Players. Both forecasts
endpoints are byte-identical to the local API; writes get Caddy's 403; Planner redirects. After deploy:
API 2.0 GiB of 3 GiB (every page had been served since the earlier deploy), db 0.6 of 2 GiB,
dashboard 124 MiB; disk 35 GB used of 193 GB.

### 2026-11-10: release 060e8d4a (research merged, PR #77)

Replaced 121bfa5d (2026-10-14). The demo database was replaced, not migrated: the 2026-10-13
snapshot had 1 possession row (local 2.9M), games through 2026-06-13 (local 2026-11-09) and nothing
before 2000-01, which migrations can't add. The `pg_dump -Fc --no-owner --exclude-schema='cl_candidate_*'`
dump was 1.7 GB (105 s locally); it was restored with `pg_restore -j 2` into `courtlens_next` while the old
release served, row counts matched local (player games 2,688,197; possessions 2,930,101; stint players
7,494,080; Stats cohort rows 52,498; alembic `19b810a4f017`), and the dump was deleted on both machines.
Cutover stopped the API and dashboard, renamed `courtlens` to `courtlens_prev` and `courtlens_next` to
`courtlens`, then ran `scripts/deploy-vps.sh` (105 s; Stats cohorts already stored: 171 existing, 0 built).
The restored database is 17 GB.

The Images run was dispatched by hand: main CI on 060e8d4a failed twice on a Wingspan e2e timing flake
(fixed in PR #78) while its tree (`bcc395cb`) was byte-identical to the PR merge tree that passed every CI
job (run 42861543674).

Serving files: 54 directories, 3.2 GB on the VPS. A crawl of 60 pages against an API that saw only the old
SERVING_DIRS found 503s on Similar Players and Roster Shapes and missing Free Agency, Draft rookies, the
Lineup Model tool, the Backtest 2026-27 score, Shooting runs, DARKO/DPM and Team Compare's starting five;
with the added directories every page matched full local data. Pins: impact 3cfdb968 (12 seasons), team
splits fce502d3, WOWY 894f9b09.

Memory: locally the API peaked at 2.26 GB (1.8 GB steady) serving every page with these pins, so its cap is
now 3 GiB. On the VPS right after deploy: API 167 MiB, db 84 MiB, dashboard 49 MiB. Win probability on
arm64: 1,902 states, max difference 2.2e-16, passed. Disk after: 42 GB used of 193 GB, including
`courtlens_prev` (5.6 GB), kept for rollback until the owner drops it.

Verified on the public URL at 1440 and 390 px: 50 pages each, all 200, no page overflow or broken images,
no console errors except one portrait 404 on Similar Players (1997-98 MIA, player 1134; local 404s too).
Ask is off, Planner hidden and redirected, writes outside the allowlist get Caddy's 403. 36 of 38 Research
API responses were byte-identical to the local API; the other two differ in a latency field and one
float's last digit. Rollback at the time: stop the API, rename the databases back, start `release.prev.env`.
Refresh timers and the nightly job stay off; the data is the 2026-11-10 snapshot.

## First-time setup

These steps have already been done once; they are recorded for a rebuild.

1. Generate `secrets.env` on the VPS (mode 0600). It holds
   `COURTLENS_POSTGRES_PASSWORD`, `COURTLENS_JWT_SECRET`, `COURTLENS_OPERATOR_TOKEN`,
   `COURTLENS_PUBLIC_ASK_TOKEN` and `COURTLENS_ACCOUNT_PROXY_TOKEN`, each from
   `openssl rand -hex 32`, plus the free-tier
   `COURTLENS_GEMINI_API_KEY` and optional `COURTLENS_GROQ_API_KEY` (see Public Ask). It never
   leaves the VPS.
2. Take a dump of the local database without the dbt candidate build schemas, which
   serving never reads:
   `pg_dump -Fc --no-owner --exclude-schema='cl_candidate_*'`.
3. Copy the dump to the VPS. Run `scripts/deploy-vps.sh` up to `db`, or start `db` by
   hand, then restore with
   `pg_restore -U courtlens -d courtlens --no-owner --exit-on-error`, and delete the dump.
4. If the dump came from a branch whose migrations are ahead of main, undo those
   revisions by hand and stamp main's head, and the next deploy migrates forward.
   The 2026-10-13 dump came from `alignment` while `14b810a4f012` was
   unmerged, so the index was dropped and the database stamped `13b810a4f011`.
   Main now carries that migration and recreates the index on deploy.
5. Create the tunnel and route `courtlens.calebhabesh.com` to `http://127.0.0.1:8090`.
   Save the connector token at `secrets/tunnel-token` (mode 0600, owner `1001:1001`).
   The next deploy starts the `cloudflared` service.
