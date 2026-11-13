import { fact } from "./research-facts";

/**
 * Learning (Research R11, catalog row 21; redesigned in RD06): tiered topics after Databallr's Learning
 * page. Each topic links to the CourtLens page that shows it and, where CourtLens measured something,
 * quotes that result (and, for a few, the myth that result answers). Every number here comes from
 * `research-facts.ts`, which a test checks against the committed frozen results. The prose is
 * CourtLens' own.
 */

export interface LearningLink { label: string; href: string }

export interface LearningMeasured {
  /** One or two sentences quoting the measured result. */
  text: string;
  /** Research block that measured it, e.g. "R03". */
  block: string;
  /** Repository path of the evidence README. */
  evidence: string;
}

export interface LearningTopic {
  id: string;
  title: string;
  subtitle: string;
  body: readonly string[];
  /** Definitions in symbols only, one labelled well each; no illustrative numbers. */
  formulas?: readonly { label: string; line: string }[];
  takeaways: readonly string[];
  measured?: LearningMeasured;
  /** A common belief that the topic's measured CourtLens result answers (RD06); shown with that result as the reality. */
  myth?: string;
  /** Ids of topics worth reading first. */
  prerequisites?: readonly string[];
  links: readonly LearningLink[];
  /** A served data panel rendered under the prose. */
  panel?: "league-trends";
}

export interface LearningTier { id: string; number: number; title: string; blurb: string; topics: readonly LearningTopic[] }

const evidence = (block: string) => `docs/evidence/research/${block}/README.md`;

