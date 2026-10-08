# IM03 descriptive possession and stint method v1

Identifier: `courtlens-impact-possession-v1`. Inputs are the accepted IM02 candidate
hashes, their selected immutable v3/CDN events, independent schedule and team/player
boxes. `possession-policy-v2` retains its original bytes and governs repair/quality.
This contract adds descriptive outcomes; it never supplies forecasting features.

A season/phase bundle contains every nonexcluded scheduled candidate and binds its
IM02 hash, result hash, source hashes, method code, exclusive dates and retained
paths. All 40 IM02 exclusions remain in coverage denominators. Population extends
`build_possession_warehouse_for_season`; the legacy delete/rebuild path rejects IM03
datasets. Admission is one PostgreSQL transaction per season/phase. An advisory
transaction lock serializes identical admissions. The database seals memberships
and facts at commit, rejecting subsequent inserts, updates, deletes and truncation,
including an admin mutation bypass. Replaying identical membership reuses its ID;
changed inputs require a new dataset. No publication pointer moves here.

## Ordered stints

Duration comes from the accepted IM02 team segments. Event lineups are matched by
full source hash/row/action locator, never by action number or inclusive clock alone.
Both sides are five players. Adjacent equal lineups merge; an instantaneous scoring
lineup can have zero seconds. Such a row still carries its actual points/factors.
Every observed player-second must reproduce the accepted candidate; known clean-game
minutes therefore remain within one second. The retained plus-minus discrepancies
and unknown player minutes remain visible in the bundle's IM02 diagnostics.

Scoring and shot/FT outcomes conserve independent box points, FGA/FGM and FTA/FTM.
Per-event factor contributions go to their actual lineups. A possession spanning a
substitution counts once at its ending lineup; this is an explicit exposure convention,
not a claim that all its points occurred with that ending lineup. Stint/player
exposures use `game_date < cutoff` for IM03; historical v1 queries keep their semantics.

## Possessions and six-factor outcomes

An offensive shot, ordinary FT sequence or turnover establishes observed control.
Made field goals, turnovers, defensive rebounds and made final ordinary FTs end that
possession. Same-clock same-shooter `1 of 1` FTs after a made shot complete an and-one,
counted once. Offensive rebounds continue possession. Missed final FTs await rebounds;
nonfinal FT deadball rebounds do not create rebound opportunities. Period boundaries
end any active observed possession. No empty end-period offense is fabricated when
there is no offensive event. Unknown FT sequences fail preparation.

Explicit technical, flagrant, clear-path, away-from-play and transition-take FTs
retain scoring in separate noncount records; they do not invent a new possession or
remove a concurrently active possession. All their points and attempts remain in
shooting totals. Team turnovers are counted when explicitly recorded, including
uncredited team events; differences from box turnovers are retained as diagnostics.

Each offensive side retains points, FGA/FGM, FTA/FTM, turnovers, player live-rebound
opportunities and offensive player rebounds. A team deadball rebound can establish
the next offense but is excluded from both player-rebound numerators/denominators.
`TSA = FGA + 0.44 * FTA` is a conventional additive true-shooting denominator, rounded
to four decimals; it is not a counted possession. Defensive outcomes are the opposing
side's outcomes. A zero denominator yields an unknown rate in later consumers.

The game factor mart exposes these additive quantities, policy and quality. Every
possession retains contributing source locators and values; the retained inputs carry
other ordered events. No raw archive dumps are added to the API.

## Conservation gate and cross-checks

For each team/game report counted possessions minus the conventional box estimate
`FGA + 0.44 * FTA - player ORB + box TOV`, with all per-game deltas, within-two counts,
mean, p95 and maximum absolute errors. This estimate uses a fixed empirical FT weight
and differs from event counting and uncredited team turnovers. Do not tune boundaries,
add possessions, discard legitimate games or change the formula to pass the gate.
The IM03 handoff's ±2 requirement remains an acceptance gate. If any game exceeds it,
seal the resulting dataset as `candidate`, not `ready`, and record
`verification_blocked`. IM04 remains pending until this gate is resolved.

Public `pbpstats_2023/2024` is a cross-check, not an official oracle: its archive
repeats possession text across event rows. Deduplicate by game/opponent, period,
start/end clock and full `EVENTS` text, then match opponent tricodes to independent
team boxes. Retain source hashes, exact/within-two counts, every difference and all
unavailable games. There is no 2025 source; unavailable never means agreement.
