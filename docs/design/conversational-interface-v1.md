# Conversational interface and exact Research operations — B34

2026-10-03. Implements the interface portion of the [search contract](replica-search-contract.md)
on top of [B33's frozen backend](conversational-analytics-v1.md). This document updates
B33's destination limitation; it does not claim real Gemini language acceptance.

`/research/ask` and the native modal Ask drawer consume the versioned turn API. Each
follow-up sends the retained conversation ID, fingerprint and resolved context. The
interface displays at most eight recent turns. Canonical identity choices use the
server's retained choice values; meaning clarifications accept an explicit follow-up.
A proposed context is displayed before its separate new-conversation action. A changed
season without a proposed retained release resolves that season's release anew, instead
of reusing the old season's ID. Already pinned controls stay disabled until clearing.

Results, charts, definitions, samples, units, limitations and evidence come from executed
server results. Distribution summaries and individual samples have separate presentation;
paired scoring/minutes results disclose their own samples. The dot plots omit nulls and
preserve observed zeros. Workload tables lead with server-computed changes. Display
numbers have at most four decimal places, with the returned value in the cell title and
exact evidence. Financial numeric strings are preserved. This does not recover precision
already rounded by older analytical services.

The primary tables have labelled keyboard-focusable horizontal scroll regions. The
drawer uses native dialog focus containment, Escape and focus return. Unmounted async
responses cannot update a new view; a response received after drawer disposal clears its
local backend conversation. Clearing is explicit and awaited. A network retry reuses the
same request ID/body rather than producing another planning call. Full page unload/API
restart can leave unacknowledged local state until B33's bounded expiry; this is not
provider deletion or durable saving. State is not written to browser storage.

Manual mode exposes all twelve registered operations, their server-derived parameter
schemas and examples. Its JSON argument editor is an advanced manual path; existing
Stats, Research, Finance and player/team controls remain available. Paired scoring and
minutes distributions can be run with one explicit manual action. Missing AI, quota,
provider errors, unsupported requests, missing observations, insufficient samples and
busy states retain entered text and manual alternatives. The key remains on the server.
The UI explains what is sent to Google and distinguishes local expiry from provider
records; configuration uses the existing server environment, with no billing or paid
fallback changes.

## Exact Research destinations

The backend now serializes executed `compare_periods`, `distribution`, `splits`,
`similarity` and `workload_shifts` operations to:

```text
/research/operation?operation=<registered name>&arguments=<canonical JSON>
  &release_id=<retained release>&season=<season>&phase=<phase>
  &before_date=<exclusive cutoff>&window=<conversation window>
```

Every executed argument is preserved, including nulls, dimensions, sample thresholds,
window sizes and date ranges. The operation view accepts only these five names and bounded
object arguments, requires a release/season/cutoff, and submits an explicit manual plan
through the same server validation/execution/rendering. It then clears its temporary
conversation. It makes no model call, arbitrary URL fetch or mutation of analytical inputs.
Development remounts share a pending request. Navigating to another operation discards late
old output. Reloading re-executes the retained canonical operation. The original specialized
B13 pages are retained; this dedicated view supplies the exact chatbot destination without
routing through controls that drop parameters. Stats and Finance keep their existing
serializers. The API now permits DELETE preflights from configured allowed origins so
browser reset/cleanup actually work; untrusted origins remain rejected.

B35 owns retaining complete conversational investigations and exports. The interface
labels that boundary, links existing saved investigations, and does not pretend that an
active conversation or a copied Research URL has been saved as evidence.

## Evaluation

Run the provider-free frozen plan/execution corpus against the local retained database:

```bash
.venv/bin/python scripts/evaluate_b34_conversation.py NEW_FIXTURE_EVIDENCE.json
```

The original 45 cases and checksum are unchanged. The evaluation explicitly corrects
B33 case 23's erroneous Barrett mapping (`1628369` is Tatum; Barrett is `1629628`).
The referential paired-distribution case first establishes a canonical Barnes selection.
Fixture planner invocations are counted separately from real remote calls; this run is
structural/manual equivalence evidence, not natural-language accuracy. The original corpus
also lacks finance and actual empty-current-season language cases; supplemental evaluation
is still necessary before claiming full chatbot acceptance.

For a later owner-configured eligible free project, verify its current model, quotas and
provider terms using [Google's model documentation](https://ai.google.dev/gemini-api/docs/models),
[structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output),
[pricing](https://ai.google.dev/gemini-api/docs/pricing),
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and
[terms](https://ai.google.dev/gemini-api/terms), then explicitly opt in:

```bash
.venv/bin/python scripts/evaluate_b34_conversation.py NEW_REAL_EVIDENCE.json \
  --real-provider --project-tier free
```

The tier declaration is an owner assertion, not an independently verified billing fact.
The runner uses only the configured model, at most 45 cases/one provider call per case,
B33's time/token/result limits, and stops on quota/provider/timeout failures. It records
SDK/configured model, returned model version when supplied, context, per-case plans,
result/manual hashes, actual usage metadata, status and latency. It requires >=90%
supported canonical equivalence and all clarification/prohibited-operation cases on the
complete original corpus; incomplete runs remain unmet. No prompt tuning occurred in B34.
No key is configured locally and no real Gemini inference was attempted for acceptance.

[Verification manifest](../evidence/b34-verification.json) binds final implementation,
checks and real browser evidence. The retained Starlette warning and broader release gates
remain independent.
