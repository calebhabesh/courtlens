# Databallr alignment catalog

Work queue for the [alignment handoff](databallr-alignment-plan.md). Pairings come from the
[Databallr route map](research/databallr-replica-findings.md); wrong pairings are corrected during
owner review.

Status: ⬜ not started · 🔧 in progress · 👀 ready for review · ✅ aligned (owner only)

## Overview

Rows are in working order.

| # | Databallr | CourtLens | Status | Notes |
|---|---|---|---|---|
| 0 | App shell (nav rows, search, page title block) | `app/layout.tsx` | ⬜ | Done with the Stats pass |
| 1 | Stats | `/stats` | ⬜ | Regressed vs Databallr (owner screenshots, 2026-10-12) |
| 2 | Dashboard (player) | `/players/[id]` | ⬜ | |
| 3 | PvP | `/compare` | ⬜ | Compare Export failure is a known gap |
| 4 | Teams | `/teams` | ⬜ | |
| 5 | WOWY | `/wowy` | ⬜ | |
| 6 | Last X Games | `/last-games` | ⬜ | |
| 7 | Live | `/live` | ⬜ | |
| 8 | Playoffs | `/playoffs` | ⬜ | |
| 9 | Showcase | `/showcase` | ⬜ | |
| 10 | Rankings | `/rankings` | ⬜ | PC12 D partial example boards (`53ee4d6`) |
| 11 | Tier List | `/tierlist` | ⬜ | PC12 D partial example boards (`53ee4d6`) |
| 12 | Roster Shapes | `/roster-shapes` | ⬜ | |
| 13 | Stat Line Shift | `/stat-line-shift` | ⬜ | |
| 14 | Contracts + Free Agency | `/contracts` | ⬜ | |
| 15 | Team Compare | `/team-compare` | ⬜ | |
| 16 | Matchup Matrix | `/matchups` | ⬜ | |
| 17 | Shot Profile Twin | `/similar-players` | ⬜ | Partial overlap |
| 18 | Six Factor RAPM | `/research` | ⬜ | |
| 19 | Wingspan | `/wingspan` | ⬜ | |
| 20 | Offensive Calculator | `/calculator` | ⬜ | |
| 21 | Learning / Patch Notes | `/methodology`, `/whats-new` | ⬜ | |

**CourtLens-only (one sweep at the end, no checkbox):** `/forecasts`, `/evaluation`,
`/investigations`, `/data-status`, `/settings`, `/planner`, `/design`.

**Databallr-only, not replicated:** Home game, WNBA, zTS, ShotQuality, D-ShotQuality,
Shot Aftermath, EPV Replays, Kawhi Files, Blog, NBA Draft.

## Page instructions

Each page gets a section when the owner starts it, using this shape:

```
### <#> <Page> — <status>
Instructions (owner, <date>):
1. [ ] <instruction> — <done note / commit>
Data-blocked: <Databallr elements we can't source>
Evidence: docs/evidence/alignment/<page>/
```
