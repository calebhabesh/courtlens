# IM03 descriptive possession method v2

Identifier: `courtlens-impact-possession-v2`. This explicit opt-in version preserves
v1's ordered stints, factors, exposure convention, repair policy, cutoff discipline
and immutable provenance. V1 remains callable and reproduces its retained game
hashes. Original candidates and evidence are not rewritten.

Boundary corrections are source-based: retained-ball flagrant, clear-path,
away-from-play, transition-take and inbound FTs are recognized from their explicit
FT label or the nearest preceding nontechnical foul at that exact period/clock.
They cannot turn a preceding made field goal into an ordinary and-one. Retained
FTs preserve scoring in noncount records. Actual `0022500009` has Brunson's made
three, a flagrant 1-of-1 FT and Diawara's next shot; v1 merges the two controls.
`0022300006` exposes a transition-take label only on the preceding foul. Ordinary
same-team/same-clock 1-of-1 FTs after made shots can have a different shooter;
`0022300013` exposes that case. Explicit examples and independent checks cover
each family; no raw outcomes or player boxes are changed.

`IM03-R1` projects an anonymous team action only from an explicit selected CDN
`possession` identity (turnovers) or a unique cross-source row matching action
number, period and clock with an explicit team. The original row remains retained.
The repair binds its locator, original/resolved team, other-source row/hash and
deterministic envelope hash, and is stored through the existing override registry
as `impact_v2_event_repair`. `0042300303`'s anonymous shot-clock turnover resolves
to Boston from the matching CDN row. Unresolved actions fail event verification;
team identity is never inferred from estimate differences or future box outcomes.

Acceptance uses [event verification v1](impact-event-verification-v1.md). The
unchanged conventional box estimate and public-group comparisons remain measured
diagnostics. Source-backed discrepancies are retained, never fitted away. Rating
consumers must bind the new accepted method and bundle hashes; no frozen B26
identifier or forecasting feature is modified.
