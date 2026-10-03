# Yahoo basketball analytical features and CourtLoad transfer opportunities

Checked 2026-10-01 for the proposed CourtLoad interface and capability revamp. This is a primary-source feature investigation, not verification of a paid Yahoo account or an implementation plan. Existing [workbench milestones](../workbench-implementation-plan.md) remain pending. Proposed CourtLoad extensions below require owner decisions and their stated data gates.

Yahoo is useful inspiration for statistical comparison, contextual splits, and organized research. The accessible material does not establish an NBA semantic AI search feature or a current basketball-specific projected minimum/maximum product. The name Research Assistant describes a comparison tool; it is not evidence of natural-language database search. [Yahoo overview](https://help.yahoo.com/kb/fantasy-basketball/overview-yahoo-fantasy-sln35629.html), [current benefits hub](https://fantasysports.yahoo.com/lp/plus/perks)

## Observed features versus proposed adaptations

“Observed” means documented in Yahoo's official material or visible in an indexed official basketball interface. The CourtLoad column is architectural inference, not a claim about Yahoo's implementation.

| Observed Yahoo capability | Proposed CourtLoad analytical job | Limits and prerequisites |
| --- | --- | --- |
| Research Assistant combines player comparison with stats, projections, and news. [Overview](https://help.yahoo.com/kb/fantasy-basketball/overview-yahoo-fantasy-sln35629.html), [benefits](https://fantasysports.yahoo.com/lp/plus/perks) | Compare named players with metric cards, sample sizes, trends, charts, and source evidence. | Box scores support descriptive comparison. Yahoo recommendations use provider projections; CourtLoad estimates need its separate registered policy. News and injury evidence are additional sources. |
| Basketball tables expose recent date windows and previous seasons. [Official basketball interface](https://basketball.fantasysports.yahoo.com/2025/nba/11270/12/team?date=2026-04-12&week=24) | Compare production and efficiency across clearly named periods. | Keep calendar windows distinct from last-N-appearance windows. Missing player rows are not zero outcomes. Exact Yahoo ranking/selection formulas were not verified. |
| Home/Away and No Rest/1 Day/2 Days/3+ Days Rest split controls appear in the NBA interface. [Official basketball interface](https://basketball.fantasysports.yahoo.com/nba/3017/5/team?date=2026-09-13&week=1) | Investigate historical venue/rest splits with samples and individual games. | Validate dates, team sides, schedules, and the rest definition. Splits are descriptive; they do not establish fatigue or causal effects. |
| The NBA interface includes Standard Deviations and Total Standard Deviation. [NBA view](https://basketball.fantasysports.yahoo.com/2023/nba/3802/5?stat1=SD) | Offer transparent metric-specific cohort percentiles or standardized comparisons. | The exact NBA computation was not verified. This label does not establish game-to-game consistency. Yahoo's baseball explanation concerns performance relative to a category average. [Baseball-specific help](https://help.yahoo.com/kb/SLN24552.html) |
| NBA Advanced Stats lists eFG%, TS%, and FTR. [Basketball help](https://help.yahoo.com/kb/SLN36389.html) | Extend the shared metric catalog with shooting efficiency and an explicitly defined free-throw rate. | Traditional counts suffice after admission. Use summed counts and valid denominators; specify FTR's numerator rather than relying on the help page's ambiguous “Free Throws” wording. |
| The same catalog lists plus-minus, assist rate, turnover rate, usage percentage, and Win Shares. [Basketball help](https://help.yahoo.com/kb/SLN36389.html) | Admit selected additional metrics after input and formula validation. | Source-provided plus-minus is a separate capability. Some rates can be box-score estimates; they do not automatically reproduce exact on-court statistics. Win Shares needs separate methodology and validation. |
| Position Rank is explicitly a Plus feature for NBA. [Benefits hub](https://fantasysports.yahoo.com/lp/plus/perks) | Rank a declared metric within an admitted position cohort. | Requires historical position evidence and explicit cohort rules. It must not become an undefined overall talent rank. |
| Opponents and Matchup Ratings appear in basketball navigation. [NBA interface](https://basketball.fantasysports.yahoo.com/nba/3017/5/team?date=2026-09-13&week=1) | Show upcoming opponent context and named historical team production allowed. | The basketball rating formula was not verified. The detailed official five-star guide found was football-specific. Do not import its meaning into NBA. [Football-only guide](https://help.yahoo.com/kb/best-ball/matchup-ratings-fantasy-football-sln9034.html) |
| Team analysis describes fantasy roster strengths and weaknesses. [Overview](https://help.yahoo.com/kb/fantasy-basketball/overview-yahoo-fantasy-sln35629.html) | Offer NBA franchise profiles across separate production/efficiency dimensions. | This is a new adaptation, not the same analytical object. Fantasy roster scores cannot establish NBA franchise quality or individual defensive impact. |

The Yahoo basketball help page repeats its TS% formula under usage percentage. Its metric descriptions are feature evidence, not a sufficient formula specification. Use a reviewed metric contract and the [NBA metric glossary](https://www.nba.com/stats/help/glossary) as an authoritative formula reference.

## Sport-specific and proprietary boundaries

The current benefits hub restricts Consensus Projections, Proj Min-Max, and additional projection sources to NFL all-season and MLB draft. Generic Fantasy Plus marketing must not be treated as evidence that these particular products exist for basketball. [Benefits hub](https://fantasysports.yahoo.com/lp/plus/perks)

Yahoo's public NBA team interface includes projected statistics and attributes projections to Rotowire. This establishes a provider-backed product, not a freely reproducible forecasting method. CourtLoad should retain its own evaluated next-game points experiment, recorded issuance, and calibration. Historical quantiles are descriptions of observed distributions, not projected ceilings/floors or prediction intervals. [Official NBA team interface](https://basketball.fantasysports.yahoo.com/nba/3017/8/team?date=2026-09-21&week=1), [CourtLoad points protocol](../design/points-forecast-protocol.md)

Transaction trends, percentage rostered/started, Diamond-manager behavior, fantasy MVP ownership, draft advice, trade partners, and lineup optimization depend on fantasy participation or provider/expert information. They do not transfer into the non-fantasy analytical workbench. “Who's Hot” is visible in basketball navigation, but its exact selection formula was not verified. A CourtLoad trend screen would require its own named period comparison and eligibility rules. [Official Research overview](https://basketball.fantasysports.yahoo.com/nba/research), [Yahoo overview](https://help.yahoo.com/kb/fantasy-basketball/overview-yahoo-fantasy-sln35629.html)

## Free-data gates

These gates are CourtLoad design inferences using the existing [source findings](workbench-source-findings.md) and [data contracts](../design/workbench-data-contracts.md). The preferred free SportsDataverse sources are candidates requiring full admission; sampled source presence does not prove readiness. Yahoo need not be a data dependency.

| Proposed capability | Minimum evidence | Gate before exposing it |
| --- | --- | --- |
| Player research, period comparison, game logs | Player identity, game identity/date/phase/team, confirmed appearances, requested counts/minutes | Admit player-grain records and per-metric validity; expose missingness and coverage. |
| eFG%, TS%, explicitly named FTA/FGA or FTM/FGA | Required scoring/makes/attempts fields | Version the formula; aggregate counts before division; zero/unknown denominator returns unavailable. |
| Metric-specific cohorts and percentiles | Complete eligible aggregate cohort under a fixed query/release | Define eligibility, minimum samples, ties, metric direction, and cohort version. Preserve exported rankings beyond the visible page. |
| Historical points/minutes distributions | Valid appeared-player outcomes under the requested cutoff/window | Define statistics and sample thresholds. Missing records remain unknown. This is a CourtLoad extension, not a verified Yahoo consistency tool. |
| Venue/rest splits | Historical team sides and dates; appropriate schedule evidence | Distinguish team schedule rest from days since an observed player appearance. Document timezone/date semantics and incomplete schedule handling. |
| Schedule density and recorded workload | Admitted schedule plus valid observed minutes | Show games in a period and recorded minutes. Do not infer fatigue, injury, or availability. Schedule density is a proposed extension. |
| Upcoming opponent and team allowance | Versioned schedule/team association and independently valid final team outcomes | Preserve unknown participants and stale associations. Allowance is named per-game production allowed, not causal or possession-adjusted defense. |
| Position-based ranking | Admitted historical player positions with source/time scope | Existing source findings do not establish current roster membership. Disable unsupported cohorts or offer unrestricted metric rankings. |
| Plus-minus | Admitted player plus-minus field or a separately validated event reconstruction | A traditional count table does not establish plus-minus coverage. Explain context and avoid causal impact claims. |
| Assist/usage/turnover estimates | Method-dependent player fields, complete team totals/minutes, and sometimes league/opponent context | Select and version a reviewed estimator. Label estimates accurately; on-court/event-based definitions need richer input. |
| Win Shares or richer defensive impact | Complete method-required team/league/player context and validated methodology | A separate project; not included merely because Yahoo names it. Existing workbench scope defers richer impact models. |
| Future points estimates | Frozen evaluated policy, eligible earlier observations, schedule/association evidence | Follow existing points and prospective issuance protocols. No forecast emerges from a language model or an empirical historical quantile alone. |
| Injury/news context | Independently admitted timestamped authoritative records | Not established by the current box-score/schedule source. Missing appearance is never an injury confirmation. |
| Semantic questions | Shared metric/query catalog and bounded read-only analytical operations | Optional natural-language adapter maps to valid queries and verified evidence. It must expose unsupported requests and retain useful manual search. |

## Recommended transferable bundle

This is a proposed bundle for owner review, not a new commitment or completion claim:

1. Period comparison for points, minutes, attempts, and efficiency.
2. Historical points/minutes distributions with median, IQR, sample size, and visible underlying games.
3. Home/away and rest splits.
4. eFG%, TS%, a clearly defined free-throw rate, and already supported per-minute/per-36 metrics.
5. Player/team comparison and metric-specific cohort rankings.
6. Opponent team allowances and schedule density as descriptive context.
7. Natural-language access to the same operations with a visible query specification and reproducible evidence.

The distribution, schedule-density, and semantic-query items are proposed CourtLoad extensions. They must not be advertised as copied, verified Yahoo premium capabilities.

Candidate semantic-search demonstrations:

- “Which players' minutes increased most over their last 10 appearances compared with the previous 10?”
- “Show Toronto players with the most blocks per 36, requiring at least 300 minutes.”
- “How variable were this player's points over the last 20 appearances?”
- “Compare these players' scoring efficiency before this date.”
- “How did this player perform at home versus away, and how many games are in each group?”

These need explicit analytical context and deterministic query semantics. The requested date must exclude that date and later outcomes where the workbench contract uses a before-date cutoff. Saved answers bind to immutable release, query, metric, and result identities.

## Access limitations

Official Help/product material and indexed official NBA fantasy pages were inspectable. Several direct Yahoo opens returned HTTP 429 or tool-access errors. No Yahoo account was created, no subscription was purchased, and no subscription-only interaction was tested. The investigation establishes documented feature descriptions and visible controls, not the complete paid workflow or unpublished formulas.

Indexed interfaces with historical or future selected dates demonstrate visible controls; their displayed rows were not used as admitted statistical or roster evidence. Generic multi-sport descriptions can conflict with more precise sport availability statements, so this report favors the explicit sport restrictions in the benefits hub. No additional research or ingestion benchmark was performed when recording this note.
