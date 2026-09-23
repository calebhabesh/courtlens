# ADR 0003: Zero-cost historical player-comparison baseline

Date: 2026-09-20. Status: **accepted by owner; implementation pending**.

## Context

The September 12 portfolio scope changed CourtLoad from mandatory fantasy management to public player comparison in matchup context. The repository still contains useful planner/auth code and fixture-verified ingestion infrastructure. Its paid BALLDONTLIE player-stat assumption conflicts with the owner's requirement for zero additional spending.

The owner confirmed that a historical replay is sufficient, local operation and a recorded demo meet the baseline deployment requirement, and hosting on the existing Raspberry Pi or Oracle VPS is optional. Backend/data engineering is the primary resume emphasis, supported by rigorous ML evaluation and a polished workflow. There is no fixed deadline.

## Decision

Build the baseline from a pinned, freely downloadable historical archive, with the NocturneBear archive as the first acquisition candidate. Complete its source/coverage/provenance gate before accepting a dataset. Preserve BALLDONTLIE functionality as optional legacy code. Use actual archive attribution; the research does not establish independently verified upstream extraction provenance.

Keep Python, PostgreSQL, dbt, FastAPI, Next.js/TypeScript and Compose. Add a bounded scikit-learn experiment. Serve a dated historical comparison with one fixed scoring target, rolling baselines, player-only/context ablation and empirical uncertainty. Separate reconstructed historical results from forecasts actually made before a game.

Implement immutable dataset/observation identities and atomic serving publication. Preserve existing auth, league, roster, matching and scenario functionality as deferred code. Neither fantasy account setup nor two fantasy scoring weeks is a completion gate.

Baseline completion requires validated real historical data, player detail/comparison, reproducible evaluation, failure/temporal tests, two case studies, measured operation and a demo. A model winning, live refresh, and public deployment are not required. Do not introduce costs or replace the selected primary source without the owner's decision.

## Consequences

The app remains reproducible when an external live API is unavailable. A static archive cannot prove original schedule publication times, original stat revisions or historical roster availability. The UI/model card must retain those limitations, and the pipeline must preserve actual acquisition time rather than backdating observations.

The initial candidate still requires full-file validation. Research checked metadata and sample rows only. If it fails, report evidence and propose a zero-cost alternative rather than fabricating coverage. Local acquisition is separate from public redistribution; raw data is not automatically committed or published.

The old September 12 scope remains historical context. Its source/live requirements are amended by this decision; the detailed executable plan is [implementation-plan.md](../implementation-plan.md), with [source research](../research/zero-cost-data-sources.md) as supporting evidence. This ADR records a decision, not completed application changes.
