# Stats: muted NBA-blue background and picker dead ends — 2026-10-13

Owner instructions 41 and 42.

**41, color scheme.** `--color-bg` is `#15325a`, a darker, muted take on the blue inside the NBA logo
(`#01408b`, owner-supplied image; same hue) so the page frames the tables instead of competing with
them. Containers are neutral charcoal steps: surface-0 `#0e1013` (tooltips and wells that used to
borrow the old page black), surface-1 `#15171b`, surface-2 `#1c1f24`, surface-3 `#24282e`. Text placed
directly on the blue uses `--color-on-bg-secondary` `#c9d3e6` (8.52:1) and `--color-on-bg-tertiary`
`#b4c2dc` (7.15:1): header nav and ghost buttons, filter-bar field labels, the What's New note. The help
row buttons are filled charcoal like the other controls. `--color-text-tertiary` moved to `#858b95` to
keep AA on surface-2 (4.82:1). Measured with `scripts/verify-contrast.py`; Design Language v1 token
and contrast tables updated. A DOM probe confirmed no visible text on the page background uses a
container-only text token on /stats.

The token is global, so every page shows the blue. Other pages keep their own on-background
secondary text until their alignment pass.

**42, Manage Custom Views.** The column picker no longer offers the PBP play-type "analogue" buckets
(computed, but implausible in live data: Create TS 17–37%, Unknown TS 101%) or the always-empty Six
Factor placeholder. Saved views that already contain them still render. Live probe: neither appears
in Add View.

Screenshots (live FastAPI/PostgreSQL via the running dev server): `stats-blue-1440.png`,
`stats-blue-390.png`, `manage-views-picker-1440.png`.

Verification: dashboard lint and typecheck clean; Vitest 454/454 (new picker test). Visual baselines
regenerated with `--update-snapshots=all`, because Playwright's default 0.2 per-pixel threshold treats
the old near-black and the muted navy as equal, so a plain update kept stale baselines. 96/96 visual and
native-select specs pass, and with the five Stats specs 122/122.

Ready for owner review; only the owner can mark Stats aligned.
