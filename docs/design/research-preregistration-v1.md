# B25 external bindings and CourtLoad preregistration v1

Registered 2026-10-03. Parent: [replica analytical contract](replica-analytics-contract.md), B25. Preserve [points-v1](points-forecast-protocol.md), retained experiments and publication independently.

## Boundary and actual state

B25 registers four bounded **designs**, not fitted models. The [fresh retained-input preflight](../evidence/b25-input-preflight.json) still has zero stints, no eligible shots/assignments in the inspected 2023–24 finalized release, and no DARKO crosswalks. It does not establish other seasons' coverage. [External-output inspection](../research/b25-external-output-spike.md) leaves DARKO admission `source_blocked`. Exact input and split memberships are **unbound**. No evaluation, acquisition, import, publication, policy activation or model fitting is authorized by the registration utility.

B25's design/validation implementation is verified separately from source-dependent completion. Its full gate remains `source_blocked`: exact chronological memberships cannot be claimed frozen until coverage is independently admitted and bound. B26 must stop at its input gate until that happens. The registry contains no fabricated external ratings or local coefficients.

## Frozen designs

The machine-readable JSON documents are the authoritative recipes; their hashes are in the [registration manifest](../evidence/b25-registration-manifest.json).

| Protocol | Outcome and fixed candidates | Required inputs / explicit limit |
| --- | --- | --- |
| [courtload-rapm-v1](../../evaluation/research/protocols/courtload-rapm-v1.json) | Exposure-weighted stint points per 100 offensive possessions; player ridge alpha 10/100/1000 against league/home and team/context baselines. | Reconciled constant five-versus-five stints, event points and fractional offensive possessions. Opponent defensive coefficients increase points allowed; lower is favorable. No causal isolated-skill claim. |
| [courtload-six-factor-v1](../../evaluation/research/protocols/courtload-six-factor-v1.json) | Three weighted rate regressions, shared alpha 10/100/1000, separate offense/defense coefficients. | Jointly valid event-attributed conventional TS, turnover-opportunity share and offensive-rebound-opportunity share. Existing stint points alone are insufficient. Rates have distinct denominators; six coefficients are not an additive overall rating. |
| [courtload-expected-shot-v1](../../evaluation/research/protocols/courtload-expected-shot-v1.json) | One fixed L2 logistic location/type model and intercept calibration against training zone/type Beta(1,1) baseline. | Located, uniquely identified observed field goals, valid type/distance, complete game reconciliation. No player ID, tracking, defender proximity, foul value or vendor identity. |
| [courtload-adjusted-shooting-v1](../../evaluation/research/protocols/courtload-adjusted-shooting-v1.json) | One descriptive prior-playtype-reference adjustment against unadjusted scoring-opportunity efficiency. | Admitted playtypes and exact scoring-opportunity/foul-trip taxonomy and reconciliation. Unknown playtypes remain unknown; no future-year filling, zTS branding or predictive promotion. |

Every document freezes estimand/units, target/feature recipes, exclusions, sample gates, train-only preprocessing, baseline/candidates, seed, selection/tie rules, uncertainty/error slices, acceptance, serving limitations and retained artifacts. Feature/model recipe identity is the experiment version plus the exact protocol content hash; changing any recipe requires a new registration and binding.

## Chronology and binding before evaluation

At least three independently reconciled complete regular seasons are required. Sort those eligible seasons: latest unexposed completed season is final, immediately preceding eligible complete season is validation, all earlier eligible complete seasons are training. **Do not skip an exposed latest season to manufacture an unexposed earlier final.** If final exposure cannot be ruled out, stop and register an honest future final horizon or retrospective-only amendment before comparing candidates. Existing 2023–24 and retained points evaluation results have been inspected; no claim of an untouched historical final is made here.

Before any candidate comparison, freeze a `courtload-research-binding-v1` document with exact experiment/protocol hash, dataset-content/source-membership/transform/coverage-report hashes, final-exposure audit hash and complete-season/game membership. Each unique ten-character NBA game ID carries date, season, role, positive eligible row count and SHA-256 of its sorted normalized row membership. Actual row manifests and coverage/audit bytes must be retained and independently verified; a hash string or `source_gates_verified:true` assertion alone is not admission evidence. The binding validator rejects duplicated games, shared/out-of-order dates, wrong role-season membership, invalid season dates, missing roles, exposed finals, insufficient seasons, protocol mismatch and row-budget overflow. It cannot establish source truth from these declarations.

