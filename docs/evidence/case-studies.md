# Real-player historical case studies

Status: **M8 case studies complete**, 2026-09-23.  
Evaluated on published snapshot `5b14b7ed-353b-499d-a37a-6887b5f6c715`, dataset `2e99f37c-231a-4748-9f48-5b9ffa99f228`.

These case studies examine historical player profiles and comparisons at explicit cutoffs during the validation era (2022–23 regular season). In accordance with the evaluation protocol, cutoffs are chosen from validation dates to explain genuine operational behavior rather than cherry-picking test-set wins.

---

## Case Study 1: Role and Form Expansion — Thomas Bryant

- **Player:** Thomas Bryant, archive player ID `1628418`
- **Observed team:** Los Angeles Lakers (`1610612747`)
- **Historical replay cutoff:** Start of NBA date `2023-01-09` in `America/New_York` (`2023-01-09T05:00:00+00:00`)
- **Data snapshot:** `5b14b7ed-353b-499d-a37a-6887b5f6c715` (metric version `basketball-v1`, scoring version `reference-v1`)

### Quantitative profile at cutoff

| Window | Appearances ($n$) | Minutes/game | Points/game | Reference points/game | FG% | FT% | 3P% | Ref pts/min |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Season-to-date** | 25 | 21.30 | 12.68 | 24.17 | .700 | .718 | .483 | 1.13 |
| **Last-10** | 10 | 28.84 | 16.90 | 32.59 | .711 | .767 | .533 | 1.13 |
| **Last-5** | 5 | 29.48 | 19.80 | 38.04 | .792 | .824 | .333 | 1.29 |

- **Season variation:** Standard deviation $\sigma = 13.26$ reference points ($n = 25$).
- **Reconstructed target:** 2023-01-09 LAL at DEN (Game ID `0022200609`), 0 lead days, 1 team rest day.
- **Opponent allowance (DEN):** 110.5 points allowed/game, 41.5 rebounds allowed/game, 27.2 assists allowed/game ($n = 10$).

### Context and interpretation

1. **Role expansion versus scoring streak:** Following Anthony Davis's right foot stress fracture in mid-December 2022, Bryant was elevated into the Lakers' starting frontcourt. The profile separates two distinct phenomena:
   - *Minutes growth:* Bryant's floor time increased by 7.5 minutes per game over his last 10 appearances (28.84 vs. 21.30 season-to-date), establishing that the initial surge was primarily opportunity-driven.
   - *Efficiency acceleration:* In his last 5 appearances, Bryant maintained his expanded playing time (29.48 MPG) while experiencing an efficiency spike (.792 FG, .824 FT), elevating his per-minute production from 1.13 to 1.29 reference points per minute and yielding 38.04 reference points per game (+13.87 over his season baseline).
2. **Reconstructed matchup context:** Bryant's reconstructed next game placed him on the road in Denver on 1 day of rest. Denver's 10-game opponent allowance showed a disciplined interior defense (41.5 rebounds allowed/game, 110.5 points allowed/game).

### What remains unknown and operational limitations

