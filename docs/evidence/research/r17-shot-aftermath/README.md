# R17 — Shot Aftermath aggregate (`courtlens-shot-aftermath-v1`)

Built and frozen 2026-11-10 on branch `research`. Parent: [Research progress](../../../research-progress.md), [Research handoff](../../../research-plan.md). Page: `/research/shooting/aftermath` (design catalog RD18; the design rounds follow, and only the owner sets ✅). Reference: the owner's saved copy of Databallr's Shot Aftermath page (not committed); databallr.com was not fetched.

Files here: [registration-receipt.json](registration-receipt.json), [data-check.json](data-check.json) (per season: matching, unknowns, league baseline, the Databallr count comparison, statuses, coloured costs), [headline.json](headline.json) (every league-wide cell: all teams × position × zone), [extract.py](extract.py) (writes both from the frozen file), [run-log-a.json](run-log-a.json) and [run-log-b.json](run-log-b.json). The content check that preceded the registration is in [`design-RD18`](../design-RD18/README.md).

## Order of work

1. Content check, counts only (no points read): [`design-RD18/content-check.json`](../design-RD18/content-check.json).
2. Owner approved the numbered method; registered and committed (`e1775c00`), content SHA-256 `7bc242ab2812159e7e4d2f0006c4bac889a2ec9bcf165c17bd631ae64b6a86b5`.
3. Rules, runner and synthetic tests committed (`52cd763e`) before the first real run.
4. Two real runs, byte-identical: results SHA-256 `5aa5161b68b2be431bcdb00cc50dd9ad89d3da6f1b5790023a2ae11a534a97bf`, 17.8 s and 17.6 s, peak 689 MiB, one thread.
5. Results read for the first time after both runs. Nothing changed after reading.

## Data check

| | 2024-25 | 2025-26 |
| --- | ---: | ---: |
| Shots (expected-shot-v2) | 219,527 | 219,160 |
| Joined to a sealed possession | 216,313 | 218,625 |
| Unknown: game not admitted by R01 | 3,214 (18 games) | 534 (4 games) |
| Unknown: not on a possession | 0 | 1 |
| First-chance attempts | 193,336 | 194,813 |
| Second-chance attempts (out of the sample) | 22,977 | 23,812 |
| First chance by possessions vs the shot table's `after_oreb` flag: agree / possessions say first chance / flag unknown | 211,810 / 3,721 / 782 | 213,795 / 3,977 / 853 |
| League points per possession (95%) | 1.145 (1.140 to 1.150), 240,025 possessions | 1.157 (1.152 to 1.162), 243,866 |
| Cells ok / thin / unknown | 545 / 70 / 5 | 552 / 65 / 3 |
| Identity and count residuals (point and every replicate) | 0 | 0 |

Against Databallr's printed 2024-25 first-chance counts: rim 62,906 vs 61,494, short mid 33,925 vs 33,391, long mid 12,346 vs 13,195, three 84,159 vs 82,583, all 193,336 vs 190,685 (+1.4%, though R01 lacks 18 games). The cause is not visible from Databallr's page.

**Possession splitting checked (after the results were read, to explain a gap; no change).** Of 26,935 offensive-rebound events in 2024-25, 88 end their possession with nothing after them, and none of those is followed by the same team's possession: the sealed possessions do not split after an offensive rebound, so second chances are not lost to splitting.

## Headline results (all teams, all positions, per first-chance attempt, 95%)

| 2024-25 | Attempts | FG% | Made | Second chances | Opponent cost | Net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rim | 62,906 | 61.9% | 1.238 | 0.135 | −0.008 (−0.015 to 0.000) | 1.381 |
| Short mid | 33,925 | 45.2% | 0.903 | 0.157 | −0.005 (−0.016 to +0.006) | 1.065 |
| Long mid | 12,346 | 41.0% | 0.820 | 0.129 | −0.010 (−0.031 to +0.010) | 0.959 |
| Three | 84,159 | 35.9% | 1.077 | 0.158 | **−0.014 (−0.020 to −0.008)** | 1.249 |
| All | 193,336 | 46.3% | 1.082 | 0.149 | **−0.010 (−0.013 to −0.007)** | 1.241 |

2025-26 has the same order: rim 1.399, three 1.256, short mid 1.077, long mid 0.970; overall cost −0.009 (−0.012 to −0.006).

