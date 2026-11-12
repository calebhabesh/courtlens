# W7 runbook: everything runs on the VPS

W7a's survey and the exact W7b and W7c steps, with how to go back. Written 2026-11-12; **the owner
approves this before W7b.** Nothing live changed in W7a: the source test ran in a one-off
container with no database and kept nothing.

## 1. The jobs (from the code, 2026-11-12, main `17e748b4`)

Timers come from `scripts/install_data_refresh.sh` (times UTC) and
`scripts/install_win_probability_push.sh`.

| Job (timer) | Command | When (UTC) | Fetches from | Writes (directories) | Writes (tables) | Settings / keys |
| --- | --- | --- | --- | --- | --- | --- |
| Rosters (`courtlens-roster-refresh`) | `refresh-espn-rosters` | every 6 h | `site.api.espn.com` | `raw/espn-rosters`, `derived/espn-rosters-v1` | acquisitions, identity crosswalk | `espn_rosters_dir` |
| Daily refresh (`courtlens-daily-refresh`) | `refresh-daily` | 13:30 | see steps | see steps | see steps | `DATABASE_URL`, dbt profile |
| · player index | `refresh-player-index` | | `api.github.com`, `raw.githubusercontent.com` (hoopR) | `raw/player-context` | acquisitions, artifacts, identity crosswalk | |
| · season stats | `refresh-season-stats` | | `api.github.com`, `raw.githubusercontent.com` (hoopR box scores, play-by-play, schedule) | `raw/season-boxscores`, `raw/sportsdataverse_<year>` | a new statistics release (datasets, release bindings, `published_snapshots` pointer), dbt run and tests | |
| · team scoring | `acquire-team-scoring` | | `raw.githubusercontent.com` (hoopR team stats) | `raw/stats-feeds` | acquisitions, artifacts | |
| · contracts | `refresh-contracts` | | `www.basketball-reference.com` | `raw/finance` | acquisitions, artifacts, identities | |
| · DARKO | `refresh-darko-daily` | | `www.darko.app` | `raw/darko`, `derived/darko-dpm-v2` | artifacts, player games | `darko_manifest` |
| · Wikipedia transactions | `refresh-wikipedia-transactions` | | `en.wikipedia.org` | `raw/wikipedia-transactions`, `derived/wikipedia-transactions-v1` | — | `wikipedia_transactions_dir` |
| · win probability | (step) | | none | `derived/win-probability-ratings` (rating snapshots) | — | `COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=false` on the PC since the cutover |
| · Projected Impact | `refresh-projected-impact` | | none | `derived/projected-impact-serving` | — | `projected_impact_*_dir` |
| Lineups (`courtlens-lineups-refresh`) | `refresh-season-lineups` | 14:05 | none (reads the season-stats store) | `derived/season-impact`, `derived/stint-box-v1`, impact serving and splits | provisional datasets, stints, possessions, observations | |
| Season impact (`courtlens-impact-refresh`) | `refresh-season-impact` | Mon 14:30 | none | `derived/season-impact`, `derived/impact-serving-v1`, `derived/impact-team-splits-v1` | datasets, members, stints, possessions | |
| Metric Backtest (`courtlens-metric-backtest`) | `refresh-metric-backtest` | 15:00 | none | `derived/metric-backtest-serving` | — | `metric_backtest_serving_dir` |
| Win-probability push (`courtlens-win-probability-push`) | `scripts/win-probability-push.sh` | after daily and roster | VPS (rsync) | VPS: `raw/sportsdataverse_<year>`, `derived/win-probability-ratings`, `derived/espn-rosters-v1`, `derived/projected-impact-serving`; PC: pulls `derived/win-probability-serving` | — | ssh `vps` |
| Scratch cleanup (`courtlens-scratch-clean`) | `make clean-scratch` | hourly | none | PC only | — | stays on the PC |

Not on a timer but kept current by hand when needed: player portraits (`cache/portraits`), the
Free Agency tracker (offseason), the Basketball-Reference history crawl (**never run in W7**).

