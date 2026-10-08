# IM03 — sealed stints, possessions and factor outcomes

Status: **verification_blocked** on the handoff's unchanged ±2 box-estimate gate.
Implementation, stored-row conservation, transaction sealing, reproducibility and
regression checks pass. IM01/IM02 remain verified; IM04 stays planned.

Parent: [impact handoff](../../impact-metrics-plan.md),
[progress](../../impact-metrics-progress.md),
[descriptive possession method](../../design/impact-possession-method-v1.md).

## Implementation

- Extended `possession_warehouse.build_possession_warehouse_for_season` with an opt-in
  IM03 bundle path. Legacy v1 calls preserve their behavior; both legacy rebuild
  entry points reject IM03 datasets. No alternate warehouse or publication path.
- Preparation rehashes retained IM01 inputs, binds only the accepted IM02 report's
  game candidate hashes, preserves ordered source-row identities, and writes
  content-addressed game and complete season/phase bundles. Historical IM02 service
  hashes remain historical while its repair, normalization and policy hashes stay
  exact. Development candidates are not selected.
- Ordered stints preserve IM02 durations/player seconds and event-level scoring,
  including equal-clock lineup changes and instantaneous scoring stints. Possessions
  retain source locators and TS components, turnovers, player live-rebound
  opportunities and offensive rebounds. Technical/retained-ball FT records conserve
  points and attempts without adding counted possessions. Definitions, end-lineup
  possession exposure and unknown/free-throw handling are in the method contract.
- New additive migration `10b810a4f008` stores the admitting transaction in a small
  nullable dataset column. Triggers reject subsequent inserts, updates, deletes and
  truncation of impact memberships/facts, including an admin bypass. Identical
  admissions are serialized; one transaction admits an entire season/phase. The
  original large-JSON guard was measured as a bottleneck and replaced before the
  final proof. The owner's database/schema and all publication pointers were untouched.
- Derived observations record the actual admission time; the original archive
  observation time is separately retained as input provenance. IM03 exposure uses
  exclusive `game_date < cutoff`. A forecasting regression forbids the new readers.
- Shared dbt facts now retain possession statistics; the new additive factor mart
  carries date, policy and quality, with conservation/grain tests. No ratings,
  presets, agent tools or B26 experiments were changed.

## Measured population and independent reproduction

The [population receipts](population-receipts.json.gz) bind all six dataset IDs,
member/bundle hashes, actual PostgreSQL version, method/schema hashes and runtime.
Population ran in a **fresh disposable PostgreSQL 17 database**, in dependency order:
2025–26 regular/playoff, then 2023–24, then 2024–25.

- **3,901 / 3,941 games**, retaining all **40** explicit IM02 exclusions.
- **202,063 stints**, **775,916 possession records** (including explicitly noncount
  retained-ball FT records), **2,020,630 player-stint rows**, **458,987 overrides**.
- Six immutable season/phase datasets, memberships, schedules and version/observation
  lineage. All are `candidate`, not `ready`, because the ±2 estimate gate fails.
- Population took **406.737 s**. No owner stints, forecasts or publication pointers
  were populated or moved. Accepted artifacts remain in the local content-addressed
  `data/derived/impact-population` store; no raw serving/API export was added.

An [independent read-only verifier](../../../scripts/verify_im03_population.py)
checks the selected membership against the external accepted IM02 report, rehashes
**every stored stint and possession body**, compares every persisted repair envelope,
checks independent schedule points, and reconciles each observed player-second.
[Machine proof](independent-verification.json.gz) and
[log](verification/independent.log) retain all cohort results. Points and shooting
attempts/makes conserve. Clean-game known minutes are within one second; IM02's four
2023–24 tolerance cases remain, maximum 23.2 s. Player ORB and turnover discrepancies
remain explicitly measured. Plus-minus diagnostics are retained without optimization.

[Six whole-membership replays](idempotence.json.gz) reuse the original dataset IDs
and leave all **12** populated table counts unchanged in **33.712 s**. This checks
sealed production-size membership, not just fixture idempotence.

