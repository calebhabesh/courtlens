# Running the hosted demo

One page for the owner (Win Probability v4, W6). Since W7 (2026-11-13) the VPS is the system of
record: it runs every scheduled job, holds the only live database and owns `data/`. The PC is for
development; it pulls from the VPS (`scripts/pull-from-vps.sh`) and never pushes. Details are in
the [deployment guide](../deployment.md).

## What runs, and when

Everything below runs inside the Compose stack at `/home/ubuntu/apps/courtlens`, except the two
backup lines, which are in the `ubuntu` user's crontab. Times are Eastern unless marked UTC.

| What | When | Service |
| --- | --- | --- |
| Win Probability seals and grading | 9:00 AM (catch-up grading); every 30 minutes at :25 and :55 from 12:25 PM until the day's last tip; then every 30 minutes until every game that tipped in the last six hours is graded | `win-probability-seal` |
| ESPN rosters | every 6 hours (midnight, 6 AM, noon, 6 PM) | `jobs` |
| Daily refresh: player index, contracts, DARKO, Wikipedia transactions, season statistics, rating snapshots, Projected Impact's weekly score | 13:30 UTC | `jobs` |
| Lineups (WOWY, Stat Line Shift, on/off for 2026-27) | 14:05 UTC | `jobs` |
| Season impact (2026-27 RAPM and the bundle the rating snapshots read) | Mondays 14:30 UTC | `jobs` |
| Metric Backtest's weekly score | 15:00 UTC (scores once every 7 days) | `jobs` |
| Demo account favourites reset | 08:00 UTC | `demo-reset` |
| Database dump to the VPS disk, two kept | Sundays 07:20 UTC | crontab |
| Records copied to the private `courtlens-records` repository | 15:10 UTC | crontab |

The `jobs` service runs one job at a time, each as its own process, so a failure or memory peak
never stops the loop. After a deploy, a job seen for the first time waits for its next scheduled
time. Run one by hand with
`docker compose --env-file secrets.env --env-file release.env exec jobs courtlens run-jobs --run <job>`.

## How to tell it is healthy

- **Jobs:** <https://courtlens.calebhabesh.com/api/job-health>. Each job shows `last_success`,
  `last_failure`, `last_seconds`, `next_run` and the tail of its output. A job is **stale** when
  its last success is older than its limit: 13 hours for rosters, 30 hours for the daily jobs,
  8 days for season impact. A stale job means the page it feeds stopped advancing; the output tail
  says why. Nothing alerts you; check the endpoint.
- **Win Probability:** `docker compose … logs --tail 20 win-probability-seal` shows each run's report
  (`seal_sealed`, `scored`, `awaiting_grade`, `next_run`). Finished games should appear on the
  Win Probability page's track record within 30 minutes of the final buzzer.
- **Backups:** `tail ~/backups/courtlens/backup.log` on the VPS shows the last dump and the last
  records push. The newest dump should be under eight days old.
- **The site:** `curl -fsS http://127.0.0.1:8090/api/health` on the VPS.

## Restoring a backup

- **Database** (a bad migration, a broken release, lost rows). The dump lives on the VPS disk,
  so it does not survive a disk failure; the records below do. Restore into a new database while
  the site keeps serving, then swap it in between 9:00 AM and noon, when no game is being sealed:

  ```bash
  cd /home/ubuntu/apps/courtlens
  dc() { docker compose --env-file secrets.env --env-file release.env "$@"; }
  dc exec -T db psql -U courtlens -d postgres -c "CREATE DATABASE courtlens_restore OWNER courtlens"
  dc exec -T db pg_restore -U courtlens -d courtlens_restore --no-owner --exit-on-error \
    < ~/backups/courtlens/db/<newest>.dump
  dc stop api jobs dashboard demo-reset win-probability-seal
  dc exec -T db psql -U courtlens -d postgres \
    -c "ALTER DATABASE courtlens RENAME TO courtlens_broken" \
    -c "ALTER DATABASE courtlens_restore RENAME TO courtlens"
  dc --profile tunnel up -d --wait
  ```

  Drop `courtlens_broken` once the site is right. The dump excludes the dbt candidate schemas,
  which serving never reads. (`pg_restore -j` cannot read from a pipe, so this restore is
  single-stream.)
- **Records** (the seals, scorecards, head-to-head reads and weekly scores that nothing can
  recompute). Clone `calebhabesh/courtlens-records` and copy its `data/` over the VPS's `data/`
  with `rsync -a` (never `--delete`). Everything else under `data/` can be rebuilt by the jobs or
  copied from the PC with the opposite of `pull-from-vps.sh`.

Both restores were proved once on 2026-11-13 (W7c evidence in the
[v4 progress log](../win-probability-v4-progress.md)).

## Game 300 and the end of the season

Nothing needs you at either point.

- **Game 300.** When 300 games have been scored by both models since v4's freeze, the seal service
  writes the registered 300-game read to `scorecard/head-to-head-reads.jsonl`, once, and the page
  shows it. If it finds the Market-informed model worse, the registered rule notes that; Live keeps
  leading with CourtLens' own read either way (W-D16). Expect "not distinguishable"; that is the
  registered expectation at 300 games.
- **End of the regular season.** Playoff games are never sealed. When ESPN's scoreboard reports a
  postseason, the seal service writes the final read once. The monthly rating snapshots stop at
  the last regular-season month; the daily, lineups and weekly jobs keep running and stop finding
  new 2026-27 games.
- **2027-28** is not automatic: a new season needs its opener date and season label set in the
  rating-snapshot and season-impact code, and Win Probability's test is registered for 2026-27
  only. Plan it before next October.
