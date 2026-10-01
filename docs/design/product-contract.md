# CourtLoad public comparison experience

> **Next release, 2026-10-01:** Follow the [workbench interface contract](workbench-interface-contract.md). This earlier public-style comparison specification remains historical context; preserve existing behavior while realigning the application incrementally.

Status: implementation specification, 2026-09-20. Parent: [implementation handover](../implementation-plan.md). This specifies product behavior and acceptance criteria; it is not a claim that these pages exist.

## Product and visual direction

An NBA fan should be able to compare two players' recent production, role and next reconstructed matchup, then see how much confidence the evidence supports. Fantasy start/sit is one application, but no account or league setup is required.

Use the existing Next.js application and CSS foundation. Build a restrained analytics interface: readable typography, aligned numeric columns, clear section labels, one accent color and an obvious historical-date label. Reuse or extract semantic CSS variables for surfaces, text, borders, accent, warning and focus. Use system or locally bundled fonts so runtime rendering does not depend on a paid service or third-party font request. One polished theme is sufficient; dual-theme implementation is optional.

The UI/UX skill's dashboard, precise-comparison and accessible-chart guidance informs this contract. Its generated marketing/enterprise landing-page patterns did not fit the task and are not adopted. This is an application entry point with search and examples, not a sales page. No logo carousel, animation framework, radar chart or decorative hero is needed.

Primary navigation: **Players · Compare · Evaluation**. Data health and methodology are visible within Evaluation and in a compact footer/header link. Preserve existing planner pages as deferred/legacy routes; remove them from primary navigation without deleting their code. Display a small “Historical replay” label and date throughout the analytical flow.

## Routes and interaction state

| Route | Required behavior |
| --- | --- |
| `/` | Brief explanation, historical coverage, search, and two real-data example links once validated. |
| `/players` | Search/explorer with season/date controls and data-availability status. |
| `/players/[id]` | Player detail for the selected snapshot and replay date. |
| `/compare` | Two selectors, shared replay controls, aligned metrics/context/estimates. |
| `/evaluation` | Experiment summary, candidate results, limitations, methodology, data health and reproducibility links. |

Persist `date`, `snapshotId`, `playerA`/`playerB` where relevant in the URL. Changing date updates the whole comparison; independent per-player cutoffs are not supported. Season/date combinations are validated, not silently moved to today's season. Opening a shared URL should reproduce the view while that snapshot is retained. If it has been retired, show an explicit notice and offer the current snapshot without changing the URL silently.

Initial defaults come from the dataset catalog. For a historical archive, never default to today's date and render a misleading empty “upcoming” view. Show the supported date range and preserve invalid input with a useful error. A seven-day strip means reconstructed team games from that cutoff, not availability-weighted weekly value.