## 2. Sources from the VPS (W7a step 2)

One document per host from the VPS (aarch64), 2026-11-12 18:19Z, the policy User-Agent
(`CourtLens/2 (+https://github.com/calebhabesh/courtlens; non-commercial portfolio)`), no
redirects, 30 s timeout, robots.txt first, 10 s between a host's two requests (every registered
pace is 5 s or less). Run as `docker compose run --rm --no-deps -T --entrypoint python api -`.

| Host | Jobs | Document | Status | Bytes | robots.txt | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `api.github.com` | season stats, team scoring, player index | hoopR's latest commit | 200 | 3,479 | 404 | reachable |
| `raw.githubusercontent.com` | the same | hoopR schedule 2027 | 200 | 4,410,377 | 404 | reachable |
| `www.basketball-reference.com` | contracts | `/contracts/BOS.html` | 200 | 155,541 | 200 | reachable |
| `www.darko.app` | DARKO | today's `__data.json` | 200 | 190,553 | 404 | reachable |
| `en.wikipedia.org` | transactions | 2026–27 transactions page | 200 | 2,199,223 | 200 | reachable |
| `site.api.espn.com` | rosters (and the seal service since W2) | team 2 roster | 200 | 87,615 | 403 (robots-optional host) | reachable |

**No source is refused**, so W7a step 3 needs no decision.

## 3. Found in the survey: rows that exist only on the VPS

Since F04 (2026-11-11) visitors write to the VPS database. On 2026-11-12 it held 3 `users`,
8 `user_favorite_players`, 10 `assistant_threads` (15 turns, 6 inputs, 6 transcripts) and
5 `workbench_personal_workspaces`. The plan's W7b step 3 (replace the database with a PC dump)
would erase them. **The runbook below carries them across** (step B4); the owner should confirm.

## 4. Sizes (2026-11-12)

PC data: raw 6.7 GB, derived 5.4 GB, artifacts 4.6 GB, cache 1.6 GB. VPS data today 3.2 GB;
VPS disk 36 GB used, 158 GB free; memory 20 GB available. VPS database about 17 GB.
After the copy the VPS data is about 18 GB.

## 5. W7b steps (on the owner's "move", 09:00 to noon Eastern, owner present)

Pre-checks: the PC's 08:30 ET `refresh-daily` succeeded today; `win-probability-seal`'s 09:00
run succeeded; no deploy is in progress. Never restart `win-probability-seal` after noon ET.

- **B1. Stop the PC's push.** `scripts/install_win_probability_push.sh --remove`; confirm with
  `systemctl --user list-timers --all | grep courtlens` and `systemctl --user list-unit-files 'courtlens-win-probability-push*'`.
- **B2. Copy the data directory once, never `--delete`, never the VPS-owned directories:**
  ```bash
  rsync -az --info=stats2 --exclude='*.tmp' \
    --exclude='derived/win-probability-serving/' --exclude='raw/espn-wp/' \
    --exclude='backups/' --exclude='logs/' --exclude='pf09-tmp/' \
    -e 'ssh -o BatchMode=yes' ~/dev/courtlens/data/ vps:/home/ubuntu/apps/courtlens/data/
  ```
  Then compare file counts and total bytes per top-level directory on both sides.
- **B3. Dump the PC database:** `pg_dump -Fc --no-owner --exclude-schema='cl_candidate_*'`, copy to
  the VPS, restore with `pg_restore -j 2` into `courtlens_next` while the current release serves
  (the 2026-11-10 procedure). Check row counts against the PC (player games, possessions, stint
  players, Stats cohort rows, alembic head).
