# B19d — native reconstruction path and source decision (2026-10-05)

**Verified candidate reconstruction implementation; representative admission gate
failed. B19/B20/WOWY remain source_blocked.** This slice reconstructs new event
lineups and intervals from raw responses. It does not rerun the derived CSV audit
as a substitute for reconstruction, or claim corrected lineups were admitted.

[Reconstruction contract](../design/b19-native-reconstruction.md),
[accepted report](b19d-native-accepted/report.json),
[replay and source coverage](b19d-native-accepted/reproducibility.json),
[raw acquisition manifest](b19d-native-accepted/raw-manifest.json),
[alternate-source attempts](b19d-native-accepted/source-probes.json).

## Gates and measured results

| Gate this task targeted | Acceptance check | Result / external dependency |
| --- | --- | --- |
| Implement a native reconstruction path | Preserve native identities; reconstruct starters/substitutions/intervals; compare every rotation segment and player/shot/FT/team totals; identical replay | **Verified implementation and reproducible candidates**, 22 independent regressions; no derived lineup inputs |
| Representative games support admissible reconciliation | Complete raw bundles and no unexplained identity, starter, minute or scoring failures | **Failed**: four complete bundles reconstruct, all four conflict with period-opening boxes; one has malformed native independent minutes. Two additional samples lack rotations |
| Decide whether this source supports season scaling | Nontruncated pinned rotation tree covers the 1,230 independent scheduled regular games | **Failed**: 168 files include only 165 regular games; **1,065 required regular-game rotation files are absent** |
| Pursue missing-input alternatives | Retain direct native rotation/range attempts and alternative source/schema evidence | Direct NBA requests timed out; alternative archive and parser seams inspected, not admitted |
| Populate B20 / partial WOWY / full season | Reconciled input gates, frozen possession membership/exposure, PostgreSQL seal/rollback/replay and retained-game WOWY checks | **Open**. Zero event/stint/possession datasets admitted in this slice; partial WOWY and complete season both remain unavailable |

## Representative reconstruction

Pinned raw mirror:
`sportsdataverse/hoopR-nba-stats-raw@000610d46d149ebb45db4f5ae6f80b16d5e2fb6b`.
Selected games were fixed before acquisition to cover B19c's duplicate-event,
malformed-minute, opposing-team FT and scorer-presence failures, plus two missing
rotation cases. The four raw families were requested for every selected game.
Retained directory: `data/raw/b19d-native-accepted-20261005`; exclusive immutable
blobs include the two HTTP 404 rotation responses. All 24 source requests and two
upstream method requests have time/status/hash observations.

| Game | B19c sampling reason | Reconstructed events / positive intervals | Remaining failures |
| --- | --- | --- | --- |
| `0022500025` | Ambiguous repeated action numbers; scoring membership | 525 / 339 | 5 team/period starter corroboration disagreements |
| `0022500007` | Malformed independent minutes | 565 / 366 | 6 starter disagreements; player `1629130` box minutes remain unknown (`25:60`) |
| `0022500013` | Opposing-team points inside possessions; overtime | 583 / 371 | 8 starter disagreements, including overtime |
| `0022501045` | Scorer absent from derived lineup | 536 / 315 | 4 starter disagreements |
| `0022500003` | Malformed minutes; opposing-team FT credits | No reconstruction | Mirror rotation HTTP 404 |
| `0022500016` | Scorer absent from derived lineup | No reconstruction | Mirror rotation HTTP 404 |

Across the four complete bundles, **2,209 native events and 1,391 positive-duration
candidate intervals** are retained. Every reconstructed event keeps its native
response `actionId`, original JSON locator, complete payload hash and before/after
lineups. Repeated `actionNumber` rows survive independently. Identity aliases bind
native person/team IDs rather than guessing from name similarity.

All four candidates have no unexplained rotation interval, five-player side,
shooter-presence, player FG/3P/FT count, player scoring, team final-point or present
scoreboard failures. Three also have no player-minute failures at the fixed
one-second tolerance. Native full-box team IDs/sides/final scores agree with the
separately retained 2026 team boxes and regular-season schedule. This demonstrates
numerical reconstruction repair on real failing games; it cannot remove the
starter provenance disagreements or certify possession membership.

Example: `0022500025` period 2 home opening evidence includes Booker (`1626164`),
while observed rotation membership includes Richards (`1630208`). The native PBP
later observes Richards's scoring/substitution, and the rotation/PBP reconstruction
reconciles all player minutes and shot/FT totals. Both starter sets remain in the
error transcript; no range response is silently replaced. The recorded disagreement
is an admission failure even though the candidate is numerically coherent.