Server-render the initial catalog/profile where practical. Use client components for selectors and chart interaction. Set caching deliberately: initial implementation can use uncached API reads; any later cache key must include snapshot/date/parameters. The catalog/published pointer must not be cached indefinitely. Keep provider access and raw artifact paths out of browser code. Follow the installed Next.js version and its [official data-fetching guidance](https://nextjs.org/docs/app/getting-started/fetching-data).

## Player detail

The first screen shows player identity, last observed team/date, replay date, last-5/last-10/season reference production and minutes, with sample counts. The page then shows:

1. **Role and form:** minutes, FGA/FTA and reference production trends; weighted shooting percentages and per-minute output. Pair small charts on a shared date axis. Label the measurement units; avoid misleading dual axes.
2. **Next reconstructed matchup:** team, opponent, date, home/away, lead days, rest and opponent per-game allowances, with coverage. Label the last-observed team assumption; this is not a verified historical roster.
3. **Estimate:** reference points, empirical interval if supported, conditional-on-appearance wording, baseline/estimator identity and evaluation link. Distinguish an interval from recent-game variation.
4. **Game log:** prior appearances and their stats, date, team/opponent, quality flags and lineage link. Paginate longer logs. Unknown/nonappearance rows are visibly distinct.

Display summaries before technical trace IDs. Put hashes, parser versions and source locators behind “How this was calculated” or lineage details. A real user should not need to understand dbt to read a comparison.

## Two-player comparison

Desktop: paired columns with shared metric row labels. Mobile: each metric keeps both players adjacent; avoid stacking two entire profiles so far apart that comparison requires memorization. Let users swap players without changing date/snapshot and change either selection independently. Keyboard selectors retain readable labels and focus.

Both sides use the same formula, cutoff, window semantics and estimator policy. They may have different next team-game dates or valid sample counts; show those differences prominently. Do not imply the players face each other. If one side lacks a target/estimate/context, retain the valid descriptive comparison and explain the missing piece.

Show the point-estimate difference as arithmetic, with a label such as “Estimate gap”; do not convert it into a win probability or a start/sit command. Default summary is “Compare the gap with the uncertainty below.” If empirical intervals overlap, a supplementary label may say “Ranges overlap; this view does not establish a clear separation.” Non-overlap does not automatically earn a winner badge or significance claim. Without calibrated intervals, say uncertainty is unavailable rather than asserting clear separation.

Summaries can use deterministic templates populated by data: “Last-5 minutes are higher than the season average.” Every numeric statement must be traceable to the response. Avoid causal explanations, inferred injuries, current-player narratives, or LLM-generated analysis.

## Evaluation and data health

Start with a plain-language answer to whether the challenger improved over rolling estimates, and which estimator the historical app actually serves. Present a compact table of baseline/player-only/context MAE, RMSE, interval coverage and width, with counts. Keep validation and final test separate. Link to slice/error analysis and a downloadable derived report if appropriate.

Show why a model was or was not promoted. A negative result is a complete result. Explain historical reconstruction, conditional appearance, inferred team association, unknown rows and reconstructed schedules. Label the reference scoring formula as CourtLoad's fixed metric, not every fantasy platform's rule.

Separate three concepts in health: data coverage period, last successful published build, and latest attempted refresh. A fixed historical archive is an intentional mode. A failed attempt is a warning even when older published data remains usable. Show actual record counts and accepted source attribution; never imply the archive has passed validation merely because it downloaded.

## Required states

| State | User-facing result |
| --- | --- |
| Loading | Stable layout and accessible progress text; no flash of fixture or current-season values. |
| No published dataset | Setup/status explanation; no fabricated player cards. |
| Fixture mode | Persistent fictional-fixture label, including screenshots. |
| Historical archive | Persistent replay date, source and coverage range. |
| Search empty / unknown player | Useful empty state with preserved query and retry. |
| Fewer than 5 valid appearances | Show available descriptive data and sample size; no estimate. |
| 5–9 valid appearances | Labeled limited-history mean, with unavailable interval if uncalibrated. |
| Unknown team / archive ends / no target | Distinct explanations; retain profile data. |
| Missing opponent totals | “Insufficient opponent coverage,” with valid-game count; no zero allowance. |
| No promoted challenger | Baseline estimate and completed experiment result, not an application error. |
| Estimate artifact unavailable at date | Explain the cutoff restriction; retain descriptive metrics. |
| Failed new build | Last good snapshot plus visible failure status; no mixed dataset. |
| Retired snapshot / invalid date | Explicit error and user-selected recovery. |

## Accessibility and browser acceptance

Use semantic links/buttons/forms, visible labels, focus indicators, and an announced loading/error status. Charts have visible numeric/table alternatives; hover is not the only way to read a value. Color is supplemented by labels or line styles. Use a simple interval dot/range chart for a single upcoming estimate, not a long forecast curve suggesting unmodeled days. Avoid radar charts when precise stat comparisons matter.

Verify keyboard search, selection, date entry, swapping and error recovery. Use tabular numerals, readable units, and deliberate missing-value labels. Check body-text contrast, 200% zoom, reduced motion, and widths around 375, 768 and 1440 pixels. Metric rows must remain comparable without whole-page horizontal scrolling; a separately labeled scrollable game-log table is acceptable.

Add browser tests against the real app/API for the main path and required states, using a tiny fixture snapshot with intentionally different players. Capture desktop/mobile views after real-data reconciliation, labeling their dataset and cutoff. Existing helper tests and a successful production build are not evidence that this workflow is usable.

The final demo should take a reader from search to a comparison and its evaluation in a few minutes. Use actual reconciled examples and let the data determine the narrative. Finish by stating one useful conclusion and one thing the product cannot establish.