Whole games and dates stay in one chronological role. For expected shots only, sort validation's distinct game dates; boundary is date at zero-based index `len(dates)//2`. Dates strictly below boundary form selection; boundary and later dates form calibration. This rule must be materialized as two exact sub-membership manifests before evaluation, with their hashes recorded alongside the full validation membership. An insufficient half fails its frozen sample gates; never move the boundary after inspecting errors. Select on the earlier half, calibrate on the later half without refitting, evaluate the final once. Other experiments use the entire validation season without calibration.

A later source correction produces a new binding with new hashes. Frozen evidence cannot be silently revised. The standalone utility validates schemas and retains declarations only; B26 must independently reconcile all referenced bytes, complete-season coverage and exposure audits and implement these enforcement steps in its offline runner. No HTTP endpoint fits or serves a registration.

## Local compute limits

The B00 record did not retain an explicit hardware specification. A fresh B25 probe reported AMD Ryzen 7 9700X, 8 cores/16 logical CPUs, 61,915 MiB physical RAM and approximately 13,916 MiB available during inspection; other services were running. Choose conservative caps of **2 CPU threads, 4,096 MiB total peak RSS and 1,800 seconds for the entire experiment**, including preprocessing, baselines, all candidate fits, calibration and uncertainty. These are fixed limits chosen against observed hardware, not measured fit consumption. Each attempt records rows/dimensions, peak aggregate process/child RSS, wall time and failure reason. The B26 runner must enforce process/thread/memory/time bounds; B25 validates their declaration only. Sparse lineup matrices are mandatory.

All input rows together must be <=1,000,000; design columns <=5,000. RAPM allows three player fits; six-factor allows nine target fits (three targets times three shared alphas); expected shot allows one candidate plus one calibration fit; descriptive adjusted shooting allows one calculation. Baseline computations and 200 frozen-prediction game-cluster error bootstraps count toward the same total time/memory cap; bootstraps do not refit candidates. Exceeding a cap records a limited/failed experiment. Any larger budget or added candidate requires a new preregistration before further evaluation. These caps cannot monopolize the Live worker or activate the points policy.

## External-output metadata contract

`courtload-external-output-v1` preserves provider/model/model-version evidence, immutable output version, raw-source hash/URL, access/reuse evidence hashes, attribution, effective date, input horizon, optional actual publisher timestamp and mandatory timezone-aware actual observation time. Values have registered provider-player/metric/unit identity, finite numbers or explicit null reasons. Canonical NBA identities require provider NBA IDs or separately verified crosswalk evidence with observation timestamps; name similarity is not an allowed mapping method. Duplicate provider identities, multiple provider IDs mapping to one NBA player and duplicate player/metric rows are rejected. Identity evidence cannot postdate the bound output observation.

Independent gates require model-version/access/reuse/input-horizon evidence, nonempty output, complete row mapping, effective/input dates strictly before the research cutoff and observation strictly before the knowledge boundary. A current retrieval cannot pass a historical knowledge boundary by supplying an older effective or publisher date. A publisher timestamp is optional when genuinely unknown; it never replaces actual observation. All outputs are classified `external_forecast`, distinct from local models. Financial value conversion needs a separate admitted output/model and matching financial coverage.

A metadata-valid declaration is **not** admitted data: B26/later import must verify evidence bytes, their meaning/allowed uses, raw parser and every normalized identity/value against source bytes before database admission. B25 supplies no provider parser, live download task, historical backdating override or external serving integration. These are gated pending the legitimate export/reuse/version spike. No universal legal conclusion follows from a blocked repository reuse gate.

## Reproduction

From the repository root:

```bash
.venv/bin/python -m courtload.evaluation.research_registration \
  evaluation/research/protocols/courtload-rapm-v1.json

# Explicit offline retention; an existing changed artifact is never overwritten.
.venv/bin/python -m courtload.evaluation.research_registration \
  evaluation/research/protocols/courtload-rapm-v1.json \
  --retain-under data/artifacts/research-registration

# After independent source admission and exposure audit, validate binding declarations.
.venv/bin/python -m courtload.evaluation.research_registration \
  evaluation/research/protocols/courtload-rapm-v1.json --binding /path/to/binding.json

# External metadata requires two explicit exclusive boundaries; blocked declarations exit 2.
.venv/bin/python -m courtload.evaluation.research_registration \
  /path/to/external-output.json --external \
  --before-date 2026-10-04 --known-before 2026-10-04T04:00:00+00:00

.venv/bin/pytest tests/unit/test_research_registration.py -q
```

Documents/bindings are bounded to 8 MiB. Internal design retention reports `design_registered_input_memberships_unbound_no_fit_authorized`. External/binding metadata success still reports required independent evidence verification. Blocked external metadata is never retained by the command. Content-addressed retained artifacts use exclusive creation and exact-byte checks; portable hashes contain no local file paths. No database migration or public API/UI contract changed in B25.
