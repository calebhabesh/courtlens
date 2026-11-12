# Hosted demo

CourtLens runs as a read-only public demo at <https://courtlens.calebhabesh.com>, linked
from the portfolio site. It is the parked PC13 hosting block, narrowed by the owner on
2026-10-13: a frozen data snapshot, Ask turned off, zero recurring cost.

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
| `.github/workflows/images.yml` | arm64 API and dashboard images, built after CI passes on main |
| `scripts/deploy-vps.sh` | Pull, migrate, health-check, warm Stats cohorts, prune |

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

### Live

Live works on the demo: its endpoints are GETs, and the API container fetches ESPN when a cached
read is stale ([Live service v2](design/shared-live-v2.md)). That needs outbound HTTPS from the API
container. Final games are kept as hashed evidence (about 0.7 MB each, capped at 4 GiB), the one
part of the demo database that grows after deploy.

### Projected Impact

The API reads the frozen projections from `data/artifacts/projected-impact` (1.1 MB, hash-checked at load) and the weekly score from `data/derived/projected-impact-serving` (about 60 KB plus 0.5 KB per game), both rsynced by each deploy and mounted read-only. Scoring runs locally in `refresh-daily`; `scripts/win-probability-push.sh` copies the score over with the win-probability inputs. The endpoints are GETs, so the Caddy allowlist is unchanged.

### Win probability

The API serves the frozen model on CPU. The model files (`data/artifacts/win-probability`, 8.4 MB)
are rsynced by each deploy and mounted read-only. The serving bundle
(`data/derived/win-probability-serving`: seals, scorecard and win probability added, about 10 MB
plus about 6 KB per scored game) is **made on the VPS** from Win Probability v4's W2 cutover; the API
mounts it read-only and a new scorecard appears without a restart.

**The seal service** (`win-probability-seal` in `deploy/compose.prod.yml`): the API image running
`courtlens seal-win-probability --next-wake` in a shell loop, as the `demo-reset` service does. Each
run seals the day's scheduled regular-season games (schema `courtlens-win-probability-pregame-v2`,
a new file only when a game's inputs, line, Out list or tip time changed), scores finished games
from the previous three days that are not yet on the scorecard, and rewrites the summaries. It runs
once when the container starts, at 09:00 US Eastern for last night's scores, then every 30 minutes
from noon while a run still lands before the day's last scheduled tip. A failed run retries in 30
minutes. It never refits ratings.

- **Mounts.** Read-write: `data/derived/win-probability-serving` and `data/raw/espn-wp` (ESPN's raw
  scoreboards, injury reports and game summaries), as uid 1001, the host's `ubuntu` user, which
  owns them. Read-only: the model files, `derived/win-probability-ratings`,
  `derived/espn-rosters-v1` and `data/raw` (the box scores).
- **Owned by the VPS.** `scripts/deploy-vps.sh` creates those two directories and never rsyncs
  them, so a deploy cannot delete or overwrite a seal made there.
- **Inputs from the PC.** The seal fetches ESPN's injury report and line itself at every run, so
  late Out news needs no PC. Box scores, rating snapshots and the roster bundle come from the
  owner's PC: `scripts/win-probability-push.sh` pushes the current season's
  `raw/sportsdataverse_<year>`, `derived/win-probability-ratings`, `derived/espn-rosters-v1` and
  the Projected Impact score, then pulls the serving bundle back for local development (never
  `--delete`; the pull is skipped while the PC's `.env` does not set
  `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=false`). `scripts/install_win_probability_push.sh`
  installs it to run after every `refresh-daily` and every 6-hourly `refresh-espn-rosters`. When
  the PC is off, seals continue on older inputs, and each seal records their ages (`ages`: box
  scores through, roster observed and checked, rating snapshot cutoff, injury report time).
- **The PC's switch.** `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING` (default true) keeps
  `refresh-daily` sealing and scoring locally. Set to false at the cutover, its win-probability step
  only ensures rating snapshots.
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

