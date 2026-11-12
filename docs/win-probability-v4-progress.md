# Win Probability v4 progress

Measured evidence for the [Win Probability v4 plan](win-probability-v4-plan.md). Newest last.

## 2026-11-11 — Plan and draft registration written; nothing fitted or built

Planned with the owner in one session (decisions W-D1 to W-D13 in the plan). The draft
registration `courtlens-win-probability-v4` loads through `load_registration` and is **not yet
committed**: W0 commits and pushes it, with the commit date as `registered_on`, before any fit.

Facts measured for the plan, on the owner's PC:

- Closing lines cover 2020-21 to 2025-26 (7,942 rows including playoffs, median 5 minutes before
  tip-off, all with a home point).
- The Original's prospective record stood at 53 games (2026-11-04 to 2026-11-10); seals were taken
  once a day at about 13:45 UTC.
- `scripts/deploy-vps.sh` mirrors `derived/win-probability-serving` with `--delete`, and the API
  mounts it read-only.

## 2026-11-11 — W0: registration committed, not yet pushed

The owner approved the plan and the registration text ("approved, commit the plan and registration
on a branch"). `courtlens-win-probability-v4` was committed alone, before any fit, on branch
`feat/win-probability-v4`: commit `d868ebcaf1b4eba10b5ee66f480c990b7280199f`, content hash
`654b26bab5ee149999f69934e7cdcf288dafd31985cb2d375a32754972225085`, `registered_on` 2026-11-11.

Still owed for W0: push the branch before W1 starts, so the registration is dated publicly before
any fit.

## 2026-11-11 — W1: stages S and C measured; all gates pass, work continues

Setup: the registration branch was pushed before any fit; work ran in the worktree
`~/dev/courtlens-wp4` (its tracked `data/` replaced by a symlink to the main checkout's data, the
four `.gitkeep` files set skip-worktree). New files only: `evaluation/win_probability_v4.py`,
`scripts/run_win_probability_v4.sh`, `tests/unit/test_win_probability_v4.py`. Evidence:
[docs/evidence/win-probability-v4](evidence/win-probability-v4/README.md).

- **Pre-fit checks** (no fit): own forecast = `mu_from_entry` with the manifest's coefficients
  (max diff 3.6e-15, 13,088 games); RMSE 14.163 own and 13.708 line on 2024-25 and 2025-26; the
  Original's log loss 0.4028 on the stage C states. All match.
- **Lines to games.** The parquet is keyed by ESPN event id and v2 had ESPN ids only for 2024-25
  and 2025-26. With the owner's approval, ESPN scoreboards for the 629 game dates of 2020-21 to
  2023-24 were read (52 min, 5 s pacing) and matched by date, teams and final score: every game
  matched. Games without a line: 10, 1, 1, 0, 0, 0 (2020-21 to 2025-26).
- **Stage S** (2023-24): w = 0.720 on 2022-23 (1,228 games; regression check line 0.740, own
  0.194). K1 0.3971, K2 0.3969, Original 0.4036. K2 against K1 +0.0002 (90% −0.0006 to +0.0009):
  **K1 kept.** Selection log committed and pushed (0a1ec88d) before stage C. 1 min 52 s, 2.4 GB.
- **Stage C** (2024-25 and 2025-26, read once; 19 s, 633 MB): w = 0.906 on 2022-23 and 2023-24
  (2,444 games; regression check line 0.905, own 0.102). Log loss 0.3938 against the Original's
  0.4028. **D1 passes**: +0.0090 (95% +0.0056 to +0.0126). **D2 passes**: squared error +12.39
  (+9.28 to +15.41); RMSE mu4 13.719, own 14.163, line 13.708; winners 69.5%, 68.4%, 69.5%.
  **A2 passes**: calibration error 0.0086. By phase the gain is +0.015 in the first half, fading
  to +0.0002 in the last two minutes; overtime −0.0045 (−0.0147 to +0.0056, 114 games).
- **Green:** 13 new unit tests pass; strict mypy (390 files) and Ruff clean. The full Python
  suite: 2,762 passed and 9 failed, and all 9 fail on `main` too — 8 `test_agent_providers`
  Anthropic cases (the main venv's `anthropic` SDK rejects `httpx2.Client`) and
  `test_no_unexplained_legacy_brand_references` (`docs/finish-progress.md:89`, from F05). Not
  touched here.

Under the registration the work continues: W2 next, after the owner reads this result.

## 2026-11-11 — W2 part A: seal v2, the seal job and the VPS service built and proved locally

Built in the worktree on `feat/win-probability-v4`; the cutover (part B) has not run. Nothing
on the VPS, the main checkout, its `.env` or any systemd unit was changed. Every trial ran against
a copy of the serving directory under `~/.cache/courtlens-tmp`, in a scratch tree laid out like the
VPS (only `artifacts/win-probability`, `derived/win-probability-ratings`, `derived/espn-rosters-v1`,
`raw/sportsdataverse_2025` to `2027`, an empty `raw/espn-wp`; no `derived/impact-history-v2`).

New: `services/win_probability_seal.py` (seal v2, `seal_slate`, the job `run`, `next_run`), the CLI
command `seal-win-probability [--next-wake]`, the setting `win_probability_local_sealing` (default
true), `scripts/win-probability-push.sh` and `scripts/install_win_probability_push.sh` (replacing
`sync-win-probability.sh` and its installer), the Compose service `win-probability-seal`,
`tests/unit/test_win_probability_seal.py` with line fixtures in
`tests/fixtures/win-probability-lines/`. Changed: `refresh-daily`'s win-probability step reads the
setting; `deploy-vps.sh` no longer mirrors `derived/win-probability-serving` and only creates it and
`raw/espn-wp`; the deployment guide. No existing function in `win_probability_production.py` or
`win_probability_pregame.py` changed; the pinned files are untouched.

- **Seal v2** (`courtlens-win-probability-pregame-v2`). Each game keeps every v1 field and adds
  `line` (home margin, spread, book, details, favourite), `players` (id, name, expected minutes,
  rating, default flag), `out` (each Out roster player with minutes, rating and absence cost),
  `form_split` (team form and home court), `ages` (box scores through, roster observed and
  checked, rating cutoff, injury report time), and null `mu4`, `w` and `tip_off_home` for W3.
  Absence cost and the form split come from extra targets in the same `build_entries` pass (the
  player added back; a neutral-site copy), so the real target is computed exactly as in v1.
- **Parity, real slate** (2026-11-11, 10 games, the same fetched bytes): every v1 field identical
  in all 10 v2 records, `inputs` included; the frozen model's probabilities on a fixed state grid
  differ by 0.0. Unit test on a synthetic slate: identical inputs and identical `score_game` rows.
- **Line sign.** ESPN's `spread` is the home spread, like the parquet's `home_point`; market home
  margin = −spread. Kept scoreboards: 77 of 77 lines name the favourite the sign gives. ESPN game
  summaries' `pickcenter` for 2024-25 and 2025-26 against the parquet: 977 games, sign agrees on
  973, median difference 0.0, p95 0.5. The four that disagree are lines crossing zero or a moved
  line (401810569: ESPN MIN −7.5, parquet −5.0). Fixtures from both are unit-tested.
- **Seal only on change.** Run 1 sealed one game, whose line moved from NO −3.5 to −2.5 in the
  minute after the parity seal; run 2, 22 s later, wrote nothing (`seal_changed: []`).
- **Scoring parity.** 2026-11-10's 6 games removed from a copy and rescored by the job: the
  scorecard rows, availability rows and 141 win-probability-added rows equal the real files'
  rows; the summary differs only in `updated_at`. Three nights (2026-11-08 to 10, 21 games,
  474 credit rows): all identical.
- **Memory and time** (PC, cgroup peak): nothing to score 22 s, 338 MB; 21 games scored 127 s,
  338 MB (the peak is loading three seasons of boxes). Compose cap 768 MB, one CPU.
- **Disk.** A v2 seal is about 5 KB per game (53 KB for 10). Raw ESPN files: scoreboard 12 KB,
  injury report 51 KB, summary 41 KB each, about 2 MB a day at most. Under 1 GB a year together.
- **VPS, read only** (2026-11-11): uid 1001 `ubuntu` owns the data; the API image runs as uid 999,
  so the service runs as `1001:1001`. Box files 2025 to 2027, ratings and the roster bundle are
  present; a dry-run push shows them current (only the roster heartbeat differed). No
  `raw/espn-wp` yet (the deploy creates it). 159 GB free of 193 GB; 20 GB of 24 GB memory
  available; release 8ef78660.
- **Schedule.** One run at container start, 09:00 Eastern, then every 30 minutes from noon while a
  run lands before the day's last scheduled tip (tested across the March clock change).
- **Resilience.** A scoring failure (an odd ESPN summary, say) is reported as `score_error` and the
  run still seals; a failed run retries in 30 minutes.
- **Green:** 29 new unit tests; the Original's serving and pin tests pass untouched. Full suite
  2,790 passed, 9 failed, the same 9 that fail on `main` (8 `test_agent_providers` Anthropic cases,
  `test_no_unexplained_legacy_brand_references`). Strict mypy (391 files), Ruff check and format
  clean.

Next: part B, the cutover, on the owner's word. Until then nothing changes on merge: local
sealing stays on, and the first deploy after the merge is the cutover deploy.

## 2026-11-11 — W3 offline part: stage F, ESPN-state parity and latency pass; nothing frozen

The owner approved starting W3's offline part on the same branch before the cutover ("start W3's
offline part today… so it is in tomorrow's deploy"), limited to stage F, the offline freeze
checks, the v4 predict path and an arm64 check command. Written only under
`data/derived/win-probability-v4` and `docs/evidence/win-probability-v4`; no manifest, model
file, pin test, serving file, v4 scoring, API or dashboard change. Evidence:
[README, W3 offline part](evidence/win-probability-v4/README.md).

- **Stage F** (K1): w = **1.0** on 2022-23 to 2025-26 (4,883 games; unclipped 1.0115, clipped to
  the registered bound; regression check line 1.002, own 0.025). The weight rose 0.720, 0.906,
  1.0 across stages S, C and F. With a line, v4's pregame forecast is the line; with none, the
  own forecast. The plan's risk table covers this: publish as measured.
- **ESPN-state parity** (stage C's w, 2,439 games): log loss +0.00053 at the same times and
  +0.00016 on ESPN's own sample, limit 0.002. **Passes.** The archive states reproduce stage C's
  saved predictions through the serving path to 3.0e-8 (float32 storage).
- **p95 latency** (w 1.0, 200 games, one thread): 21 ms, limit 100 ms. **Passes.**
- **Platform reference** (w 1.0): 1,902 states; the stdin check passes on x86 (0.0).
- **Code.** `services/win_probability_market.py` (the predict path: the Original's model with
  mu4); `evaluation/win_probability_v4_checks.py` (`parity`, `latency`, `platform-write`,
  `platform-check --reference -`); stage `final` in `win_probability_v4.py`; optional `mu_for` and
  `reference` hooks in `win_probability_parity.run` and the platform check (defaults unchanged: v2's
  platform check still gives 0.0 on its committed reference, and its sampled states are identical);
  `scripts/win_probability_v4_platform_check.sh` runs the arm64 check in the VPS API container with
  the reference on stdin.
- **Green:** 8 new unit tests. Full suite 2,799 passed, 9 failed (the same 9 that fail on `main`). Strict mypy (393 files), Ruff check and format clean.

Next: tomorrow, after the cutover is confirmed, run `scripts/win_probability_v4_platform_check.sh`
and report. The owner decides on the freeze.

## 2026-11-11 — Plan revised: W2 and W3 splits recorded, W7 added; nothing built

Plan text only (Fable 5.2, with the owner). No code, data, VPS or timer was changed.

- **W-D14.** The plan now records what was agreed after W1: W2 in two parts (A built, B the
  cutover), W3 as W3a (final fit, checks, freeze) and W3b (both models scored afterwards from every
  seal since the freeze), and the dated protocol note as a committed file whose API field ships in
  W3b.
- **W-D15, block W7.** The owner wants CourtLens to run entirely on the VPS, like their other
  projects ("self sustaining"). W7a surveys every job and tries every source from the VPS; W7b
  moves the data directory, the database, rosters and the daily refresh; W7c moves the rest and
  adds backups and job health. It runs after W3b and before W4.
- **Measured for W7 on the PC today:** daily refresh 11 min and 2.9 GB peak; rosters 2.6 min and
  265 MB; lineups 40 to 58 min and 1.0 GB; Metric Backtest seconds and 180 MB; the season impact
  job has had no real run this season. Data: 6.7 GB raw, 5.4 GB derived, 4.6 GB artifacts.
- **Not known yet:** whether any source refuses the VPS's address, and how each job behaves on
  arm64. W7a answers both before anything moves.
- "How to work through this plan" now carries the worktree, Python, trial-run and known-failure
  notes, so a new session needs only the plan, the registration and this log.

Next is unchanged: W2 part B on the owner's "cut over", then the arm64 check and the freeze (W3a).
