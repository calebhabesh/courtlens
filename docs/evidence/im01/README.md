# IM01 archive admission — 2026-10-07

Status: **verified**. The historical blocked runs below are retained. QA01 and
IM02 subsequently cleared the shared gate; see the resolution at the end. The [impact progress log](../../impact-metrics-progress.md)
records the measured boundary. QA01 remains a separate dependency
of IM02; this acquisition does not admit reconstructed stints or unblock Stats presets.

Starting revision: `d9c700acac2ab5e3331a2f15ce3b8d6b7e3d89dc`. The owner's `TODO.md` was dirty
at the start. QA and DL work subsequently appeared in the shared tree; those files were left
to their respective lanes. IM01 changes only its new acquisition module, tests, v2 source
review, evidence and impact progress entry. Existing source policies, B19/B26 memberships,
frozen evidence, forecasting inputs and publication pointers are unchanged by this block.

## Retained inputs and reproduction

The archive revision is `e829d4678be1e075f99e5d41a1c5f97089be446b` from
[shufinskiy/nba_data](https://github.com/shufinskiy/nba_data/tree/e829d4678be1e075f99e5d41a1c5f97089be446b).
Downloaded 28 `.tar.xz` files: v3/CDN play-by-play, matchups and shot detail for starting years
2023–2025, each in regular-season and playoff phases, plus both phases of pbpstats for 2023/2024.
`pbpstats_2025` and `pbpstats_po_2025` do not exist in the pinned index and remain unavailable.

The 37 retained assets include those archives, three independently downloaded SportsDataverse
schedules, four archive notices, and two SportsDataverse notices. Total exact source bytes:
**140,835,244** (134.31 MiB); fully scanned archive rows: **6,618,623**. Notices are copied under
[notices/](notices/), including the full Apache 2.0 license and the SportsDataverse README's
CC BY 4.0 data attribution and MIT software license. See the
[v2 admission review](../../design/research-source-admission-v2.md) for approved local use.
Markdown notices use `.md.txt` filenames so repository code-block formatting cannot rewrite
the original bytes; [all six notice hashes were checked](verification/notices-hashes.log).

[The machine-readable report](acquisition-and-coverage.json) records every asset URL, SHA-256,
byte count, content-version UUID, observation time/UUID, coverage, missing game ID, independent
schedule membership hash and team-game denominator. Complete per-game row counts remain in
the raw observation manifests under `data/raw/impact-archive/observations/`. No raw rows are
committed or exposed through the API. Objects use SHA-256 paths and exclusive creation; failed
bundles retain successful asset observations without creating a completed bundle receipt.

Two final completed observations (`02e58f9a-e062-47f8-bd6d-95e86b0a7550` and
`068decb9-4599-4385-91dc-a541f1302ff3`) fetched every URL again. All **37** hashes/byte counts
and content-version IDs matched. Their separate receipt hashes and actual times are in the
machine report. Elapsed time after first asset receipt: **32.28 s / 31.49 s**. An earlier
development receipt is retained as well; neither it nor any original object was rewritten.

Both final observations reproduce content signature
`8952f9f6f8aeea4315f865c3efaefe486c0e4bcee581f5d4bf0312707235ca94`.
Independent offline verification rehashed all assets and rescanned all 28 archives and three
schedules, reproducing coverage and that signature:
[first observation](verification/offline-first.log),
[second observation](verification/offline-second.log).

```bash
.venv/bin/python -m courtlens.ingestion.impact_archive \
  --revision e829d4678be1e075f99e5d41a1c5f97089be446b
.venv/bin/python -m courtlens.ingestion.impact_archive \
  --verify data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json
```

Each acquisition creates new observation receipts. Identical content reuses objects; changed
content creates a new content version and preserves prior bytes. The CLI has no database or
API mutation path. An alternate retained root can be supplied with `--root` to either command.

## Measured game coverage

The independent schedules validate **1,230 games / 30 teams / 82 games per team** in each regular
season. Finalized playoff schedule memberships contain **82 / 84 / 85 games**. Each denominator
is separately hashed. No archive has an unexpected game or a game outside its requested phase.

| Season | Phase | Expected | v3 | CDN | Matchups | Shot detail | pbpstats |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2023–24 | Regular season | 1,230 | 1,230 | 1,230 | 1,227 | 1,230 | 1,228 |
| 2023–24 | Playoffs | 82 | 82 | 82 | 82 | 82 | 82 |
| 2024–25 | Regular season | 1,230 | 1,230 | 1,230 | 1,229 | 1,230 | 1,230 |
| 2024–25 | Playoffs | 84 | 84 | 84 | 84 | 84 | 84 |
| 2025–26 | Regular season | 1,230 | 1,230 | 1,230 | 1,230 | 1,230 | Unavailable |
| 2025–26 | Playoffs | 85 | 85 | 60 | 85 | 85 | Unavailable |

Missing 2023–24 matchup games: `0022300383`, `0022301192`, `0022301230`.
Missing 2024–25 matchup game: `0022400856`.
Missing 2023–24 pbpstats cross-check games: `0022301177`, `0022301195`.

The 2025–26 CDN playoff archive lacks 25 games (70.59% coverage):
`0042500204`, `0042500205`, `0042500206`, `0042500207`, `0042500214`, `0042500224`,
`0042500234`, `0042500235`, `0042500236`, `0042500301`, `0042500302`, `0042500303`,
`0042500304`, `0042500311`, `0042500312`, `0042500313`, `0042500314`, `0042500315`,
`0042500316`, `0042500317`, `0042500401`, `0042500402`, `0042500403`, `0042500404`,
`0042500405`. The v3 archive covers all 85 games; cross-source arbitration in IM02 must explicitly
account for the unavailable CDN side. Acquisition coverage does not certify event correctness,
lineups or possession/minute conservation. Matchup gaps constrain later defense coverage.

## Verification

[Targeted checks](verification/targeted-tests.log): **103 passed**, including **23 IM01 tests**
and archive, shot-admission, rich-source and frozen-identifier regressions. The IM01 checks cover
real network-independent fetch semantics, changed versions, corrupt retained bytes, failed/empty/
oversized downloads, exclusive receipts, tar traversal/symlinks/extra members, malformed CSV,
expanded-byte/row limits, truncated xz, missing/unexpected game lists, invalid schedules,
stable complete acquisition signatures, policy/coverage tampering and offline reproduction.

[Scoped Ruff](verification/ruff-scoped.log), [formatting](verification/format-scoped.log) and
[strict mypy](verification/mypy-final.log) pass; mypy checks **184 source files**.

The [full disposable PostgreSQL run](verification/python-full.log) measured **13 failed,
1,561 passed, 0 errors, 2 skipped, 20 deselected, 1 warning** in **289.18 s**. It used
`.venv/bin/python scripts/test_python.py -q`, the in-progress QA01 harness, with its own
ephemeral PostgreSQL 17 container and no owner dotenv, keys, raw data or database. The harness
removed that container after completion. The tree was being edited concurrently; this is an
intermediate measured gate, not a clean-checkout QA01 result. The later three additional IM01
failure-boundary cases are included in the final 103-test targeted run.

Failed IDs are the peers-similarity API case; three restore cases; rich-admission point
conservation; four workbench-job cases; current-season discovery; the two archive-stats
normalization variants; and retained-M6 registration. Their exact IDs and traces are in the log.
None is an IM01 test. The skips require an isolated Next browser server and local real-archive
evaluation artifacts. The harness deselects 20 `requires_published_data` cases. The warning is
the previously recorded google-genai `_UnionGenericAlias` deprecation on Python 3.14.

Latest [repository Ruff](verification/ruff-final.log) and
[repository format](verification/format-final.log) checks also catch concurrently edited files
outside IM01; the retained logs identify the paths. IM01 introduced no remaining static-check
failure. These shared-lane failures were not edited here. The full gate remains unmet and IM02
requires measured QA01 completion. No dashboard changes or browser checks are part of IM01.

## Continuation verification

Offline receipt verification now also rejects altered attribution, admission scope, unavailable
families, invalid bundle UUIDs, naive/future completion timestamps and asset observations after
bundle completion. The same retained source bytes and original content signature still verify
under the [hardened offline check](verification/offline-continuation.log). Metadata tampering
cases were added to the existing complete-acquisition test.

The [fresh targeted run](verification/targeted-continuation.log) passes **103 tests**.
[Scoped Ruff](verification/ruff-continuation.log),
[formatting](verification/format-continuation.log) and
[strict mypy](verification/mypy-continuation.log) pass with **184** source files checked.

The [fresh full-suite run](verification/python-continuation.log) measured **9 failed, 1,570 passed,
0 errors, 1 skipped, 19 deselected, 1 warning** in **303.47 s**, using another disposable
PostgreSQL database and the latest shared QA harness. Its ephemeral database container was
removed by the harness. The tree was still being changed concurrently, so this is not one of
QA01's required clean-checkout acceptance runs. The updated metadata assertions were verified
by the final targeted run after this full-suite process had collected its modules.

Failed cases are `test_get_rich_admissions_report`, `test_assistant_query_when_disabled`,
`test_curated_questions_offline_verification` and six `test_entity_lookup.py` cases: exact
alias/diacritic discovery, ambiguity, zero-game rookie discovery, typo matching, destination
context preservation and retained selection resolution. The log preserves complete traces.
The single skip requires the isolated Next browser server; the harness deselects 19 published
data cases. The existing google-genai deprecation warning remains. No IM01 test failed.

The latest [shared Ruff](verification/ruff-shared-latest.log) and
[shared formatting](verification/format-shared-latest.log) checks report concurrent DL scripts
`scripts/split_css.py` and `scripts/verify-contrast.py`. IM01's source and test files are clean;
the scripts were left to their owning lane. QA01's clean-checkout verification has begun but
its progress status is still planned. IM01 remains `verification_blocked`, and IM02 remains
pending that measured dependency. The [IM02 preflight](im02-preflight.md) records actual
integration observations and confirms all 23 retained starter disagreements without changing
the reconstruction policy or warehouse.

## Shared verification gate resolution — 2026-10-07

QA01 is verified at `18b76e0`. The [IM02 acceptance evidence](../im02/README.md)
records two fresh full disposable PostgreSQL runs, each **1,646 passed / 0 failed /
0 errors**, the documented isolated-Next-browser skip, 19 published-data deselections
and the existing SDK warning. Repository Ruff/format/mypy are clean. IM02's 65
focused checks include the 23 IM01 receipt tests. Its two full archive audits
rehash all 37 retained assets, reproduce every original coverage report and bind
the unchanged acquisition content signature. No acquisition object was rewritten.
IM01's shared verification gate is now satisfied; historical failures above remain
as measured evidence of their original runs.
