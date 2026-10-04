# B28 finance acquisition and schema evidence

Measured 2026-10-03. Implements the owner-approved manual path under [finance-import-v1](../design/finance-import-v1.md). No delegated agents, subscription, finance UI or B29 computation.

## Free-source spike

Bounded ordinary HTTP requests to two Toronto announcement pages, NBA's reporting/identity pages, Basketball Reference contracts and Spotrac free agents all returned 403. [Receipts and import verification](../evidence/b28-finance-import.json) retain status, exact rejected-response sizes and hashes; ignored local bytes are under `data/artifacts/b28-source-spike`. No challenge/access bypass was attempted. These observations establish failure of the selected direct download paths, not absence of every free source.

The browser search/open tool exposes [Toronto's extension announcement](https://www.nba.com/raptors/news/raptors-extend-ingram), [NBA-hosted AP reporting](https://www.nba.com/news/raptors-brandon-ingram-extension) and [canonical NBA identity](https://www.nba.com/player/1627742/brandon-ingram). The retained manual bundle contains small factual operator notes, with URLs, attribution, capture method and actual acquisition time. These are neither original article byte captures nor permission for a comprehensive scraping service. Retrospective announcement facts remain useful despite the direct automation gate.

## Real bounded admission

[Initial manual bundle](../evidence/b28-manual-input/manifest.json) admits six observation families for one historical extension, initially retaining unknown monetary/option/guarantee/year terms. Historical association identifies Toronto at the announcement, without using the current player page's team. Existing canonical NBA identity `5fc338d8-b281-43d4-bb3f-12a880b64801` was independently already present.

[Reviewed correction bundle](../evidence/b28-manual-correction/manifest.json) appends two explicit revisions using the reported source: contract years and total contract value. No original term or input bytes changed. The descendant selects six rows, with one total amount, and retains original IDs for its other four families. Seasonal salary/cap hit, option and guarantee schedules are still unknown. No annual amount is derived from the total and no present free-agency claim is made. Both source statements remain accessible as independently dated observations.

Tracked worker jobs `b0f561f7-b49b-4b65-8a49-0b840aa8d456` and `eaa3d8f3-05e4-46ae-b844-d625d0c6ddc1` succeeded. Financial books `96b89635-82b4-47c7-b4f6-52ab85c0f0bc` and `256f66b1-129d-4904-be30-7b946f6e92fc` verified their raw CSV/source bytes and resolved memberships. Repeat admission reuses the descendant. Real SQL update and membership-extension attempts reject. The public basketball snapshot remains `5bbb6035-6794-4bb0-b894-7208f52ef7ad`.

## Reproduction

```bash
.venv/bin/alembic upgrade head
courtload finance-template /tmp/finance.csv
courtload finance-preview docs/evidence/b28-manual-input
courtload finance-import docs/evidence/b28-manual-input --execute-now
courtload finance-verify 96b89635-82b4-47c7-b4f6-52ab85c0f0bc
courtload finance-preview docs/evidence/b28-manual-correction
courtload finance-import docs/evidence/b28-manual-correction --execute-now
courtload finance-verify 256f66b1-129d-4904-be30-7b946f6e92fc
```

On another database, seed independently validated canonical identities and import the initial bundle first. The correction example contains installation-specific parent/observation IDs: adapt a copied bundle to the newly returned IDs, regenerate CSV hash, and retain the adapted manifest. Do not overwrite these measured bundles. Source notes are historical acquisition evidence, not a present daily refresh.

## B29 handoff

Require explicit finance release identity; do not silently select a branch/newest book. Resolve inherited source provenance and independently apply actual observation/effective boundaries. Unknown effective dates need explicit handling, and an old announcement acquired today cannot pass an earlier known-at boundary. Contract-signing observations are not enough to infer present open-market status. Known payroll uses admitted seasonal amount kinds only. Thresholds, value conversion, comprehensive roster/financial coverage and automated refresh stay independently gated. Full database backup/fresh restore acceptance remains open; raw source and CSV bytes are in the database, and `finance-verify` provides the focused integrity check.
