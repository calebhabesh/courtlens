# R01 — impact history backfill, time decay, intervals, R², snapshots

Measured 2026-11-04 on branch `research`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md). Registrations are in
[`evaluation/research/registrations/`](../../../../evaluation/research/registrations/); their content
hashes are in [results.json](results.json) and in every artifact.

Machine-readable files here: [coverage.json](coverage.json) (per-season coverage, rule counts,
exclusions with reasons), [results.json](results.json) (fits, intervals, time decay, snapshots,
runtimes and peak memory per run), [six-factor-reconstruction.json](six-factor-reconstruction.json),
[snapshot-index.json](snapshot-index.json) and [archive-observation.json](archive-observation.json)
(every downloaded asset with SHA-256). Bulk outputs stay in git-ignored `data/derived/impact-history-v2/`
(1.2 GB), addressed by the hashes recorded here.

## What changed and what did not

- New code only: `domain/research_registry.py`, `domain/impact_history_aliases.py`,
  `ingestion/impact_history.py`, `ingestion/impact_history_extras.py`,
  `evaluation/impact_history_fits.py`, `evaluation/impact_history_ratings.py`,
  `evaluation/impact_history_serving.py`. No hash-pinned module (`impact_population`,
  `impact_repair_audit`, `impact_archive`, `domain/impact_*`, `possession_repair`, the IM04/IM05
  runners) was edited; they are imported and run on the new seasons.
- The sealed 2023-24 to 2025-26 bundles, datasets and IM04/IM05 artifacts are untouched. The served
  impact bundle carries all 18 sealed entries byte-identical (checked) and adds 36.
- All runs used `systemd-run` with `MemoryMax` (2–3 GiB), `MemorySwapMax=0`, two CPUs and
  `TMPDIR=~/.cache/courtlens-tmp`. Highest peak: 1.8 GiB (IM03 bundles).

## 1. Backfill 2014-15 to 2022-23 (`courtlens-impact-history-v2`)

Inputs: shufinskiy/nba_data at the IM01 pin `e829d46`, 36 archives plus 4 notices (301 MB, fetched in 69 s at 281 MB peak memory).
The pinned index has `cdnnba` only from 2020-21, not 2016-17 as the handoff assumed, so
2014-15 to 2019-20 run on the v3 stream alone (`cdn_rows=None`, as the in-season pipeline does).
Matchups start in 2017-18. Schedules and boxes are the SportsDataverse files already retained with
their receipts. 2019-20 has 1,059 regular-season games (88 in the bubble, after the 1 July cap the
IM01 checks use) and 2020-21 has 1,080.

**Registered stop rule hit, then a new rule.** The v1 pilot (100 evenly spaced games each from
2014-15, 2017-18, 2020-21) excluded **52 / 27 / 3**. Every exclusion was the same cause: the NBA
later renamed players in boxes and in the play-by-play name fields (Kanter → Freedom, "Ennis" →
"Ennis III", "Bullock Jr.", "Porter Jr.") while substitution descriptions keep the old text, and short
names collide with first names ("James" for LeBron James and James Jones). Rule **R01-H5**
(`domain/impact_history_aliases.py`) resolves such a name only from the same game's own rows (the
substitution row's own `personId` for the outgoing name; the single teammate whose action or
sub-out rows carry that exact text for the incoming one; a unique Jr./Sr./II/III suffix match only
when the game attests nothing). Every rewrite is kept with original text and evidence rows and is
recorded in Postgres as an `r01_history_name_alias` override. Registration v2 adds the rule; v1 is
kept. v2 was revised once before any admission (adding the suffix fallback after the pilot showed
Reggie Bullock entering with no other row in his game); pilots ran under v2 hashes
`31360912…` (5 / 0 / 0) and `6f65bf3f…` (4 / 0 / 0). The owner approved sealing with this rule.

