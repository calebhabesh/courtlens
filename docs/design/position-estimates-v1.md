# Position estimates v1

Adopted 2026-10-12 for the reference alignment of Stats (catalog row 1, instruction 18). The reference site
shows five positions (PG, SG, SF, PF, C) beside each player and filters by them. No admitted free
source lists five positions for every player: the NBA roster index lists only G, F and C (with
hybrids such as G-F), and the NBA Draft Combine lists five positions only for players who attended.
CourtLens therefore **estimates** a five-position label from its own admitted data.

## Method

- **Labels:** the player's latest NBA Draft Combine position, first listed (`SG-PG` → SG). Combine
  rows without an NBA person ID are never name-matched.
- **Samples:** one per player-season in the served workbench dataset, using regular-season totals
  when the player has regular-season minutes and every phase of that season otherwise. Labelled
  samples need at least 100 minutes for training.
- **Features:** listed height and weight and listed G/F/C flags (latest roster index), plus that
  season's per-36 AST, OREB, DREB, BLK, STL, 3PA, FTA and PTS. Each rate is shrunk toward the league
  rate of the player's listed group with 300 minutes of prior weight, so small samples lean on
  size and listing. Six shares follow from the shrunk rates: AST / (AST + PTS), 3PA / PTS,
  REB / (AST + 1) and the logs of AST, BLK and OREB. Missing size takes the listed group's median.
- **Model:** standardized multinomial logistic regression (scikit-learn 1.6.1, `C = 3`,
  single-threaded, fixed seed). Fit on every labelled sample, then applied to all player-seasons.
- **Listing bound:** the estimate stays within the NBA listing: G allows PG or SG, F allows SF or
  PF, C allows only C, and a hybrid listing (G-F, F-C, ...) allows both families. Probabilities
  outside the bound are dropped and the rest renormalized; an unlisted player is unbounded.
- **Evaluation:** five folds grouped by player (no player is scored by a model that saw them).
  Reported: exact accuracy, within-one-position accuracy and the confusion matrix for the bounded
  model, the same model without the listing bound, and a bounded baseline that uses only listed
  position and size. Results live in the artifact and the progress
  notes, not here, so this contract's hash does not depend on them.

## Claims and limits

- An **estimate** of the position a player's size and box-score profile most resembles. It is not
  a roster listing, a role claim or a forecast feature, and it is labelled "estimated" in the UI.
- Listed size and position are the latest roster-index values, not backdated per season. The
  listing weighs heavily: a player the NBA lists as F-G (for example Luka Dončić) can be estimated
  as a wing even with lead-guard assist rates.
- Combine labels are pre-draft and noisy between neighbouring positions (PG/SG, PF/C); exact
  accuracy is modest while within-one accuracy is high.
- A player-season without box minutes has no estimate (unknown, never a default position).
- The artifact is append-only and content-addressed under `data/derived/position-estimates-v1/`;
  serving re-hashes it on every read, like the value/archetype store.

## Extending to new seasons

`--extend-from <sealed artifact>` labels seasons the sealed run never saw with that run's frozen
scaler and coefficients; nothing is refit. Group priors and size medians come from the sealed
seasons' own samples (a listing group absent there shrinks toward the whole league). Before writing,
the frozen model re-scores every sealed player-season and must reproduce every sealed label; any
mismatch writes nothing. Sealed seasons are copied verbatim, and `extension` records the frozen
artifact's hash, the reproduced count and the added seasons. Used for the 2000-01 to 2022-23 Stats
backfill (alignment instruction 43), so adding history cannot relabel a current player.

## The season in progress (provisional)

The sealed artifact holds complete seasons only; sealing a season in progress would freeze labels
read from a few weeks of games. `courtlens refresh-position-estimates` (a step of the daily refresh)
labels every season newer than the newest sealed one with the sealed run's frozen scaler and
coefficients and that season's box rates to date. Nothing is refit and no sealed label is read,
changed or re-checked. One input differs from a sealed run: a player's rates shrink toward his own
latest sealed season (that season's rates, themselves shrunk toward its listing group as its label
was), not toward his listing group's average; a player with no sealed season (a rookie) keeps the
group prior. With 300 prior minutes, a few weeks of games are mostly prior, and the listing
group's average sits on the SG side for G and the PF side for F: measured 2026-11-14 on 152
players with 1,500+ minutes in 2025-26, scoring their own 2025-26 rates at 50 minutes moved 32
labels with the group prior (PG→SG 15, SF→PF 14) and 15 with their 2024-25 season as the prior,
with the remaining moves in both directions; at 700 minutes both moved 6. It writes a content-addressed file to
`data/derived/position-estimates-provisional-v1/`, serves it through `.current` and prunes the
older one; identical inputs give the identical file. Serving reads a provisional season only when
no sealed season is as new, and the catalog's `position_estimates` names the provisional seasons so
the Stats position chips say the labels are provisional; a season with neither shows the chips
disabled instead of an empty table. Labels may change as the season's games accumulate. Once the
season is complete it is sealed into a new append-only artifact by an explicit owner run.

Measured 2026-11-13: the frozen model re-scored against today's roster index reproduces 12,451 of
12,819 sealed labels (368 differ, from listing and size updates since the sealed run), so
`--extend-from` now refuses to write; sealing 2026-27 will need the owner to choose between
extending from a roster index observed before the drift or a new sealed run.
