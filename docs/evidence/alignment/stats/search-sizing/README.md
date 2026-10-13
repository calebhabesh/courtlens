# Stats table search sizing — 2026-10-13

Owner instruction 46 makes the table's player search more compact, following the supplied
Databallr screenshot. Desktop width is capped at 288px (previously 320px at 1440), and height
uses the existing 32px control token (previously 40px). The scoped foundation-layer rules also
size the input and clear button so entering text does not enlarge the field. Phone touch sizing
is retained below 768px. Existing font, focus treatment, suggestions and filtering behavior remain.
With text entered, the production field stays 288×32px and keeps visible focus. Suggestions retain
their existing 320px minimum width for readable player captions and align with the field's left edge.

Real local FastAPI/PostgreSQL captures: [1440 desktop](stats-1440.png),
[desktop search detail](search-detail-1440.png), [390 phone](stats-390.png) and
[375 phone](stats-375.png). [Measurements](measurements.json) confirm 288×32px desktop and
228×42px phone, 13px text and no horizontal page overflow. Scoped glance check passes:
the smaller desktop field fits the dense table, its text/icon remain legible, and phone search
remains usable without changing the controls above the table.

Dashboard lint/typecheck, Vitest **459/459** and production webpack build pass. All six existing
readability/search browser checks pass, including keyboard selection, clearing, portal suggestion
visibility, touch selection and Escape. Stats desktop/phone screenshot baselines refreshed and
verified. Ready for owner review; only the owner marks the page aligned.
