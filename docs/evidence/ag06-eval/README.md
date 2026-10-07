# AG06 — v3 evaluation and replay

Evaluation tooling is implemented and verified offline. **Live development
measurement is incomplete**: Gemini returned `provider_quota` on the first case;
Anthropic and OpenAI have no configured key. No provider was retried or substituted.
AG07's measured quality prerequisite remains unmet; no pipeline cleanup occurred.

## Frozen corpus

`evaluation/assistant/ag-v3.json` was frozen before scorer work or prompt tuning.
Its SHA-256 is
`308d3973d0d31add2ecf5d3964213a60ae8331014beb80ee5e6d7f2e636be7c4`.
The corpus contains 204 cases: 180 development and 24 fresh holdout. All 150 v2 IDs
retain `v2_expected_status` and `v2_split`; all exposed v2 cases are development
cases. Web has 22 development and 6 holdout cases; conflict has 10 development
cases. Injuries now require web citations, guards require `position_query`,
ambiguous cases require an assumption, and prohibited actions require refusal.
The fresh holdout was not inferred. The system prompt was not tuned or changed.

The independent SQL oracle is retained from AR02. V3 scoring checks result cells,
ordering, identity, exact sample counts, selected and executed scope, display
tolerance, comparisons and registered forecast evidence. A missing issuance needs
the actual `forecast` tool's `no_issuance` result. General/mixed answers require
keywords and no unsupported numbers. Web sources must be cited in the answer;
source presence alone does not pass. Limited fallback is excluded from provider
accuracy. Every report includes all required metrics, with null for unmeasured
denominators, incomplete three-run flakiness and unknown cost.

## Measured development attempt

```bash
make eval-assistant PROVIDER=gemini \
  ASSISTANT_EVAL_ARGS='--output docs/evidence/ag06-eval/gemini-dev.json'
```

`MODEL=` explicitly overrides the configured model. The owner's existing Gemini
model alias, `gemini-3.5-flash-lite`, was preserved for this attempt. The command
plans three development repetitions, records full safe provider requests/responses
and tool payloads under `evaluation/assistant/transcripts/ag-v3/`, and stops at the
first provider failure. Artifacts are exclusively created; existing reports are
never overwritten. Holdout inference requires the explicit AG08 opt-in flag.

| Provider | Measurement |
| --- | --- |
| Gemini | 1/540 attempted turns; `provider_quota`, retry hint 60 seconds; 0 complete three-run questions, 0 observed web searches, no usage reported |
| Anthropic | 0/540 turns; `provider_disabled`, no key; unmeasured |
| OpenAI | 0/540 turns; `provider_disabled`, no key; unmeasured |

[Final metric summary](final-summary.json) retains each original report's checksum
and summarizes the same observations with the final scorer. Original reports are
retained unchanged; the final summary corrects the draft's all-unknown-cost total
to null and includes mean known cost per turn. It does not repeat provider calls.
The single Gemini limited fallback answered with warehouse data, but scores zero
for provider accuracy. Its 1309.86 ms latency and zero *reported* tokens do not
establish a model quality, search, cost or throughput baseline. Refusal/citation
precision and recall, flakiness and the absent-key providers remain unmeasured.

The retained AR02 fixture warehouse baseline is **255/279 (91.40%)** across leaders,
single-player, compare, follow-up, forecast and mixed categories. There is no
complete v3 live baseline to compare with it and no recorded owner acceptance of
a quality gap. This is AG07's explicit gate in the handoff, not a discretionary
approval request. Rerun into new evidence paths when a configured provider can
complete the development repetitions before deleting the old pipeline.

## Replay and verification

The fixed development subset contains **33 cases across 11 categories**, with 36
compressed JSON transcripts including follow-up setup turns. These are explicitly
**authored transport fixtures, not captured live inference or language accuracy**.
They exercise real SQL over a deterministic private publication; no synthetic
transport score is used to satisfy the AG07 live baseline. The only live transcript
is the quota-stopped Gemini request. A manifest binds each fixture artifact to its
SHA-256 and the frozen corpus digest.

`ReplayProvider` compares the complete provider request and the executed tool/audit
payload exactly. The replay test also changes a retained warehouse cell and proves
that it raises a payload-drift error. No live inference runs in pytest.

| Check | Result |
| --- | --- |
| Capture boundary | 34 passed: 33 authored cases plus payload-drift control |
| Replay in a separate fresh PostgreSQL instance | 34 passed |
| Scoring and corpus controls | 6 passed |
| Full Python suite at clean `3f72211` | **1596 passed, 0 failed, 0 errors**, 1 documented browser skip, 19 published-data checks deselected; 312.48 s |
| Ruff / formatting | Clean isolated AG06 snapshot; 529 files formatted |
| Strict mypy | Clean isolated AG06 snapshot; 184 source files |

Full-suite evidence is recorded in the agent progress log and `verification/`.
The clean AG06 verification snapshot is `3f72211`, based on QA01's `18b76e0`.
Concurrent DL/IM edits and the owner's TODO are excluded. The later runner setup
failure guard is separately checked; it does not alter the agent or replay path.
The current shared checkout still reports 11 Ruff errors and two formatting
failures in DL's uncommitted `scripts/split_css.py` and `scripts/verify-contrast.py`.
Those files were neither edited nor committed by Lane 2; clean lane verification
does not certify concurrent lane changes. The shared static-check logs are retained.
No dashboard, owner environment, publication, provider prompt, sealed v2 fixtures,
AR evidence or old corpus was modified. AG08 acceptance remains pending.
