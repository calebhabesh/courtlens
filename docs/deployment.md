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
   `POST /api/workbench/operations/*`, which compute results without writing.

Workspace changes (favorites, boards, saved views), jobs, saved analyses
and the assistant are therefore unavailable. The dashboard image is built with
`NEXT_PUBLIC_COURTLENS_HOSTED=true`, which hides the Ask button and replaces the Ask page
with a note, and with an empty `NEXT_PUBLIC_COURTLENS_API_URL`, so browser calls are
same-origin.

### Live

Live works on the demo: its endpoints are GETs, and the API container fetches ESPN when a cached
read is stale ([Live service v2](design/shared-live-v2.md)). That needs outbound HTTPS from the API
container. Final games are kept as hashed evidence (about 0.7 MB each, capped at 4 GiB), the one
part of the demo database that grows after deploy.

### Disk budget

The VPS boot volume is 193 GB, nearly all of the Always Free 200 GB block-storage allowance
(measured 2026-10-19: 21 GB used across CourtLens, LineWatchTO and the portfolio; Docker images
4.8 GB, volumes 8.3 GB). Outbound transfer is free up to 10 TB a month and inbound is free, and
Caddy compresses responses (`encode zstd gzip`). The demo needs about 1.2 GB of images, about 6 GB
of Postgres and about 1.4 GB of serving files. The data snapshot is frozen, so the database
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
value-archetype and WOWY manifests, and player portraits (`SERVING_DIRS` in the script,
about 1.4 GB). They are rsynced from
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

## First-time setup

These steps have already been done once; they are recorded for a rebuild.

1. Generate `secrets.env` on the VPS (mode 0600). It holds
   `COURTLENS_POSTGRES_PASSWORD`, `COURTLENS_JWT_SECRET` and `COURTLENS_OPERATOR_TOKEN`,
   each from `openssl rand -hex 32`. It never leaves the VPS.
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
