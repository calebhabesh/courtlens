# UC04 batch 5 (Ask and CourtLens-only pages) evidence

Captured 2026-10-14 against fixture builds on the fixture API (4180) in a disk-backed sandbox:
`before` is commit `7a7c004` (batch 4), `after` is the working tree, both served on 3180. Chromium,
dark theme, reduced motion, at 1440×900 and 390×844 (touch).

- [`measure-courtlens.mjs`](measure-courtlens.mjs) measures every control in `main`, drawers and
  dialogs on 20 states per viewport: Forecasts, Evaluation (and its unavailable state),
  Investigations (public and personal), a saved investigation after Verify, the operation gallery,
  Case Studies, Distributions and Trends (both views), adjusted shooting, Data Status, Settings,
  Planner, Ask (empty, answered and manual) and the Ask drawer on a player page. The fixture API has
  no saved operations or durable threads, so those states use `page.route` mocks taken from
  `saved-operations.spec.ts` and `threaded-assistant.spec.ts`; the answered turn carries a citation,
  two follow-ups and an action so every Ask control row renders. Every state reports zero page
  errors and zero horizontal overflow, before and after.
- [`before.json`](before.json), [`after.json`](after.json) and [`control-diff.txt`](control-diff.txt)
  (from [`../uc04-stats/diff-controls.mjs`](../uc04-stats/diff-controls.mjs)).
- [`playwright.log`](playwright.log): the full suite against the after build.

| Image | Shows |
| --- | --- |
| [cmp-ask-1440.png](cmp-ask-1440.png), [cmp-ask-390.png](cmp-ask-390.png) | Ask top bar and the Send button (round → kit square, D26) |
| [cmp-ask-answered-1440.png](cmp-ask-answered-1440.png), [cmp-ask-answered-390.png](cmp-ask-answered-390.png) | Follow-up and action chips unchanged (`ask-chip` does not fit the kit) |
| [cmp-ask-drawer-390.png](cmp-ask-drawer-390.png) | Ask drawer header fits one line; page-context remove (D27) |
| [cmp-ask-manual-1440.png](cmp-ask-manual-1440.png) | Manual Ask: Clear conversation, Run, Open in Stats, Save (C2, C3) |
| [cmp-forecasts-1440.png](cmp-forecasts-1440.png) | Header links (C2) |
| [cmp-investigations-personal-1440.png](cmp-investigations-personal-1440.png) | Library header, pager and legacy list actions (C2, C3) |
| [cmp-saved-detail-1440.png](cmp-saved-detail-1440.png), [cmp-saved-detail-390.png](cmp-saved-detail-390.png) | Saved investigation actions (C2) |
| [cmp-case-studies-1440.png](cmp-case-studies-1440.png), [cmp-case-studies-390.png](cmp-case-studies-390.png) | Case switch (C13) and actions (C2) |
| [cmp-trends-390.png](cmp-trends-390.png), [cmp-adjusted-shooting-390.png](cmp-adjusted-shooting-390.png) | Filter-bar view switches at phone width (C13) |
| [cmp-settings-1440.png](cmp-settings-1440.png), [cmp-planner-1440.png](cmp-planner-1440.png) | Legacy `ui/button` callers (C1) |