## Remaining acceptance gate

[Per-cohort distributions and diagnostics](coverage-summary.md), plus
[all per-game results, unavailable comparisons and exclusions](coverage-and-conservation.json.gz):

**3,736 / 7,802 team-games (47.885%)** fall within ±2 of
`FGA + 0.44 × FTA − player ORB + box TOV`. Maximum absolute difference: **11.28**.
The estimate is reported exactly as specified; no extra exclusions, fabricated
possessions, fitting to the estimate, or unrecorded threshold revision was applied.

Public pbpstats groups compare 4,852 regular-season team-games: **2,433 exact**, **4,826
within two**, maximum **4**. These are deduplicated possession-text groups, not an
asserted official oracle. The archive repeats each possession across event rows;
grouping uses opponent/period/start/end/full EVENTS text. No playoff/2025–26 comparison
is available. The unavailable 2023–24 regular games are listed. The method and all
source hashes remain recorded, and unavailable never means agreement.

The sample `0022400001` illustrates the gate issue: CourtLens and deduplicated public
pbpstats both count **99 per side**, while Atlanta's fixed box estimate is **101.72**.
That observation does not waive the handoff's gate. It provides a concrete basis for
clarifying whether the estimate is a hard acceptance requirement or a diagnostic.

## Checks

- [Final full Python suite](verification/python-final.log): **1,659 passed, 0 failed,
  0 errors**, one documented isolated-Next-browser skip, 19 published-data deselections,
  one existing google-genai warning, **318.10 s**. All latest scalar-guard tests execute
  against migrated disposable PostgreSQL; no owner dotenv/data/keys are needed.
- [Targeted checks](verification/targeted-final-accepted.log): reconstruction/receipt,
  forecast isolation, PostgreSQL boundary/sealing/rollback/tamper and rename regressions.
- [dbt](verification/dbt.log): **83 passed**, zero warnings/errors/skips: nine models
  and 74 data tests, **8.60 s**. This builds real factor, lineup and player exposure marts.
- Repository [Ruff](verification/ruff.log), [formatting](verification/format.log) and
  [strict mypy](verification/mypy.log) pass; mypy checks 189 source files.
- A migration-head fixture regression was fixed by selecting RN02's named revision
  instead of the newest migration. Its OID/body/trigger and sealing assertions remain
  intact. The first full development run was stopped after identifying this failure;
  a subsequent run stopped for the scalar-guard performance change. Those logs and
  the obsolete disposable-schema probe remain development evidence, not accepted runs.

## Reproduce

Use a disposable PostgreSQL URL, never silently reuse an owner database for verification.
The new migration must be applied before population. Preparation is network-free:

```bash
.venv/bin/python -m courtlens.ingestion.impact_population
# Retains six immutable bundles and prints their paths. Then, in a disposable DB:
COURTLENS_DATABASE_URL='<disposable-postgresql-url>' .venv/bin/alembic upgrade head
COURTLENS_DATABASE_URL='<disposable-postgresql-url>' \
  .venv/bin/python -m courtlens.ingestion.impact_population \
  --populate --bundle '<one-accepted-bundle-path>'
COURTLENS_DATABASE_URL='<disposable-postgresql-url>' \
  .venv/bin/python scripts/verify_im03_population.py \
  --bundle '<one-accepted-bundle-path>' --output '<new-proof-path>.json.gz'
.venv/bin/python scripts/test_python.py -ra
```

Supply each accepted bundle to verify all seasons; the repeated `--bundle` option
preserves the recorded order. Original IM01/IM02 objects and evidence stay immutable.
Dashboard work and browser changes belong to the separate design lane.

## Owner gate decision

On 2026-10-08 UTC, the owner confirmed the recommendation to **keep ±2 as a hard
acceptance gate**. IM03 remains `verification_blocked`; all six datasets remain
`candidate` and IM04 remains planned. The estimate discrepancies are not waived.
