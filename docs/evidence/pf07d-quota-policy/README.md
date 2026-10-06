# PF07d quota policy and first real-model evaluation

2026-10-06. The owner clarified the cost policy and supplied an AI Studio screenshot confirming
that the configured NBA-Analytics key belongs to a Free-tier project. **Account eligibility and
call authorization are resolved. PF07d remains partial because measured model planning accuracy
is below its gate.** Historical PF07d/PF08a evidence is retained; this directory records the delta.

## Policy and source verification

- The owner's installation uses eligible free Gemini inference and provider-enforced quotas,
  with no separate CourtLoad daily/lifetime usage allowance or per-evaluation call-count approval.
  Other installation owners may explicitly use paid accounts at their own expense. Paid Gemini
  keys work with the current adapter; additional vendors require compatible adapters and are
  separate implementation work. The free core/manual paths do not gain a paid dependency.
- Google's limits include RPM, input TPM and RPD; they are applied per project rather than per
  API key. Active quotas vary by model/project and are viewed in AI Studio. A timeout is distinct
  from quota exhaustion; no provider/model/billing fallback or retry loop is enabled.
  [Official rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
  [official failure distinctions](https://ai.google.dev/gemini-api/docs/troubleshooting).
- AI Studio's Billing Tier column establishes project status; a key's presence, public pricing
  or a successful call alone cannot prove free account eligibility.
  [Official billing verification](https://ai.google.dev/gemini-api/docs/billing#verify-billing-status).
  The configured model lists free input/output on the Free tier.
  [Official pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite).
- The owner's screenshot and explicit confirmation were checked against the displayed key suffix.
  [Eligibility record](free-project.json) retains the date, screenshot SHA-256, verification method
  and boolean match only. No full API key, credential hash or full account screenshot is retained.
- The evaluator now requires only `verified_free`, `checked_at`, `verification_method`, configured
  credentials and explicit real-provider opt-in. `authorized_calls` and the mandatory 24-call cap
  are removed. Default scope is the finite frozen corpus; optional `--max-calls` is a smoke-test
  stop. Existing per-turn execution bounds, provider timeout, pacing, no-retry behavior and
  refusal to overwrite evidence remain intact. Normal runtime had no daily call allowance to remove.

This is a sequential Codex-owned policy/evaluation delta, without delegation. Existing dirty
work is preserved. Owned changes: evaluator script, new quota-policy unit tests, assistant/freeze
contracts, progress log, README, `.env.example` and this evidence directory. No provider prompt,
model selection, corpus, analytical formula, schema, migration, data source or dashboard UI changed.
[Starting hashes](starting-files.json).

## Actual measurement

[Raw real-provider report](real-provider.json), [command log](real-provider.log).
The unchanged `pf07d-hybrid-v1` corpus has 49 cases with 12 originally held-out cases.
One synthetic empty-scope case is inapplicable to retained inputs and remains separately verified;
it is not counted as a real-provider success. The run completed every other case, using read-only
retained PostgreSQL transactions and approved deterministic source/knowledge paths.

| Measurement | Outcome |
| --- | --- |
| Actual model calls | **10**, observed model `gemini-3.5-flash-lite` |
| Actually model-evaluated canonical accuracy | **7/10 = 70%**, below 90%; language gate **unmet** |
| All applicable cases | **48 completed, 45 canonically correct**; this is not a language-accuracy denominator |
| Readable responses / exact evidence safety | **48/48** each |
| Critical inability/clarification | **16/16 correct** |
| Answer-required external facts | **4/4 correct**, independently scored |
| Applicable original held-out cases | **10/11 correct**, now observed regressions |
| Provider quota/timeouts/errors, retries or fallback | **0** |
| Recorded tokens | **52,476 input**, **1,875 output**, **54,351 total** |
| Provider latency | Maximum **2,911.088ms**, sum **18,863.588ms**; not full-service resource acceptance |
| Required backend checks | **341 passed**, zero failures/skips/warnings. [Log](backend-tests.log) |
| Dashboard tests | **188 passed**. [Log](dashboard-tests.log) |
| Ruff/format/strict mypy/generated contract/diff | Pass. [Ruff](ruff.log), [format](format.log), [mypy](mypy.log), [contract](contract.log), [diff](diff-check.log) |
| Artifact preservation | **316 hashes unchanged**. [Record](preservation.json) |
| Read-only retained reproduction | **185 outcomes unchanged**, same 48 prior mismatches; **33/33 saved v1 conversations reproduce**. [Record](retained.json), [log](retained.log) |

The three mismatches (`pf07d-30`, `pf07d-37`, `pf07d-38`) share one defect: a scoring-table
request added `min_per_game` alongside the requested `pts_per_game`, whereas the frozen manual
operation selects scoring only. Returned numbers were evidence-bound, but operation/result
identity was not canonically equal. Do not relax the scorer, remove the extra-column checks,
change frozen expectations or count readable answers as exact equivalence. One failure was
originally held out; after observation it is regression evidence for a later repair. The first
run is retained unchanged, with no prompt tuning or further inference in this block.

The new eight policy tests use fake providers, including a 25-call stub test that proves the
old default cap is gone. Those are **not** additional real inference calls. A first test harness
import failed because `scripts` is not on pytest's import path; loading the existing runner by
its actual file path fixes collection. [Focused tests](tests.log).

## Reproduction and boundary

```bash
.venv/bin/python scripts/evaluate_pf07d_hybrid.py /tmp/pf07d-new-provider-report.json \
 --real-provider --free-project-evidence docs/evidence/pf07d-quota-policy/free-project.json
.venv/bin/pytest tests/unit/test_hybrid_evaluation_quota_policy.py tests/unit/test_hybrid_evaluation.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard test
```

Recheck project status before a later run; preserve earlier evidence and use a new output path.
Next bounded work is fixing scoring-only planning and evaluating that repair under the retained
regression/independent-holdout rules. The existing opt-in PF08a preview is not full PF08 acceptance.
PF09 and original replica source/model/finance/Live gates remain open. No billing changes,
paid tools, publication, data acquisition/admission, training or retained personal history mutations
occurred. The key/project was neither changed nor displayed in logs.
