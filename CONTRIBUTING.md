# Contributing

1. Copy `.env.example` to `.env`; never commit the result.
2. Run `make install install-dashboard`.
3. Keep operational data, fixtures, and synthetic benchmarks explicitly classified.
4. Add tests for changes to scoring, temporal cutoffs, eligibility, or source parsing.
5. Run `make lint`, `make typecheck`, `make test`, and `make build` before opening a change.

Provider fixtures must be small and permitted for redistribution. Prefer hand-authored edge cases;
never commit a large raw backfill or an API key.

`make test-python` runs the ordinary Python suite with a disposable PostgreSQL 17
container and synthetic published snapshots. It ignores the owner's dotenv, data
and provider keys. Docker must be available; CI can instead set
`COURTLENS_TEST_POSTGRES_URL` to a fresh disposable database. Tests never need the
application database. Use `PYTEST_ARGS='tests/integration/test_workbench_api.py -q'`
to narrow a diagnosis.

Exact historical totals, playoff brackets and retained M6/forecast artifacts use
`requires_published_data`. Run them with `make test-published` after restoring a
retained backup into a disposable database and setting
`COURTLENS_TEST_POSTGRES_URL` to that database. Restore the backup's artifact tree
under `data/` in this checkout too. These checks retain their original assertions;
the synthetic suite does not certify the restored historical release.
