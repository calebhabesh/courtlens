# Assistant evaluation (AR02)

The [final frozen corpus](ar02-v2.json) contains 150 questions across leaders, single-player
statistics, comparisons, follow-ups, general knowledge, mixed questions, clarification/refusal,
and forecasts. It uses a fixed 2026-10-06 clock and regular-season 2025-26 observations.
Each question has three repetitions: 120 development questions and 30 holdout questions.
The final holdout uses fresh historical scope and general/clarification targets, frozen before
any tuning. No final holdout is executed in AR02. Input checks include message, scope and prior
plan, and catch overlapping primary/setup inputs across splits.

The original [v1 corpus](ar02-v1.json) and baseline remain intact. Final review found that some
v1 reserved leader prompts were reused by dev follow-up setups; v1 is therefore baseline evidence,
not the final holdout. V2 preserves all 120 dev targets unchanged and replaces the 30 reserved
targets without looking at their outcomes. Use v2 for AR03–AR08. Existing PF07d evidence stays sealed.

## Run

From the repository root, with the existing local PostgreSQL configuration:

```bash
# Live dev evaluation; configured Gemini model, retained Free-tier evidence, no arbitrary call cap.
make eval-assistant

# AR03's bounded categories; selection is recorded without changing the frozen corpus.
make eval-assistant ASSISTANT_EVAL_ARGS='--category general --category mixed'

# Authored plans exercise the whole dev corpus without inference.
# This is execution/scoring coverage, not language accuracy.
make eval-assistant ASSISTANT_EVAL_ARGS='--mode fixture'

# Optional bounded smoke run or a retained snapshot.
make eval-assistant ASSISTANT_EVAL_ARGS='--max-calls 9 --release-id YOUR_RETAINED_RELEASE_ID'

# Final acceptance only, in AR08. Never tune against this output.
make eval-assistant ASSISTANT_EVAL_ARGS='--split holdout --open-holdout'

# Score existing captured responses against the retained SQL snapshot; zero inference.
.venv/bin/python scripts/rescore_assistant.py docs/evidence/ar02-evaluation/live-capture.json.gz data/artifacts/assistant-eval/new-score.json

# CI replay: actual Gemini plans, retained result bytes and separate SQL expectations.
.venv/bin/pytest tests/unit/test_revamp_provider_replay.py
```

The live runner writes a unique report under `data/artifacts/assistant-eval/` unless `--output`
is supplied. Existing evidence is never overwritten. Acquisition checkpoints retain completed
turns, raw plan outputs, repair inputs, usage, model versions and sanitized provider failures.
Quota, timeout or capacity failures stop acquisition without retries or provider switches.
An optional call limit also stops acquisition. Exit 2 means an incomplete acquisition; incorrect
answers themselves are measurements, not an accuracy threshold that fails the command.
The default five-second pacing interval is configurable; it is not a declaration of project quota.

## Expected answers and scoring

Read-only SQL against the pinned published workbench snapshot computes answers independently of
the assistant's query executor. It groups confirmed appearances, uses each metric's valid
denominator, preserves nulls, excludes `game_date >= before_date`, and orders ties by player ID.
Ranking/single-player/follow-up cases check all returned entity/value/sample triples and order.
Comparison cases check both identities and games, points/game, rebounds/game, assists/game and
minutes/game. These selected cells are the exact-answer oracle; this is not an audit of every
additional profile metric or a verification of official NBA leader qualification.

Forecast SQL independently selects the first eligible target and latest prior issuance, checking
dataset, player, target horizon and strict issuance cutoff. Available forecasts must match estimate,
interval, policy ID, feature hash and issuance dates, and disclose conditional appearance.
Missing issuance expects an honest `no_observations` refusal, never a zero prediction. Issuance
availability is reported separately so correct unavailability is not claimed as prediction accuracy.
Positive issuance selection is covered by synthetic PostgreSQL tests even when the published
snapshot has no eligible issuance at the frozen cutoff.

General/mixed questions require the agreed visible label, relevant concept terms and no numerical
claims in the general block. These are automated presentation/relevance checks, not a semantic
fact-checker for arbitrary basketball prose. Clarification and prohibited/unavailable requests have
declared terminal statuses/reasons; pleasant refusals never count as data answers.

The report separates:

- **Exact answer:** expected status, scope, selected SQL cells/order/samples, and category checks.
- **Plan accuracy:** strict canonical operation/argument equality with the authored plan, ignoring
  step IDs. Equivalent-looking filters or sort aliases can pass answer scoring but fail this stricter
  plan agreement. Unrequested columns fail plan agreement. Nonanalytical cases have no plan denominator.
- **Refusal precision/recall:** appropriate `unable` outcomes versus all refusals/expected refusals.
  Clarifications are scored separately through their exact terminal status.
- **Flakiness:** fraction of fully repeated questions whose correctness changes between runs.
  Partial repetitions never enter this denominator. Answer variation additionally measures changing
  result/prose signatures, even if correctness stays the same.
- **Latency and calls:** observed turn time (including pacing and follow-up setup), provider calls,
  setup calls, analytical calls, per-call token usage and acquired/planned coverage.

Authored fixture calls are synthetic provider invocations, not paid/live inference. Live records
retain both actual recorded calls and server attempt accounting; a prevented call at an optional
stop can be counted as a server attempt without having dispatched an HTTP request.
Follow-ups execute a real setup turn each repetition and pass its observed plan into the next
turn. They are not evaluated with an injected golden previous plan in live mode.

Baseline evidence: [AR02 evaluation report](../../docs/evidence/ar02-evaluation/README.md).
The original acquisition capture is retained when scoring changes; rescoring writes a separate
report with the source digest, scorer digest and every changed failure list.

AR03 category measurements and limits: [routing report](../../docs/evidence/ar03-routing/README.md).
