CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# ADR 0001: Player analytics and the planner ship before any ML estimate

Status: accepted

CourtLoad's core public value is understandable, source-traceable player analysis; its strongest
applied action is deciding whether a roster change creates more usable games under a real weekly
schedule. Both remain useful without prediction, while a weak model can make the product less
honest.

The portfolio requires a completed baseline/model evaluation, but product promotion is conditional.
An estimate must use a frozen scoring target, point-in-time features, rolling-origin evaluation,
uncertainty/error reporting, and must beat the strongest trailing/EWMA baseline in later held-out
windows. If it does not, the negative result is published and no model enters the player profile or
planner; both continue to use transparent descriptive production.
