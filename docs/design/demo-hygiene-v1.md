# Demo hygiene v1 (PC12 C)

Scope: Evaluation availability, curated public investigations, saved-distribution labels and the
Playoffs title. Existing numerical definitions, frozen artifacts and saved evidence remain intact.

## Evaluation archive

- Parameter-free `/evaluation` reads the frozen M6 experiment through
  `/api/analytics/evaluations?archive=true`. It uses the frozen config's snapshot, or a retained
  ready snapshot with a verified equivalent binding after restore. The publication pointer is
  independent of this historical archive.
- The reader still checks dataset content, observation and scoring identities and the registered
  report SHA-256. No report is attached to different inputs. Missing archive inputs do not fall
  back to the current release.
- Explicit `snapshotId` always remains authoritative, including with `archive=true`. A mismatch
  or unavailable snapshot stays visible until the visitor chooses Open Evaluation Archive.
- M6 measures **reference points** (PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV). Its EWMA
  replay policy and 2023–24 final test are separate from the basketball-points experiment served
  on Points Forecasts. The headline compares measured error, with support and source; a negative
  promotion result remains a completed result.

## Public and personal investigations

- Parameter-free `/investigations` is a menu of four real retained findings. The display metadata
  in `dashboard/lib/public-investigations.ts` pins each original ID and manifest SHA-256. The API
  verifies the manifest and result hashes before returning a finding.
- Titles/descriptions are presentation metadata. Original titles, IDs, manifests, numerical
  results, exports and reproduction behavior are preserved. Data details shows the original title
  and hash. A missing or mismatched curated record is omitted with an unavailable count and a
  Case Studies link; there is no substitute result.
- Locally, My Saved Investigations opens `/investigations?view=personal`, preserving pagination,
  saving, the legacy archive and verification/export paths. The hosted-demo flag omits this
  navigation and always opens the public menu. This is a presentation policy; PC13 still owns
  public API exposure and deployment controls.
- PC13 must retain these exact four records and their input releases when packaging the demo.

## Saved distribution plots

- Each dot is one finite observed value. Unknown values keep their returned sample slot and have
  no dot; observed zero and signed values are preserved. There is no line interpolation or
  invented uncertainty. Y axis: metric with units and numeric ticks. X axis: **returned appearance
  order**, with first/last appearance number and retained date. “Newest first” appears only when
  every retained date establishes that order. This is not a calendar-spaced trajectory.
- Source and observed/unknown counts remain beside the plot. Exact returned samples and
  summary stay in the table/evidence. The graph leads the saved distribution's detail; chart
  marks keep their geometry at each viewport without changing layout height.
- Public detail titles match the curated menu. Technical result hashes stay in Data details on
  saved pages. The shared Ask result renderer picks up the same axis labeling; its agent loop,
  transport, layout and stored evidence do not change.

## Playoffs

The bracket landing's title is **Playoffs**, matching its tab and navigation. Live and Finals keep
their existing Live header. Bracket data, cutoff rules, series links and factual outcomes are
unchanged.

## Acceptance

Real production first loads at 1440×900 and 390×844; fresh extended glance judgments; dashboard
lint/types/unit checks and affected browser/baseline checks; Python pytest/Ruff/mypy for the new
archive selection path. Report service-state and alignment gaps explicitly. Earlier Compare
export and source-verification gaps remain independent of this batch.
