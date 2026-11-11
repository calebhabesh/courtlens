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
