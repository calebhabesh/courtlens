# AG08 — owner-accepted closure with live measurement waived

On 2026-10-08 the owner asked to finish without live tests because Gemini quota
would be consumed. The sequence is closed under that explicit waiver, not under
a claim that the original live acceptance criteria passed.

[Acceptance record](acceptance.json) deliberately has null V3 accuracy and holdout
scores. Zero development runs and zero holdout cases were executed in this closure.
The retained AR02 warehouse reference is **255/279 (91.40%)**. No comparison showing
V3 meets it exists. The frozen 24-case holdout was not inferred, scored or tuned.
AG01's live smoke remains unverified. The original quota reports remain intact.

[Local configuration](provider-configuration.json) confirms Gemini is already
enabled, with the owner's existing model selection. There was no application access
switch to unblock. Keys, models, quotas and provider access were not changed or
probed; zero live-provider calls were made. The owner acceptance removes the
measurement dependency, not the provider's quota enforcement.

The three owner examples are replayed from the sealed AG03 synthetic fixtures at
1440 and 375 pixels. Screenshots demonstrate current rendering only: the MVP,
best-defender and RAPM prose is fixture content, not new measured basketball claims
or evidence of live model quality. The retained [capture spec](owner-examples.spec.ts)
is run from `dashboard/e2e` in the AG07 scratch copy, alongside its navigation helper.
All historical fixture bytes remain unchanged.

[AG07 cleanup evidence](../ag07-cleanup/README.md) contains the offline checks and
compatibility-retirement scope. README now describes V3 and distinguishes the
historical scores from the waived live measurement. Direct NBA capabilities remain
`source_blocked` pending source admission/consent; DL and IM are not reopened.


Final evidence: **1,845 Python tests**, **286 Vitest tests**, and **6 synthetic owner
captures** pass. Ruff/format/mypy, dashboard lint/types and production build pass.
The broader browser run is **180 passed / 15 skipped / 10 failed**; the owner-capture
failure among those passed on its separate rerun. The remaining nine unchanged-UI
failures are explicitly retained in AG07, not covered up by the live-provider waiver.
AG08 is **accepted_with_waiver** for the owner-directed no-live closure; full original
acceptance remains unverified. Nothing in this report asserts a new live accuracy score.
