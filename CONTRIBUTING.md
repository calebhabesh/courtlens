# Contributing

1. Copy `.env.example` to `.env`; never commit the result.
2. Run `make install install-dashboard`.
3. Keep operational data, fixtures, and synthetic benchmarks explicitly classified.
4. Add tests for changes to scoring, temporal cutoffs, eligibility, or source parsing.
5. Run `make lint`, `make typecheck`, `make test`, and `make build` before opening a change.

Provider fixtures must be small and permitted for redistribution. Prefer hand-authored edge cases;
never commit a large raw backfill or an API key.