### Disk budget

The VPS boot volume is 193 GB, nearly all of the Always Free 200 GB block-storage allowance
(measured 2026-10-19: 21 GB used across CourtLens, LineWatchTO and the portfolio; Docker images
4.8 GB, volumes 8.3 GB). Outbound transfer is free up to 10 TB a month and inbound is free, and
Caddy compresses responses (`encode zstd gzip`). The demo needs about 1.2 GB of images, about 21 GB
of Postgres (the 2026-11-10 snapshot, with full history and the 12 impact seasons) and about
3.1 GB of serving files. The data snapshot is frozen, so the database
does not grow. Deploys never build on the VPS. Each deploy removes CourtLens images other
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

Operational inputs refresh on timers (`scripts/install_data_refresh.sh`; not yet installed on the
VPS): ESPN rosters every 6 hours, and `courtlens refresh-daily` at 13:30 UTC for the hoopR player
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
and stint-box configs name directories that serve their `.current` bundle; `deploy/pinned.env`
still pins the sealed files, so the VPS keeps serving sealed seasons until it switches to the
directories. Player-index datasets, contract refreshes and
finance books are sealed and never pruned, so they grow only on days the data changes: in the
worst case, every day, about 5 GB a year, roughly 3% of the free disk. Egress is
unaffected because refreshes only download.

## Deploy

After CI and then Images succeed on a main commit, run this from any checkout:

```bash
scripts/deploy-vps.sh            # latest origin/main
scripts/deploy-vps.sh <sha>      # a specific main commit
```

Serving files are git-ignored: evaluation reports, saved analyses, the impact,
value-archetype and WOWY manifests, player portraits, the Research serving tables and model
files, DARKO, ESPN rosters, the Free Agency and Wikipedia bundles, shot zones, stint boxes and
the raw box-score evidence behind starting positions (`SERVING_DIRS` in the script, about
3.1 GB on 2026-11-10; the raw evidence is mounted read-only as `data/raw`). They are rsynced from
`$COURTLENS_DATA_DIR`, which defaults to the checkout's `data/`. A worktree must point
this at the primary checkout.

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

### 2026-11-12: release 3988ffc4 (seals 5 minutes before tip, #95; legacy-brand test, #94)

