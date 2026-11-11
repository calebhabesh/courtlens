# F04 evidence: accounts, the demo account and favourite players

Finish plan F04, built 2026-11-11 on `feat/f04-accounts`. Owner decisions: invite-only (CLI), one
shared demo account reset nightly, favourites only.

## Screenshots

Taken by `dashboard/e2e/f04-accounts.spec.ts` with `F04_EVIDENCE_DIR` set, on the sandbox build
(mock API on 4180, dashboard on 3180). Fixture players: Fixture Star (TOR) and Fixture Guard (BOS).

| File | What it shows |
| --- | --- |
| `f04-favorites-signed-out-1440.png` | Header star popover signed out: "Sign in" and "Use the demo account" |
| `f04-sign-in-dialog-1440.png` | Sign-in dialog opened from the Stats Favorites filter, with its reason |
| `f04-favorites-demo-1440.png` | Demo account: Favorite Players list (latest-season photo, logo beside the code, season), shared-list note |
| `f04-stats-favorites-1440.png` | Stats filtered to the signed-in account's one favourite |
| `f04-player-page-favorite-1440.png` | Player page star filled after saving; header count 2 |
| `f04-drawer-demo-390.png` | Phone drawer: Favorite Players section at the top |
| `f04-sign-in-dialog-390.png` | Sign-in dialog at phone width |

## Boundary check

`caddy-allowlist.txt`: `scripts/check_caddy_allowlist.sh` runs the pinned Caddy image
(`deploy/pinned.env`) with `deploy/Caddyfile` in front of stub upstreams. 26 checks: the seven
account routes reach the dashboard; PUT and malformed favourite paths, `/api/auth/*`, `/api/me/*`
writes and workspace favourite writes get 403; public Ask and `/api/workbench/query` are unchanged.

## Real data

`describe_favorites` on the owner's local database (read-only) resolves all eight seeded demo
players with names, latest season 2026-27 and current team (DEN, OKC, MIA, SAS, LAL, MIN, NYK, GSW).
