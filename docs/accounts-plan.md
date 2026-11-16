# Accounts plan: sign-up, Google sign-in, Ask behind accounts

Owner, 2026-11-16: accounts should belong to people, not only to operator invitations. Add
"Sign in with Google" (as in the owner's linewatchto project) and open password sign-up, keep the
one-click demo account, and require an account (or the demo account) to use Ask. This revises the
finish plan's F04 decision "invite-only, no public sign-up form"; everything else in F04 stays
(favourites per account, the shared nightly-reset demo list, session in an HttpOnly cookie through
the dashboard proxy, operator CLI). Record evidence in the [accounts progress log](accounts-progress.md).

## Decisions

- **One account, several ways in.** A `users` row is the person. It may hold a password, one or
  more linked Google identities (`user_identities`, keyed by Google's stable `sub`), or both.
- **Password sign-up needs a confirmed email.** Sign-up stores the account with
  `email_verified_at = NULL` and emails a confirmation link; the password does not sign in until
  the link is used. Operator-created accounts and Google accounts are confirmed.
- **No account enumeration.** Sign-up and "forgot password" always answer the same way. An address
  that already has a confirmed account gets an email saying so (with a reset link) instead of a
  second account.
- **Google links by verified email.** A Google sign-in whose `email_verified` address matches an
  existing account links to it and confirms it. If that account's password was never confirmed,
  the password is cleared and its sessions end, so nobody can pre-register someone else's address
  and keep a way in.
- **Links are pages, not side-effecting GETs.** Mail scanners open links; the confirmation and
  reset links open `/account/verify` and `/account/reset`, which act only on a button press (POST).
- **Tokens.** Confirmation (24 h) and reset (1 h) tokens are 32 random bytes, stored as SHA-256
  hashes in `account_tokens`, single use. A new token of a purpose voids the older ones.
- **Google OAuth.** Authorization-code flow with PKCE, `state` and `nonce`. The API owns the
  client ID and secret (`COURTLENS_GOOGLE_CLIENT_ID`, `COURTLENS_GOOGLE_CLIENT_SECRET`), builds the
  authorization URL and exchanges the code; the dashboard proxy only carries the short-lived flow
  cookie. Redirect URI: `{COURTLENS_PUBLIC_SITE_URL}/api/account/google/callback`. Scopes
  `openid email profile`, which need no Google verification review.
- **Email.** Plain SMTP (`COURTLENS_SMTP_*`, `COURTLENS_EMAIL_FROM`), so any free provider works.
  Without SMTP, development logs the links and production turns sign-up and reset off (Google and
  the demo stay on). A process-wide daily cap keeps under free-tier sending limits.
- **Ask needs an account.** The Ask proxy forwards the session; in public mode the API refuses Ask
  writes without a valid session. Conversations of a real account follow the account across
  browsers; the demo account keeps per-browser conversations so visitors don't see each other's.
  The per-address daily question limit is unchanged.
- **Housekeeping.** The nightly demo reset also deletes accounts never confirmed after 7 days and
  spent or expired tokens. Signed-in users can delete their own account.
- **Privacy page.** `/privacy` states what is stored (email, name, favourites, Ask conversations)
  and how to delete it; Google's consent screen links to it.

## Blocks

- **A01 Backend.** Migration (nullable password, `email_verified_at`, `user_identities`,
  `account_tokens`), services, routes, mailer, Google client, limits, tests.
- **A02 Dashboard.** Proxy routes, sign-in dialog (Google, sign in, create account, forgot
  password, demo), `/account/verify`, `/account/reset`, `/privacy`, delete account, tests.
- **A03 Ask gate.** API and proxy gate, signed-out Ask prompt, per-account conversations, tests.
- **A04 Hosted demo.** Caddy allowlist for the new writes, production env, deployment guide.
