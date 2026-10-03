# B26 strict shot adapter and complete-season reconciliation

Measured 2026-10-03. **The strict adapter and one real-game reconciliation are verified. The subsequent 2025–26 season fails admission; full B26 remains `source_blocked`.** No fit, database admission, publication, final-error inspection, split binding or chronology amendment occurred.

Parent: [input-readiness handoff](b26-input-readiness.md). Frozen quality policy: [shotchart-admission-v1](../design/shotchart-admission-v1.md). Machine evidence: [b26-shotchart-admission.json](../evidence/b26-shotchart-admission.json).

## Implementation

`domain/shotchart.py` preserves the exact NBA game/event/player/team identities, date, period/clock, observed type/make, original geometry, CSV locator and full raw-field hash. Unknown targets and malformed/nonfinite fields reject the row and quarantine the game. Missing geometry stays null; genuine zeros remain observed. All observed attempts reconcile before geometry eligibility is assessed. Team and every recorded player, including zero-attempt players, require exact FGA/FGM/3PA/3PM equality. Summed player boxes must also equal team boxes. Schedule identities, sides, phase, scores and team scoring conservation are independent checks.

`ingestion/shotchart.py` acquires only full revision-pinned URLs, preserves notices and actual observation receipts, verifies complete bytes/hashes, and streams exactly one expected CSV tar member without extracting paths. Compressed/expanded/field/row/per-game limits fail closed. The implementation supports the installed Python 3.14 streaming tar behavior through a nonseekable reader wrapper.

`evaluation/shotchart_admission.py` is an explicit offline CLI. It verifies independently retained SportsDataverse schedule/player/team bytes against their receipts, establishes the finalized regular-season denominator and spools normalized attempts to temporary SQLite instead of retaining all shots in memory. New candidate directories and files use exclusive creation. Full-season expansion requires a successful one-game proof with matching source, independent boxes, quality-contract, implementation and retained-artifact hashes. Each expected game retains exact comparisons, membership hash, reasons, clock reversals and geometry exclusions. Raw fields and normalized attempts are retained together in JSONL. This utility does not connect to PostgreSQL or invoke the replacing B19 admission service.

## Source and use evidence

