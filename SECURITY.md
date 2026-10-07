# Security policy

## Supported version

The `main` branch is the only supported version while CourtLens is pre-1.0.

## Reporting

Please report a suspected vulnerability privately to the repository owner. Do not include API
keys, access tokens, private rosters, raw provider responses, or exploit details in a public issue.

## Security boundaries

- Provider credentials are server-side environment variables and must never reach the dashboard.
- Passwords use Argon2id hashes; bearer tokens are signed, expire, and carry only an owner ID.
- Every league, roster, watchlist, week state, and scenario read/write is owner-scoped. Cross-owner
  resources deliberately return `404` to avoid disclosing their existence.
- Raw responses are validated as data, stored outside the web root, and never executed or proxied.
- Public analytics endpoints expose derived product views rather than downloadable raw-provider
  payloads.
- Production must use a unique 32+ character JWT secret, TLS, restricted CORS, rate limiting at
  the edge, managed database credentials, and non-demo accounts.

Fixture credentials in `courtlens seed-demo` are intentionally public and are only permitted when
`COURTLENS_ENVIRONMENT` is not `production`.
