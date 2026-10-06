# B19c — retained event identity and conservation diagnostic (2026-10-05)

**Verified diagnostic slice. B19 remains source_blocked.** No PBP, possession or
stint admission; B20/WOWY population remains closed. This slice resolves the
checker’s incomplete lineup identity assumption and measures the remaining source
and policy failures. It does not claim those failures are all repaired.

[Full-season diagnostics](b19c-event-accepted/audit.json),
[byte-identical reproduction and measured totals](b19c-event-accepted/reproducibility.json),
[identity/conservation contract](../design/b19-event-identity-conservation.md).

## Measured identity and scoring results

- Read the complete retained PBP, lineup and possession assets against the
  independent 2025–26 schedule/player/team baselines. All **1,230 regular games**
  have identical complete ordered game/season/period/action projections:
  **621,881 event/lineup pairs**, **245,646 possessions**, and **32,619 repeated
  action-number rows**. An action-number dictionary cannot preserve this grain.
- Each diagnostic join binds both original one-based CSV data-row locators and
  both complete decoded payload hashes. A game transcript preserves every pair.
  Input SHA-256s, baseline hashes, script and normalization/hash dependency hashes
  are in the report. No exported ID is certified as a native NBA event identity.
- **125 games** have repeated `(period, action_number)` keys with different lineup
  sets. Complete sequence equality permits a pinned positional diagnostic but
  cannot independently prove those ambiguous pairs. Native/builder evidence or
  reconstructed lineups remain necessary before their admission.
- Direct explicit made-field-goal and diagnostic FT-description credits reconcile
  both independent team point totals in **all 1,230 games**. This is an arithmetic
  diagnostic, not a validated possession parser. **124 games** have present
  scoreboard observations that disagree with cumulative direct credits; **91**
  contain decreases and **one** has a differing last observed final. These source
  correction/timing cases remain quarantined; no running-maximum clamp is used.

## Remaining conservation failures

| Gate | Measured result |
| --- | --- |
| Imported PBP off/def versus joined home/away lineups | **97,594 rows in all 1,230 games** disagree; **3,537** PBP rows have repeated players within an off/def side. No replacement is admitted. |
| Five-player home/away source validity | **84 games** fail; **81** have positive-duration invalid lineup intervals under row hold. |
| Row-hold player time | At least one player differs by more than the fixed **one-second** diagnostic tolerance in every game. |
| Endpoint-hold comparison | All parseable player times meet tolerance with no invalid independent minute input in **494 games**; **692 games** still have a numerical mismatch. This is not a starter reconstruction or an admission gate pass. |
| Independent player minutes | **84 games** contain invalid/unknown required minutes: **73** malformed nonempty minute games and **12** unknown-minute games, with overlap. Explicit DNP/DND/NWT comments remain separate, without manufactured numerical minutes. |
| Imported possession team points | **273 games** differ from independent outcomes. |
| Opponent scoring inside an offensive interval | **362 opposing-team points in 255 games**; preserve separate team credits rather than attributing them to the offense or dropping them. |
| Imported possession points versus own-team direct events | **49 games** differ at individual interval level. |
| Unresolved event boundaries/clocks | **11 games**; raw possession-row locators and boundary details retained. |
| Scoring event membership | **10 games** have scoring events not assigned exactly once. |
| Scorer presence in joined lineup | **14 games** fail. |
| Explicit nonparticipation versus candidate time | **One game** fails. |
| Possessions spanning lineups | **33,644 possessions across all 1,230 games**; a single start lineup cannot establish shared-floor exposure or scoring attribution. |

Reasons overlap. Neither exposure hypothesis passes the complete admission contract.
The endpoint comparison supports investigating pre-event snapshot semantics; it
cannot certify silent period starters from later appearances. Keep event scoring
credits distinct from possession exposure and use an explicitly frozen cross-lineup
policy after reconstruction. The report preserves source bytes and all unknowns.

