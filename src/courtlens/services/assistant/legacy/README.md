# Retired V2 compatibility pipeline

Ordinary Ask turns use `assistant.agent.loop`. This package exists only for explicit
V2/manual-plan compatibility and historical evaluations. Do not route new agent
features through the JSON planner, intent router, narrative checker or allowlist
retriever here.

AG07 uses the handoff's retirement option: V1 `/assistant/query`, the conversation
API, explicit V2 manual plans and legacy evaluation scripts still have callers.
Deleting their implementations or tests would remove supported behavior. Their
regressions remain active, with imports updated to this package. Historical
fixtures, schemas and reports stay byte-identical. The default `make eval-assistant`
command already uses V3; old evaluation scripts are compatibility entry points.

Shared entity resolution lives in `assistant.entities`, response limits in
`assistant.limits`, and status in `assistant.status`. Numeric parsing/rounding
already lives in `domain.answer_numbers`, shared with V3 provenance. No shared
implementation is copied. Agent, status and history imports must not load this
package; `test_agent_architecture.py` enforces that boundary in a fresh interpreter.
