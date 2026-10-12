# Stats Overview: Impact before Counting — 2026-10-12

Owner instruction 40 supersedes instruction 16. Overview and its preview now use
**Profile → Impact → Counting → Efficiency → Shooting → Other**. Impact contains DPM, ODPM and
DDPM; Counting retains PTS, REB, AST, PTS Created, Rim AST and TOV. Updated the existing group-boundary
expectation. Only the Overview preset order changed.

Verification: dashboard lint/typecheck pass; Vitest **453/453**; production webpack build passes;
Stats DARKO, preview, readability/search and follow-up browser specs **24/24**. Stats desktop/phone
baselines updated for the reordered columns and reverified **2/2**. An initial phone-baseline run
was interrupted by switching the test API to the real API; the corrected fixture run passed.

Real FastAPI/PostgreSQL screenshots: `stats-impact-first-1440.png`, `stats-impact-first-390.png`.
[measurements.json](measurements.json) confirms the actual header and metric order at both widths,
no horizontal page overflow and no page errors. On desktop DPM now begins at x=663.25 and is visible
on first load. The table begins at y=371.5 and ends at y=884 in the 1440×900 viewport.

Glance test: header, filters, first desktop result, alignment, identity, missingness, icons,
loading/interaction states, phone layout and dates **pass (10/10)**. Desktop shows Profile, Impact
and Counting together; the phone retains its fixed identity and horizontally scrolling metric
region. The source credit remains a visible blue link beside the result.

Ready for owner review; only the owner can mark Stats aligned.
