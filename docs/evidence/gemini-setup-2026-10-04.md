# Gemini connection — 2026-10-04

Backend configuration is installed; successful inference and B34 language acceptance
remain unverified. The owner supplied an AI Studio key for free-tier use. The project
tier is owner-declared, not independently verified.

The key is stored only in the ignored root `.env`, with permissions `0600`.
The selected model is the owner's `gemini-flash-latest` endpoint. Compose now forwards
the key/model to the API only. Local Python reads the same file. A local API was
started on `127.0.0.1:8000`; its status reports configured. The key is absent from
these evidence files and from dashboard/worker Compose environment configuration.

## Observed provider behavior

- An authenticated model-list request returned HTTP 200, including both
  `gemini-3.8-flash` and `gemini-flash-latest`. Listing is not inference access evidence.
- `gemini-3.8-flash`: the first corpus case returned `provider_error`; a minimal
  direct request returned HTTP 403 `PERMISSION_DENIED`, “The caller does not have
  permission.” [Initial evaluation](gemini-connection-2026-10-04.json)
- `gemini-flash-latest`: a direct request returned HTTP 503 `UNAVAILABLE`, reporting
  high demand. The bounded corpus evaluation stopped on its first case with
  `provider_error`. [Evaluation](gemini-flash-latest-2026-10-04.json)
- A diagnostic SDK call confirmed HTTP 503 and the same high-demand message.
  [Sanitized SDK error](gemini-sdk-error-2026-10-04.json). The adjacent
  `gemini-sdk-diagnostic-2026-10-04.json` is transport-only evidence: its wrapper ran
  from stdin, so the multiprocessing manual baseline failed to spawn. Its semantic
  comparison is invalid and is excluded from acceptance.

Both proper real-provider evaluations attempted one planning call each and stopped.
No successful output, observed model version, token usage or language accuracy was
obtained. Their recorded zero supported accuracy denotes a failed request, not a
measured semantic accuracy result. Six inference requests were attempted overall:
three evaluation/diagnostic calls, two direct probes and one unintended call exposed
by the disabled-query test's incomplete settings mock. That mock is now corrected
in both API and unit tests to include the conversation execution module.

## Local verification

- Ruff check/format: pass; strict mypy: pass, 144 source files.
- Full pytest after correcting the disabled-query mocks: **616 passed, 125 skipped**,
  zero warnings. Skips include PostgreSQL checks requiring a disposable database URL.
- Separate disposable PostgreSQL run: **11 passed, 2 failed**. The six conversation
  integration tests passed. The two legacy assistant smoke tests require a published
  snapshot that their empty-database fixture does not create (`no_published_data`).
  [Check output](gemini-postgres-checks-2026-10-04.log). Only the newly created test
  database was removed afterward.
- [Retained-input fixture corpus](gemini-manual-baseline-2026-10-04.json): all 45
  cases pass (25 supported, ten clarification, ten unsupported); zero remote calls.
- [Real local API](gemini-local-api-2026-10-04.json): health/status HTTP 200; an
  explicit manual true-shooting definition answers with one result and zero provider calls.
- Resolved Compose configuration confirms the configured key/model reach only the
  API. No frontend source changed; dashboard/browser checks were not rerun.

## Future provider review

Revisit Groq if Gemini's 429 quota errors or 503 capacity errors repeatedly prevent
ordinary use, planning exceeds the 20-second transport deadline, or the complete
supported corpus falls below the contract's 90% accuracy target. This session's
capacity failure is a reason to watch availability, not evidence that Groq is better.

Before switching, verify the actual free-project limits, add a bounded provider
adapter, and run the same canonical-operation/entity/context/evidence evaluation:
at least 90% supported correctness and all critical cases correct. Compare measured
latency and failures under the intended workload. Keep manual operation available
and do not add automatic paid fallback. These criteria persist for future project
work; this change does not install background provider monitoring.

Official references checked today: [Gemini models](https://ai.google.dev/gemini-api/docs/models),
[Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), and
[Groq limits](https://console.groq.com/docs/rate-limits). Recheck at evaluation time;
aliases, eligibility and project limits can change.