| Season | Source | Scheduled | Clean | Patched | Excluded (IM02 + event gate) | Admitted | R01-H5 rewrites (games) | Stints | Possessions | Box +/- exact |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2014-15 | history v2 | 1,230 | 0 | 1,208 | 22 (22 + 0) | 98.21% | 3,549 (574) | 57,810 | 229,809 | 50.27% |
| 2015-16 | history v2 | 1,230 | 0 | 1,219 | 11 (11 + 0) | 99.11% | 2,275 (474) | 59,475 | 236,479 | 50.04% |
| 2016-17 | history v2 | 1,230 | 0 | 1,206 | 24 (20 + 4) | 98.05% | 1,888 (365) | 58,726 | 234,795 | 50.40% |
| 2017-18 | history v2 | 1,230 | 1,146 | 71 | 13 (1 + 12) | 98.94% | 1,034 (240) | 59,715 | 238,674 | 50.99% |
| 2018-19 | history v2 | 1,230 | 1,172 | 55 | 3 (2 + 1) | 99.76% | 906 (201) | 61,936 | 247,673 | 49.59% |
| 2019-20 | history v2 | 1,059 | 970 | 63 | 26 (25 + 1) | 97.54% | 728 (155) | 54,694 | 209,402 | 49.24% |
| 2020-21 | history v2 | 1,080 | 0 | 1,074 | 6 (5 + 1) | 99.44% | 1,035 (223) | 53,533 | 214,554 | 53.23% |
| 2021-22 | history v2 | 1,230 | 0 | 1,228 | 2 (0 + 2) | 99.84% | 1,513 (254) | 62,284 | 243,233 | 50.64% |
| 2022-23 | history v2 | 1,230 | 0 | 1,229 | 1 (0 + 1) | 99.92% | 1,383 (219) | 62,265 | 246,351 | 49.66% |
| 2023-24 | sealed | 1,230 | 0 | 1,216 | 14 | 98.86% | – | 58,652 | 241,673 | 52.14% |
| 2024-25 | sealed | 1,230 | 0 | 1,212 | 18 | 98.54% | – | 61,514 | 241,609 | 53.18% |
| 2025-26 | sealed | 1,230 | 0 | 1,227 | 3 | 99.76% | – | 68,925 | 245,711 | 48.71% |

"Patched" in 2014-15 to 2016-17 is mostly IM02-R1 period starters; in 2020-21 onward it includes
v3/CDN arbitration (IM02-R6), as in the sealed seasons. Remaining IM02 exclusions: 30 games with
"Co. Martin" (Cody Martin, whose every box name is shared with Caleb Martin or Cody Zeller, so no
text the pinned parser accepts names him), free throws with no outcome text, two Robinsons on the
2014-15 76ers, and missing-substitution cycles. All 23 event-gate exclusions (rule H2) failed only
the pbpstats public-sequence review; their event checks passed. Every exclusion with its reason is
in [coverage.json](coverage.json). Override rows sealed (3,491 in 2014-15 …) are fewer than
rewrites because rewrites inside excluded games are not sealed.

Reproduction: two IM02 runs give the same content hash `a3db5faf…` (5 min 48 s / 4 min 52 s,
peak 1.0 GiB). IM03 bundles: 85–118 s per season, peak 1.8 GiB. Sealing: nine ordinary
`courtlens-impact` datasets, status `ready`, PostgreSQL stint and possession counts equal the
bundles; re-sealing 2022-23 returned `reused: true` (38 s). Database 16 → 22 GB.

## 2. IM04-method fits on the new windows

27 windows: 1Y/2Y/3Y ending 2014-15 to 2022-23, plus 2Y and 3Y ending 2023-24 and 3Y ending
2024-25 (which the sealed run could not form). Pinned functions, alpha grid [10, 100, 1000],
cutoff rule H3 (day after the last admitted game; equals the 1 July cap except for the bubble).
**Every fit chose alpha 1000, the grid's upper end**, as all twelve sealed fits did; the pinned
grid was not widened. BPR is unavailable only for the three windows starting 2014-15 (no earlier
season). The pinned prior rule needs prior cutoffs before 1 July, so **2020-21's box prior skips
2019-20** (its cutoff is 2020-08-15). Runtime 27 min 2 s over four chunks, peak 1.4 GiB.
The compact array form used by the later stages reproduces all twelve 1Y fits (all four targets)
to at most **1.1 × 10⁻⁷**.