export const LEARNING_TIERS: readonly LearningTier[] = [
  {
    id: "core-concepts", number: 1, title: "Core Concepts", blurb: "The ideas every other page assumes.",
    topics: [
      {
        id: "per-100",
        title: "Per-100 Possession Thinking",
        subtitle: "Put players with different minutes and teams with different pace on one scale",
        body: [
          "A per-game number mixes three things: how good a player is, how many minutes he plays and how fast his team plays. Two players with the same steals per game can differ a lot once you count the possessions each was on the floor for.",
          "Dividing by the player's own possessions removes minutes and pace together. Most advanced rates (turnover rate, rebound rates, usage) are built this way already. Per-100 numbers still ignore teammates and opponents; RAPM handles those.",
        ],
        formulas: [{ label: "Per-100 rate", line: "Stat per 100 = Stat ÷ Player possessions × 100" }],
        takeaways: [
          "Per-game counts grow with minutes and pace, not only with skill.",
          "Per-100 rates divide by the player's own possessions.",
          "Per 36 adjusts for minutes only; per 100 adjusts for minutes and pace.",
        ],
        links: [{ label: "Per 100 in the Stats table", href: "/stats" }, { label: "Glossary", href: "/stats/glossary" }],
      },
      {
        id: "relative-stats",
        title: "Relative Efficiency",
        subtitle: "Compare a shooter with his own league, not with every era at once",
        body: [
          "League scoring efficiency moves over time with the three-point line, rule changes and shot selection. A true shooting percentage that was well above average one decade can be below average the next.",
          "Relative true shooting (rTS) subtracts the league's TS% for that season. CourtLens uses rTS as the baseline that zTS adjusts further for play-type difficulty.",
        ],
        formulas: [{ label: "True shooting", line: "TS% = PTS ÷ (2 × (FGA + 0.44 × FTA))" }, { label: "Relative true shooting", line: "rTS = Player TS% − League TS% (same season)" }],
        takeaways: [
          "Raw TS% is not comparable across eras.",
          "rTS is the gap to that season's league average.",
          "Positive rTS is above average in its own season.",
        ],
        prerequisites: ["ts-efg-fg"],
        links: [{ label: "zTS", href: "/research/zts" }, { label: "TS% in the Stats table", href: "/stats" }],
      },
      {
        id: "league-evolution",
        title: "The League's Statistical Evolution",
        subtitle: "How shooting, turnovers and rebounding moved from 2014-15 to 2025-26",
        body: [
          "The table below is counted from every regular-season play-by-play game CourtLens keeps. It shows the league-wide inputs behind the four factors, season by season.",
          "Because the baselines move, a player's raw shooting or rebounding rate means more when it is read against its own season. This is the reason for relative stats.",
        ],
        takeaways: [
          "League baselines move from season to season.",
          "Read a player's rate against his own season's league value.",
          "These league inputs feed the Poropudas and Halme rating on the calculator page.",
        ],
        prerequisites: ["relative-stats"],
        links: [{ label: "Season inputs on the calculator", href: "/calculator" }],
        panel: "league-trends",
      },
      {
        id: "four-to-six-factors",
        title: "From Four Factors to Six",
        subtitle: "Shooting, turnovers and rebounding, on offense and on defense",
        body: [
          "Dean Oliver's four factors (shooting, turnovers, rebounding and free throws) describe how a team wins a possession. Folding free throws into true shooting leaves three factors, and taking each on offense and on defense gives six.",
          "Six-factor RAPM estimates a player's effect on each of the six while he is on the court. Together they rebuild most of his overall RAPM, so the breakdown is a fair summary of where his impact comes from.",
        ],
        formulas: [{ label: "Offense", line: "oTS, oTOV, oREB" }, { label: "Defense", line: "dTS, dTOV, dREB (positive = helps the defense)" }],
        takeaways: [
          "Free throws fold into true shooting, so four factors become three per side.",
          "Six-factor estimates are in favourable sign: positive always helps.",
          "They explain overall RAPM well but not perfectly.",
        ],
        measured: { block: "R02", evidence: evidence("r02"), text: `The six factors rebuild RAPM with a cross-validated R² of ${fact("sf.r2")} in 2025-26.` },
        prerequisites: ["ts-efg-fg", "per-100"],
        links: [{ label: "Six-Factor RAPM", href: "/research/rapm/six-factor" }],
      },
      {
        id: "shot-value",
        title: "Shot Value and Expected Points",
        subtitle: "What a shot is worth before it goes in",
        body: [
          "A layup and a long two have very different make rates, and a corner three is worth 50% more than either when it falls. Expected points per shot puts a value on each attempt from where and how it was taken, before the result is known.",
          "CourtLens' Shot Quality model predicts each shot's make probability from its location, shot type and the play-by-play context before it. A player's actual points per shot minus his expected points is his shot-making.",
        ],
        formulas: [{ label: "Expected points", line: "xPTS = P(make) × shot value" }, { label: "Shot-making", line: "Shot-making = Actual PTS per shot − xPTS per shot" }],
        takeaways: [
          "Shot location and type decide most of a shot's value.",
          "Expected points separate shot selection from shot-making.",
          "A model is only useful if it beats simple zone averages on unseen games.",
        ],
        measured: { block: "R05", evidence: evidence("r05"), text: `On ${fact("sq.seasons")}, the model's Brier score is ${fact("sq.brier")}% better (${fact("sq.brierLow")}% to ${fact("sq.brierHigh")}%) than league zone and distance rates.` },
        prerequisites: ["ts-efg-fg"],
        links: [{ label: "Shot Quality", href: "/research/shot-quality" }],
      },
    ],
  },
  {
    id: "impact-measurement", number: 2, title: "Impact Measurement", blurb: "From raw plus-minus to ratings tested on later games.",
    topics: [
      {
        id: "on-off",
        title: "On/Off Differentials",
        subtitle: "How the team does with a player on the court and off it",
        body: [
          "On/off compares the team's point margin per 100 possessions with a player on the floor against the margin with him off. It is simple and uses only real outcomes.",
          "It is also confounded. A bench player who always shares the floor with a star inherits the star's margin, and a starter is compared with the bench that replaces him. Small samples swing it further.",
        ],
        formulas: [{ label: "On/off", line: "On/off = Net rating (on) − Net rating (off)" }],
        takeaways: [
          "On/off measures the team's result, not the player alone.",
          "Teammates and the replacement player shape it.",
          "WOWY shows the same idea for specific combinations of players.",
        ],
        prerequisites: ["per-100"],
        links: [{ label: "WOWY", href: "/wowy" }, { label: "Stat Line Shift", href: "/stat-line-shift" }],
      },
      {
        id: "rapm",
        title: "RAPM",
        subtitle: "Regularized adjusted plus-minus",
        body: [
          "RAPM fits every stint of every game at once: the point margin of each stint is explained by the ten players on the court. That separates a player from his teammates and opponents in a way on/off cannot.",
          "Ridge regularization pulls every estimate toward zero, more for players with fewer possessions, so a short hot stretch can't produce an extreme rating. Time decay weights recent games more than old ones.",
        ],
        formulas: [{ label: "Ridge regression", line: "minimize Σ w × (margin − Σ player effects)² + λ × Σ effect²" }],
        takeaways: [
          "RAPM controls for every teammate and opponent on the floor.",
          "Regularization shrinks low-sample players toward average.",
          "The useful test is how well a rating predicts games it did not see.",
        ],
        measured: { block: "R08", evidence: evidence("r08"), text: `Fixed before each of ${fact("bt.games")} games (${fact("bt.seasons")}), monthly time-decay RAPM predicts the margin with an RMSE of ${fact("bt.timeDecayRmse")} points against team net rating's ${fact("bt.teamNetRmse")}, the only metric ranked above every other.` },
        prerequisites: ["on-off", "per-100"],
        links: [{ label: "Metric Backtest", href: "/research/backtest" }, { label: "RAPM Ratings", href: "/research/rapm" }],
      },
      {
        id: "stabilization",
        title: "Stabilization and Sample Size",
        subtitle: "How many attempts before a stat says more about the player than about luck",
        body: [
          "Split a player's attempts into two random halves and correlate the halves across players. When the correlation reaches 0.5, half of the spread between players is skill. The number of attempts at that point is the stat's stabilization point.",
          "Free-throw percentage stabilizes quickly. Three-point percentage is much slower: in CourtLens' data it never reached 0.5 within the samples real players have.",
        ],
        formulas: [{ label: "Split-half reliability", line: "ρ(n) = correlation between two random halves of n attempts" }, { label: "Stabilization point", line: "smallest n with ρ(n) ≥ 0.5" }],
        takeaways: [
          "Stats stabilize at very different sample sizes.",
          "Three-point percentage needs far more attempts than most players get in a season.",
          "Read early-season shooting numbers with that in mind.",
        ],
        measured: { block: "R03", evidence: evidence("r03"), text: `FT% stabilizes at ${fact("sn.ftAttempts")} attempts and TS% at ${fact("sn.tsAttempts")}. 3P% reaches only ${fact("sn.threeLargestRho")} at the largest observed sample, ${fact("sn.threeLargestN")} attempts.` },
        myth: "A month of hot three-point shooting shows a player has become a better shooter.",
        links: [{ label: "Signal vs Noise", href: "/research/signal-noise" }],
      },
      {
        id: "shrinkage",
        title: "Regression to the Mean",
        subtitle: "Blend a small sample with what is typical",
        body: [
          "A player who shoots 50% on 40 threes is probably not a 50% shooter. The best guess blends his own number with the league's, trusting his own more as his attempts grow. This is shrinkage, and RAPM's regularization does the same thing for impact.",
          "CourtLens tested it: shrunk percentages predict a player's next season better than his raw ones.",
        ],
        formulas: [{ label: "Shrinkage", line: "Shrunk = (Makes + m × League rate) ÷ (Attempts + m)" }, { label: "Prior weight", line: "m = attempts at which ρ = 0.5" }],
        takeaways: [
          "Shrinkage weights a player's own record by its sample size.",
          "It helps most where stats stabilize slowly.",
          "Stats can show shrunk shooting percentages with one toggle.",
        ],
        measured: { block: "R03", evidence: evidence("r03"), text: `Shrinking cuts next-season prediction error by ${fact("sn.threeShrinkCut")} for 3P% and ${fact("sn.ftShrinkCut")} for FT%.` },
        prerequisites: ["stabilization"],
        links: [{ label: "Signal vs Noise", href: "/research/signal-noise" }, { label: "Shrunk toggle in Stats", href: "/stats" }],
      },
      {
        id: "intervals",
        title: "Intervals, Not Verdicts",
        subtitle: "Every estimate comes with its uncertainty",
        body: [
          "CourtLens gives each impact estimate an 80% interval from a bootstrap over games: refit the model on many resampled sets of games and see how far the estimate moves.",
          "Two players whose intervals overlap are not shown as one better than the other. On Research pages a value is coloured green or red only when its whole interval sits above or below zero.",
        ],
        formulas: [{ label: "Bootstrap", line: "Resample games with replacement, refit, repeat" }, { label: "80% interval", line: "80% interval = 10th to 90th percentile of the refits" }],
        takeaways: [
          "An estimate without an interval hides how sure it is.",
          "Overlapping intervals are not a ranking.",
          "Colour marks only estimates whose interval excludes zero.",
        ],
        prerequisites: ["rapm"],
        links: [{ label: "Six-Factor RAPM", href: "/research/rapm/six-factor" }, { label: "Methodology", href: "/methodology" }],
      },
    ],
  },
  {
    id: "shooting", number: 3, title: "Shooting Deep Dive", blurb: "What shooting numbers measure and what they miss.",
    topics: [
      {
        id: "ts-efg-fg",
        title: "TS% vs eFG% vs FG%",
        subtitle: "Three ways to score a shooter",
        body: [
          "FG% counts every make the same. eFG% gives threes their extra half point. TS% also counts free throws, so it measures points per shooting chance.",
          "For comparing scorers, TS% is the most complete of the three. eFG% is useful when you want shooting from the field alone.",
        ],
        formulas: [{ label: "Field-goal percentage", line: "FG% = FGM ÷ FGA" }, { label: "Effective field-goal percentage", line: "eFG% = (FGM + 0.5 × 3PM) ÷ FGA" }, { label: "True shooting percentage", line: "TS% = PTS ÷ (2 × (FGA + 0.44 × FTA))" }],
        takeaways: [
          "FG% undervalues three-point shooters.",
          "eFG% credits threes; TS% also credits free throws.",
          "The 0.44 estimates how many free throws use up a possession.",
        ],
        links: [{ label: "Glossary", href: "/stats/glossary" }, { label: "Stats table", href: "/stats" }],
      },
      {
        id: "shot-quality-making",
        title: "Shot Quality vs Shot Making",
        subtitle: "Taking good shots and making hard ones are different skills",
        body: [
          "A player's true shooting splits into the quality of the shots he takes (expected points), how much better or worse he converts them (shot-making) and his free throws.",
          "Which part persists from one season to the next matters for projection. CourtLens measured both on offense.",
        ],
        formulas: [{ label: "Decomposition", line: "TS = Shot quality + Shot making + Free throws" }],
        takeaways: [
          "The decomposition adds up exactly; nothing is left over.",
          "Shot quality and shot-making can move in opposite directions.",
          "Neither part was clearly more persistent than the other.",
        ],
        measured: { block: "R06", evidence: evidence("r06"), text: `Next-season correlation: shot quality ${fact("sd.sqR")}, shot-making ${fact("sd.makeR")}. The difference, ${fact("sd.diff")} (${fact("sd.diffLow")} to ${fact("sd.diffHigh")}), includes zero, so neither is clearly more persistent.` },
        prerequisites: ["shot-value"],
        myth: "Shot quality is a skill; shot-making is luck that fades by next season.",
        links: [{ label: "Shooting decomposition", href: "/research/shot-quality" }, { label: "Defensive Shot Quality", href: "/research/defensive-matchups" }],
      },
      {
        id: "play-type-difficulty",
        title: "Play-Type Difficulty",
        subtitle: "Adjusting efficiency for the shots a role creates",
        body: [
          "A spot-up shooter and an isolation scorer face different defenses. zTS adjusts true shooting for the league-average efficiency of the play types a player uses, so a heavy isolation load isn't penalized for being hard.",
          "CourtLens tested whether that adjustment helps, and the answer depends on the question.",
        ],
        formulas: [{ label: "zTS", line: "zTS = rTS adjusted for the efficiency of the player's play-type mix" }],
        takeaways: [
          "Role decides much of a player's shot difficulty.",
          "zTS tracks offensive shooting impact better than rTS.",
          "rTS predicts the next season's efficiency better than zTS.",
        ],
        measured: { block: "R04", evidence: evidence("r04"), text: `On the test seasons, zTS correlates ${fact("zts.trackingGain")} better with oTS RAPM than rTS does, but predicts next-season rTS ${fact("zts.predictiveGain")} worse.` },
        prerequisites: ["relative-stats"],
        myth: "Adjusting efficiency for shot difficulty always gives a better number.",
        links: [{ label: "zTS", href: "/research/zts" }],
      },
      {
        id: "volume-efficiency",
        title: "Volume and Efficiency",
        subtitle: "Why a lead scorer's efficiency isn't comparable with a role player's",
        body: [
          "A role player's shots mostly come to him: open catch-and-shoot threes and finishes off a teammate's drive. A lead scorer has to create his own shot against the defense's best attention, late in the clock as often as early.",
          "So efficiency usually falls as usage rises, and a role player's high true shooting says little about what it would be with twice the shots. Read usage and true shooting together, and compare scorers with others at a similar load.",
        ],
        formulas: [{ label: "Usage rate", line: "USG% = Player (FGA + 0.44 × FTA + TOV) ÷ Team (FGA + 0.44 × FTA + TOV), while he is on the court" }],
        takeaways: [
          "Higher usage usually means harder shots.",
          "A role player's efficiency may not hold at a bigger load.",
          "Judge scorers on usage and true shooting together.",
        ],
        prerequisites: ["ts-efg-fg", "relative-stats"],
        links: [{ label: "Usage beside zTS", href: "/research/zts" }, { label: "TS% in the Stats table", href: "/stats" }, { label: "Compare players", href: "/compare" }],
      },
      {
        id: "free-throws",
        title: "Free Throw Generation",
        subtitle: "Getting to the line is its own skill",
        body: [
          "Free throws are the most efficient shot in basketball, and some players draw far more of them than others. Free-throw rate measures how often a player gets there relative to his field-goal attempts.",
          "Because TS% counts free throws, a player who draws fouls can post high true shooting with ordinary field-goal percentages.",
        ],
        formulas: [{ label: "Free-throw rate", line: "FTr = FTA ÷ FGA" }],
        takeaways: [
          "Drawing fouls raises true shooting directly.",
          "FTr separates that skill from field-goal shooting.",
          "Signal vs Noise shows how many attempts FTr needs to stabilize.",
        ],
        prerequisites: ["ts-efg-fg"],
        links: [{ label: "FTr in the Stats table", href: "/stats" }, { label: "Glossary", href: "/stats/glossary" }],
      },
    ],
  },
  {
    id: "lineup-context", number: 4, title: "Lineup and Context", blurb: "Players never play alone.",
    topics: [
      {
        id: "wowy",
        title: "WOWY (With or Without You)",
        subtitle: "Results for chosen combinations of players",
        body: [
          "WOWY filters every possession by who was on the court: a player with a teammate, without him, or any combination of up to five. It shows how a pairing performed, not why.",
          "The same confounding as on/off applies, and samples shrink quickly as you add players.",
        ],
        takeaways: [
          "WOWY answers \"how did these players do together\".",
          "Every added player shrinks the sample.",
          "Read small samples as noise until they grow.",
        ],
        prerequisites: ["on-off"],
        links: [{ label: "WOWY", href: "/wowy" }, { label: "Stat Line Shift", href: "/stat-line-shift" }],
      },
      {
        id: "lineup-sample-size",
        title: "Lineup Sample Size",
        subtitle: "Five-man units rarely play enough to judge",
        body: [
          "Even a team's most-used lineup plays a small share of the season's possessions, and most lineups play a few minutes. Their net ratings swing widely by chance.",
          "Models that rate players first and then combine them into lineups borrow strength from every possession each player played.",
        ],
        takeaways: [
          "Most lineup samples are too small to rank.",
          "Player-level models borrow strength across lineups.",
          "Check possessions before reading a lineup's net rating.",
        ],
        prerequisites: ["stabilization", "wowy"],
        links: [{ label: "Lineup Model", href: "/research/lineup-model" }, { label: "WOWY", href: "/wowy" }],
      },
      {
        id: "complementary-skills",
        title: "Complementary vs Redundant Skills",
        subtitle: "Is a lineup more than the sum of its players?",
        body: [
          "The common view is that skills interact: two non-shooters cramp each other, a shooter makes a driver better. If that were large, a model that learns interactions between players would beat an additive one.",
          "CourtLens built that model, with learned player vectors and an interaction term, and tested it against ridge RAPM on held-out stints. The learned interaction came out about zero.",
        ],
        formulas: [{ label: "Lineup model", line: "margin = Σ player effects + interaction(player vectors)" }],
        takeaways: [
          "Fit is a reasonable idea, but it is hard to measure from margins.",
          "The additive model was as good as the interaction model.",
          "A null result is a result: it bounds how large fit effects can be.",
        ],
        measured: { block: "R14", evidence: evidence("r14"), text: `On held-out stints, ridge RAPM beat the lineup model by ${fact("lm.ridgeEdge")} points per 100 possessions: no practical difference.` },
        prerequisites: ["wowy", "rapm"],
        myth: "A well-fitted lineup is worth much more than the sum of its players.",
        links: [{ label: "Lineup Model", href: "/research/lineup-model" }],
      },
      {
        id: "offensive-rebounding",
        title: "Offensive Rebounding Tradeoffs",
        subtitle: "Crash the glass or get back on defense",
        body: [
          "Sending players to the offensive glass wins extra possessions but leaves fewer defenders back. Long misses from three bounce differently from misses at the rim, so the rebound rate depends on what was missed.",
          "The calculator page splits league offensive rebound rates by the kind of miss, season by season.",
        ],
        formulas: [{ label: "Offensive rebound rate", line: "ORB% = ORB ÷ (ORB + Opponent DRB)" }],
        takeaways: [
          "Offensive rebounds trade against transition defense.",
          "Rebound rates differ by the kind of miss.",
          "Six-factor RAPM credits oREB and dREB separately.",
        ],
        prerequisites: ["four-to-six-factors"],
        links: [{ label: "Rebounds by miss on the calculator", href: "/calculator" }, { label: "Six-Factor RAPM", href: "/research/rapm/six-factor" }],
      },
    ],
  },
  {
    id: "testing-models", number: 5, title: "Testing Models", blurb: "CourtLens' own addition: claims checked on games the model never saw.",
    topics: [
      {
        id: "out-of-time",
        title: "Out-of-Time Testing",
        subtitle: "Train on the past, score on later seasons",
        body: [
          "A model scored on the games it was fitted on always looks good. CourtLens registers each model's candidates and test seasons before fitting, chooses on earlier seasons and reads the test seasons once.",
          "Win Probability is the clearest case: it was chosen on earlier seasons and scored over the in-game states of the test seasons against a simpler baseline.",
        ],
        formulas: [{ label: "Log loss", line: "Log loss = −mean(y × log p + (1 − y) × log(1 − p))" }, { label: "Reading it", line: "Lower is better" }],
        takeaways: [
          "Register candidates and test seasons before fitting.",
          "Choose on earlier seasons; read the test once.",
          "Publish the result, including when it is negative.",
        ],
        measured: { block: "R15a", evidence: evidence("r15a"), text: `On ${fact("wp.games")} games in ${fact("wp.seasons")}, Win Probability's log loss is ${fact("wp.logLoss")} against the baseline's ${fact("wp.baselineLogLoss")}, with calibration error ${fact("wp.calibration")}.` },
        prerequisites: ["intervals"],
        links: [{ label: "Win Probability", href: "/research/win-probability" }],
      },
      {
        id: "prospective",
        title: "Prospective Scoring",
        subtitle: "Freeze the predictions, then wait for the games",
        body: [
          "The strictest test freezes predictions before the games are played. Projected Impact froze its 2026-27 player ratings on Nov 5, 2026, and is scored only on games played after that.",
          "Before freezing, it was tested the usual way on past seasons against carrying last season's rating forward.",
        ],
        takeaways: [
          "A frozen prediction can't be tuned after the fact.",
          "The past-season test says how well it should do.",
          "The prospective score says how well it does.",
        ],
        measured: { block: "R07", evidence: evidence("r07"), text: `On ${fact("pi.seasons")}, Projected Impact beats carry-forward by ${fact("pi.gain")} (${fact("pi.gainLow")} to ${fact("pi.gainHigh")}) in minutes-weighted squared error.` },
        prerequisites: ["out-of-time"],
        links: [{ label: "Projected Impact", href: "/research/projected-impact" }],
      },
      {
        id: "draft-value",
        title: "What a Draft Pick Is Worth",
        subtitle: "Value by slot, with intervals",
        body: [
          "Average value falls steeply over the first picks of a draft and keeps falling, more slowly, through the second round, but the spread at every slot is wide. A pick's average says little about any one player.",
          "Draft Classes measures win shares over each pick's first four seasons, by slot, across every class with complete data.",
        ],
        takeaways: [
          "Value falls fast through the top picks.",
          "Every slot has a wide spread.",
          "Compare slots by intervals, not single averages.",
        ],
        measured: { block: "R09", evidence: evidence("r09"), text: `The first pick averaged ${fact("dv.pick1")} win shares over his first four seasons, the second ${fact("dv.pick2")}.` },
        prerequisites: ["intervals"],
        links: [{ label: "Draft Classes", href: "/draft" }],
      },
      {
        id: "body-measurements",
        title: "Body Measurements and Defense",
        subtitle: "Does a long wingspan go with better defense?",
        body: [
          "Scouts prize wingspan beyond height. CourtLens matched Draft Combine measurements with each player's career defensive rating from DARKO to see whether the extra length shows up.",
          "The association is positive and modest. It describes players who made the league; it is not a prediction or a cause.",
        ],
        formulas: [{ label: "Ape index", line: "Wingspan − Height" }],
        takeaways: [
          "Length beyond height goes with slightly better defense.",
          "The effect is modest and varies by position.",
          "Descriptive association, not a cause.",
        ],
        measured: { block: "R10", evidence: evidence("r10"), text: `Across ${fact("ws.n")} players, wingspan minus height correlates ${fact("ws.r")} with career D-DPM.` },
        prerequisites: ["rapm"],
        links: [{ label: "Combine & Wingspan", href: "/wingspan" }],
      },
    ],
  },
];

export const learningTopicCount = (tiers: readonly LearningTier[] = LEARNING_TIERS): number => tiers.reduce((sum, tier) => sum + tier.topics.length, 0);

const TOPICS = new Map(LEARNING_TIERS.flatMap(tier => tier.topics.map(topic => [topic.id, { tier, topic }] as const)));

/** A topic and its tier by id (prerequisite chips). */
export const learningTopic = (id: string): { tier: LearningTier; topic: LearningTopic } | undefined => TOPICS.get(id);

/** Topic search: every word of the query appears in the topic's title, subtitle, prose, formulas or takeaways. */
export function topicMatches(topic: LearningTopic, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [topic.title, topic.subtitle, ...topic.body, ...(topic.formulas ?? []).flatMap(f => [f.label, f.line]), ...topic.takeaways].join(" ").toLowerCase();
  return words.every(word => text.includes(word));
}
