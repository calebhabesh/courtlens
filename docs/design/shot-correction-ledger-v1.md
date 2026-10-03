# Reviewed shot correction ledger v1

Registered 2026-10-03 before correction application. This implements the next
correction boundary described by [shot admission v2](shotchart-admission-v2.md)
without changing that retained policy or its earlier uncorrected results.

Retained complete official NBA game-page HTML is an accepted authoritative
observation: its single `__NEXT_DATA__` JSON contains final game identity and the
full `playByPlay.actions` list. This extends the earlier prescribed PDF/JSON
acquisition formats to JSON embedded in retained official HTML. Retain the
entire original HTML, actual URL/time/byte count/SHA-256 and separately retained
official game book corroboration. The derived extract's identity is the parent
HTML hash and explicit JSON locator, not a claim of a direct NBA JSON download.

The ledger binds original archive, v2 contract and this correction contract;
each unique game/event exclusion binds the original raw-field hash and reviewed
conclusion. Review timestamps cannot precede evidence or postdate execution.
Only `exclude_not_official_attempt` is supported. Never replace coordinates or
distances from the PBP: their provider encodings differ. Event key is
`actionNumber`, not `actionId`. Non-shot action keys may repeat; field-goal keys
must be unique. Validate explicit field-goal flags, make/type, positive NBA IDs,
period and bounded clock. Official decimal clocks are truncated to the original
whole-second ShotChartDetail precision for comparison, never rounded upward.

Application must establish complete exact equality of the remaining game's
official field-goal event membership, player/team IDs, period/whole-second clock,
make flag, type and game date. A missing archived target, duplicate identity,
changed original row hash, remaining official target, additional missing/extra
official event or any observed identity/outcome mismatch fails closed. Exact
independent player/team shooting counts remain mandatory after application.
Geometry still uses the original archive and the frozen v2 exclusions.

Retain the ledger, every excluded original row/raw fields, all pre-correction
comparisons and clock diagnostics, official full bytes and receipts. New proof
and season candidates bind the ledger byte hash and correction implementation.
No alteration of original archive, v1 or earlier v2 artifacts, database
memberships, historical forecasts or model protocols occurs. This source
correction does not authorize fitting or possession/aftermath ordering.