## 3. Game-bootstrap intervals (`courtlens-impact-intervals-v1`)

200 seeded replicates per fit, resampling games, fixed selected alpha. Each bootstrap first
re-derives its point fit (max difference 1.1 × 10⁻⁷). Median 80% interval width among qualified
players, and the share whose interval excludes zero:

| Season | 1Y RAPM width | excl. 0 | ORAPM | DRAPM | oTS | Time-decay RAPM width | excl. 0 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2014-15 | 5.44 | 42% | 3.79 | 3.82 | 2.49 | 5.22 | 40% |
| 2015-16 | 5.56 | 34% | 3.92 | 3.90 | 2.57 | 2.83 | 47% |
| 2016-17 | 5.65 | 32% | 3.96 | 3.95 | 2.56 | 2.74 | 46% |
| 2017-18 | 5.77 | 33% | 4.07 | 3.97 | 2.61 | 4.05 | 42% |
| 2018-19 | 5.61 | 35% | 3.94 | 3.94 | 2.55 | 3.96 | 47% |
| 2019-20 | 5.77 | 31% | 4.07 | 4.06 | 2.69 | 3.82 | 43% |
| 2020-21 | 5.80 | 34% | 4.03 | 4.06 | 2.64 | 2.66 | 46% |
| 2021-22 | 5.90 | 29% | 4.14 | 4.14 | 2.65 | 2.74 | 43% |
| 2022-23 | 5.82 | 36% | 4.09 | 4.07 | 2.62 | 2.71 | 48% |
| 2023-24 | 5.87 | 37% | 4.06 | 4.10 | 2.64 | 2.69 | 50% |
| 2024-25 | 5.91 | 34% | 4.08 | 4.15 | 2.66 | 2.72 | 53% |
| 2025-26 | 6.05 | 32% | 4.17 | 4.18 | 2.62 | 2.77 | 52% |

About two thirds of qualified players have a 1Y RAPM interval that includes zero. Time-decay
widths follow the selected penalty (about 2.7 at alpha 3000, about 4 at alpha 1000): intervals at a
fixed penalty understate total uncertainty, as the registration states. Intervals are served for
every 1Y regular-season rating entry (top-level `intervals` map in the impact serving bundle).

## 4. Time-decay RAPM (`courtlens-rapm-time-decay-v1`)

550-day half-life (parameter), games kept to weight 0.1 (1,827 days), one home column per season,
bubble games home 0, alpha grid [100, 300, 1000, 3000, 10000]. Season-end fits chose 3000 eight
times and 1000 four times; no endpoint. Registered diagnostic, held-out stint margin RMSE per 100
on each season's last 20% of dates (same stints as the pinned 1Y diagnostic):

| Season | Held-out stints | Time decay | 1Y player ridge | Team/context |
| --- | ---: | ---: | ---: | ---: |
| 2015-16 | 6,698 | 87.068 | 87.200 | 87.205 |
| 2016-17 | 6,409 | 87.781 | 87.925 | 87.975 |
| 2017-18 | 6,648 | 87.733 | 87.881 | 87.982 |
| 2018-19 | 6,651 | 87.091 | 87.304 | 87.455 |
| 2019-20 | 4,935 | 91.206 | 91.314 | 91.364 |
| 2020-21 | 5,858 | 88.511 | 88.618 | 88.785 |
| 2021-22 | 6,408 | 89.781 | 90.011 | 89.996 |
| 2022-23 | 6,401 | 87.668 | 87.718 | 88.017 |
| 2023-24 | 6,571 | 90.226 | 90.197 | 90.500 |
| 2024-25 | 6,631 | 90.890 | 91.029 | 91.004 |
| 2025-26 | 7,278 | 92.425 | 92.489 | 92.631 |

