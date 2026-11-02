# Stats follow-up 84: in-season default sort and empty columns

Captured 2026-10-29 from the owner's dev servers (:8000 API, :3100 dashboard), DARKO bundle
`a918102a…` whose 2026-27 `current` board was requested 2026-10-29 with ratings through 2026-10-27.

| File | Scope | What it shows |
| --- | --- | --- |
| `in-season-dpm-1440.png` | 2026-27 regular season, through Oct 28 | DPM-ranked (Jokić, Wembanyama, Gilgeous-Alexander, Leonard, Dončić); footer "DARKO · through Oct 27, 2026"; 5 empty columns hidden, eye button after Reset table |
| `empty-columns-shown-1440.png` | same | Eye button pressed: OnBall%, PTS Created, Rim AST, rTS%, cTOV% back, all "—" |
| `before-first-rating-minutes-1440.png` | 2026-27, through Oct 25 | Ratings end Oct 27, after the cutoff: DARKO unavailable, Impact hidden, sorted by MIN (Maxey, J. Brown, LaVine) |
| `in-season-dpm-390.png` | 2026-27, phone | Same default at 390 px |

Also measured: 1999-00 (before DARKO's first season) opens sorted by MIN; 2025-26 keeps its sealed
end-of-regular-season board (Jokić, Wembanyama, Leonard). Ben Simmons (0 GP in 2026-27) has no DPM.