## Source decision and alternatives

The retained Git tree has `truncated=false`. Compare its filenames with the
independently retained 1,230-game baseline, not with a capped directory listing.
There are 168 rotation files, **165 regular-game matches**, and 1,065 missing games;
every missing game is listed in the reproduction report. File existence for the
165 games does not establish that their full bundles would reconcile.

The mirror's period-capture method and pinned upstream window math describe
one-second opening range queries. The four sample bundles nevertheless have
**23 team/period starter disagreements**; some responses contain no positive
player minutes. Their metadata does not preserve the requested StartRange/
EndRange parameters. Current method code is retained as context, not proof of
which transform produced each historical response.

Retained alternate attempts in `data/raw/b19d-alternatives-accepted-20261005`:

- Direct `gamerotation` for `0022500003` and the explicit period-2
  `boxscoretraditionalv3` range for `0022500025` both ended in **ReadTimeout**
  with a 15-second read timeout. This is an observed access failure from this
  environment, not a claim that the NBA endpoint never works elsewhere.
- The [shufinskiy manifest](https://github.com/shufinskiy/nba_data/blob/main/list_data.txt)
  has NBA `nbastatsv3_2025` / `cdnnba_2025` archives; its
  [loader documentation](https://github.com/shufinskiy/nba_data/blob/main/README.md)
  keys seasons by **start year**. These are alternative PBP candidates, not
  verified raw starter/rotation bundles. No derived CSV archive was relabelled
  as native range-box evidence or used to override disagreements.
- Inspected pbpstats's actual Stats NBA cached-file seam at
  `e7ccf2fb6326da630a3cf1665aac964a1e108f4c`. Its
  [base loader](https://github.com/dblackrun/pbpstats/blob/e7ccf2fb6326da630a3cf1665aac964a1e108f4c/pbpstats/data_loader/stats_nba/base.py)
  reads `resultSets/headers/rowSet`; these retained v3 PBP responses use
  `game/actions`. Raw-schema inspection is retained in
  [the supplemental manifest](b19d-native-accepted/pbpstats-seam.json).
  No parser runtime, possession correctness or supported v3 integration is
  claimed. Production dependencies were unchanged.

**Decision:** do not scale this source to season admission yet. The next input
step must obtain corrected, parameter-bearing period starter/range observations
and a valid independent minute for `1629130`; full-season scaling also needs the
missing rotations or another independently evidenced starter/interval source.
The reusable CLI accepts an explicit games file once those representative gates
pass. Freeze possession rules only after that source decision succeeds. B32 is
independent and its remaining gates were preserved.

## Verification and reproduction

Accepted and repeat replay outputs are byte-identical, including all four full
candidate transcripts and the summary report. Every raw/method artifact checksum
was verified. Acquisition and replay script signatures are distinct because the
final replay dependency inventory added the baseline normalization module; the
exact original acquisition script is retained as `acquisition-script.txt` and
matches both acquisition manifests. Only the accepted/repeat pair is counted;
earlier `b19d-native-probe*` and baseline-probe outputs are development evidence.

- [Backend suite](b19d-checks/pytest.txt): **690 passed / 135 opt-in skipped**,
  22.81s; no newly executed PostgreSQL or browser checks are claimed.
- [Focused tests](b19d-checks/unit.txt): **22 passed**, covering independent
  native grain, same-clock scoring/substitutions, minute missingness, source
  corrections, rotation gaps/overlap, starter conflict, aliases/collisions,
  immutable outputs, failed HTTP byte retention, and tamper rejection.
- [Ruff](b19d-checks/ruff.txt), [format](b19d-checks/format.txt): zero issues,
  363 files. [Strict mypy](b19d-checks/mypy.txt): zero issues, 147 source files.
- All **26 historical / 17 B19a input / 14 B19b evidence / B19c accepted-output**
  checksums pass; logs are under `b19d-checks`. No source, DB, release pointer,
  migration, warehouse, dashboard or sealed historical artifact was rewritten.

Run from the repository root, always selecting fresh output directories:

```bash
.venv/bin/python scripts/reconstruct_b19_native.py replay \
  --raw data/raw/b19d-native-accepted-20261005 \
  --baseline data/raw/sportsdataverse_2026 \
  --output docs/evidence/b19d-NEW-REPLAY
.venv/bin/pytest tests/unit/test_native_reconstruction.py -q

# New observations, never overwriting retained acquisitions:
.venv/bin/python scripts/reconstruct_b19_native.py acquire --raw data/raw/b19d-NEW-RAW
.venv/bin/python scripts/reconstruct_b19_native.py probe-sources --raw data/raw/b19d-NEW-PROBES
```
