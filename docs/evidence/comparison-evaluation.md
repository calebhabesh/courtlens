# M7 comparison and evaluation evidence

Checked 2026-09-21. M7 serves one snapshot-bound two-player response, historical replay
estimates from the registered M6 policy, and the measured evaluation report. No challenger is
promoted. The pages use human-readable summaries while retaining immutable IDs and hashes in
details.

## Real comparison

The real-data check used published snapshot `5b14b7ed-353b-499d-a37a-6887b5f6c715`, dataset
`2e99f37c-231a-4748-9f48-5b9ffa99f228`, and replay date 2023-11-15. The response compared
LeBron James (`2544`) and Stephen Curry (`201939`) through one `/api/analytics/compare` request.
Both embedded profiles returned the same snapshot, dataset, replay cutoff, metric version, scoring
hash, and source.

| Measure | LeBron James | Stephen Curry |
| --- | ---: | ---: |
| Last-5 reference points/game | 42.16 | 41.48 |
| Last-10 reference points/game | 45.25 | 42.31 |
| Season reference points/game | 45.25 | 42.31 |
| Reconstructed next team game | LAL vs SAC, 2023-11-15 | GSW vs OKC, 2023-11-16 |
| Lead/rest days | 0 / 0 | 1 / 1 |
| EWMA-20 estimate | 44.23 | 41.68 |
| 80% empirical interval | 31.84–56.63 | 29.28–54.07 |

The arithmetic estimate gap was 2.56 CourtLoad points. The ranges overlap, so the UI presents the
gap beside uncertainty and does not invent a winner probability or start/sit command. The target
dates differ visibly; the comparison does not imply that the players face each other. Estimates
are conditional on appearance and use the M6 out-of-time reconstruction with fit end 2023-02-10,
calibration end 2023-04-09, and run `6f7af9e63f27aada910d`.

The estimate reader verifies the registered replay SHA-256
`7c635f46abfd8df5e4045dfd2fa24ef993a8fa6e992475f45ef5603ce65bcb2f` and calibration SHA-256
`510e50fd351c7f3f3d3fe21e277294acb35bd19296acaeafe0df00d315f239b6`. It returns an explicit
cutoff-unavailable state outside registered replay coverage. Five to nine valid prior appearances
receive the specified limited-history mean without a calibrated interval; fewer than five receive
no numeric estimate.

Captures: [desktop comparison](../assets/real-comparison.png),
[375 px comparison](../assets/real-comparison-mobile.png), and
[evaluation](../assets/real-evaluation.png). The mobile comparison had equal 375 px document and
viewport widths, with both player values adjacent in every metric row.

## Evaluation and health

`/api/analytics/evaluations` binds the published snapshot and accepted dataset hashes to M6 run
`6f7af9e63f27aada910d`. It verifies report SHA-256
`84d5443326c03bfdffdfac2c01ca72b17943ff1f3b0a733f6023e5924aa5de4b` before returning validation,
final-test metrics, promotion gates, limitations, publication time, latest build state, and
published relation counts. The UI reports EWMA MAE 7.8187 versus context MAE 7.9604 on 39,988
identical core forecasts and all four gate outcomes. It also discloses that M6 did not measure S3
observed appearances with no candidate.

The real health response reported 90,609 player/game facts, 220,942 dated profiles, a ready latest
build, and published time 2026-09-21T04:46:04.412079+00:00. A fixture browser case verifies that a
failed newer build remains visible while the prior snapshot is usable.

## Failure and interaction checks

Six Playwright checks cover the prior player workflow plus a complete comparison, swapping
players, different target dates, sparse history, invalid-date recovery with preserved selections,
missing opponent context, a missing estimate, the no-promotion decision, a failed build state,
keyboard-only selection, and a 375 px viewport without page-level horizontal overflow. API tests
reject identical players, unsupported dates, unknown snapshots,
and attaching the M6 report to a different snapshot. Both sides are assembled after resolving the
publication pointer once, and the existing PostgreSQL publication tests verify lock rejection and
atomic pointer preservation/rollback.

Verification passed: Ruff lint and formatting, strict mypy, 63 routine Python tests, two
PostgreSQL publication tests, frontend lint and typecheck, two Vitest tests, six Playwright tests,
the Next.js production build, Python and npm dependency checks, and Docker Compose validation.
PostgreSQL and temporary verification servers were stopped after the checks.

Known limits remain: S1/S2 core estimates lack a registered selection-safe replay artifact; source
records are revised history; team association is inferred; appearance probability is outside the
target; and the S3 no-candidate coverage count remains unknown.
