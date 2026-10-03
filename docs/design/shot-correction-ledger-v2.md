# Reviewed shot correction ledger v2

Registered 2026-10-03 before corrected 2024–25 execution. Preserve
[ledger v1](shot-correction-ledger-v1.md), its original exclusion and results.
All complete official observation, original-row hash, review, exact whole-game
membership/outcome/clock checks and immutable retention requirements remain.

Add only `replace_observed_shot_type`: an exact original game/event/raw-row hash
may change normalized 2/3 value to an explicit `replacement_shot_value` of 2 or
3 established by that same event in retained official full-game observations.
The original type must differ. All other official event identity/outcome/clock
fields and complete post-correction membership must still match. Makes,
geometry/distance, player/team, clock and game identity cannot be replaced.
Zone classification is recomputed by `shot-zones-v1` using original geometry
and the corrected observed type. Reconciliation still precedes exclusions.

Every original corrected row remains in `corrections.json`; normalized corrected
membership retains the original raw-field hash plus the separately bound ledger.
An authoritative observed type correction is not an inference from coordinates
or a counts-fitting adjustment. Counts alone never authorize it. A v1 ledger
cannot request type replacement. New candidates bind the exact v2 contract,
ledger, official observation and implementation hashes.