1. **Net value ranks rim > three > short mid > long mid in both seasons**, Databallr's order. Net intervals are about ±0.01 to ±0.03 and no two zones' intervals overlap in either season.
2. **Opponent cost is small.** Overall it is a benefit of about 0.01 points per attempt (95% interval below zero in both seasons), because opponents score less after a make (1.112 and 1.123 per possession) than on an average possession (1.145, 1.157). On threes it is a benefit in both seasons; at the rim and from mid-range the interval includes zero.
3. **After a defensively rebounded rim miss, the opponent scores more than average:** 1.191 and 1.202 per possession, +0.047 (+0.029 to +0.064) and +0.045 (+0.027 to +0.064). After missed threes and mid-range shots the interval includes zero in both seasons. This is the clearest aftermath effect, and it is per rebounded rim miss, not per attempt.
4. **Second chances are lower than Databallr's** (rim 0.135 vs 0.176, three 0.158 vs 0.201 per attempt in 2024-25), while FG%, made points and the opponent's points after makes and misses come close (after a make 1.112 vs 1.112; after a rim miss 1.191 vs 1.201). The possessions are not split after offensive rebounds (above), so the gap is a definitional difference not visible from Databallr's page. Reported, not adjusted.
5. **Positions (estimates):** bigs have the highest rim net (1.504 and 1.519) and the largest rim-miss cost (+0.063 in 2024-25, +0.038 with an interval including zero in 2025-26); guards' and forwards' costs are mostly indistinguishable from zero outside threes.
6. **Team cells: colour needs a caution.** Each season has about 600 team cells per cost; at 95%, about 30 would exclude zero by chance alone. 2024-25 colours 70 all-attempt team costs (49 benefit, 21 cost) and 60 rebound-branch ones; 2025-26 80 and 50. Some are real, not all: the page must say so beside any team colour.

Inconclusive or negative, stated plainly: mid-range opponent cost is not distinguishable from zero in either view or season; the rim's all-attempt cost interval touches zero; Databallr's second-chance level is not reproduced.

## What was built

- **Rules:** `src/courtlens/domain/shot_aftermath.py` (zones, values, residuals, status, tone).
- **Runner:** `src/courtlens/evaluation/shot_aftermath_runner.py`. Checks every constant against the registration and every input by hash (shot tables, possession bundle and members, play-by-play archives, position artifact), fails on non-finite values or a broken identity, keeps timings out of the hashed file.
- **Frozen:** `evaluation/research/frozen/courtlens-shot-aftermath-v1.json` (2.1 MB).
- **API (GET only, typed Pydantic responses):** `/api/shot-aftermath` (summary, data checks, definitions, limitations, position accuracy), `/api/shot-aftermath/scope?season=&team=&position=` (five zone rows), `/api/shot-aftermath/teams?season=&position=&zone=` (30 teams in code order, not ranked, plus the all-teams row). The loader recomputes the results hash and compares the registration hash, so an edited file serves nothing (503). GET only, so the Caddy allowlist in `docs/deployment.md` is unchanged; the hosted demo needs the frozen file in its deploy, which this session does not touch.
- No hash-pinned module, sealed protocol, frozen file of another block or pinned table was edited. The old workbench operation (`POST /api/workbench/operations/shot-aftermath`) is unchanged.

## Checks

| Check | Result |
| --- | --- |
| Reproducibility | two runs, byte-identical results (`5aa5161b…`) |
| Ruff check and format, strict mypy | clean (384 source files) |
| R17 tests | 16 passed: zones, every branch of a synthetic game (and-one, block, putback second chance, uncounted segment skipped, period-end censoring), Databallr's formula, status and tone, aggregation, determinism, registration constants, the frozen hashes, every cell's partitions and identities, tones only where the interval excludes zero, position accuracy recomputed from the artifact, all three endpoints, errors, a tampered file |
| Full Python suite | 2,693 passed, 4 skipped, 9 failed: the 8 known `test_agent_providers.py[anthropic]` SDK failures and `test_frozen_identifiers.py::test_no_unexplained_legacy_brand_references`, which flags `dashboard/content/patch-notes.json` and `dashboard/e2e/fixtures/rd16-points-evaluation.json`, both committed before this block and untouched by it |
