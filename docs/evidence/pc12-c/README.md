# PC12 batch C: demo hygiene

Implements C after B `7cb48bd`. D and PC13 remain pending; no owner gate applies between batches.
[Contract](../../design/demo-hygiene-v1.md). Existing owner Stats/guide edits are preserved and
excluded from this commit and the isolated production build.

- Evaluation opens the frozen M6 archive through an explicit archive read, independently of the
  current publication pointer. The registered dataset, scoring and report-hash checks remain.
  Explicit incompatible snapshot links preserve their selection/error and provide archive recovery.
  A paired error graphic labels the reference-points formula and support. The basketball-points
  forecast experiment remains separate.
- Saved Investigations opens a curated menu of four real findings with readable display titles,
  pinned original IDs and manifest hashes. Missing/mismatched examples are omitted with a useful
  action. Personal/legacy records remain locally under `?view=personal`; the hosted flag omits that
  navigation and always renders the public menu, including for the personal-view URL.
- Saved distributions lead with observed dots, numeric value-axis ticks, units, appearance/date
  endpoints, order, source and observed/unknown counts. Unknown slots have no dot; zero stays zero;
  no interpolation or invented uncertainty. Round marks retain their size at each viewport.
- Original saved titles, manifests, results, exact exports and reproduction behavior remain.
  Technical saved-result definitions, inputs, limitations and hashes are in Data details.
  Playoffs' title now matches its navigation.

## Real production first loads

[Capture](capture.mjs), [measurements](measurements.json), [fresh glance judgments](glance.json).
The clean export is HEAD plus C, excluding owner edits. UI at 3413 reads the real API at 8000,
through a [GET-only adapter](api-adapter.mjs) at 4183 for browser reads. Owner UI/API settings and
ports 3000/3100 remain intact. No acquisition, publication or model fit ran.

Seven routes enter without query parameters, at 1440×900 and 390×844: 14 viewport captures plus
full-page versions. All have zero page/console errors, failed responses or sideways overflow, and
no ISO dates, hashes, cutoff code rules or verification titles in the main flow. All sampled
non-table phone controls meet 40px. Desktop small Data details triggers retain their existing
28px treatment; these are not phone touch-target failures.

- Evaluation: [desktop](screenshots/evaluation-desktop.png), [phone](screenshots/evaluation-phone.png).
  Frozen report `6f7af9e63f27aada910d`, registered SHA-256 `84d54433…`; 39,988 scored forecasts,
  EWMA MAE 7.82 versus context 7.96 reference points. Graphic begins at 227/278px (desktop/phone).
  Glance **11/13 applicable**; the identity item is not applicable to an experiment.
- Public menu: [desktop](screenshots/public-investigations-desktop.png),
  [phone](screenshots/public-investigations-phone.png). Four retained findings start at 227/259px.
  Glance **10/13**: no analytical graphic is expected on a finding menu; its phone summary clips,
  while every card keeps full scope. Alignment and exhaustive states remain partial.
- Saved distribution: [desktop](screenshots/saved-distribution-desktop.png),
  [phone](screenshots/saved-distribution-phone.png). Scottie Barnes' five retained games have
  35/26/17/5/9 points, mean 18.4; plot begins at 351/431px. Appearance spacing is ordinal, not
  calendar time. Glance **12/14**.
- Other curated details: [periods](screenshots/saved-periods-desktop-full.png),
  [venue](screenshots/saved-venue-desktop-full.png), [peers](screenshots/saved-peers-desktop-full.png),
  with phone/full-page captures beside them. All load and keep exact numerical results, but the
  operational metadata tiles precede their analytical tables and there is no leading graphic.
  Each is **8/13 applicable**, with the specific first-screen/visual/source limits recorded.
  C cleans labels/evidence; it does not claim these inherited analytical layouts are verified.
- Playoffs: [desktop](screenshots/playoffs-desktop.png), [phone](screenshots/playoffs-phone.png).
  Title and selected tab agree; 15 observed series. Bracket starts at 388/396px. Glance **10/14**;
  existing source/coverage presentation and chart limitations remain partial.

