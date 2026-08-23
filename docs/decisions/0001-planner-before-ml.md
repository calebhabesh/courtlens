# ADR 0001: The planner ships before any ML estimate

Status: accepted

CourtLoad's core user action is deciding whether a roster change creates more usable games under a
real weekly schedule. That value exists without prediction, while a weak model can make the product
less honest.

V1 therefore uses transparent trailing production only. A future estimate must use a frozen scoring
target, point-in-time features, rolling-origin evaluation, uncertainty/error reporting, and must beat
the strongest trailing/EWMA baseline in later held-out windows. If it does not, the negative result is
published and no model enters the planner.