- **Absence of injury feeds:** CourtLoad operates strictly from box scores and schedule records. It has no integration with official NBA injury reports or depth charts. It correctly captures the historical expansion in minutes and production, but cannot explain the underlying driver (Davis's injury) or forecast when Davis will return to reclaim minutes.
- **Rotational volatility:** High per-game standard deviation ($\sigma = 13.26$) reminds managers that even during an elevated form window, individual game outcomes carry wide dispersion.

---

## Case Study 2: Context and Uncertainty in Player Comparison — Chris Paul vs. Scottie Barnes

- **Players:**
  - Player A: Chris Paul, archive player ID `101108`, Phoenix Suns (`1610612756`)
  - Player B: Scottie Barnes, archive player ID `1630567`, Toronto Raptors (`1610612761`)
- **Historical replay cutoff:** Start of NBA date `2023-01-09` in `America/New_York` (`2023-01-09T05:00:00+00:00`)
- **Data snapshot:** `5b14b7ed-353b-499d-a37a-6887b5f6c715`

### Side-by-side comparison at cutoff

| Metric | Chris Paul (PHX) | Scottie Barnes (TOR) | Comparison / Context |
| :--- | :---: | :---: | :--- |
| **Season reference pts/game** | 33.77 ($n = 26$) | 33.79 ($n = 36$) | Identical baseline (gap: 0.02) |
| **Season minutes/game** | 31.08 | 34.17 | Barnes +3.09 MPG |
| **Season standard deviation ($\sigma$)** | 12.98 | 11.60 | High game-to-game variance for both |
| **Last-10 reference pts/game** | 33.85 ($n = 10$) | 36.74 ($n = 10$) | Barnes +2.89 |
| **Last-5 reference pts/game** | 31.50 ($n = 5$) | 37.98 ($n = 5$) | Barnes +6.48 (surging form) |
| **Last-5 minutes/game** | 29.83 | 35.50 | Barnes +5.67 MPG |
| **Last-5 shooting (FG / FT / 3P)** | .500 / .857 / .524 | .448 / .760 / .231 | Paul higher efficiency, Barnes higher volume |
| **Reconstructed next game** | 2023-01-11 PHX at DEN | 2023-01-10 TOR vs CHA | Different dates and opponents |
| **Rest / lead days** | 2 rest / 2 lead | 1 rest / 1 lead | Paul has extra rest; Barnes plays earlier |
| **Opponent points allowed/game** | 110.5 (DEN, $n = 10$) | 120.1 (CHA, $n = 10$) | Charlotte allows +9.6 PPG |
| **Opponent rebounds allowed/game** | 41.5 (DEN, $n = 10$) | 45.9 (CHA, $n = 10$) | Charlotte allows +4.4 RPG |
| **Replay ML estimate** | Unavailable for S1/S2 | Unavailable for S1/S2 | Frozen ML models evaluate S3 only |

### Context and interpretation

1. **Superficial equality versus operational divergence:**
   - A decision-maker evaluating only season-long fantasy averages would treat Paul and Barnes as exact peers (33.77 vs. 33.79 points/game).
   - Trailing multi-window analytics reveal substantial divergence: Barnes is playing 35.5 minutes per game over his last 5 appearances and generating 37.98 reference points/game, whereas Paul's minutes have dipped to 29.83 with 31.50 reference points/game.
2. **Defensive matchup context:**
   - Barnes's reconstructed target is at home against Charlotte (`1610612766`), whose prior 10-game allowance is 120.1 points and 45.9 rebounds per game.
   - Paul's reconstructed target is away in Denver (`1610612743`), whose 10-game allowance is 110.5 points and 41.5 rebounds.
   - Defensive allowances indicate that Barnes's opponent allows 9.6 more points and 4.4 more rebounds per game than Paul's.
3. **Uncertainty dominates the margin:**
   - Despite Barnes possessing favorable form (+6.48 in last-5) and a friendlier defensive matchup, single-game variance for both players ($\sigma \approx 12\text{--}13$) is roughly twice as large as the trailing form difference.
   - For cutoffs with calibrated prediction intervals (such as S3 cutoffs like LeBron James vs. Stephen Curry at 2023-11-15), calibrated 80% empirical intervals are ~25 points wide and heavily overlap.
   - CourtLoad refuses to synthesize an artificial "win probability" or generate an automated start/sit decision. Instead, it presents form, minutes, and opponent context alongside empirical dispersion, allowing the user to make an informed judgement under uncertainty.

### What remains unknown and operational limitations

- **Defensive matchup grain:** CourtLoad measures whole-team allowance (points, rebounds, assists allowed per game by the opponent across its prior 10 games). It does not model individual defender assignments, switch schemes, or position-specific defensive ratings.
- **Evaluation epoch boundaries:** Frozen challenger and baseline evaluation artifacts were registered for S3 out-of-time holdouts (2023–24). S1 and S2 validation cutoffs correctly return `artifact_not_available_for_cutoff` to maintain cryptographic integrity and prevent retroactive evaluation claims.
