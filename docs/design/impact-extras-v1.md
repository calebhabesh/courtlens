# CourtLens defense and shooting extras v1

IM05 is an offline descriptive block. IM06 activates serving. Keep the active v1/v2
catalogs, frozen B26 experiments, rating artifacts, IM03 memberships and forecasting
features unchanged. The separately versioned `IMPACT_EXTRAS_CATALOG` uses the shared
`MetricDefinition` contract and is retained in every output for IM06 registration.

## Inputs and identity

Consume only the six event-accepted IM03 v2 bundles; rehash acceptance, its evidence,
contracts/code, complete bundle membership, games and IM02 candidates. Match candidate
event-lineup locators to actual retained selected-source rows. Rehash raw archive and
box bytes against the IM01 observation and IM02 receipts. Reconstruct neither lineups
nor possessions. Use exclusive `game_date < cutoff`, independent schedule dates and
separate regular-season/playoff cohorts. Reject duplicate identities and invalid counts.
Missing sources or ambiguous/conflicting joins remain unknown, with counts/reasons.

Matchup grain is game/offensive-player/defensive-player. In this archive `person_id`
is offense and `matchups_person_id` is defense: verify opposing box teams, rather than
using a name or the column label to decide. Source `team_id` belongs to offense.
Sum the source's matchup FGA for each defender; divide by their actual IM03 defensive
controls in games with valid matchup rows for that player. This is **matchup FGA
faced/100**, not tracking DFGA or contests. Do not force these tracking assignments to
conserve box FGA. Record per-game offensive matchup-minus-box FGA differences.
An actor absent from the independent box roster makes that game's supplemental
matchup metric unavailable for all players; list every affected row/identity.
The admitted game remains in all other samples. Do not map an unknown actor by name.
Reference schema: [nba_api BoxScoreMatchupsV3](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/boxscorematchupsv3.md).

Shot detail joins selected-source field goals by game/actionNumber (= GAME_EVENT_ID),
player, team, period, clock second, value and outcome. A duplicate/conflicting row is
unavailable for that join; retain a reason. Restricted Area is the rim zone. Do not
guess a defender from aggregate matchups or distribute shots across five defenders.

## Samples and formulas

All counts aggregate before division. Ratios are fractions; per100 units are explicit.
Each metric retains numerator, denominator, covered games and total player games.
Zero numerator on a verified complete sample is zero; missing count/actor, missing
source and zero denominator give null. No automatic minimum for descriptive values;
ranking eligibility requires 500 reconstructed minutes and 200 denominator units for
rates (counts require 500 minutes), always recorded separately. No causal claims.

Box-backed counts use strictly valid appeared player rows from games in IM03: points,
FGA/FGM, 3PA/3PM, FTA/FTM, AST, STL, BLK and personal fouls. Invalid or absent rows do
not become zero. Existing height/wingspan and IM04 DRAPM/DBPR/dTS/dTOV/dREB are reused
in IM06; no new measurements or fits in this block.

- STL/100, BLK/100: box counts / actual on-court defensive controls * 100.
- FOUL frequency: box PF / mean actual offensive and defensive controls. This
  includes offensive personal fouls; it is not a probability or tactical estimate.
- DRB%: explicitly credited player defensive rebounds / individual live rebound
  opportunities on defense at the **rebound event lineup**. Team rebounds are omitted.
- Block recovered fraction: uniquely linked blocked FGs followed by an individual
  rebound recovered by the defending team / blocked FGs with known individual recovery.
  Report unresolved/team/dead-ball recoveries; this conditional fraction is not all blocks.
- TS = points / (2 * TSA), TSA = FGA + 0.44 FTA. rTS subtracts selected-window,
  same-phase league TS. TSAdd/100 = (points - 2*TSA*league_TS) / offensive controls*100.
  These are box-estimate TS denominators, not event-control denominators. League
  references use paired complete box rows, never future or other-phase rows.
- 3PR = 3PA/FGA; FTR = FTA/FGA; AST/100 = AST/offensive controls*100.
- Bad-pass turnovers: selected PBP player turnovers whose explicit subtype contains
  `bad pass`; includes out-of-bounds bad passes. No inference of intended recipient.
- Rim assists: uniquely identified assists on made, joined Restricted Area FGs.
- Self/team-miss ORB fractions: player offensive rebounds / live individual rebound
  opportunities after their own / another teammate's missed FG, respectively. FT,
  team and ambiguous rebound links are omitted and reported. Opportunity lineup is
  the rebound lineup, allowing between-event substitutions.
- Charges drawn: explicit CDN offensive-charge foul + unique opposing
  `foulDrawnPersonId`, matched to the selected-source foul identity. Missing CDN or
  unresolved charge actors makes the whole game's charge metric unavailable.
- Credited forced turnovers (analogue): box steals + explicitly credited charges
  drawn. These disjoint event families exclude other defensive pressure; not all FTOVs.

## PBP play-type analogues

These labels describe a reproducible partition, **not Synergy play types or tracking
creation/spacing**. Each FG is assigned once, with precedence Trans → Finish → Space
→ Create. Trans requires a preceding counted opposing control ending in an explicit
turnover or defensive rebound, in the same period, and a shot within six seconds of
that ending (not six seconds after the first shot). Finish = joined Restricted Area;
Space = uniquely credited assisted made non-rim shot. Create is the residual known
unassisted FG (including misses, where assistance is undefined), not proven creation.
Unresolved made-shot assist or zone identity goes to Unknown. FT contributions go to
Unknown; no fictional play type is inferred from free throws or foul outcomes.

Each bucket exposes TSA, TSA / all player TSA, TS, and rTS relative to that bucket's
same-phase selected-window league TS. Sum all five TSA and points to complete player
box totals; no missing join changes that conservation. Frequencies include Unknown.
Per-bucket small samples remain descriptive and use the same eligibility rule.

## Source gates

Wave 2: deflections, potential assists, OnBall%, tracking DFGA and individual rim
points saved require admitted hustle/tracking/per-shot defender evidence. STOP%,
D-SQI and general FTOV/sTOV require explicit method/attribution definitions as well;
do not attach vendor definitions or call steals a complete forced-turnover measure.
NBA [glossary](https://www.nba.com/stats/help/glossary) supplies conventional TS/FTR
context; CourtLens-specific analogues above are separately defined. No Databallr
requests, output comparison, vendor-equivalence, predictive or isolated-skill claims.

## Artifacts and verification

One content-addressed artifact per season/phase, with player values/support,
complete catalog, sample rule, selected game fact hashes, league/bucket references,
coverage/repair disclosures and source limitations. Semantic hashes bind selected
facts and code/contract hashes, excluding full-season source hashes and acquisition
timestamps; full raw/bundle receipts are separate provenance. Future facts cannot
alter an earlier-cutoff artifact. Exclusive writes reject overwritten artifacts.
Two complete offline replays must reproduce hashes. Tests independently verify
formulas, orientation, identity conflicts, unknowns, rebound substitutions,
transition timing, TSA/point conservation, temporal isolation and forecast isolation.
Record full Python regression and repository Ruff/format/strict mypy evidence.
