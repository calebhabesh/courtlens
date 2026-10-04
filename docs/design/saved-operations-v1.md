# B35a retained conversational operations

2026-10-04. Backend boundary for [B35](../databallr-replica-implementation-plan.md).
Consumes the [conversation contract](conversational-analytics-v1.md),
[interface contract](conversational-interface-v1.md) and
[search/save requirements](replica-search-contract.md). B35b owns the subsequent interface,
original content and installable metadata. This contract does not mark the parent block complete.

## Explicit retention

`POST /api/workbench/assistant/investigations` accepts `SaveConversationRequest`:
`request_id`, `conversation_id`, `turn_id`, `context_fingerprint`, `title`, and
`include_question` (false by default). It accepts no client result, evidence, plan,
question substitution or provider narrative. The active server turn must contain a verified
executed manifest (`answered`, `no_data` or `insufficient_sample`). Expired/cleared/evicted
turns require execution again. A running turn or mismatched context cannot be saved.

The selected server result is re-executed against its pinned inputs and must match before
retention. Saving expands Stats through the server's full-result execution, up to 2,000
eligible rows; a larger cohort fails explicitly with 413. It never silently truncates at
the conversational page limit. Other operations retain their declared bounded result,
including samples, summary, actual windows, cohort sizes and top-k. A retained distribution
is its requested historical window, not an implied complete career.

Each saved manifest contains the canonical original and retained plans, resolved context
and fingerprint, original execution manifest identity, metric/operation versions, complete
operation results, exact evidence cells, input identities, result hashes, canonical local
open destinations and limitations. Where a forecast result contains an issuance, its
retained plan pins that issuance ID rather than selecting the latest one on reproduction.
An explicit `no_issuance` result remains absence evidence: it cannot establish prospective
accuracy, and reproduction may report a mismatch if an eligible issuance later appears.

The manifest has a 32 MiB ceiling and a supervised 45-second execution deadline. Queries
use the existing read-only isolated PostgreSQL worker and database statement deadlines.
No Gemini calls or provider result uploads occur during save, retrieval, reproduction or
export. Configured provider secrets, transport transcripts, accounting and generated
narrative are not retained. Upstream aggregate rounding remains an explicit limitation.

`title` and optional question are separate metadata. Opting into question retention copies
only the selected server-held exchange. Metadata does not change the analytical manifest
hash. Privacy copy in B35b must distinguish durable opted-in metadata from the 30-minute
active conversation and from provider retention. Clearing a conversation does not delete
a saved investigation. Repeated save request IDs return the same record even after API
restart/clear; changing the request content under the same ID fails with 409.

## Storage and recovery

Additive revision `35b810a4f003` follows `31b810a4f002`. Both
`saved_conversation_analyses` and `saved_conversation_inputs` reject ordinary ORM
updates/deletes and PostgreSQL UPDATE/DELETE/TRUNCATE. A saved analysis references exactly
one retained workbench/archive dataset with an FK. Step input rows additionally protect
referenced financial books and prospective issuances with FKs. The immutable manifest and
results reside in PostgreSQL; no new artifact-directory copying policy is necessary.

Backup manifests carry the ordered saved-analysis ID/hash inventory. Restore verification
checks manifest integrity and matches this inventory when present. Older backup manifests
remain compatible when the field is absent. Full release-wide recovery and all deeper
source/model capability gates continue to belong to B37.

Legacy `/api/workbench/analyses` investigations keep their existing IDs, artifacts and
API contracts. New conversational evidence uses a distinct namespace/schema; B35b should
present both kinds without treating ephemeral conversation state as retained evidence.

## Retrieval, reproduction, export and interface handoff

- `GET /api/workbench/assistant/investigations?limit=50&offset=0`: bounded summaries;
  maximum limit 100, deterministic created-at/ID ordering. Each summary identifies context,
  operations and whether its question was saved.
- `GET /api/workbench/assistant/investigations/{id}`: self-contained verified detail.
- `GET /api/workbench/assistant/investigations/{id}/reproduce`: independently re-executes
  against retained context, validates the canonical plan and compares complete results,
  evidence and destinations. Returns per-step result hashes and explicit match/reason.
  Unsupported retained versions stay exportable; they cannot execute as newer semantics.
- `GET /api/workbench/assistant/investigations/{id}/export?format=json|csv`: download with
  a UUID-derived filename and `Cache-Control: no-store`. JSON is the complete typed detail.

CSV includes manifest hash, title, metadata, numbered `manifest_json_part` rows and an
exact-cell table containing step/operation/result/evidence identity, entity/path/metric/unit,
value/null reason, sample and input identity. Reconstruct the manifest by ordering its part
rows by the second column, JSON-decoding each third column and concatenating the resulting
strings, then JSON-decoding the concatenation. Each chunk has at most 16,000 characters
before JSON escaping, keeping ordinary chunks below spreadsheet limits. The complete JSON
export is preferable to spreadsheets for large manifests. Formula-like strings are escaped
in every cell; JSON chunks begin with a quote. Zero and literal `null` remain distinct;
the manifest retains original types and precision. An image is still a presentation artifact.

Frozen Pydantic API models live in `domain/saved_conversation.py`; the
[schema bundle](saved-operations-v1.schema.json) binds save requests, details, summaries and
reproduction reports. The existing server result component can consume manifest results
without any provider-written arithmetic or narrative.

B35b must add explicit save controls (with independent question opt-in), saved detail/list
views alongside legacy investigations, evidence inspection, export/reproduce status and
canonical reopening. It must also complete definitions/learning/blog/patch notes,
lineage/operations/settings links, and installable metadata/cache verification. Existing
canonical URLs are preserved here; a general retained-operation UI is not claimed by B35a.
