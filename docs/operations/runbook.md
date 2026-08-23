# Operations runbook

## Start and verify

```bash
cp .env.example .env
docker compose up --build -d db migrate api dashboard
curl --fail http://localhost:8000/api/health
./scripts/smoke.sh
```

If port 3000 is occupied, set `COURTLOAD_DASHBOARD_PORT=3100` in `.env` and include that origin in
`COURTLOAD_CORS_ORIGINS`.

## Initial backfill

Choose a bounded permitted range. Game-player stats require the recorded paid entitlement.

```bash
docker compose exec api courtload ingest \
  --start 2025-10-01 --end 2026-04-30 \
  --include-stats --include-players
docker compose --profile tools run --rm dbt build --profiles-dir .
```

Re-run the same command and retain the idempotency counts as evidence.

## Daily correction window

`scripts/refresh.sh` reloads the last three days (to catch late corrections), the next fourteen days,
runs operational checks, and then builds/tests dbt. Schedule it once daily during the season using
cron, systemd, a scheduled container, or the hosting platform's job runner.

## Failure triage

| Symptom | Meaning | Action |
| --- | --- | --- |
| HTTP 401 on teams/games | invalid/missing credential | replace the server-side key; do not expose it in UI |
| Entitlement error on stats | NBA ALL-STAR access absent/expired | keep schedule current, mark player form stale, renew or disable paid refresh |
| HTTP 429 | configured/requested rate too high | lower requests/minute and respect `Retry-After` |
| Schema error | upstream contract drift | preserve raw response/error, update fixture and parser deliberately |
| dbt test failure | transformed data violates an invariant | do not publish the affected mart until investigated |
| Dashboard says fixture | most recent successful run is a fixture | do not call it current/operational data |

## Backup and restore

```bash
./scripts/backup.sh
gunzip -c data/backups/courtload-TIMESTAMP.sql.gz | \
  docker compose exec -T db psql -U courtload -d courtload
```

Back up the raw-object volume with the database. A database row without its content-addressed object
loses the audit trace. Test restore to a separate database before relying on a backup policy.

## Production checklist

- unique JWT and database secrets; TLS at the edge;
- exact CORS origin and edge rate limits;
- no fixture seeding or demo credentials;
- persistent raw volume/object bucket and automated PostgreSQL backups;
- scheduled refresh with a private failure webhook;
- health, request latency, failed ingest, freshness, disk, and database alerts;
- source tier/cost/terms rechecked and recorded;
- smoke test plus dbt build after each deployment.
