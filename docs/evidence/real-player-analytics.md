# Real-player analytics validation

Status: **M4 player profile and presentation evidence complete**, 2026-09-21.

Do not complete this with fictional fixtures. Use one lawfully retrieved real player and publish
only derived data allowed by the current source contract.

## Reconciliation

- Player and as-of cutoff: LeBron James, archive player ID `2544`, start of NBA date
  2023-01-09 in `America/New_York`.
- Data snapshot: M3 serving snapshot `4ea4a228-b8bc-4a4c-b4c1-93e809a8a32d`, reproduced
  and republished for M4 as snapshot `5b14b7ed-353b-499d-a37a-6887b5f6c715`; both use immutable dataset
  `2e99f37c-231a-4748-9f48-5b9ffa99f228`, content hash
  `be2dae2706f9c90d37fef4c70e523e5925c247a2f091d6b885a65255d0b92c4a`.
- Games available and limitation: 30 confirmed 2022-23 appearances precede the cutoff. The
  archive is revised historical reconstruction observed in 2026, not original pregame history;
  the global malformed-minute quarantine and 179 excluded games still apply.
- Last-5: 32.800000 points, 51.340000 reference points, 1.468535 reference points/minute,
  FG .551724, 3P .275862, FT .823529.
- Last-10: 33.000000 points, 52.320000 reference points, 1.496782 reference points/minute,
  FG .565789, 3P .264151, FT .828571.
- Season-to-date (30): 28.666667 points, 49.936667 reference points, 1.393862 reference
  points/minute, FG .506006, 3P .301980, FT .757576.
- Independent calculation: a Python `Decimal` calculation read `archive_player_games` directly,
  selected only `game_date < 2023-01-09`, calculated the serialized reference formula, and used
  summed matched makes/attempts and valid positive-minute rows. Every value matched the dbt JSON
  value within `1e-12` (the tolerance only covers JSON floating serialization).
- Last-10 source games, newest first: `0022200595`, `0022200590`, `0022200530`,
  `0022200518`, `0022200505`, `0022200494`, `0022200492`, `0022200475`,
  `0022200451`, `0022200437`. Their points were 37, 25, 47, 27, 28, 38, 34, 31, 33 and 30.
- Temporal/target check: the maximum contributing history date is 2023-01-07. The reconstructed
  target is 2023-01-09 against team ID `1610612743`; no target-date outcome contributes.

## Presentation

- Profile screenshot: [desktop](../assets/real-player-profile.png) and
  [375 px mobile](../assets/real-player-profile-mobile.png), pinned to M4 snapshot
  `5b14b7ed-353b-499d-a37a-6887b5f6c715` and replay date `2023-01-09`.
- Trend screenshot: included in both profile captures. The page shows minutes, FGA/FTA and
  CourtLoad reference production on the same ten prior appearances; the game log is the visible
  numeric alternative.
- Same-cutoff two-player comparison screenshot:
- One question the profile answered more clearly than a raw game-log table: LeBron's last-five
  output was elevated without a comparable minutes increase: 51.34 reference points in 34.96
  minutes versus 49.94 in 35.82 season-to-date minutes. The trend and summaries show the
  distinction without implying why it happened.
- One confusing or misleading presentation that was changed: the mobile game-log table initially
  expanded the whole document to 940 px. Paint containment now keeps horizontal scrolling inside
  the explicitly labeled table while the 375 px page itself remains fixed-width.

## Lineage

- Displayed metric: last-five CourtLoad reference points per game, `51.34`, plus `34.96` minutes
  per game. The API and page read these from the pinned serving profile rather than recomputing
  the windows in TypeScript.
- Serving mart row/version: `mart_archive_player_profile`, metric `basketball-v1`, feature
  `historical-prior-day-v1`, reference-scoring SHA-256 stored on the serving snapshot.
- Intermediate and normalized grains: dataset/player/replay date profile →
  dataset/player/game `fct_archive_player_game` → immutable `archive_player_games`.
- Raw object/checksum trace: each normalized row retains source version and observation IDs;
  those resolve to the archive artifact hash and exact CSV line through `archive_observations`.