Retained local source root: `data/raw/b26-shotchart/e829d4678be1e075f99e5d41a1c5f97089be446b/`. The complete archive is 2,825,192 bytes, SHA-256 `dcb6c29edda8463132ab62f63118b5cee80d751bcbee9ad98fa38ebe12e6d33c`; its one CSV member is 44,640,276 bytes. The pinned [publisher README](https://github.com/shufinskiy/nba_data/blob/e829d4678be1e075f99e5d41a1c5f97089be446b/README.md) describes the archive; [field documentation](https://github.com/shufinskiy/nba_data/blob/e829d4678be1e075f99e5d41a1c5f97089be446b/description_fields.md) includes game/event identities. The [repository Apache 2.0 license](https://github.com/shufinskiy/nba_data/blob/e829d4678be1e075f99e5d41a1c5f97089be446b/LICENSE), README and field-document bytes and their hashes are retained with the acquisition receipt. Archive filenames use starting years; `shotdetail_2025` is 2025–26.

Independent schedule/team/player bytes remain under `data/raw/sportsdataverse_2026/`; their existing receipts and all three full hashes verified. Attribute NBA Stats, `shufinskiy/nba_data` and SportsDataverse; disclose coordinate conversion, identity padding, independent reconciliation and exclusions. Existing source evidence distinguishes repository licenses from unresolved upstream NBA reuse. This is local research diagnostic retention, not a claim of cleared public redistribution or admitted reuse. The SportsDataverse receipt reports acquisition/reuse; it does not prove historical publication-time availability. Full raw bytes are in ignored local runtime storage, not embedded in tracked documentation.

## Real-game result

Houston at Oklahoma City, **2025-10-21**, NBA game `0022500001`, final **124–125**:

- **201 attempts** with unique event identities; every recorded player and both teams reconcile exactly.
- Oklahoma City: **104 FGA, 46 FGM, 52 3PA, 13 3PM**. Houston: **97 FGA, 43 FGM, 39 3PA, 11 3PM**.
- **201 geometry-eligible attempts**, no rejected rows, clock reversals or geometry exclusions.
- Exact source/recipe/row/artifact proof: `data/artifacts/research-shots/b26-game-0022500001-final/`. The tracked evidence retains the full comparison report and proof manifest.

## Complete-season result and failure

The independently checked denominator is **1,230 finalized regular-season games, 30 NBA teams, 82 games each**, all before the audit cutoff. The shot archive contains every expected game and no extra games: **219,160 attempts**, zero malformed/rejected rows, zero duplicate event grains and zero geometry exclusions under the fixed policy.

**518 games pass; 712 are quarantined.** Exact four-count player/team totals reconcile in **1,229 of 1,230 games**. Quarantine is dominated by **event-clock-order failures in 712 games**. The source's numeric event IDs are unique but frequently fail the v1 assumption that increasing IDs follow the recorded clock. Two retained examples:

- `0022500006`: event 323 at period 2, 0:01, followed by event 327 at 0:04.
- `0022500008`: event 663 at period 4, 2:50, followed by event 674 at 3:26.

These observations do not independently establish the reason for the source ordering behavior. Corrected timestamps or nonchronological provider identifiers are possible explanations, not verified repairs. The expected-shot model needs unique event identity rather than possession ordering, so an independently justified, separately versioned input policy may be appropriate. **The frozen v1 check has not been removed or silently relaxed.** Shot identity cannot certify possession sequence or aftermath eligibility.

The one all-attempt discrepancy is **Houston at Charlotte, 2026-02-19, game `0022500792`**. For Jabari Smith Jr. (`1631095`), the shot archive counts **9 FGA, 6 FGM, 3 3PA, 2 3PM** versus independent player boxes **8/6/3/2**. Houston shots count **86/42/32/9** versus final team boxes **85/42/32/9**. This is one extra missed two-point attempt in the shot source relative to boxes. There is no established correct event to delete; no row was repaired, dropped or synthesized. This game also has a clock-order failure. Even a justified ordering-policy amendment would leave this independent count blocker.

The full season bundle is `data/artifacts/research-shots/b26-season-2025-final/`: every game's comparisons, all clock reversals, all normalized/raw rows, exclusions and exact artifact hashes are retained. Its **91,362** eligible attempts come only from the 518 passing games; this partial sample does **not** meet the complete-season gate. Runtime: **13.86 seconds**, peak child RSS **141,024 KiB (137.72 MiB)**. These are input-audit measurements, not fit-resource measurements or enforced experiment caps.

## Verification and attempts

- **131 focused/regression tests passed**, zero skips, including **57 new tests**. PostgreSQL-backed B23/readiness fixture tests executed and rolled back. One existing Starlette/httpx deprecation warning remains.
- Ruff check and format passed (**245 files**); strict mypy passed (**108 source files**).
- All **26** retained historical checksums passed; all four B25 protocol files match their recorded hashes and retained registration bytes.
- Full source receipts and game/season artifact hashes reverified; reusing a real retained output directory exits **2** and leaves its manifest unchanged.
- Initial game attempt `b26-game-0022500001-v1` failed on Python 3.14 streaming tar behavior before writing results. The nonseekable wrapper fixed it. Subsequent `-v2` and `-v3` proofs passed; after adding richer clock evidence, the `-final` proof passed. The `b26-season-2025-v1` audit and final audit reproduce the same 518/712 split. Earlier candidates were preserved. One measurement command could not launch because `/usr/bin/time` is absent; measurement used a subprocess timer and `resource.getrusage` instead.
- No full backend/dashboard/browser suite rerun for this offline source utility. Existing browser failures, warning gate and verified-video absence remain separate.

## Next dependency

Do not expand to the other two seasons or fit a model while the recent complete-season gate fails. Independently reconcile the event-clock semantics against primary event evidence and register a new input-transform/quality version if justified. Resolve `0022500792` from separately acquired, immutable official shot/box/event observations; any correction or override must retain provenance and a new candidate identity. Re-run one game and the whole season under that policy. Only a complete passing recent season authorizes the ordered three-season expansion.

Append-only database source admission, independently reviewed use evidence, the retrospective chronology amendment, exact split/validation-half binding, resource-enforced runner, model cards and read-only result APIs remain pending. RAPM/six-factor still lack complete possessions/stints/opportunity attribution; adjusted shooting still lacks admitted playtypes and foul trips. No part of this input work completes those experiments.

```bash
# Each output directory must be new.
.venv/bin/python -m courtload.evaluation.shotchart_admission \
  --shot-source-dir data/raw/b26-shotchart/e829d4678be1e075f99e5d41a1c5f97089be446b \
  --box-source-dir data/raw/sportsdataverse_2026 --starting-year 2025 \
  --before-date 2026-10-03 --game-id 0022500001 \
  --output-dir /tmp/courtload-b26-game-new

.venv/bin/python -m courtload.evaluation.shotchart_admission \
  --shot-source-dir data/raw/b26-shotchart/e829d4678be1e075f99e5d41a1c5f97089be446b \
  --box-source-dir data/raw/sportsdataverse_2026 --starting-year 2025 \
  --before-date 2026-10-03 --game-proof-dir /tmp/courtload-b26-game-new \
  --output-dir /tmp/courtload-b26-season-new
# Season exits 2 and retains source-blocked evidence under v1.
```


2026-10-03 follow-up: the v1 audit above is retained historical evidence. The separately registered v2 and reviewed official corrections now reconcile all three seasons. See [completed expected-shot experiment](b26-expected-shot-result.md) and [three-season evidence](../evidence/b26-three-season-admission-v2.json).
