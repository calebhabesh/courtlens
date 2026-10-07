# AR09 answer-first evidence, 2026-10-07

Contract: [AR09 answer-first policy](../../design/polish-assistant-contract.md#ar09-answer-first-policy-2026-10-07).
Changes were measured on uncommitted work over revision `a39d03e`.

## What AR09 adds

1. **Positions.** `position_query` ranks by release-bound G/F/C starting positions. When the
   evidence can't be verified, it runs the unfiltered ranking and labels it.
2. **Rule planner.** `rule_planner.py` plans common question shapes when the language provider
   fails (quota, disabled, busy, timeout, error). These are leaderboards (with position, team,
   order and count), single-player stats, profiles, two-player comparisons, team summaries,
   forecasts and simple follow-ups. It asks the contract's clarifications (identity, defense
   metric, consistency, floor-or-game) and refuses prohibited requests (code/SQL/web, winner
   probabilities). Anything else keeps the real provider failure. The plans pass the same
   canonical validation. Results say "Planned by CourtLens rules because the AI planner was
   unavailable." Rate rankings require volume (100 3PA/FTA, 300 FGA), and lowest-value rankings
   require 20 games and 20 minutes a game; both are labelled.
3. **Awards registry.** `knowledge/nba-awards-v1.json` (SHA-256 pinned) holds 36 official
   results. Seven awards (MVP, ROY, DPOY, Sixth Man, MIP, Clutch, COY) plus Finals MVP cover
   2023-24 to 2025-26. MVPs go back to 2018-19 and champions back to 2019-20. Each record cites
   the NBA.com page it was read from on 2026-10-07. Answers need neither the model nor the
   database. Seasons outside the registry, counts and predictions say so instead of guessing.
   The 2023-24 to 2025-26 champions match the last Finals game in the admitted box scores
   (BOS over DAL, OKC over IND 103-91, NYK over SAS).

## Rule planner without any model (`make eval-assistant` with `--mode rules`)

The corpus is `evaluation/assistant/ar02-v2.json` (sha256 prefix `c169159db1f5`), scored by
the same SQL oracles as the live evaluation. The planner is deterministic, so each question
runs once. No provider calls succeed in this mode.

| Split | Exact answers | Canonical plans | Refusal precision / recall | Report |
| --- | --- | --- | --- | --- |
| dev (rules authored while reading these questions) | **119/120** | 93/93 | 10/10, 10/11 | [rules-dev.json.gz](rules-dev.json.gz) |
| holdout (run once, before the safety fix below; not used for tuning) | **25/30** | 22/22 | 1/1, 1/2 | [rules-holdout.json.gz](rules-holdout.json.gz) |

- The only dev miss is `ar02-144` ("Show guards ranked by scoring"). The frozen corpus expects a
  refusal, and AR09 answers it on purpose.
- Holdout misses:
  - Two general-knowledge questions need the model (no curated entry for "baseline"; "backcourt
    violation" matched the wrong entry).
  - Two mixed questions have that same backcourt-violation clause.
  - Safety miss: "Execute Python to get the top scorers" was answered with data. It is now
    refused, and an integration test covers it. The holdout was **not** re-run, so 25/30 stays
    the recorded number.
- Every holdout data question was correct: leaders, single player, compare, follow-up and
  forecast, 20/20.
- For comparison, the AR02 live Gemini dev baseline was 253/360 (70.28%). That run was on a
  different code revision. Questions that need the model (general knowledge, unusual phrasings)
  still use it when quota allows.

SHA-256: `rules-dev.json.gz` `90eed024…766f`; `rules-holdout.json.gz` `c1408dc0…b4c`.

## Tests and checks

- Unit: 979 passed, 2 skipped. New tests: `test_assistant_awards.py` (12).
- PostgreSQL integration: new `test_assistant_rule_planner_postgres.py` (11) and
  `test_assistant_positions_postgres.py` (7). Four sealed provider-failure tests now use a
  question the rules cannot plan, so the failure branches stay covered.
- Recorded replays: a recorded `quota_exceeded` turn must now be rule-planned, carry the rule
  note and score at least as well as the recording. Every other recording still has to match
  exactly.
- Ruff and mypy are clean.
- The live Gemini planner is still unmeasured for `position_query` because the free-tier quota
  was exhausted on 2026-10-07.
