# IM06 serving and UI evidence

Parent: [impact metrics handoff](../../impact-metrics-plan.md).
Contract: [impact serving v1](../../design/impact-serving-v1.md).
**IM06 is verified.** [Sealed acceptance](acceptance.json.gz) binds implementation,
source acceptances, the reproduced serving bundle and measured evidence below.

## Served behavior

The exclusively-created serving bundle projects the 12 sealed IM04 rating artifacts
and six sealed IM05 extras artifacts. Two fresh builds reproduce the same SHA-256:
`2cd9c98b2594d948edc2c574e082e1b8b06ff4d6bfeca294f87e8062eae76d48`.
[Retained compressed bundle](serving-manifest.json.gz),
[first receipt](verification/reproduce-a.json), [second receipt](verification/reproduce-b.json).
These builds rehash both pinned acceptances, every sealed evidence file and source
artifact. No source acquisition or fitting runs during serving.

The v3 catalog adds **68 metrics**: 18 rating/window columns, six favorable-sign
factor coefficients, six per-team on/off rates/differences and 38 IM05 extras.
Default/v1/v2 metric responses preserve their previous definitions. QuerySpec can
request the v3 columns through selectors, presets, sorts and predicates. SQL joins
the bounded immutable payload before filtering, ranking, cohort windows and paging.
Unmatched players receive explicit null values and zero covered-game samples.
Qualification controls sorting and percentiles; unqualified extras retain their
descriptive values. Name filtering never changes the eligible percentile cohort.

Only fully observable single-season scopes with a season window select these final
fits. Every artifact's last included game must precede the query's exclusive cutoff.
Short/date/multi-season query windows and earlier cutoffs report unavailable. 2Y/3Y
are explicitly labeled fit windows ending in the selected season. On/off retains
separate traded-team references; team-filtered ratings retain their full-league fit,
while full-season extras are withheld. Saved impact investigations pin the retained
bundle and replay it after the configured default changes. Custom views explicitly
opt into v3; retained v2 views and unavailable-column declarations remain valid.

Stats ungates Impact, On-Off and Six Factor; Defense, Advanced and True Shooting
include their defined extras. The player impact card and `/research/rapm` share the
bounded serving endpoint. The research page retains the B26 experiment status beside
the descriptive rating table. Coverage, patch rate, fit windows, support samples,
methodology, confounding and wave-2 source gaps remain visible. Undefined residual
and PVAL are not presented as measurements. No third-party model values are fetched.

## Independent real-data checks

[Independent verifier](../../../scripts/verify_im06_serving.py) reads the sealed
artifacts directly, independently computes on/off from scoring/count-control totals
and compares paginated real PostgreSQL API rows with the original source values.
It does not call the serving projection or its selection helpers.
[Measured report](verification/real-serving.json): **166,260 values/nulls matched**
over **2,445 box-player cohort memberships**, across all six scopes:

| Season | Regular-season players | Playoff players |
| --- | ---: | ---: |
| 2023-24 | 586 | 229 |
| 2024-25 | 577 | 232 |
| 2025-26 | 591 | 230 |

The report also checks page uniqueness/completeness, name-filter cohort invariance,
exclusive cutoff and short-window gates. Victor Wembanyama's 2025-26 1Y RAPM is
**9.123015906749517**, matching the IM04 artifact. Complete-cohort presentation took
**2.163 s**, name-filtered presentation **1.864 s** on the local read-only scratch API;
these are observed local timings, not an SLA. The implementation computes only
requested impact percentiles over the entire eligible cohort.

## Validation

- [Python full suite](verification/python-final.log): **1,778 passed**, zero failures
  or errors, **291.11 s**; one documented isolated-browser skip, 19 explicit
  published-data deselections and the existing google-genai Python 3.14 deprecation
  warning. No xfails or relaxed frozen replay assertions.
- [SQL/saved-view checks](verification/targeted-final.log): four PostgreSQL tests pass,
  covering sorting/paging/predicates/export, qualified percentiles, unknown rows,
  pinned saved replay after bundle replacement and custom v3 view creation.
- [Ruff/format](verification/ruff-final.log), [strict mypy](verification/mypy-final.log),
  [dashboard lint](verification/dashboard-lint-final.log),
  [TypeScript](verification/dashboard-typecheck-final.log) and
  [Compose config](verification/compose-final.log): pass.
- [Vitest](verification/vitest-final.log): **285 passed**, 38 files.
- [Production build](verification/dashboard-build-final.log): pass in an isolated
  copy with webpack; Turbopack rejects a dependency symlink outside its scratch root.
- [Browser regression](verification/browser-regression-final.log): **229 passed**,
  15 intentional skips (two AR07 real-service cases, workspace external persistence,
  and 12 IM06 real-service cases executed separately below).
- [Real-service browsers](verification/browser-real-final.log): **12 passed**,
  **14 screenshots**.
  [Screenshots](screenshots) cover Stats presets, player impact, research/B26 and
  the earlier-cutoff unavailable state at **1440 and 375 px**. Numeric cells are
  compared with the real serving endpoint; both widths assert no document overflow.
  Desktop/mobile captures were visually inspected. The profile's existing trend
  card minimum width was adjusted to fit 375 px using design tokens and scoped CSS.

## Reproduction and preserved state

Install/reproduce the supplement from retained source evidence:

```sh
.venv/bin/python scripts/build_impact_serving.py
.venv/bin/python scripts/generate_impact_contract.py
.venv/bin/python scripts/test_python.py -ra
.venv/bin/python scripts/verify_im06_serving.py --api http://127.0.0.1:8020 \
  --output /tmp/im06-real-serving.json
```

`COURTLENS_IMPACT_SERVING_MANIFEST` selects a retained JSON address; Docker binds
the serving directory read-only. An absent bundle gates the capability; a changed
addressed file fails integrity checking with 503. Changing the active bundle is a
configuration choice, preserving the previous file and all pinned investigations.

The real-data API ran on scratch port 8020 with PostgreSQL
`default_transaction_read_only=on`. UI verification used scratch port 3200; full
browser regression and production build used an isolated dashboard copy on 3201
with its own mock API. Historical screenshot suites wrote into the scratch evidence
directory, preserving existing DL evidence. Python writes used disposable migrated
PostgreSQL and temporary artifact directories. Owner dotenv, database, datasets,
public pointer, frozen experiments, forecasts and existing Docker services were
not mutated or redeployed. No database migration or dbt change is part of IM06.
[Before/after publication identity](verification/preserved-state.json) is unchanged.
[Pin transport checks](verification/pin-transport.json) preserve URL/legacy roundtrips
and the frozen planner schema/default serialization.

Development logs include corrected regressions to legacy catalog defaults and
frozen provider schemas, an unmatched-player null omission, scratch build setup and
the new-view catalog handshake. Final logs determine acceptance. IM07 agent/catalog
prompt/eval work, IM08 dated refreshes and AG08 remain outside this bounded block.
