# Accounts progress log

Evidence for the [accounts plan](accounts-plan.md). Only the owner marks a block ✅.

## 2026-11-16: A01–A04 built

- **A01 backend:** migration `5e6f7a8b9c03`; `services/accounts.py` (sign-up, confirmation and
  reset links, Google linking, delete, prune), `services/account_mail.py` (SMTP),
  `services/google_oauth.py` (PKCE, state, nonce, ID-token checks). `tests/integration/test_accounts_sign_up_api.py`
  covers sign-up, no enumeration, claiming an unconfirmed address, resets, expired links, Google
  linking and pre-registration, ID-token audience, issuer, expiry, nonce and key, delete and prune.
  Account, migration and public Ask tests: 35 passed against SQLite and disposable PostgreSQL
  (`scripts/test_python.py`). Ruff and mypy clean.
- **A02 dashboard:** account proxy routes (sign-up, confirm, forgot/reset, delete, Google
  start/callback with a ten-minute flow cookie and same-site return path), the dialog (Google,
  sign in, create account, forgot password, demo; the demo caption and "invitation only" line
  removed), `/account/verify`, `/account/reset`, `/privacy`, Delete account in the account menu and
  drawer. Vitest: 1,111 passed. ESLint, Stylelint and tsc clean.
- **A03 Ask gate:** the Ask proxy refuses signed-out writes and forwards the session; in public
  mode the API refuses Ask writes without a valid session and keys a real account's
  conversations to the account (the demo keeps per-browser ones). Signed out, Ask shows "Sign in,
  or use the demo account, to ask questions." in place of the composer.
- **A04 hosted:** Caddy allows the new writes (`check_caddy_allowlist.sh` passed against the
  pinned image); `compose.prod.yml` passes the Google and SMTP settings and the site URL.
- **Browser:** `f04-accounts` (with two new tests) and `fo14` passed in a sandbox on :3180/:4180.
  Six `threaded-assistant`/`im07` failures came from Ask label and layout edits another session
  had in progress in the working tree ("Delete Chat"), not from accounts; the same specs passed on
  `main`.

**Email, same day:** Resend (owner's account) with `calebhabesh.com` verified through Cloudflare
auto-configure (DKIM at `resend._domainkey`, SPF and MX at `send`), a sending-only key limited to
that domain. A real local sign-up delivered "Confirm your CourtLens account" to a Gmail inbox, but
into Spam (localhost link, new domain, no DMARC, text only). Added `_dmarc` TXT
`v=DMARC1; p=none;` (cf CLI, resolves publicly) and an HTML part to every account email.

**Not yet verified:** a real Google sign-in round trip; inbox (not Spam) placement with an https
link; not deployed.

## 2026-11-16: deployed

- PR #114 (accounts + the Ask chat polish) merged as `7e32bfb4`; CI, Images and `deploy-vps.sh`
  passed; migration applied; demo seeded. CI had first failed only on the read-cache route
  classes for the two new auth GETs (fixed in `481fc211`).
- Live check: pages 200, signed-out Ask write refused with the sign-in message. It also found
  Google redirects going to `https://courtlens.calebhabesh.com:3000/` (a port-less Host assigned
  to the internal URL keeps its port). Fixed in PR #115 (`71b9eea4`), deployed; the redirect now
  lands on the public origin.
- **Open:** the VPS `secrets.env` has no Google or SMTP values yet, so production offers the demo
  account only (`/api/account/options` reports `google: false, sign_up: false`).

## 2026-11-17: Google branding verification

Google's branding check rejected the consent screen: the home page domain wasn't verified to the
owner, and `/privacy` "does not have sufficient content". The terms link pointed at another
project. Fixes: `/privacy` rewritten as a full policy (operator, what is collected, use, Google
user data with the Limited Use statement, processors, cookies, retention, security, choices,
children, changes, contact `privacy@calebhabesh.com`); a new `/terms`; the sign-in dialog links
both. Domain ownership needs a Search Console DNS TXT record on `calebhabesh.com`.
