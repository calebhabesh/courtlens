# IM07 — impact agent and evaluation

Parent: [impact handoff](../../impact-metrics-plan.md).
Contract: [impact agent v1](../../design/impact-agent-v1.md).
**IM07 is verified.** The [acceptance seal](acceptance.json.gz) binds the final implementation, new
corpus/fixtures, original input acceptances and measured evidence below. Live
language quality remains unmeasured after the configured Gemini provider hit quota.

## Implemented behavior

New Ask turns use `courtlens-agent-prompt-v2` and the `courtlens-stats-v3` catalog.
The warehouse covers CourtLens RAPM/ORAPM/DRAPM, BPR, on/off, six factors and defined
extras through the existing `query_stats` and `list_metrics` tools. No new tool,
source acquisition, fitting, migration or forecasting feature is introduced.
DPM remains a distinct external model. Definitions distinguish fit windows, units,
samples, descriptive confounding and unavailable cells/scopes.

Impact operations pin the retained serving bundle. Results/evidence retain artifact
identities, cutoff, coverage, qualification/support, source, methodology and exact
metric units/versions. Explicit impact query windows also update reported scope,
even when a page/thread inherited a short window. Only requested support columns enter the bounded provider
payload. Support metadata has its own units; nonzero support cannot establish an
available coefficient when the actual metric cell is null. The bounded web audit
checks actual cells with matching season, phase and cutoff, including possessive
RAPM wording. Positive and absent/null/earlier-cutoff controls pass.

Historical v1 provider requests select the retained original prompt and catalog
for exact replay, with no relaxed request/schema/tool/audit comparisons. The legacy
prompt is byte-identical to the pre-IM07 version. Existing frozen transcripts are
not regenerated. Ask's field-unit lookup now recognizes `/items/…` evidence paths,
so real RAPM/sample labels display their supplied units.

## Corpus and original-source oracles

`evaluation/assistant/ag-v3-im07.json` is a new revision:
`bf367cbcffd4e8e3a13b3dc074ff76cc98376aa9a49173cf97bf04782225fb2f`.
It contains **215 cases: 191 development and 24 unchanged holdout**. Five development
RAPM/DRAPM web cases become warehouse oracles. Eleven added development cases cover
ORAPM, 2Y/3Y RAPM, on/off, all six factors and BPR. Every unrelated old development
case and every holdout object remains unchanged. The loader checks the parent hash
and rejects even rehashed holdout edits. DPM remains external. No holdout inference.

Independent expected coefficients/support come from the **12 original IM04** sealed
artifacts, rehashed against their acceptance and compressed-byte checksums.
Independent SQL joins those coefficients to the release's observed box cohort and
checks identity, order, qualification and exact sample counts. On/off is independently
recomputed from original scoring/control totals, never copied from the serving
projection. Source date gates require every original game before the query cutoff.

[Final real-data replay](verification/replay-sealed.json), using the
[retained capture](verification/accepted-capture/report.json):
**48/48 exact answers**, **16 development questions × 3 replays**, zero unsupported
numbers and **zero missed warehouse overrides**. These are explicitly authored
transport fixtures over real PostgreSQL/artifact values, **not language accuracy**.
All provider requests and executed payloads are compared exactly.

The [owner example](verification/owner-example-accepted.json) returns Victor
Wembanyama's 2025-26 1Y RAPM **9.123015906749517**, shown as **+9.1230** with a CourtLens
warehouse chip, 63 covered games and the original artifact binding. [Desktop/mobile
screenshots](screenshots) use that real recorded response through mocked thread
transport, at **1440 and 375 px**. Both assert the visible unit, source chip, pinned
analysis link and no document overflow. They do not represent live model inference.

## Live attempt and limits

[Live development attempt](verification/real-agent-final/report.json) uses the
existing configured **Gemini `gemini-3.5-flash-lite`** alias for the owner's RAPM
question. It stopped at **1/3 planned turns** with `provider_quota`, retry hint
**60 seconds**, without retry, model change or provider substitution. The limited
fallback does not count as provider accuracy; **0 complete three-run questions**,
no reported token/search usage and unknown cost. Other providers were not invoked.
AG07's live baseline/cleanup gate and AG08 acceptance remain unchanged. IM08 remains
planned and separate.

## Verification

- [Full Python](verification/python-sealed.log): **1,795 passed**, zero failures or
  errors, **279.74 s**; one existing isolated-browser skip, 19 explicit published-data
  deselections and the inherited google-genai Python 3.14 deprecation warning.
- [Agent controls](verification/agent-accepted.log): **96 passed**, including the
  unchanged AG06 exact replay and impact source/cutoff/null/audit/scoring controls.
- [Ruff](verification/ruff-sealed.log),
  [formatting](verification/format-sealed.log),
  [strict mypy](verification/mypy-sealed.log): pass, **202 source files**.
- [Dashboard lint](verification/dashboard-lint-sealed.log),
  [types](verification/dashboard-types-sealed.log),
  [Vitest](verification/vitest-accepted.log): pass, **286 tests / 39 files**.
- [Production build](verification/build-accepted.log): pass, isolated webpack build.
- [Browser regression](verification/browser-sealed.log): final fixture regression
  plus the two IM07 real-recorded response cases: **231 passed, 15 skipped**. The existing external-server-only
  skips remain; browser startup records the existing Next standalone launch notice.
- [Compose configuration](verification/compose.log) and diff whitespace checks pass.

Python relational writes use disposable migrated PostgreSQL only. Real agent
verification enforces PostgreSQL `default_transaction_read_only=on`, including
spawned SQL workers. Dashboard build/browser runs use an isolated copy; historical
screenshot suites write there, preserving sealed DL/IM evidence. Original 3100,
3200 and 8020 services are not redeployed.

[Preservation](verification/preserved-state.json): **2,878 prior evidence/corpus/
fixture files unchanged**, legacy prompt byte equality, and unchanged public
release/snapshot/dataset/semantic identity matching IM06. Owner dotenv, source
memberships, rating/extras artifacts, frozen experiments and forecast inputs are
preserved. No Databallr request occurred. Development captures/failures remain
historical, separate from the final evidence selected by acceptance.

## Reproduction

```sh
.venv/bin/python scripts/test_python.py -ra
.venv/bin/python scripts/verify_im07_agent.py \
  --recordings docs/evidence/im07/verification/accepted-capture/transcripts \
  --output /tmp/im07-replay.json
# Optional bounded live dev evaluation; no holdout inference:
.venv/bin/python scripts/evaluate_agent.py --case-id ag06-web-01 \
  --output /tmp/im07-live-dev.json
```

Replay needs the retained configured bundle and publication. Reports/transcripts
are exclusively created; choose new output paths. The standard live runner now
defaults to the separate IM07 revision/transcript directory; explicit AG06 corpus
paths retain historical scoring/replay compatibility.