- **B4. Carry the visitor rows across.** From the live `courtlens` database, dump only
  `users`, `user_favorite_players`, `assistant_threads`, `assistant_turns`, `assistant_turn_inputs`,
  `assistant_agent_transcripts`, `workbench_personal_workspaces` (`pg_dump -Fc --data-only -t …`),
  truncate those tables in `courtlens_next` (the PC's dev users), restore the dump into it, and
  reset each table's id sequence to its maximum. Check the counts equal the live database's.
- **B5. Swap** in the 2026-11-10 way: stop `api` and `dashboard` (not `win-probability-seal`, which
  reads no database), rename `courtlens` → `courtlens_prev`, `courtlens_next` → `courtlens`, start
  them. Keep `courtlens_prev` until the owner says to drop it. From here the VPS database is the
  live one and is never replaced from the PC.
- **B6. `deploy-vps.sh` stops copying data.** A PR removes `SERVING_DIRS` and its rsyncs; it keeps
  creating the directories, migrations, the demo seed and the Stats cohort warm-up. Verify with a
  deploy that no file under `data/` changes (`find data -newer <marker>` before and after).
- **B7. The `jobs` service.** A PR adds a Compose service in the `win-probability-seal` pattern:
  the API image, `data/` read-write, the database, one job at a time on the PC's schedule (rosters
  every 6 h; daily 13:30; lineups 14:05; Metric Backtest 15:00; season impact Mondays 14:30), a
  failed job reported and the loop continuing. The API's mounts stay read-only. Its memory cap is
  set from a measured run (the daily refresh peaks at 2.9 GB on the PC: start at 4 GB, then set).
- **B8. Move rosters.** Run `refresh-espn-rosters` once on the VPS in the jobs container; compare
  its bundle with the PC's of the same hour (content-addressed: same hash when ESPN did not change).
  Then remove only the PC's roster timer.
- **B9. Move the daily refresh.** Run it once on the VPS the next morning after the PC's run;
  compare: content-addressed raw files by hash; the statistics release by row counts and season
  totals; DARKO and Wikipedia bundles by hash. Then remove the PC's daily timer.
- **B10. Rating snapshots on the VPS.** Refit the newest snapshot there and compare with the PC's
  file: largest rating difference and largest change in any sealed game's own forecast. **Above
  0.01 points, stop and ask.** Add a dated protocol note that the seal's inputs now come from the VPS.
- **B11. Measure** the daily run on the VPS (time, peak memory), the API's p95 response time while
  it runs, and disk after it.

**Going back (any point in W7b):** re-enable the PC's timers (`scripts/install_data_refresh.sh`)
and its push (`scripts/install_win_probability_push.sh`); if the swap happened, stop `api` and
`dashboard`, rename `courtlens` → `courtlens_failed`, `courtlens_prev` → `courtlens`, start them.
A reverted `deploy-vps.sh` copies data again on the next deploy.

## 6. W7c steps

- **C1. Move the rest**, one at a time, the same way: lineups, Metric Backtest, the Projected
  Impact weekly score, season impact (measure season impact's first real run; it has not had one
  this season).
- **C2. Frozen models on a new machine.** Metric Backtest and Projected Impact score the same
  finished games on both machines once; rows must agree to 1e-9; a dated protocol note on each.
- **C3. Backups.** Weekly `pg_dump -Fc` on the VPS disk, two kept. Nightly copy of the records that
  cannot be recomputed (seals, scorecards, head-to-head, weekly scores) to a private GitHub
  repository (recommended: free and versioned; the owner picks at this gate). Prove one restore of
  each.
- **C4. Job health.** Each job writes its last success and failure; one GET endpoint returns them;
  the operations note says what stale looks like. No new alert service; ask before reusing one.
- **C5. The PC.** `scripts/install_data_refresh.sh --remove` (the scratch cleanup stays); add
  `scripts/pull-from-vps.sh` (copies data and, on request, a database dump to the PC; never pushes).
- **C6. Docs.** The deployment guide rewritten around the VPS as the system of record; AGENTS.md's
  hosted-demo paragraph.

Evidence for W7: this table, each job's VPS run beside the PC's, time and memory per job, disk
after a week, one restore from each backup, and a day the PC was off with every page advancing.