Current upstream method files were retained at SportsDataverse-py commit
`81eb7e7060de58ec79b6bdf8bbc1a797f9eb537f`. Their manifest is included in the
reproduction report. The current
[lineup implementation](https://github.com/sportsdataverse/sportsdataverse-py/blob/81eb7e7060de58ec79b6bdf8bbc1a797f9eb537f/sportsdataverse/nba/nba_lineups.py)
documents pre-substitution snapshots and per-period reconstruction; the
[possession implementation](https://github.com/sportsdataverse/sportsdataverse-py/blob/81eb7e7060de58ec79b6bdf8bbc1a797f9eb537f/sportsdataverse/nba/nba_possessions.py)
contains action-number lineup dictionaries and score-difference attribution.
These are diagnostic references, not proof that this code built the retained
August assets. The [pbpstats quickstart](https://pbpstats.readthedocs.io/en/latest/quickstart.html)
provides a raw-data/override seam to evaluate during reconstruction; CSV aggregate
imports cannot substitute for its raw response inputs.

## Verification

- Final-code full scan **27.613s**; independent repeat **27.647s**. `audit.json` is
  byte-identical, SHA-256
  `c6c3eb577288f6ca6cd2cb962edd4086565164fe8af2179075ec734e29b260be`.
  Source/baseline/script/dependency hashes and every per-game join transcript agree.
- **20 new unit regressions**: repeated grain, shifted/dropped projection,
  full-payload/locator identities, ambiguous repeated keys, corrupt side/roster,
  positive-duration invalid lineup, unknown/malformed minutes, explicit
  nonparticipation, score decreases, opponent technical FT attribution,
  missing/overlapping scoring membership, substitution snapshot hypotheses,
  invalid clock diagnostics, reopened source groups and output overwrite refusal.
- [Whole backend suite](b19c-checks/pytest-final.txt): **668 passed / 135 opt-in
  skipped**, 22.80s. Skips are reported, not counted as executed PostgreSQL tests.
- [Ruff](b19c-checks/ruff-final.txt), [format](b19c-checks/format-final.txt):
  zero issues, **358 files** formatted.
  [Strict mypy](b19c-checks/mypy-final.txt): **146 source files**, zero issues.
- All **26 historical** checksums, **17 B19a input** checksums and **14 B19b
  evidence** checksums pass:
  [historical](b19c-checks/retained-checksums.txt),
  [inputs](b19c-checks/input-checksums.txt),
  [assignment evidence](b19c-checks/assignment-checksums.txt).
  `git diff --check` passes. No runtime source, DB, migration, publication,
  dashboard, model or serving changes; no new PostgreSQL/browser claim.
- Earlier `b19c-event-probe`, `b19c-event-probe2` and `b19c-event-final` outputs are
  retained and excluded. The first counted blank explicit nonparticipant minutes
  as invalid; the second separated them and compared snapshot hypotheses. The
  third scan overlapped a script change; its reported end-of-run script hash is
  not accepted provenance. Only the frozen-code accepted/repeat pair is evidence.

Reproduce to a fresh output directory:

```bash
.venv/bin/python scripts/audit_b19_event_conservation.py \
  --raw data/raw/b19a-2026-20261004 \
  --baseline data/raw/sportsdataverse_2026 \
  --output docs/evidence/b19c-NEW-REPLAY
.venv/bin/pytest tests/unit/test_b19_event_conservation.py -q
```

**Next B19 dependency:** retain raw native PBP, rotation and per-period starter/range
box observations for a bounded reconstruction spike, including representative
ambiguous joins, malformed minutes, opponent FT credits and scoring-membership
failures. Pin parser and immutable overrides, reconcile event/player time, and
freeze substitution/possession attribution before append-only stint admission.
B19b assignment serving integration remains a separate B23 step. B32 final scores,
crosswalks, corrections/player admission and maximum-three-box/retention gates
remain open.
