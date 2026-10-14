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

Workspace changes (favorites, boards, saved views), jobs, live leases, saved analyses
and the assistant are therefore unavailable. The dashboard image is built with
`NEXT_PUBLIC_COURTLENS_HOSTED=true`, which hides the Ask button and replaces the Ask page
with a note, and with an empty `NEXT_PUBLIC_COURTLENS_API_URL`, so browser calls are
same-origin.

### Disk budget

The VPS boot volume is 50 GB. The demo needs about 1.2 GB of images, about 6 GB of
Postgres and about 1.4 GB of serving files. The data snapshot is frozen, so the database
does not grow. Deploys never build on the VPS. Each deploy removes CourtLens images other
than the current and previous release. Container logs rotate at 3 × 10 MB, and journald
is capped at 200 MB.

Stored Stats cohorts (`stats_cohort_entries`/`stats_cohort_rows`) add about 120 MB: every
season's whole-league Stats rows and ranks for the served release. After each deploy the script
runs `courtlens warm-stats-cohorts` in the API container, which stores any season the new release
or serving code has not stored yet (about 40 s locally for 62 seasons) and deletes entries of
other releases. If it fails the deploy still completes; each season is then computed and stored
on its first view.

Scheduled refresh (C22) is not enabled. Publication is append-only, so turning it on
also needs a retention job that keeps only the last few ready snapshots on the VPS.

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
