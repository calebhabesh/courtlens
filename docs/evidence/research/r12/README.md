# R12 — Research landing, menu and README

Built 2026-11-06 on branch `finish-r11-r12`, after R11. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md) (R12, D8, D14). Build block: shared Research components, no
page CSS. No Python, API, model or data change. Nothing deployed.

## Landing (`/research`)

One card per headline result: one number, one sentence, its test seasons and links to the page and
the evidence. The numbers are facts from `dashboard/lib/research-facts.ts`, which Vitest checks
against the frozen results.

| Card | Number | Tested on | Source |
| --- | --- | --- | --- |
| R15 Win Probability | log loss 0.4028 (baseline 0.4157, calibration error 0.0083) | 2,439 games, 2024-25 and 2025-26 | `courtlens-win-probability-v2-card.json`; `/api/win-probability` |
| R08 Metric Backtest | +0.80 RMSE gain (+0.72 to +0.88), monthly time-decay RAPM over team net | 11,979 games, 2016-17 to 2025-26 | `courtlens-metric-backtest-v1.json`; `/api/metric-backtest` |
| R07 Projected Impact | +4.38 (+3.25 to +5.50) over carry-forward | 2024-25 and 2025-26 | `courtlens-projected-impact-v1-card.json`; `/api/projected-impact` |
| R05 Shot Quality v2 | 2.56% better Brier (2.44% to 2.67%) than zone × distance rates | 2024-25 and 2025-26 | `courtlens-expected-shot-v2.json`; `/api/shot-quality` |
| R16 Ask Evaluation | **none:** "Evaluation in progress", "Holdout not yet run" | — | R16 untouched: its holdout was not opened, its runner not run, nothing estimated |

Below the cards: how the results were tested (four steps), then every Research page from the menu
(generated from `lib/nav-model.ts`, so it can't drift from the menu).

## Menu against D8

| D8 group | Menu now | Note |
| --- | --- | --- |
| (landing) | **Overview: Research Overview** (new, R12) | D8: "/research opens the menu" |
| Models | Win Probability, Projected Impact, Lineup Model | matches |
| Impact | Six-Factor RAPM (Impact Tree inside), Metric Backtest | matches |
| Shooting | Shooting (Expected Shots, Adjusted Shooting, Shot Aftermath tabs), Defensive Shot Quality, zTS, Shot Quality | matches; Shot Aftermath is a Shooting tab |
| Methods | Signal vs Noise, Points Forecasts (Evaluation Archive linked inside), Learning (R11) | matches |
| Tools | Combine & Wingspan, Draft Classes, Hypothetical Calculator, Patch Notes (R11) | matches. D8 says "ORtg Calculator"; the page is still the hypothetical calculator plus R10's observed inputs, so the label is left for the design phase's ORTG Lab |
| Cuts | Workload Trends, Distributions & Splits, Blog: redirects only. Case Studies, Saved Investigations, Evaluation Archive: off the menu, linked from Methodology | confirmed |

The only gap fixed is the landing entry.

## README

A "Results" section now leads with R15, R08, R07 and R05, each with its number, test seasons and
evidence link, and "Ask evaluation (R16): evaluation in progress; no number yet". The Status
paragraph says the holdout evaluation is in progress. A Vitest test (`research-facts.test.ts`,
"README results") fails if any README number stops matching its checked fact.

## Verification

| Check | Result |
| --- | --- |
| Lint, Stylelint, typecheck | 0 errors, 0 warnings |
| Vitest | 804 passed (19 new README tests, menu tests updated) |
| Python | not run: no Python changed |
| Page spec `e2e/r12-research-landing.spec.ts` | 3 tests; with the R11 and menu specs **60/60 over three repeats** |
| Full Playwright (production sandbox, mock API 4180, dashboard 3180, 2 workers, 8 GiB, `docs/` copied) | **579 passed, 17 skipped, 0 failed**; no baseline changed; `git status` shows no evidence-file changes |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs)) | Private API on 4180 (worktree code, shared Postgres read only). Every number on each card rebuilt from the four APIs: 26 checks at 1440 and 26 at 390, **0 mismatches**, 0 console errors, 0 overflow, 0 broken images; R16 shows no number |

## Glance test (1440 × 900 and 390 × 844)

| # | Item | 1440 | 390 | Note |
| --- | --- | --- | --- | --- |
| 1 | Header | pass | pass | "Research" (menu: Research Overview); one subtitle line, truncated at 390 by the shared header |
| 2 | Filters | n/a | n/a | No filters |
| 3 | First screen | pass | pass | Cards start at 243 px (1440) and 227 px (390); no paragraph or notice before them |
| 4 | Alignment | pass | pass | Tokens only; shared left edges |
| 5 | Identity | n/a | n/a | No players or team codes |
| 6 | Missing data | pass | pass | R16 is one line, no number; no hashes |
| 7 | Icons | pass | pass | Wrapper Lucide; 20 px headings, 16 px inline |
| 8 | States | pass | pass | Static content: no loading or error state |
| 9 | Phone | — | pass | 0 px sideways scroll; 0 touch targets under 40 px |
| 10 | Dates | pass | pass | No ISO dates |

Screenshots (full page, viewed): [1440](research-landing-1440.png), [390](research-landing-390.png).

## Hosted demo refresh: steps, not run

R11 and R12 add no endpoints, so the Caddy allowlist needs no change. The demo deploys only main
commits after CI and Images pass ([deployment guide](../../../deployment.md)):

```bash
# 1. Merge research into main (owner), push, wait for CI and then Images to pass.
# 2. From the primary checkout (or a worktree with COURTLENS_DATA_DIR=~/dev/courtlens/data):
scripts/deploy-vps.sh            # latest origin/main
# 3. On the VPS:
cd /home/ubuntu/apps/courtlens
docker compose --env-file secrets.env --env-file release.env --profile tunnel ps
curl -fsS http://127.0.0.1:8090/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/research
```

**Found while preparing (not fixed, owner's call).** The deploy config predates most Research blocks.
The R11 and R12 pages are static and will work. Several Research pages read served directories
that `scripts/deploy-vps.sh` (SERVING_DIRS) doesn't sync and `deploy/compose.prod.yml` doesn't mount,
so on the demo they would lack data:

| Directory (local size) | Read by | Effect on the demo |
| --- | --- | --- |
| `data/derived/draft-value-v1` (11 MB) | Draft Classes | value tables missing |
| `data/derived/lineup-model-v1` (13 MB) | Lineup Model tool | lineup tool unavailable |
| `data/derived/metric-backtest-serving` (180 KB) | Metric Backtest | 2026-27 score missing |
| `data/derived/win-probability-ratings` (464 KB) | Win Probability, Draft Classes rookies | dated ratings missing |
| `data/derived/impact-serving-v1/3cfdb968….json` (170 MB) | Six-Factor RAPM's 12 seasons (R01) | `deploy/pinned.env` still pins `2cd9c98b…` (47 MB, 3 seasons) |

Switching the pin to the 170 MB bundle needs a memory check first: the API container is capped at
1536 MiB. A fix would add each directory to SERVING_DIRS, the API's read-only mounts and (for the
impact bundle) `pinned.env`, then measure the API's memory on arm64. That is a deploy block of its
own; nothing here changes the deploy config.

R16 constraints observed: no Ask or provider calls; the main `.venv` unchanged; the shared Postgres
only read (R16's pinned release `a584c88b` untouched); `~/dev/courtlens-r16` and `research-r16`
untouched.

## Not done

- R16's number on the landing card and in the README (when R16 finishes).
- The owner's review and the design phase.
- The demo refresh and the deploy-config gap above.