- **What:** the seal service runs at :25 and :55 Eastern instead of :00 and :30, so each game's last seal is 5 minutes before its tip, not 30 (a protocol note records it).
- **Why Images was started by hand:** the backend job is green again (#94), but the dashboard job failed on the same 2 R10 Wingspan Playwright tests as the morning run. The hand-started Images run (43272196653) passed.
- **Deploy:** no Stats cohorts built (171 existing); 158 GB free. The seal service's first run (17:45:32Z) sealed nothing new and set its next run to 17:55:00Z; `/api/health` ok.

### 2026-11-12: release 8afa373d (Win Probability v4 W2 part B, the cutover)

- **What:** the `win-probability-seal` service; seals and scoring now run on the VPS (#92). The PC only pushes inputs (`scripts/win-probability-push.sh`) and pulls the bundle back.
- **Why Images was started by hand:** Images runs only when CI succeeds. CI failed on the known legacy-brand test (fixed in #94) and, on the first run, on 2 flaky R10 Wingspan Playwright tests that passed when re-run. The hand-started Images run (43244641923) passed.
- **Before the deploy:** the PC's serving bundle was pushed once, without `--delete`. The deploy ran from the worktree's `scripts/deploy-vps.sh`, which no longer mirrors `derived/win-probability-serving`.
- **Deploy:** no Stats cohorts built (171 existing); 158 GB free.
- **The seal service:** first run at 15:25:07Z sealed all 4 of the day's games (schema v2, each with a line). Re-scoring 2026-11-11's 10 games in a one-off container on copies matched the PC's rows to 1.1e-16; the live scorecard's hash didn't change. Idle at 5 MiB of its 768 MiB cap.
- **arm64:** v4's platform check gave a largest difference of 2.2e-16 over 1,902 states (limit 1e-9).
- **The PC:** `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=false` in `.env`; `courtlens-win-probability-push` installed. Its first run pushed the inputs and pulled the VPS's seal back.
- **Checked on the public URL:** `/api/health` ok; `/api/win-probability` serves the Original with 63 prospective games through 2026-11-11; `/research/win-probability` loads; `POST /api/win-probability` gets Caddy's 403.

### 2026-11-11: release 8ef78660 (finish plan F04 and F05)

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

### 2026-11-11: releases b98f790b and 301e2a2a (finish plan F00–F02)

- **b98f790b** (PR #83): pins `gemini-3.5-flash-lite` and a 45 s turn limit for public Ask. Deployed on the owner's instruction although main CI failed three times on URL-timing flakes in unrelated specs; Images had passed.
- **301e2a2a** (#84 prompt v3, #85 Shot Aftermath extras): CI and Images green. `deploy-vps.sh` stored no new Stats cohorts (171 existing); 158 GB free.
- **Public Ask check:** one real question answered in 12.7 s, the counter went 3 → 2, the asker lists their own thread and a stranger none, and deletes and cross-site writes get 403.

### 2026-11-10: release be43917a (RD16, PR #79)

Points Forecasts with the Evaluation Archive as its tab (research through the RD16 approval, d28783f8),
plus the e2e and frozen-identifier test fixes (#78, #79). Frontend only: same database, serving files
and pins; `deploy-vps.sh` took 57 s and stored no new Stats cohorts (171 existing). Main CI and Images
passed on the merge commit. The old 2026-10-13 database (`courtlens_prev`) was dropped on the owner's
instruction before this deploy.

Verified on the public URL at 1440 and 390 px: 43 pages each, all 200, no page overflow or broken
images, no console errors except the known 1997-98 portrait 404 on Similar Players. Both forecasts
endpoints are byte-identical to the local API; writes get Caddy's 403; Planner redirects. After deploy:
API 2.0 GiB of 3 GiB (every page had been served since the earlier deploy), db 0.6 of 2 GiB,
dashboard 124 MiB; disk 35 GB used of 193 GB.

### 2026-11-10: release 3c2f1b03 (research merged, PR #77)

Replaced 121bfa5d (2026-10-14). The demo database was replaced, not migrated: the 2026-10-13
snapshot had 1 possession row (local 2.9M), games through 2026-06-13 (local 2026-11-09) and nothing
before 2000-01, which migrations can't add. The `pg_dump -Fc --no-owner --exclude-schema='cl_candidate_*'`
dump was 1.7 GB (105 s locally); it was restored with `pg_restore -j 2` into `courtlens_next` while the old
release served, row counts matched local (player games 2,688,197; possessions 2,930,101; stint players
7,494,080; Stats cohort rows 52,498; alembic `19b810a4f017`), and the dump was deleted on both machines.
Cutover stopped the API and dashboard, renamed `courtlens` to `courtlens_prev` and `courtlens_next` to
`courtlens`, then ran `scripts/deploy-vps.sh` (105 s; Stats cohorts already stored: 171 existing, 0 built).
The restored database is 17 GB.

The Images run was dispatched by hand: main CI on 3c2f1b03 failed twice on a Wingspan e2e timing flake
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
   The 2026-10-13 dump came from `databallr-alignment` while `14b810a4f012` was
   unmerged, so the index was dropped and the database stamped `13b810a4f011`.
   Main now carries that migration and recreates the index on deploy.
5. Create the tunnel and route `courtlens.calebhabesh.com` to `http://127.0.0.1:8090`.
   Save the connector token at `secrets/tunnel-token` (mode 0600, owner `1001:1001`).
   The next deploy starts the `cloudflared` service.
