# IM03 — verified under event acceptance v1

Status: **verified**, 2026-10-08 UTC. **IM04's IM03 dependency is cleared.**
The owner authorized the recommended event-based acceptance path after the estimate
incompatibility diagnosis. This is an explicit acceptance revision; the original
hard ±2 gate was not satisfied. The original six candidate datasets and preceding
contracts/receipts remain historical evidence.

Parent: [progress](../../impact-metrics-progress.md),
[handoff](../../impact-metrics-plan.md),
[event acceptance v1](../../design/impact-event-verification-v1.md),
[possession method v2](../../design/impact-possession-method-v2.md).
The [sealed acceptance receipt](acceptance-v2.json.gz) binds the measured checks,
all six ready dataset IDs/admitting transactions and evidence/log hashes.

## Corrections and independent acceptance

- Added opt-in `courtlens-impact-possession-v2`; v1 remains callable. Four actual
  archived counterexamples reproduce their exact retained v1 bodies and fail the
  independent event gate. Their corrected v2 hashes match final admitted membership:
  [counterexamples](v1-counterexamples.json.gz).
- Retained-ball FT classification reads explicit labels or the nearest preceding
  nontechnical foul at the same clock. This fixes transition-take/contextual FTs
  and prevents retained FTs from merging two made-shot controls. Ordinary same-team
  and-ones can have a different FT shooter. These are event corrections, with no
  changed box coefficient or manufactured possessions. NBA rules award retained
  possession for these penalty families:
  [fouls and penalties](https://official.nba.com/rule-no-12-fouls-and-penalties/),
  [transition-take rule](https://official.nba.com/video-transition-take-fouls/).
- One anonymous team turnover in `0042300303` resolves to Boston from a unique
  matching CDN action/period/clock with an explicit team. Its original row, other
  source row/hash and deterministic `IM03-R1` envelope are retained and persisted
  through the existing override registry. An unresolved action fails verification.
- The independent verifier parses raw outcomes/factors, preclassifies terminal
  events and partitions observed actions; it does not consume the builder's active
  state, normalized kinds, statistics or possession counts. It verifies every
  period/team/start/end/count boundary, ordered contributing locator, factor value,
  end lineup, stint scoring/factors/exposure, duration and player-second. Source-based
  Decimal ledger terms exactly reconcile all **7,802** box-estimate discrepancies,
  with no residual balancing term.
- Population recomputes event and public proofs before writes. A rehashed false
  event pass is rejected; unknown nonempty public events fail even with matching
  totals. Available public reviews must reproduce, and unavailable sources cannot
  carry invented review evidence. Code and both new contract hashes bind bundles.

The accepted IM02 report stays
`c657a3c63929476fa60004be2e428d1310f771ebce6840e537aa6d61d38512cb`.
Its source selection, lineups, quality, exclusions and minute tolerances remain
unchanged. V2 changes boundaries in **729** games, decreases counted controls by
**619**, adds **644** noncount FT records and changes total records by **+25**.
The final physical stint durations, scoring and accepted player seconds preserve
IM02. Rating consumers must bind these new method/bundle hashes.

## Full retained source and public review

[Independent input re-extraction](input-reextraction.json.gz),
[log](verification/input-reextraction.log): **3,901 games**, **192.057 s**.
The verifier rehashes original archives, re-extracts every selected input row,
other-source repair excerpt, independent player/team box and complete public group,
checks membership against the external accepted IM02 report, then recomputes every
per-game event/public proof. This verifies retained excerpts against original bytes.

[Public sequence review](public-sequence-review.json.gz),
[log](verification/public-sequences.log): **4,852 comparisons**, **zero unresolved**.
Source-overlap components exactly account for each count delta. The retained groups
and row ordinals permit full replay. Unique description/outcome and clock/factor
bridges record feed schema differences; count agreement alone cannot pass a review.

- **2,531 exact**, **4,839 within two**, maximum difference **3**. These group totals
  are diagnostics, not an asserted official oracle.
- Difference components: **2,049** public groups without observed counted control,
  **1,479** selected controls without a corresponding public group, **52** grouping
  boundary differences and **12** team-label differences. These count components,
  not games; offsetting components can occur within the same comparison.
- Five matched actor/clock observations have conflicting classifications between
  retained feeds, including a public DiVincenzo miss versus a selected turnover.
  `source_event_revisions` retains both descriptions and selected locators. This
  label records the disagreement; which export was updated first is not established.
- Playoffs and all 2025–26 public groups remain unavailable. The admitted 2023–24
  games `0022301177` and `0022301195` also lack public groups. **1,475 unavailable
  games** are explicitly listed; unavailable never means agreement. Public review
  passing for such cohorts means all *available* discrepancies were reviewed.

## Population, read-back and sealed replay

[Population receipts](population-receipts.json.gz), [log](verification/population.log):
**450.791 s** in fresh disposable PostgreSQL 17, ordered 2025–26, 2023–24, 2024–25,
regular season before playoffs. All **six new datasets are ready**:

- **3,901 games**, preserving all **40** explicit IM02 exclusions.
- **202,063 stints**, **775,941 records**: **770,161 counted controls**, **5,780 noncount
  retained/technical FT records**.
- **2,020,630 player-stint rows**, **458,988 override envelopes**, including the one
  new team-action repair. Complete immutable memberships, schedules and lineage.

[Independent PostgreSQL read-back](independent-verification-v2.json.gz),
[log](verification/independent-v2.log): **154.315 s**. Every persisted stint/possession
body and content hash matches retained membership; every repair and player-second
matches accepted inputs. All event/public proofs reproduce. Schedule points and
shooting conserve. Clean-game known minute errors remain within one second. The
four inherited patched 2023–24 tolerance cases remain disclosed, maximum **23.2 s**;
IM02 plus-minus diagnostics and unavailable period-minute comparisons are preserved.

[Six whole-membership replays](idempotence.json.gz),
[log](verification/idempotence.log): **110.414 s**, same dataset IDs/statuses and all
**twelve table counts unchanged**. PostgreSQL boundary/sealing/rollback/tamper tests
also execute in the full migrated disposable suite.

The [original candidate read-only receipt](original-candidates-retained.json.gz)
matches all six old dataset IDs/hashes and candidate statuses. This block writes
only to `courtlens-im03-event-proof` on port 55434; the old proof instance on 55433,
owner database, public pointers and forecast data receive no writes from this work.
Accepted bundles/proofs live in `data/derived/impact-event-gate`.

## Unchanged box-estimate diagnostic

[Complete coverage, all deltas, source ledger terms and boundary changes](coverage-and-conservation-v2.json.gz),
[cohort summary](coverage-summary.md): **3,647 / 7,802 (46.744%) within ±2**, maximum
**11.28**, using exactly `FGA + 0.44 × FTA − player ORB + box TOV`.
The original v1 result was 3,736 / 7,802 (47.885%). Correcting retained FT counts
lowers this estimate-agreement rate; it is not a success criterion. No extra game
exclusions, estimate fitting or coefficient tuning were applied.

## Report encoding audit

The final JSON round-trip audit exposed numeric diagnostic histogram keys whose
sorting changed after decoding as JSON strings. Canonical coverage v2 and a fresh
read-back v2 use string keys and reproduce their content hashes after JSON parsing.
Original reports and the initial acceptance receipt remain retained; all per-game
proofs, bundle hashes, dataset IDs and measured counts are unchanged. The final
acceptance v2 binds the corrected reports and their original-source provenance.

## Validation

- [Full Python suite](verification/python-full.log): **1,684 passed, 0 failed,
  0 errors**, one documented isolated-Next-browser skip, 19 published-data
  deselections, one existing google-genai warning, **395.07 s**.
- [dbt](verification/dbt.log), [run results](verification/dbt-run-results.json):
  **83 passed**, zero warnings/errors/skips; **nine models and 74 data tests**,
  **7.47 s**, on all six new populated datasets. An initial unscoped attempt reached
  unrelated archive models requiring `archive_dataset_id`; a partial selector
  omitted the player exposure model. Those logs remain development evidence. The
  accepted selection includes all IM03 source/conservation/grain/exposure checks.
- Repository [Ruff](verification/ruff-report-encoding.log), [formatting](verification/format-report-encoding.log)
  and [strict mypy](verification/mypy.log) pass; mypy checks **192 source files**.
- Actual-source regressions cover the corrections and public conflicts. Adversarial
  checks reject duplicate/missing boundaries, factors, attribution, duration,
  exposure, raw-outcome mutation and forged proofs. Normalized-kind/stat mutations
  demonstrate that the verifier reads raw classifications independently.

## Reproduce

Preparation is network-free and uses accepted IM01/IM02 objects:

```bash
.venv/bin/python -m courtlens.ingestion.impact_population \
  --event-gate --output-root data/derived/impact-event-gate
.venv/bin/python scripts/verify_im03_public_sequences.py \
  --bundle-root data/derived/impact-event-gate --output '<new-public-proof>.json.gz'
.venv/bin/python scripts/verify_im03_event_sources.py \
  --bundle '<accepted-bundle-path>' --output '<new-source-proof>.json.gz'
```

Repeat `--bundle` for all six paths in population receipt order. In a new disposable
PostgreSQL instance, migrate first, then use the shared population orchestrator:

```bash
COURTLENS_DATABASE_URL='<disposable-url>' .venv/bin/alembic upgrade head
COURTLENS_DATABASE_URL='<disposable-url>' \
  .venv/bin/python -m courtlens.ingestion.impact_population \
  --populate --bundle '<accepted-bundle-path>'
COURTLENS_DATABASE_URL='<disposable-url>' \
  .venv/bin/python scripts/verify_im03_population.py \
  --bundle '<accepted-bundle-path>' --output '<new-readback-proof>.json.gz'
.venv/bin/python scripts/test_python.py -ra
```

Set all DBT connection variables to that disposable instance. The accepted selection:

```bash
.venv/bin/dbt build --project-dir warehouse --profiles-dir warehouse --select \
  +mart_workbench_possession_factors +mart_workbench_lineup_exposure \
  +mart_workbench_player_possession_exposure impact_factor_grain \
  impact_player_seconds_conserve impact_possession_factors_conserve
```

The exact [population runner](verification/populate-runner.txt) and
[replay runner](verification/replay-runner.txt) are retained. Use new evidence paths
for regenerated receipts. IM04 remains planned and may begin against these sealed
inputs; no ratings have been fitted or published by this acceptance block.
