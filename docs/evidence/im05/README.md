# IM05 defense and shooting extras

Parent: [impact progress](../../impact-metrics-progress.md),
[method and sample contract](../../design/impact-extras-v1.md).
Status: **verified**, 2026-10-08 UTC.
Completion is established by the sealed acceptance and independent verification
report linked below, not by this document alone.

The offline runner rehashes event-accepted IM03 v2 acceptance/evidence, all six
bundles, every game/stint, candidates and exact retained IM01 archives and boxes.
It checks all 202,063 accepted stint bodies and ready dataset identities against
the IM03 proof database with read-only transactions. Full acquisition hashes are
separate provenance; artifacts retain exclusive cutoffs and selected game facts.
No IM03 membership, IM04 rating, frozen B26 experiment, forecast input, owner
database, published pointer, dbt model or dashboard is changed by IM05.

## Definitions and outputs

The separately versioned `IMPACT_EXTRAS_CATALOG` uses the existing typed
`MetricDefinition` contract. It stages 38 definitions for IM06; the active v1/v2
catalogs and API capabilities retain their previous behavior. Every definition
has a formula, unit, source fields, sample rule and limitations, and every column
has an independent numerical unit case. Rates aggregate numerators and denominators
before division. Values and ranking qualification are separate; qualifying rates
require 500 covered reconstructed minutes and 200 denominator units.

Eighteen defense/advanced columns cover STL/100, BLK/100, foul frequency, DRB%,
conditional block recovery, matchup FGA faced/100, TS, rTS, TSAdd/100, 3PR, FTR,
AST/100, explicit bad-pass turnovers, rim assists, self/teammate-miss ORB fractions,
explicit charges drawn and a credited forced-turnover analogue. Existing
height/wingspan and IM04 defensive ratings/factors are available for reuse in IM06.

Twenty additional columns expose TSA, frequency, TS and rTS for Create, Space,
Trans, Finish and Unknown. These are the contract's PBP partition, not Synergy
or tracking estimates of creation/spacing. Trans requires a preceding live
opposing control ending within six seconds; Finish uses Restricted Area; Space
uses uniquely credited assisted makes; Create is the remaining known unassisted
FGs, including misses where assists are undefined. All FT contributions and
unresolved joins remain Unknown. Frequencies include that bucket; TSA and points
conserve each complete player box, rather than silently discarding unknowns.

## Measured population and source limitations

Six season/phase artifacts cover **3,901 games**, preserving all **40 IM03
exclusions** and inherited repair, period-minute/plus-minus limitations and the
unchanged **46.744% within ±2** estimate diagnostic. The build receipt and
verification report retain their complete per-cohort provenance.

| Season | Phase | Admitted games | Players | Joined / unavailable FGs | Unknown TSA share |
| --- | --- | --- | --- | --- | --- |
| 2023–24 | Regular season | 1,216 | 572 | 216,233 / 5 | 9.702% |
| 2024–25 | Regular season | 1,212 | 569 | 216,308 / 5 | 9.653% |
| 2025–26 | Regular season | 1,227 | 582 | 218,622 / 3 | 10.394% |
| 2023–24 | Playoffs | 81 | 214 | 13,677 / 0 | 9.634% |
| 2024–25 | Playoffs | 83 | 219 | 14,197 / 0 | 10.909% |
| 2025–26 | Playoffs | 82 | 230 | 13,916 / 0 | 11.458% |

Every unavailable shot/assist/charge join retains its source locator and reason.
Per-player values retain numerator, denominator, covered and total games, reference
and qualification. Missing box/source rows never become zero. All admitted active
player boxes in this run are complete. The player source and opportunity universes
remain explicitly distinct for conditional rebound and block fractions.

- Matchup identities are offense `person_id`, defense `matchups_person_id`, as
  verified with opposing independent box teams and the
  [endpoint schema](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/boxscorematchupsv3.md).
  These are aggregate matchup assignments, not shot contests. Full offensive
  matchup-minus-box FGA discrepancies remain in artifacts; no fitting forces equality.
- Four original missing matchup games remain unavailable: `0022300383`,
  `0022301192`, `0022301230`, `0022400856`. In addition, seven rows in
  `0022400430` assign Emanuel Miller (`1641801`), who is absent from its independent
  box roster. That game's supplemental matchup metric is unknown for all players;
  the game remains in every other sample. Each offending row/identity is listed.
  No name-based correction or new game exclusion was applied.
