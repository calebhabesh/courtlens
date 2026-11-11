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
