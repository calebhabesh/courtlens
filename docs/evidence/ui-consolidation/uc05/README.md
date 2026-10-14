# UC05 CSS split evidence

Run 2026-10-14 on branch `ui-consolidation` after `e5a785c` (UC04 batches 6b and 6c).

## Method

1. **Dead rules.** [`dead.py`](dead.py) lists rules whose every comma-separated selector names a
   class that no `.ts`/`.tsx` file mentions (a class is live if its full name appears anywhere in
   source, or a prefix of it is built with a template or concatenation). Samples were checked by
   hand; no library classes (`lucide-*`) were flagged. [`prune.py`](prune.py) removes them from the
   selector to the closing brace (keeping comments) and drops at-rule blocks left empty; a second
   pass catches rules exposed by the first. Every surviving rule stays byte-identical and in order.
2. **Split.** [`propose.py`](propose.py) suggests an owner per section from the components that
   reference its classes. The maps ([`components-map.json`](components-map.json),
   [`pages-map.json`](pages-map.json)) assign each section of `components.css` and `pages.css` to a
   file next to its component or route; mixed sections stay in the reduced shared file.
   [`split.py`](split.py) writes each file wrapped in its original `@layer`, keeps unlayered rules
   unlayered in the shared file, and `app/globals.css` imports the files in first-appearance order.
   It refuses a split where any rule pair that shares a class, a property and a specificity would
   change relative order inside a layer. Overriding sections (`shared-overrides.css`,
   `route-surfaces.css`, `page-fallbacks.css`, `workbench-player-explorer-responsive.css`) got their
   own files so they still follow what they override.
3. **Whole-cascade check.** [`cascade.py`](cascade.py) compiles nothing itself; it compares the
   compiled `globals.css` (Tailwind PostCSS) before and after rule by rule, per layer:
   [`cascade-check.txt`](cascade-check.txt) shows 2,858 → 2,388 rules, 470 removed (the dead rules,
   counting nested children), 0 added, 0 order conflicts. A first version of this check ignored
   pairs in different `@media` contexts; the live measurement caught a 4 px phone compare-tray
   shift from exactly such a pair, the check was corrected (media queries do not change precedence)
   and the split fixed.

## Results

- `components.css` 4,698 lines / 118,022 B → 375 lines / 9,542 B; `pages.css` 4,708 lines /
  137,537 B → 286 lines / 16,562 B (shared layout and unlayered rules). 63 colocated files.
- All dashboard CSS sources: 406,772 → 352,148 B. Compiled global stylesheet: 381,128 → 318,399 B.
- All five measurement scripts (196 states at 1440/1024/390): **0 changes** against the
  `e5a785c` build ([`control-diff.txt`](control-diff.txt)).
- Full Playwright: [`playwright.log`](playwright.log).
