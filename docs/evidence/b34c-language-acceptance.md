# B34c — real Gemini language acceptance

2026-10-04. **Verified for the owner-approved `gemini-3.5-flash-lite` configuration.**
This closes B34's measured language gate for this model and retained input context.
It does not certify Flash latest, other datasets, arbitrary language or the full replica.
Current Codex session; no delegated agents or implementation-model overrides.

## Acceptance

| Check | Measured result |
| --- | --- |
| Frozen original corpus | **45/45**: 25 supported, 10 clarification, 10 prohibited/unsupported |
| Final Stats query recheck | **7/7**, same canonical scope and exact current manual result hashes |
| Post-repair paraphrase corpus | **12/12**: 8 supported, 2 clarification, 2 prohibited |
| Finance/empty-season supplemental cases | **6/6**; five model calls and one explicit manual finance operation |
| Production browser demonstrations | **3/3**, exact manual result hashes, zero page errors |
| Every retained conversation analysis | **33/33 reproduce**, zero provider calls |
| Full Python suite | **621 passed, 125 opt-in skips**, zero reported warnings |
| Focused PostgreSQL conversation/saved tests | **27 passed**, no skips or warnings |
| Archive Stats/conversation checks | **108 passed** |
| Ruff / format / strict mypy / Compose / harness syntax | Pass; 343 formatted files, 144 typed source files |

[Verification manifest](b34c-verification.json),
[completed core evidence](b34c-language-final-core.json),
[paraphrases](b34c-holdout-final.json),
[supplemental evaluation](b34c-supplemental-accepted.json),
[production browser](b34c-browser-final/verification.json),
[retained reproduction](b34c-retained-accepted.json).

The final full language run passed all 45 cases with 45 calls. Seven query cases were
then rechecked after narrowing the Stats correction to archive data; all passed and
match the final provider-free fixture baseline. The completed core artifact therefore
accounts for **52 actual calls**, without replacing any failed semantic case in that run.

The original held-out failures were inspected during diagnosis. They are regression
cases now, not unseen validation. The additional twelve questions were frozen before
their first inference and were not tuned from their outputs. Their first and final
runs both passed. V1 had an invalid fixture clarification literal; V2 fixes it before
any provider evaluation, preserves the questions, and retains both checksum files.

## Changes and production behavior

Planner instructions now agree with the registered similarity argument, leave optional
defaults intact, select only requested ranking columns, and avoid double normalization.
Server-side exact player-name resolution applies to every registered player argument.
A bounded canonical thirty-team catalog supplies team identities. Clarification precedence
preserves unnamed defensive metrics, ambiguous consistency, teammate attendance versus
shared court time, and explicit context changes. Explicit scoring/minutes variability
executes paired historical distributions. SQL/web/writes/credentials/refresh/training
and unsupported position restrictions cannot be silently translated into other queries.

Automatic SDK function calling is explicitly disabled. Server validation, execution,
rendering, budgets, secret handling and lack of automatic provider/paid fallback remain
in force. The provider-free SDK test narrowly filters one known Python 3.14 deprecation
from `google.genai.types`; it does not suppress application warnings.

The owner approved the recommendation to use Lite after acceptance. Local ignored
`.env`, Python defaults, Compose fallback and the documented example now select Lite.
Credential lines are preserved and `.env` remains mode 0600. The fresh API status reports
configured Lite. The frontend receives the model name, never the credential.

[Production Ask view](http://127.0.0.1:3137/research/ask) reuses the retained B36b Next.js
16.3.5 standalone build against the current API on 8036. No dashboard source changed;
its broader build/unit/fixture-browser checks remain B36b's dated evidence. New real-model
browser checks exercise workload shifts, Scottie Barnes similarity and paired points/minutes
distributions, with server/manual hash equality and screenshots:
[workload](b34c-browser-final/demo-1.png), [similarity](b34c-browser-final/demo-2.png),
[distributions](b34c-browser-final/demo-3.png). No Save action is taken.

The pinned context is release `5bbb6035-6794-4bb0-b894-7208f52ef7ad`, regular-season
2024–25, exclusive cutoff 2025-06-23. Supplemental cases independently cover 2026–27's
empty outcomes and admitted finance with separate financial dates/book identity.

## Probes, limits and preserved evidence

All failed probes remain retained. Successive 45-case probes measured 19/25 supported,
24/25 supported with one provider-busy response, then 25/25 with one missed defensive
clarification. A subsequent 44-case success ended with a quota response; its single
explicit quota recheck is separately retained. Final acceptance uses the later complete
45/45 run, final seven query rechecks, supplements and production checks.

**276 actual provider calls** were made across development, rechecks, supplements and
browser runs. One 503 busy response and one 429 quota response are recorded. Shorter
two-second evaluation pacing was unsuccessful; the final full run uses 4.5 seconds.
No SDK retry loop or paid/model fallback was introduced. The final core/paraphrase warm
turn median is **1,445ms**, p95 **1,844ms**, maximum **1,927ms**. Manual baselines populate
operation caches, so these are warm evaluation observations, not uncached or field latency.
Usage metadata is retained where available; failed browser probes do not retain token
metadata, so a complete billing/token total is not claimed. Project Free tier is
owner-declared, not independently verified. Current provider references:
[structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[project-specific limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[pricing](https://ai.google.dev/gemini-api/docs/pricing).

The full-suite rerun exposed a real archive defect: zero-filled nonappearance boxes
entered performance samples. Archive SQL now excludes those fields, matching the profile
calculation. Deterministic appeared/nonappeared archive reconciliation passes. There are
no retained archive/v2 investigations; 27 legacy archive/v1 records use the unchanged
legacy path. The broader workbench attempt changed three retained query hashes and was
reverted outside archive scope; that failed reproduction probe remains retained.
**A versioned workbench nonappearance correction with legacy compatibility remains a
separate integrity follow-up.** No metric definitions or sealed artifacts are rewritten.

All 33 saved-conversation identities/hashes and 149 publication pointers match before/after.
Standard Stats tests retain their own bounded test investigations; the evaluation/browser/
reproduction harnesses do not save analyses. No acquisition, publication, worker, model
training or finance import is started.

B32 actual changing-game/finality/correction observations, deeper source/model gates
and the versioned workbench correction remain open. This is a verified language slice,
not full replica completion.