Time decay is lower in 10 of 11 seasons, by 0.12 on average. Per-stint margins are very noisy
(RMSE near 88), every model is close to the team baseline, and no interval on the differences was
registered, so this is a small, unconfirmed edge, not a verdict. R08 tests ratings on game margins.

## 5. Six-factor reconstruction R² (`courtlens-six-factor-reconstruction-v1`)

Seconds-weighted regression of 1Y RAPM on the six factor ratings among players qualified for all
seven (223–262 per season); 80% player-bootstrap bands in the JSON.

| Season | In-sample | 10-fold CV | Cross-season (t−1 coefficients) |
| --- | ---: | ---: | ---: |
| 2014-15 | 0.962 | 0.960 | – |
| 2015-16 | 0.959 | 0.957 | 0.958 |
| 2016-17 | 0.960 | 0.957 | 0.959 |
| 2017-18 | 0.960 | 0.957 | 0.959 |
| 2018-19 | 0.965 | 0.963 | 0.962 |
| 2019-20 | 0.958 | 0.955 | 0.957 |
| 2020-21 | 0.955 | 0.950 | 0.953 |
| 2021-22 | 0.960 | 0.959 | 0.959 |
| 2022-23 | 0.964 | 0.962 | 0.959 |
| 2023-24 | 0.958 | 0.955 | 0.953 |
| 2024-25 | 0.966 | 0.964 | 0.963 |
| 2025-26 | 0.956 | 0.952 | 0.951 |

CourtLens measures **0.955–0.966** in-sample, not the commonly quoted 0.985; the out-of-sample
values are only slightly lower, so the reconstruction is stable rather than overfitted.

## 6. Dated rating snapshots (`courtlens-rating-snapshots-v1`)

**91 snapshots**, 2015-16 opener (2015-10-27) to 2026-05-01: each season's opener plus the 1st of
every month through the first month start after its last game. Each is a time-decay fit on games
strictly before its cutoff; the index check confirms `latest_game_date < cutoff` for all 91.
Alpha 3000 in 53, 1000 in 38, never a grid endpoint. A unit test confirms that adding later games
leaves a snapshot's bytes unchanged. Readers use the latest snapshot with cutoff on or before the
game date. Snapshots cover regular-season games only.

## Serving

Installed by moving `.current` (nothing pruned; rollback is moving it back). Weekly and daily
current-season jobs carry non-provisional entries forward, so these persist.

| Directory | Bundle | Adds |
| --- | --- | --- |
| `impact-serving-v1` | `3cfdb968…` | 27 rating windows, 9 extras seasons, intervals for all 12 1Y entries |
| `impact-team-splits-v1` | `fce502d3…` | 9 history extras seasons |
| `wowy-v1` | `894f9b09…` | 9 regular-season cohorts (inputs list their datasets) |
| `stint-box-v1/manifest` | `e073feb4…` | 9 stint boxes (every admitted game) |

The hosted demo still pins its own files (`deploy/pinned.env`); R12 refreshes it. Page work for the
intervals (Six-Factor RAPM page, Impact Tree) is R02.

## Checks

Ruff, format and strict mypy (304 source files) clean. New tests: `tests/unit/test_impact_history.py`
(rule R01-H5 on real-game shapes, schedule denominators, archive families, registrations) and
`tests/unit/test_impact_history_ratings.py` (compact form equals the pinned fit for all targets,
snapshot leakage, decay weights, seeded bootstrap, cutoffs, serving install). Full Python suite:
2,378 passed, 1 skipped, **8 failed**, all in `tests/unit/test_agent_providers.py[anthropic]`:
the installed Anthropic SDK rejects an `httpx2.Client` (environment; unrelated to R01). The
frozen-identifier test caught a placeholder `courtload-…` in the plan and in the new registry
docstring; both were reworded.
