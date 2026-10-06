# B19b append-only assignment admission — 2026-10-05

**Verified bounded admission. B19 parent remains source_blocked.**
2025–26 regular season: **240,750 assignment rows in all 1,230 games**.
17,104 nonregular rows remain in the original retained source bytes and are excluded
from this dataset. No PBP, possessions, lineups or new shots are admitted here.

Dataset: `24a61903-0f8b-4ce4-93e1-61c0ed057053`.
Semantic content SHA-256:
`ce7f3ef0931e36005f586c6189c6df9c88a17b81202d79ad68bd055b715aa212`.
Ordered row membership SHA-256:
`1675802c16cdcaa3c1f4bbe79e0a10db97f97c307d92e5f4bc3be6d2916cd506`.
[Admission manifest](b19b-assignment-accepted/admission/manifest.json),
[stored-row verification](b19b-assignment-accepted/admission/verification.json),
[independent reproduction](b19b-assignment-accepted/reproduction/verification.json).
Reproduction reruns baseline and assignment checks from content-addressed files,
then compares every stored payload, normalized identity, exact exposure, game
membership and complete dataset membership. Both verification reports agree exactly.

## Storage and transaction contract

Additive migration `19b810a4f004` creates independent `assignment_datasets`,
`assignment_games`, `assignment_members` and `assignment_observations`.
Admission does not extend a sealed box dataset or invoke the legacy replacement
importer. Every decoded source field is retained and hashed, including names,
comments, display minutes, percentages, help fields and leading-zero jersey values.
The original CSV is retained byte-for-byte; source identity is its SHA-256 plus the
one-based CSV data-row number, excluding the header. Dataset/game memberships bind
these ordered row locators and complete payload hashes. Pair uniqueness is also
enforced relationally; members have a composite FK to their own dataset/game.

