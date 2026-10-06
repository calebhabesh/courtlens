# B19a complete rich-source audit — 2026-10-04

**Verified acquisition/audit slice. B19 analytical admission remains source_blocked.**
One recent full season, 2025–26 (ending year 2026), regular-season reconciliation.
No retained analytical dataset, public pointer, forecast, experiment or Live setting
was mutated. The new checker performs filesystem reads and writes its own evidence;
it imports no database service. Use the corrected living ledger, not B19's earlier
fixture-based “VERIFIED” prose, to assess overall completion.

Read the replica/workbench handoffs, rich-input analytics contract, free-source
feasibility and B26 source-readiness evidence before implementation. Implementation
choice: current Codex session, no delegation or model overrides.

Five ordinary complete public downloads are retained in
`data/raw/b19a-2026-20261004/`: **134,324,855 bytes** and **2,185,951 CSV data rows**.
All five full SHA-256 hashes and sizes independently match retained publisher
release metadata. [Source manifest](b19a-full-source-final/source-manifest.json)
records URLs, bytes, digests, asset IDs, publisher update times and local artifact
write times. Local write time is not historical availability or provider update
time. Raw artifacts are locally retained and Git-ignored; JSON audit evidence does
not replace the original bytes. NBA Stats/SportsDataverse attribution, data CC BY
4.0 declaration and helper MIT license are retained; public redistribution rights
remain a separate gate. Pinned candidate-builder/method files are retained as
inspection references, not proof of the revision used for the August release.

The independent retained schedule has **1,230** regular-season games. Every game
has two matching team outcomes/sides and complete matching player/team
FGA/FGM/3PA/3PM totals. Source games are separated by phase before reconciliation;
preseason, play-in, cup final and playoffs are not silently pooled. Original boxes
include malformed minutes such as `30:60`; these remain unrepaired and are flagged
separately wherever lineup appearance verification depends on them.

| Full asset | All-phase rows | Observed regular games | Games passing necessary checks |
| --- | ---: | ---: | ---: |
| PBP | 707,440 | 1,230 | 62 |
| Possessions | 278,341 | 1,230 | 852 |
| Game lineups | 707,440 | 1,230 | 0 |
| Shots | 234,876 | 1,230 | 1,230 |
| Assignments | 257,854 | 1,230 | 1,230 |

These are **necessary-check results, not admitted populations**. Every family's
`not_admitted` flag is true. [Final complete audit](b19a-full-source-final/audit.json)
records all affected game IDs, all reason counts, three raw data-row examples per
reason/game, column inventories, null counts, phase counts and unresolved gates.

- **PBP:** `action_id` and chronological `order_index` are the event grain.
  `action_number` repeats in every regular-season game; for example turnover and
  steal descriptions share 25 while provider action IDs are 16 and 17. Repetition
  is preserved as a diagnostic, not incorrectly rejected as a duplicate provider
  event. Off/def five-player-side checks fail in **1,155** games, including empty
  sides and repeated identities; this does not establish that every failed row
  lacks an independently reconstructable home/away lineup. **91** games contain
  decreasing score observations requiring policy review; **one** final score
  differs from the independent boxes. Minute-dependent appearance checks flag
  **73** games with malformed independent box minutes. Source-derived shot totals
  match boxes even when independent minutes fail.
- **Possessions:** **273** games have team point-conservation mismatches;
  **61** contain invalid five-player sides; **73** depend on malformed independent
  player minutes; **11** contain invalid required values. Reasons overlap. All
  **245,634 regular-season possession rows** declare `pbp_fallback`; this label
  does not certify starters or FT/technical/rebound accounting. **852** games pass
  this limited checker, but event membership, cross-lineup scoring and exposure
  attribution remain unverified.
- **Lineups:** repeated `action_number` in all **1,230** games conflicts with the
  current table's `(dataset_id, game_id, action_number)` unique constraint and
  leaves a naive action-number join ambiguous. **84** games contain invalid
  five-player sides. These rows are event observations, not duration-certified
  stints. Row/event mapping, period continuity and player minute conservation
  remain required before B20.
- **Shots:** all observed attempts match every player's FGA/FGM/3PA/3PM, including
  zero denominators; independent player totals also equal team totals. Outcome,
  player/team identity, season and basic clock/geometry checks pass. The file
  lacks provider event IDs, and distance/coordinate consistency and corrections
  remain separate gates. B26's separately admitted shot archive is preserved.
- **Assignments:** all regular games pass pair/team participation, unique-pair,
  nonnegative finite exposure and make/attempt checks. No assumption equates
  fractional assignment exposures with ordinary possessions/player minutes.
  Exact `matchup_minutes_sort` seconds versus rounded display minutes, source
  denominator methodology and durable versioned admission remain required.

The old B19 service still runs bulk DELETE/replacement inside admin mutation and
can skip absent baselines or admit surviving rows after parse failures. Do not run
it against retained datasets to convert this audit into an admission. A separate
append-only admission/membership design and executed PostgreSQL sealing/rollback
verification are required. This audit makes no new relational acceptance claim.

Verification:

- Final complete-file audit: **28.451 seconds**. Independently repeated final-code
  audit produced identical family diagnostics, hashes, baseline identities and
  expected game membership: [reproducibility](b19a-full-source-final/reproducibility.json).
  Observation timestamps and durations are intentionally compared separately.
- **11 focused tests pass**, covering provider event identity versus repeated
  action numbers, duplicate sides/events, missing/orphan games, unknown outcomes,
  invalid denominators, zero-denominator reconciliation and independent invalid
  minutes without erasing observed shot totals.
- [Backend suite](b19a-full-source-final/pytest.txt): **636 passed / 125 opt-in skips**
  in 29.36s. No PostgreSQL/browser acceptance is inferred from these skips;
  this slice changes no relational implementation or dashboard.
- Whole-tree Ruff and formatting: **347 files**, zero issues; strict mypy:
  **144 source files**, zero issues. [Ruff](b19a-full-source-final/ruff.txt),
  [formatting](b19a-full-source-final/format.txt), [mypy](b19a-full-source-final/mypy.txt).
- All **26 sealed historical checksums** and all **17 audit input checksums** pass.
  [Historical](b19a-full-source-final/retained-checksums.txt),
  [source inputs](b19a-full-source-final/input-checks.txt).
- Initial `b19a-full-source-audit/` and intermediate `b19a-full-source-verified/`
  outputs remain preserved, superseded by `b19a-full-source-final/`. The first
  checker wrongly treated repeated action numbers as provider-event duplicates;
  the intermediate checker let invalid box minutes interrupt shot tallying.
  Focused regressions and corrected full scans resolve both checker issues.

Reproduce locally into a new output directory:

```bash
.venv/bin/python scripts/audit_b19_rich_sources.py \
  --raw data/raw/b19a-2026-20261004 \
  --baseline data/raw/sportsdataverse_2026 \
  --output docs/evidence/b19a-NEW-RUN
sha256sum -c docs/evidence/b19a-full-source-final/inputs.sha256
.venv/bin/pytest tests/unit/test_b19_source_audit.py -q
```

Next B19 boundary: implement append-only source/admission membership with exact
raw-row identity, then independently admit assignments using precise numeric
seconds and explicit denominator provenance. For PBP/possessions/lineups, resolve
row/event joins and documented source corrections/policy before declaring a
reconciled season or populating B20/WOWY. Never invent missing starters, normalize
malformed minutes silently, or waive score conservation. B32's final/correction
and maximum-three-box gates remain independent and open.
