# IM02 — deterministic repair policy and measured coverage

Status: **verified**. Parent:
[impact progress](../../impact-metrics-progress.md),
[possession policy v2](../../design/possession-policy-v2.md).
QA01's two clean runs at `18b76e0` satisfied the prerequisite. This block leaves
v1 reconstruction, sealed B19/B20/B26 evidence, forecasting features and publication
pointers intact. Other dashboard work in the shared tree belongs to its own lane.

## Implementation and retained evidence

- `domain/possession_repair.py`: seven versioned deterministic rule families,
  explicit source-row identity, period starter inference, dead-ball substitution
  insertion/replay, same-clock free-throw and substitution order, minute carry and
  tolerance, independent box arbitration and game quality. Unknown comparisons
  remain null; no unknown players, box rows or scores are manufactured.
- `ingestion/impact_repair_audit.py`: network-free audit of every independently
  scheduled game, bounded per-game memory through temporary SQLite spooling,
  rehashed IM01 archives/receipts and actual player/team box receipts. Every candidate
  is retained by SHA-256 at `data/derived/impact-repair/<prefix>/<hash>.json.gz`.
  Identical results reuse bytes; corrupt retained candidates fail verification.
- `possession_warehouse.record_repair_result_overrides`: actual v2 result/envelope
  verification, idempotent registry insertion through the existing
  `record_reconstruction_override` path and caller-owned transactions. V2 envelopes
  have a distinct type so v1 cannot interpret them as old starter arrays. The
  existing helper keeps its default commit behavior for legacy callers.
- PostgreSQL tests persist the seven **actual B19d game `0022500007` repairs** from
  the domain result, verify replay/idempotence, rollback and sealed-row protection,
  and reject a rehashed result containing a tampered repair before any write.

The audit does not create a production dataset, populate the owner's database or
admit/serve possessions. IM03 owns warehouse population, sealed season/phase
membership, possession outcomes and its conservation gates. It must extend the
existing orchestrator rather than call its historical delete/rebuild path against
sealed memberships. Bind only the accepted report's per-game candidate hashes,
not every retained development version. Preserve event-row identities and ordered
lineups at equal clocks when assigning points; v1's inclusive-clock attribution
is not evidence for v2 boundary scoring. New IM exposure uses an exclusive
`game_date < cutoff` condition. Full-period minute boxes are unavailable in the archive audit;
whole-game box minutes are checked, with native opening-box observations additionally
checked on the four retained B19d games. No unobserved period minutes are claimed.

## Measured acceptance boundary

[Coverage and every exclusion](coverage-summary.md) accounts for **3,941 games**:
**21 clean, 3,880 patched, 40 excluded**. The machine-readable
[summary](coverage-summary.json) includes per-season/phase rule counts, missing
cross-checks, unknown minutes and agreement distributions. The
[first full audit](audit-accepted-first.json.gz) retains every game ID, candidate
hash/reference, player-minute and plus-minus comparison, source arbitration and
input/code/policy hashes. Its content signature is
`c657a3c63929476fa60004be2e428d1310f771ebce6840e537aa6d61d38512cb`.
The first audit took **200.646 s**. The [second audit](audit-accepted-second.json.gz)
reproduced the entire content signature in **204.171 s**. An independent
[reproduction check](verification/reproduction.log) rehashed all **3,941 candidates**
and all **472,716 repair envelopes**, regenerated the summary, and checked the
current code/policy hashes. [Machine proof](reproduction.json) records the result.

`patched` includes explicit v3/CDN arbitration even when no lineup repair is needed.
All seven rule counters are reported separately; source schema differences are
not a count of missing substitutions. R3 needs no eligible event movement in the
final real archive population. Real same-clock regressions verify that a shooter
can finish free throws, leave after a timeout and return after a violation at the
same clock. Adversarial tests also exercise the incoming-shooter movement.

Regular-season reconstruction is **1,216/1,230 (2023–24)**,
**1,212/1,230 (2024–25)** and **1,227/1,230 (2025–26)**. Playoffs are
**81/82**, **83/84** and **82/85**. Every nonexcluded 2024–25 and 2025–26 known
player-minute comparison is within **0.5 s**. Four 2023–24 games use the <=30 s
minute tolerance; the maximum retained error is **23.2 s**. All 25 unavailable
2025–26 CDN playoff cross-checks remain explicitly unavailable, never agreement.

Box plus-minus exact agreement is **48.71–56.24%** across season/phase cohorts.
The 95th-percentile absolute difference is **2–3 points**, with a maximum **9**.
These are material source/order diagnostics retained with the candidate data,
not fitted away or treated as exact box agreement. IM02 imposes no acceptance
threshold on plus-minus or coverage. Later metrics must carry this limitation.

## Four B19d games and portable rule regressions

The [native replay](b19d-accepted-first.json.gz) rehashes all original observation
blobs and reproduces the retained **v1 content hashes** before running v2. All
**23 starter disagreements** become explicit R1 overrides: 6, 8, 5 and 4 for
`0022500007`, `0022500013`, `0022500025` and `0022501045`. Reconstructed starters
match the independent native rotation evidence in all four games. The real
`25:60` minute becomes 1,560 s under R5. All four games are patched, none excluded,
and their known player-minute errors are <=0.5 s. Their original evidence is intact.
The [second native replay](b19d-accepted-second.json.gz) is byte-identical.

[Curated fixture provenance](../../../tests/fixtures/impact_repair/README.md)
explains the archived failures used by the tests. Besides B19d, they cover the
2023 v3 schema with no `shotValue`, two actual missing substitutions in
`0022500568`, the 23.2 s minute tolerance in `0022300167`, distinct CDN substitution
runs in `0022501221`, and the legitimate same-clock shooter re-entry in
`0022400542`. Contradictory scoring in `0022500149` remains excluded. No tests need
network access or owner data. A forecasting regression rejects calls into impact
readers and checks unchanged point-in-time feature hashes/catalog inputs.

## Checks and reproduction

[24 unit tests](verification/unit-final.log),
[65 targeted checks](verification/targeted-accepted.log), including PostgreSQL
registry/stint tests and the 23 IM01 receipt tests, pass. Repository-wide
[Ruff](verification/ruff-final.log), [formatting](verification/format-final.log)
and [strict mypy](verification/mypy-final.log) pass; mypy checks 187 source files.
The [first complete suite](verification/python-accepted.log) has **1,646 passes,
zero failures/errors**, one documented isolated-Next-browser skip, 19 explicit
published-data deselections and the existing google-genai deprecation warning in
**308.97 s**. The [final complete suite](verification/python-final.log), including the
strengthened registry fixture that round-trips all seven actual domain envelopes,
again has **1,646 passes, zero failures/errors**, the same documented skip,
deselections and SDK warning in **304.50 s**. Both runs used separately migrated
disposable PostgreSQL 17 instances, empty runtime data and no owner dotenv/keys.

```bash
.venv/bin/python -m courtlens.ingestion.impact_repair_audit \
  --observation data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json \
  --output /tmp/im02-new-audit.json.gz
.venv/bin/python -m courtlens.ingestion.impact_repair_audit \
  --native-b19-root data/raw/b19d-native-accepted-20261005 \
  --output /tmp/im02-new-b19d.json.gz
.venv/bin/python scripts/test_python.py -ra
```

Output paths must be new. Repeated archive audits retain identical per-game
candidates; elapsed runtime is observation metadata excluded from the report's
reproducible content signature. The accepted report's code and policy hashes must
match the current files. Dashboard/browser changes are outside IM02; the ordinary
suite's existing Next-browser skip stays separately documented by QA01.
