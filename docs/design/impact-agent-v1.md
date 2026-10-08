# CourtLens impact agent v1

IM07 extends the existing six read-only agent tools. `query_stats` and `list_metrics`
reach the serving catalog; no impact-specific tool, acquisition, model fitting,
forecast feature, database migration or publication action is added.

New turns use `courtlens-agent-prompt-v2`: warehouse before web, including RAPM,
ORAPM/DRAPM, labeled multi-year windows, BPR, on/off, six factors and defined extras.
DPM remains a distinct external model, never an alias for BPR. The prompt requests
single-season/phase season-window queries and discloses final-fit cutoffs, samples,
coverage/patch rates, confounding and source gaps. Null cells remain unavailable.

`list_metrics` exposes `courtlens-stats-v3`, metric definitions/versions and artifact
scopes. A metric can be queryable while its configured bundle is source-blocked;
observed artifact scopes do not certify a player cell. Catalog pagination remains
bounded. Existing model-controlled tool schemas are unchanged.

Canonical impact operations pin the retained bundle's content address. Result
metadata includes selected artifact identities, coverage, limitations, source and
methodology. Support is restricted to requested columns before bounded provider
serialization. An explicit impact query window also sets the reported execution
window, rather than retaining an inherited short-window label. Evidence cells identify the correct metric version, unit, player,
covered-game sample, qualification/denominators and original artifact binding.
Equivalent-analysis links retain the bundle pin. Saved canonical steps accept the
server-owned pin for reproduction; model tool arguments cannot supply it.

The bounded provenance audit checks named web RAPM/DRAPM claims against actual
warehouse cells, including possessive player wording. It keeps the requested
phase and exclusive cutoff and uses a season window for fitted coefficients.
Absent/null cells never establish warehouse authority. The audit detects missed
warehouse overrides; it does not turn audit reads into answer evidence or reject
an otherwise sourced turn.

Historical `courtlens-agent-prompt-v1` requests remain supported for exact recorded
replay. The retained v1 prompt/glossary and legacy catalog payload are selected only
by a trusted ReplayProvider recording's declared version. Unknown versions fail;
full request/schema/tool/audit payload equality remains mandatory. Original AG06
corpus and transcripts are not regenerated or relaxed.

`evaluation/assistant/ag-v3-im07.json` is a separate checksummed development
revision. It retains every AG06 case ID, every unrelated development case, and
all 24 holdout case objects verbatim. Five development web cases become exact
warehouse RAPM/DRAPM oracles; eleven new development cases cover ORAPM, 2Y/3Y
RAPM, on/off, six factors and BPR. DPM stays external. The corpus loader verifies
the original parent digest and rejects even rehashed changes to holdout objects.
No holdout inference occurs in IM07.

Expected impact values/support come directly from the sealed IM04 original
artifacts, checked against retained compressed bytes and semantic hashes. Direct
on/off rates are independently recomputed from original scoring/control totals.
Independent PostgreSQL joins scope these originals to the observed box cohort,
with qualification, ordering, identity and samples checked separately from the
serving projection. Scoring requires the warehouse call/chip, correct impact
unit/version and original selected artifact, with zero missed overrides.

`scripts/verify_im07_agent.py` uses PostgreSQL-enforced read-only connections,
including spawned SQL workers. It captures explicitly authored transport fixtures,
then replays each development case three times with exact payload checks. These
results do not establish language accuracy. Optional live measurement uses only
the configured provider for the owner's development RAPM example, stops at the
first provider failure and retains incomplete denominators. No retry, provider
substitution, model change or quota bypass is part of this block. AG07's live
quality gate, AG08 acceptance and IM08 source acquisition remain separate.
