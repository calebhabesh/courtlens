# Team Comparison (`/team-compare`) — 2026-10-17

Alignment row 15. `/team-compare` is a single centered 920px comparison card pairing two team seasons side by side:

- **Team identity & series score:** Square `176×176` (`112×112` on phone) team-tinted logo panels with in-place franchise picker triggers (`TeamGrid` with `edgeHighlights={false}`), full franchise names (`Oklahoma City Thunder`, `Boston Celtics`, etc.), per-team season selectors, and season/playoff series win counts (`32px` desktop / `24px` phone) centered between each team's logo box and the center `-` hyphen above `vs`.
- **Paired player rotations & verified starting units:** Release-bound offline read-only starting-lineup snapshot (`starter-evidence.bf09e1d964030a116b25996df57e53b051f5f45500e0343781a9d7784bc3d563.json`) derived from admitted raw NBA box-score `position` fields splits `By Position` into **Most-used Starting Five** (`G`, `G`, `F`, `F`, `C`) and **Bench & Alternate Starters** sorted by team minutes. Outer-edge player values (`20px` desktop / `16px` phone) use semibold `600` weight and team-tinted fill on the leading side of each pair (`400` on the trailing side).
- **Team Stats & Edit Metrics drawer:** Searchable `Edit Metrics` drawer in the scope console customizes both `Rotation Metrics` (20 metrics across Impact, Counting, Shooting & Efficiency, and Exposure) and `Team Stats` (25 metrics across Overview & Record, Pace & Efficiency, Scoring & Shooting, and Four Factors Offense/Defense).
- **Docked `Game History` tray:** Expands beneath `.tc-draft-card` (matching Player Comparison's `Trend lines` tray) to show the season/playoff series game scoreboard (`G1`, `G2`, … with venue, score, and winning margin badge), a 6-pill game team totals strip (`FG`, `3P`, `FT`, `REB`, `AST`, `TOV`), and side-by-side compact player box-score tables (`Top 5` / `Full Box`) fetched on demand from `/api/live/historical`.

## Captures & Verification

- Desktop (`1440×900`): [team-compare-1440.png](team-compare-1440.png)
- Desktop with `Game History` open (`1440×900`): [team-compare-game-history-1440.png](team-compare-game-history-1440.png)
- Phone (`390×844`): [team-compare-390.png](team-compare-390.png)
- Measured layout and typography verification: [verification.json](verification.json)
