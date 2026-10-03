# Expected-shot ShotChartDetail admission v2

Registered 2026-10-03 before v2 game/season execution. Parent policy:
[shotchart-admission-v1](shotchart-admission-v1.md). This is a distinct input
quality policy, not an amendment to any model protocol or fitting authorization.

Retain the v1 contract and all original acquisitions and results. All v1 parsing,
clock validity, duplicate game/event rejection, independent exact all-attempt
player/team reconciliation, geometry rules, denominator and resource limits
remain binding. Default execution remains v1. Explicit v2 identifies its recipe
as `courtload-shotchart-v2`, freezes the contract and implementation hashes, and
retains a separate policy-registration artifact before scanning any rows.

For expected-shot observations, numeric event IDs establish unique identity,
not chronology. Retain every adjacent period/clock reversal under event-ID
sorting as a diagnostic; it alone does not quarantine a game. Do not reorder,
repair or infer clocks. Invalid clocks still reject rows. Sorting by event ID
is only deterministic membership serialization. **Possession and aftermath
eligibility require independently validated sequence; this policy grants none.**

Primary justification: the [official Denver–Minnesota game book](https://statsdmz.nba.com/pdfs/20251027/20251027_DENMIN_book.pdf),
printed page 19, records Gordon's fourth-quarter attempt at 3:26 before Jokic's
at 2:50. The retained archive assigns event IDs 674 and 663 respectively. This
supports identity-only treatment; it does not establish why identifiers reverse.
Browser inspection supports the policy decision, not a corrected source admission.

## Reviewed correction ledger — prescribed next boundary

The current v2 adapter does not accept a correction ledger. The requirements
below are frozen for that later implementation; they are not completion evidence.

No row may be dropped just because counts improve. A separate, explicitly
supplied `courtload-shot-correction-ledger-v1` may exclude an identified row from
a new v2 candidate only after review of retained official evidence. It binds the
complete original archive hash, v2 contract hash, unique game/event key, exact
raw-field hash and expected normalized shot fields. Exclusions are the only
supported operation; no synthesized/replacement outcomes or fuzzy matching.

Each entry requires an identified reviewer, actual aware review timestamp,
written conclusion that the row is not an official field-goal attempt, and
one or more retained NBA official PDF/JSON artifacts. Evidence records actual
aware observation time, URL, relative basename, format, complete byte count and
SHA-256 plus review locator/reason. Verify bounded bytes, format, exact official
game URL and observation <= review <= execution. An explicit review is a
provenance-bearing input whose substantive correctness remains independently
reviewable; hash validation alone cannot prove the review conclusion.

Correction matching occurs after strict parsing. Every entry must match exactly
once in the complete archive, even in a one-game audit. Duplicate identities,
changed row hashes/fields, missing targets, corrupt/missing evidence, unreviewed
entries and v1 correction requests fail closed. Retain original excluded rows in
`corrections.json`, alongside the full ledger and evidence hashes. They are not
malformed-row rejections. Retain pre-correction count comparisons and reversal
diagnostics, then reconcile every remaining attempt before geometry filtering.
Proofs must match policy, correction-ledger bytes and implementation exactly.

Game `0022500792` is Houston at Charlotte, 2026-02-19. Event 403 is a **pending
candidate**, not an approved exclusion. The official book's Q3 substitutions and
two Smith attempts support investigation but no ledger is approved solely from
browser text or a count-fitting diagnostic. Acquire full immutable official
bytes and review them before supplying a ledger. Preserve the archive and v1
results regardless of later correction status.

Run explicit previously failing games and the discrepancy, then require all
1,230 recent-season games to pass before 2024–25/2023–24 expansion. Complete
reconciliation still grants no reuse/database admission, chronological binding,
resource-enforced fit, model card or API readiness.
