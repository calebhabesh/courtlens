# CourtLens impact serving v1

IM06 serves the sealed IM04/IM05 outputs as a separate immutable analytical
supplement. It preserves public release pointers, box-stat definitions v1/v2,
original memberships, B26 experiment status and all forecast inputs. A read never
acquires data or fits a model. Source attribution is NBA public data via the
admitted shufinskiy archive and SportsDataverse independent boxes/schedules.

`scripts/build_impact_serving.py` verifies both pinned acceptances and all their
sealed evidence bytes, then projects exactly 12 rating and six extras artifacts
into an exclusively-created SHA-256-addressed JSON bundle. Configuration selects
one retained address with `COURTLENS_IMPACT_SERVING_MANIFEST`; absence gates the
capability, altered bytes return an integrity failure. Another bundle is a new
address, never an overwrite. This is an analytical supplement, not a replacement
public snapshot publication. The artifact identities accompany every query that
uses it and enter its cursor/cohort binding; conventional query hashes stay intact.

Only single-season, same-phase season-window queries select the supplement.
Every selected artifact must have `last_included_date < before_date`, including
every season of 2Y/3Y windows. Final artifacts can therefore serve after the last
included game, even before their conservative July 1 cutoff. Earlier queries
return unavailable; no final-season fit is represented as an earlier as-of fit.
Future artifact memberships cannot enter prior-cutoff query bindings.

RAPM/ORAPM/DRAPM and BPR/OBPR/DBPR retain labeled 1Y/2Y/3Y windows. Six factors
are six separate favorable-sign percentage-point coefficients, never a composite,
residual or PVAL. Ratings require the IM04 display sample (20 games, 1000 relevant
opportunities on both sides); otherwise cells are null with support retained.
Full-league fitted ratings remain full-league fits when selecting team participants.
Full-season extras are unavailable under a team filter. All units are fixed;
counting-mode switches do not renormalize modeled rates or coefficients.

On/off retains per-team scoring, offensive/defensive counted controls and seconds
for both on and off. A single-team player can display their one team record;
a multi-team player requires a selected team, otherwise their scalar cells are
null and all team records remain available. Off includes team-season games without
an appearance. Never average traded-team references or infer roster/availability.

Extras retain value, numerator, denominator, reference, source-covered and total
games and IM05 qualification. Values remain descriptive when unqualified;
percentiles require the recorded qualification. SQL joins the bounded coefficient
payload before analytical predicates, sorting, cohort windows and pagination.
Name/entity display filters stay after the eligible cohort. No full Python box-fact
load or post-page value merge is introduced. Model support and box appearances are
distinct samples and are presented as such.

Saved impact investigations record `impact_manifest_sha256` and metric version
`courtlens-stats-v3`; replay loads that retained address even after the configured
default changes. The pin is preserved in canonical URLs. Absent pins remain omitted
from legacy serialized queries and planner schemas, preserving frozen replay inputs.
Cursor/cohort bindings use selected artifact identities, excluding the global pin
so adding future artifacts cannot change a prior-cutoff binding.

The API's explicit `version=courtlens-stats-v3` serving catalog extends retained
definitions with CourtLens impact keys; the default and explicit `version=v2`
retain v2, and `version=v1` retains v1. UI definitions are
generated from the Python catalog. Percentile SQL computes requested impact fields
over the complete eligible cohort before presentation filtering and pagination.
Coverage shows scheduled/admitted/clean/patched/
excluded games and patched/admitted percentage for each contributing season/phase.
Methodology retains omitted zero-control RAPM scoring, the unchanged box-estimate
diagnostic, reconstruction/minute/plus-minus limitations, missing source families,
conditional samples and the Unknown PBP bucket. Wave-2 metrics stay unavailable.

`/research/rapm` shows the descriptive serving table alongside the preserved
preregistered B26 experiment panel. Profile impact cards share the same endpoint
and exclusive cutoff. Stats presets use server-owned values and support; screenshots
at 1440 and 375 px distinguish real-service evidence from fixture UI tests.