All inputs are copied with exclusive creation to `data/artifacts/assignments/` under
their full SHA-256. Existing content is checksum-verified and never overwritten.
The manifest binds the complete source CSV, independent schedule and player/team
boxes, methodology reference, parser code and its normalization/hash dependencies.
Paths are relative to the artifact root. Source and baseline originals remain intact.
NBA Stats/SportsDataverse attribution and the source license evidence remain in
[B19a's retained source manifest](b19a-full-source-final/source-manifest.json).

One PostgreSQL transaction stages parent, games, members and an observation. The
caller commits only after source reproduction and relational verification pass.
A transaction advisory lock serializes identical candidate admissions; identical
bytes/semantics reuse the dataset and append a local observation. Corrections create
new datasets; an A→B→A sequence retains two datasets and three ordered observations.
These are local admission observations, not invented provider acquisition times.

Database statement triggers reject UPDATE, DELETE and TRUNCATE on all four tables,
including SQL with `courtload.allow_admin_mutation=true`. Insert triggers permit
game/member extensions only in the parent's original admission transaction.
After commit, membership is sealed. Ordinary updates cannot reopen it.
Rollback of a failed candidate removes its complete relational transaction while
retained source artifacts remain available. Prior datasets remain addressable by ID;
this block creates no assignment publication pointer or default serving selection.

## Exposure policy: assignment-exposure-v1

`matchup_minutes_sort` is the arithmetic time input. PostgreSQL unconstrained
`NUMERIC` and Python `Decimal` preserve its precise decimal seconds. Display
`matchup_minutes` is preserved independently: the source's first row displays
`1:26` while its arithmetic exposure is **85.5 seconds**. Fractional possessions
are stored as exact decimals too. Across this admitted dataset, the sum of source
pair credits is **13,960,014.9 seconds / 1,212,909.3 partial possessions**; these
are assignment totals, not ordinary team possession or player-minute totals.

The retained [SportsDataverse schema](https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-data/main/docs/datasets/game_matchups.md)
identifies arithmetic seconds and fractional matchup possession credits. Its
three time shares use defender floor time, offensive-player floor time and shared
floor time as their respective denominators. The original shares remain provider
fields; CourtLoad does not reconstruct those tracking denominators. The reference
was fetched on 2026-10-05 and sealed by hash, separately from the August source bytes.
Its precise provenance is in the input manifest. Provider assignment/credit
methodology remains a limitation; admission certifies observed pairs and numeric
fields, not independent tracking reconstruction or causal defensive attribution.

Future aggregate shooting percentages must divide summed source makes by summed
corresponding attempts; zero attempts yields unknown. Empty source percentages
remain empty/unknown. Source zeros are retained without asserting a measured rate
when its denominator is zero. Help and partial-possession credits are not forced
to conserve ordinary player totals. No nearest-defender, causal quality, shared-floor
WOWY or reconstructed possession/stint claims follow from this admission.

Independent game/team final outcomes and player/team shot counts reconcile. Every
pair's NBA player/team identities and offensive side match independent participation
records. Missing/orphan/duplicate games or pairs, unknown counts, invalid phases,
nonfinite/negative exposure, out-of-range source shares and makes exceeding attempts
reject the entire candidate, with row/game diagnostics. Malformed independent box
minutes remain unrepaired; assignment participation checks do not claim verified
player floor time. B19a's minute-dependent lineup gates remain open.

## Measured verification

- [Backend suite](b19b-assignment-accepted/pytest.txt): **648 passed / 135 opt-in
  skipped** in 23.12s. Ten new PostgreSQL tests are included in that skip count and
  were separately executed, with no skips.
- [Executed PostgreSQL suite](b19b-assignment-accepted/postgres.txt): **10 passed**,
  isolated migrated schemas, 0.34s. Covers post-flush rollback, a mid-admission FK
  failure, A→B→A immutable replays, exact high-precision decimals, SQL mutation,
  truncation and post-commit membership-extension rejection under the admin setting.
- Twelve new unit tests cover full-field correction identities, repeat parsing,
  retained-byte corruption, missing/orphan/duplicate pairs, unknown counts,
  invalid identity/side, exposure and shooting denominators.
- [Ruff](b19b-assignment-accepted/ruff.txt),
  [formatting](b19b-assignment-accepted/format.txt): zero issues, 355 files formatted.
  [Strict mypy](b19b-assignment-accepted/mypy.txt): 146 source files, zero issues.
- All **26 historical** and **17 B19a input** checksums pass:
  [historical checks](b19b-assignment-accepted/retained-checksums.txt),
  [input checks](b19b-assignment-accepted/input-checks.txt).
- PostgreSQL migration was applied to the local runtime. Before/after comparisons
  preserve complete public-pointer, workbench-dataset and B26 research-dataset
  records, plus prior rich-admission/matchup and forecast row counts:
  [before](b19b-assignment-accepted/before.json),
  [after](b19b-assignment-accepted/after.json),
  [runtime counts/version](b19b-assignment-accepted/retained-state.json).
  New runtime counts: one assignment dataset, 1,230 games, 240,750 members and one
  admission observation. Dashboard code is unchanged by B19b; no new browser claim.

Reproduce admission locally (output must be a new directory):

```bash
.venv/bin/alembic upgrade head
.venv/bin/python scripts/admit_b19_assignments.py \
  --source data/raw/b19a-2026-20261004/game_matchups_2026.csv \
  --baseline data/raw/sportsdataverse_2026 \
  --methodology data/raw/b19a-2026-20261004/game_matchups-methodology-20261005.md \
  --output docs/evidence/b19b-NEW-ADMISSION
.venv/bin/python scripts/admit_b19_assignments.py \
  --verify-dataset 24a61903-0f8b-4ce4-93e1-61c0ed057053 \
  --output docs/evidence/b19b-NEW-VERIFICATION
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload \
  COURTLOAD_REQUIRE_POSTGRES_TESTS=1 \
  .venv/bin/pytest tests/unit/test_assignment_admission.py \
    tests/integration/test_assignment_admission_postgres.py -q
```

For another installation, use its reported local dataset UUID. Content and membership
hashes are portable; observation timestamps and installation UUIDs are separate.
Code changes alter the pinned transform identity and require a newly verified dataset.

B19 remains **source_blocked** for PBP/possession/lineup row identity, conservation,
appearance and exposure attribution. B20/WOWY stays unpopulated. B23 must explicitly
integrate these new sealed assignment inputs before the API/UI can serve them;
this admission does not relabel the old fixture-backed endpoint as retained-data
acceptance. B32's final/correction and three-box gates remain independent and open.