- Fifteen assisted-make identities are unresolved across the regular seasons.
  Thirteen FG joins are unavailable. Rim-assist samples disclose the affected games;
  all shooting contributions still conserve inside known/Unknown buckets.
- Credited charges total 2,661; 21 charge actors are unresolved, and absent CDN
  games cannot establish charge counts. The 2025–26 playoff CDN gap from IM01
  remains inherited. Credited forced turnovers combine supported box steals and
  explicit charges; they are not a complete pressure or FTOV measure.
- Block recovery has 28,465 known individual recoveries. Team/dead-ball/unresolved
  recoveries stay outside that conditional denominator; player-level differences
  from complete box blocks remain retained, not treated as defensive failures.
- Wave 2 explicitly retains deflections, complete potential assists, OnBall%,
  tracking DFGA and individual rim points saved. STOP%, D-SQI and general
  FTOV/sTOV also require an explicit method/attribution contract. Aggregate
  matchups lack a per-shot defender/zone join; no individual rim defense is inferred.

Example, **2025–26 regular season, before 2026-07-01**: Victor Wembanyama has
195 supported box blocks over 3,781 on-court defensive controls = **5.1574 BLK/100**,
597 credited defensive rebounds over 1,826 known individual rebound opportunities
= **32.6944% DRB**, and **62.6293% TS**. All three have 63 covered games.
His Unknown analogue frequency is **15.4067%** of TSA. These describe the admitted
source sample and are not causal ratings or projections.

## Verification and reproduction

- [Independent verification](extras-verification.json): two complete builds,
  **273.106 / 265.159 seconds**, reproduce six identical artifact and fact hashes.
  **174,559** numerical/source comparisons pass, including independent raw
  matchup orientation/coverage, per-player box/bucket conservation and Fraction
  arithmetic for all 38 columns. Complete derived per-game ledgers are retained
  in `facts/`; complete outputs in `artifacts/`; both original run receipts are
  retained as `build-receipt.json.gz` and `replay-receipt.json.gz`.
- [Sealed acceptance](acceptance.json.gz) binds final artifact/fact hashes,
  accepted IM03 identities, source provenance, implementation/contracts/tests,
  measured checks and retained evidence bytes.
- [Full disposable PostgreSQL regression](verification/python-full.log):
  **1,766 passed, zero failed/errors**, one documented isolated-Next-browser skip,
  19 published-data deselections, one existing google-genai Python 3.14 warning,
  **291.43 seconds**. This includes 59 new IM05 unit checks.
- Repository [Ruff](verification/ruff-final.log),
  [formatting](verification/format-final.log) and [strict mypy](verification/mypy.log)
  pass. Mypy checks 198 source files. No dbt or dashboard implementation changed;
  their earlier block results remain historical, not rerun evidence for IM05.
- Development build/unit logs remain separate. The first development archive
  build rejected the seven absent-roster matchup rows; its artifacts stay retained.
  Focused development failures were incorrect fixture expectations and a test
  import/return-shape error; the final full run supplies acceptance.

```bash
.venv/bin/python -m courtlens.evaluation.impact_extras_runner \
  --receipt data/derived/impact-extras-v1/new-build-receipt.json \
  --database-url postgresql+psycopg://courtlens:courtlens@127.0.0.1:55434/courtlens_im03_event
.venv/bin/python -m courtlens.evaluation.impact_extras_runner \
  --receipt data/derived/impact-extras-v1/new-replay-receipt.json \
  --database-url postgresql+psycopg://courtlens:courtlens@127.0.0.1:55434/courtlens_im03_event
.venv/bin/python scripts/verify_im05_extras.py \
  --first data/derived/impact-extras-v1/new-build-receipt.json \
  --second data/derived/impact-extras-v1/new-replay-receipt.json \
  --output docs/evidence/im05/new-verification.json
```

Use fresh receipt/report paths. Identical content-addressed artifacts are reused
only when exact bytes match; no prior artifact or receipt is overwritten. The
single actual-source test fixture `im05-game.json.gz` retains the selected/CDN
rows, shot detail, matchup and independent boxes of `0022500001`, along with their
source hashes and accepted game/candidate. This is a local noncommercial test
fixture under [IM01 admission](../../design/research-source-admission-v2.md) and
its retained attribution/licenses; no raw source rows enter API responses.

Serving, preset ungating, methodology displays and model badges remain **IM06**.
