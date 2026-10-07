# CourtLens assistant agent rework progress

Parent: [assistant agent handoff](assistant-agent-plan.md). Plans are not runtime evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`, `source_blocked`,
`verification_blocked`. `verified` requires the completion evidence named in the handoff's block
table.

## Planning baseline: 2026-10-07

- Starting revision: a39d03e, with an uncommitted working tree (AR07–AR09 and dashboard changes).
  Inspect `git status` before each block.
- The owner confirmed every decision in the handoff through a grilling interview.
- Facts checked during planning: no RAPM anywhere in `src/`; Impact/On-Off/Six Factor presets gated;
  general blocks reject numbers (`TextBlock.authority`); the Gemini-only provider hit
  `quota_exceeded` in AR04/AR05/AR08/AR09; Databallr robots.txt allows `/`, but its Terms of
  Service forbid copying materials and reverse engineering, so AD01 permission is required.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| AG01 | verification_blocked | [Provider foundation and verification](evidence/ag01-providers/README.md): official SDK adapters, current doc/model/tool checks, config/status/env/Compose, price estimates and exact replay. 43 provider/config tests and 1019 unit tests pass; Ruff/mypy clean; 205 Vitest tests and dashboard lint/types pass. Live Gemini smoke stops on `provider_quota` before tools/search; other providers unmeasured without keys. Broader DB/browser gaps recorded separately. Ask routing remains v2 until AG03. |
| AG02 | planned | |
| AG03 | planned | |
| AG04 | planned | |
| AG05 | planned | |
| AG06 | planned | |
| AG07 | planned | |
| AG08 | planned | |
| AD01 | planned (owner action) | |
| AD02 | source_blocked | AD01 permission not recorded. No Databallr calls or import attempted. |
| AD03 | source_blocked | Requires permitted AD02 data. |
| AD04 | source_blocked | Requires AD03 and AG06. |

## AG01 checkpoint: 2026-10-07

- Actual starting revision: `06034ed`, clean tree. AR07–AR09 and the handoff were committed
  before this session; the planning baseline above records the earlier state.
- The 60,000-token ceiling is retained as a configurable default. New provider defaults are
  `gemini-3.8-flash`, `claude-sonnet-5-5`, `gpt-6.1-sol`; an explicitly configured legacy Gemini
  model alias is preserved. The owner's `.env` was not changed.
- Completion is **not verified**: the configured Gemini smoke returned quota with a 60-second
  retry hint, without retries; no live tool/search success observed. Absent-key providers are
  unmeasured. Evidence includes a safe failure transcript and exact verification limits.
- Gemini's native search lacks a documented hard per-request query cap. AG03 must account for
  sub-calls/queries, stop further search and expose overshoot rather than claim a hard bound.
- AG02–AG08 were not started. AD01 remains owner action; no request date or permission reply
  was supplied. No Databallr access occurred. Sealed AR/v2 evidence and holdouts are unchanged.
