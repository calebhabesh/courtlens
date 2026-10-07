"""Pre-RN01 identifiers retained byte-for-byte under refresh decision R2.

These schema, parser, experiment and hash-input versions identify sealed content.
New versions use the CourtLens prefix. The three browser keys matching this
pattern are retained only as migration sources; they are not hash contracts.
"""

FROZEN_IDENTIFIERS: frozenset[str] = frozenset(
    {
        "courtload-adjusted-shooting-v1",
        "courtload-analysis-plan-v1",
        "courtload-ask-sidebar-collapsed-v1",
        "courtload-assistant-active-thread-v2",
        "courtload-assistant-history-change-v2",
        "courtload-assistant-operations-v1",
        "courtload-assistant-v2",
        "courtload-conversation-result-v1",
        "courtload-conversation-v1",
        "courtload-expected-shot-retrospective-v2",
        "courtload-expected-shot-v1",
        "courtload-external-output-v1",
        "courtload-history-v2",
        "courtload-knowledge-v1",
        "courtload-knowledge-v3",
        "courtload-offline-plan-corpus-v1",
        "courtload-pf07d-hybrid-v1",
        "courtload-pf07d-scoring-holdout-v1",
        "courtload-public-nba-v1",
        "courtload-rapm-v1",
        "courtload-research-binding-v1",
        "courtload-research-package-v1",
        "courtload-research-preregistration-v1",
        "courtload-research-run-v1",
        "courtload-retrospective-shot-binding-v2",
        "courtload-rule-planner-v1",
        "courtload-saved-operation-v1",
        "courtload-sdv-rich-v1",
        "courtload-shared-floor-evidence-v1",
        "courtload-shared-floor-v1",
        "courtload-shooting-evidence-v1",
        "courtload-shooting-sequences-v1",
        "courtload-shot-correction-ledger-v1",
        "courtload-shot-correction-ledger-v2",
        "courtload-shot-correction-ledger-v3",
        "courtload-shot-input-policy-registration-v1",
        "courtload-shotchart-audit-v1",
        "courtload-shotchart-v1",
        "courtload-shotchart-v2",
        "courtload-six-factor-v1",
        "courtload-thread-turn-v2",
        "courtload-thread-v2",
    }
)