All-page alignment and real-service loading/error/empty injection remain incomplete; these pages
are **implemented/tested**, not exhaustively verified. Prior A/B and injury/transaction source gates
remain as recorded. The existing Compare Export failure is unchanged; no full-browser-green claim.

## Retained evidence and read-only checks

[Before](read-only-before.json) and [after](read-only-after.json) match: 161 publication pointers
with the same pointer digest, 1,031 identities, 205 feed datasets / 200,690 versions and members,
and all 340 measurement rows retained. [Saved counts](saved-counts.json): all 33 saved analytical
records and 236 legacy investigations remain. [Original evidence identities](retained-evidence.json)
records each original title, manifest/result hashes, and exact JSON export hash, plus the frozen
evaluation identities. The server verifies both saved manifest and result hashes on every read.

PC13 must package these four exact saved findings and their pinned releases. This batch's hosted
flag is a menu policy; PC13 still owns public API exposure, deployment controls and replay threads.

## Verification

- [Python](verification/python.log): **2,036 passed** (four new archive-selection cases), one
  existing browser-server prerequisite skip, 19 published-data deselections, existing third-party
  deprecation warning. The initial [in-repo scratch run](verification/python-inrepo-temp.log) had
  one repository-scan failure because scratch files were inside the checkout; the corrected full
  run uses external scratch space. [Ruff](verification/ruff.log), [format](verification/format.log)
  and [strict mypy](verification/mypy.log) are clean.
- [Dashboard lint](verification/dashboard-lint.log): 0 errors / 0 warnings;
  [types](verification/dashboard-types.log) clean; [Vitest](verification/dashboard-unit.log):
  **439 passed**, including plot axes, retained order, unknown gaps, zero/signed values and singleton
  geometry. The owner's existing pending edits also pass these local dashboard checks.
- [Final affected browser run](verification/playwright-final.log): **54 passed** across new C paths,
  Evaluation/Compare, saved operations, research operations, legacy conversations and Live.
  C entry checks include 1440, 768, 390 and 375px; mismatch recovery and changed manifests are
  explicit. Saved-operation checks still verify exact exports/reproduction and personal pagination.
- [Final baseline checks](verification/baseline-check-final.log): six new captures and four refreshed
  Evaluation/Playoffs captures pass. Refresh reasons: leading archived-error visual, full phone
  scope, corrected Playoffs title, public finding menu and labeled saved plot.
- [Fixture build](verification/build-fixture.log), [real build](verification/build-real.log),
  [hosted-flag build](verification/build-hosted.log) pass. [Hosted checks](hosted-check.json),
  [script](hosted-check.mjs), [log](verification/hosted-check.log): four desktop/phone path checks
  confirm the public menu and no personal/legacy navigation. The hosted fixture retains one real
  distribution and explicitly reports the other three examples unavailable; real captures have four.

## Reproduction

```bash
# Use external scratch on the main disk, not inside the checkout:
TMPDIR=/home/ethioking/.cache/courtlens-pc12-c .venv/bin/python scripts/test_python.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtlens
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
# Separate dashboard export, fixture API at 4100, production UI at 3422:
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3422 npx playwright test e2e/pc12-demo-hygiene.spec.ts e2e/saved-operations.spec.ts
# Separate dashboard export, real API at 8000:
COURTLENS_API_INTERNAL_URL=http://localhost:8000 NEXT_PUBLIC_COURTLENS_API_URL=http://localhost:4183 npm run build -- --webpack
node docs/evidence/pc12-c/api-adapter.mjs
# In that dashboard export:
COURTLENS_API_INTERNAL_URL=http://localhost:8000 PORT=3413 HOSTNAME=127.0.0.1 node e2e/start-dashboard.mjs
# From the repo:
node docs/evidence/pc12-c/capture.mjs
```

Next: **PC12 D**, fixed-rule example boards for Rankings and Tier Lists. No owner data was deleted
or retitled.
