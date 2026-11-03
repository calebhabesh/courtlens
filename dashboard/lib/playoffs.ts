import type {
  PlayoffGameCard,
  PlayoffRoundResponse,
  PlayoffSeriesSummary,
  PlayerSeriesStats,
  SeriesMatchupRow,
  TeamSeriesStats
} from "./types";

/**
 * Format a percentage value (0.0 to 1.0) into a display string (e.g. 54.2%).
 */
export function formatPercent(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${(val * 100).toFixed(decimals)}%`;
}

/**
 * Format a numeric stat value with given decimals.
 */
export function formatStat(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return val.toFixed(decimals);
}

/**
 * Return human-readable status badge text for a series summary.
 */
export function getSeriesStatusBadge(series: PlayoffSeriesSummary): {
  label: string;
  badgeClass: string;
} {
  // The API reports a decided series as "finished"; "final" is the older fixture spelling.
  if (series.status === "finished" || series.status === "final") {
    if (series.is_sweep) {
      return { label: "SWEEP", badgeClass: "badge-positive" };
    }
    return { label: "FINAL", badgeClass: "badge-accent" };
  }
  if (series.status === "in_progress") {
    return { label: "IN PROGRESS", badgeClass: "badge-warning" };
  }
  return { label: "SCHEDULED", badgeClass: "badge" };
}

/**
 * Return human-readable display info for a single playoff game card.
 */
export function getGameCardDisplay(
  card: PlayoffGameCard,
  seriesWinnerTricode?: string | null
): {
  label: string;
  badgeClass: string;
  note?: string;
} {
  if (card.status === "final") {
    return {
      label: "FINAL",
      badgeClass: "badge-positive",
      note: card.margin ? `Margin: ${card.margin > 0 ? `+${card.margin}` : card.margin} PTS` : undefined
    };
  }
  if (card.status === "scheduled") {
    return {
      label: "SCHEDULED",
      badgeClass: "badge-accent",
      note: card.game_date ? `Replay Date: ${card.game_date}` : "Awaiting Tipoff"
    };
  }
  // unplayed_placeholder
  return {
    label: "NOT NEEDED",
    badgeClass: "badge text-muted",
    note: seriesWinnerTricode
      ? `Series concluded by ${seriesWinnerTricode}`
      : "If necessary placeholder"
  };
}

/**
 * Filter bracket rounds by round number and conference.
 */
export function filterBracketRounds(
  rounds: PlayoffRoundResponse[],
  roundFilter: number | "all",
  conferenceFilter: "all" | "East" | "West" | "Finals"
): {
  roundNumber: number;
  roundName: string;
  series: PlayoffSeriesSummary[];
}[] {
  return rounds
    .filter((r) => roundFilter === "all" || r.round_number === roundFilter)
    .map((r) => {
      let filteredSeries = r.series;
      if (conferenceFilter === "East") {
        filteredSeries = r.eastern_series;
      } else if (conferenceFilter === "West") {
        filteredSeries = r.western_series;
      } else if (conferenceFilter === "Finals") {
        filteredSeries = r.finals_series;
      }

      return {
        roundNumber: r.round_number,
        roundName: r.round_name,
        series: filteredSeries
      };
    })
    .filter((r) => r.series.length > 0);
}

/**
 * Determine which team has the analytical edge for Four Factors and Ratings.
 * Higher is better for all except tov_pct and def_rating (where lower is better).
 */
export type FactorAdvantage = "team1" | "team2" | "tied" | "unknown";

export function evaluateFactorAdvantage(
  val1: number | null | undefined,
  val2: number | null | undefined,
  lowerIsBetter = false
): FactorAdvantage {
  if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
    return "unknown";
  }
  if (Math.abs(val1 - val2) < 0.0001) {
    return "tied";
  }
  if (lowerIsBetter) {
    return val1 < val2 ? "team1" : "team2";
  }
  return val1 > val2 ? "team1" : "team2";
}

export interface TeamComparisonFactorRow {
  key: string;
  label: string;
  unit: "pct" | "rating" | "pts" | "raw";
  team1Val: number | null | undefined;
  team2Val: number | null | undefined;
  lowerIsBetter: boolean;
  advantage: FactorAdvantage;
}

export function buildTeamSeriesComparison(
  team1: TeamSeriesStats,
  team2: TeamSeriesStats
): TeamComparisonFactorRow[] {
  return [
    {
      key: "net_rating",
      label: "Net Rating",
      unit: "rating",
      team1Val: team1.net_rating,
      team2Val: team2.net_rating,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.net_rating, team2.net_rating, false)
    },
    {
      key: "off_rating",
      label: "Offensive Rating",
      unit: "rating",
      team1Val: team1.off_rating,
      team2Val: team2.off_rating,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.off_rating, team2.off_rating, false)
    },
    {
      key: "def_rating",
      label: "Defensive Rating",
      unit: "rating",
      team1Val: team1.def_rating,
      team2Val: team2.def_rating,
      lowerIsBetter: true,
      advantage: evaluateFactorAdvantage(team1.def_rating, team2.def_rating, true)
    },
    {
      key: "pace",
      label: "Pace (Poss / 48m)",
      unit: "raw",
      team1Val: team1.pace,
      team2Val: team2.pace,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.pace, team2.pace, false)
    },
    {
      key: "efg_pct",
      label: "Effective FG% (eFG%)",
      unit: "pct",
      team1Val: team1.efg_pct,
      team2Val: team2.efg_pct,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.efg_pct, team2.efg_pct, false)
    },
    {
      key: "tov_pct",
      label: "Turnover% (TOV%)",
      unit: "pct",
      team1Val: team1.tov_pct,
      team2Val: team2.tov_pct,
      lowerIsBetter: true,
      advantage: evaluateFactorAdvantage(team1.tov_pct, team2.tov_pct, true)
    },
    {
      key: "oreb_pct",
      label: "Offensive Rebound% (ORB%)",
      unit: "pct",
      team1Val: team1.oreb_pct,
      team2Val: team2.oreb_pct,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.oreb_pct, team2.oreb_pct, false)
    },
    {
      key: "ftr",
      label: "Free Throw Rate (FTR)",
      unit: "raw",
      team1Val: team1.ftr,
      team2Val: team2.ftr,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.ftr, team2.ftr, false)
    },
    {
      key: "ppg",
      label: "Points Per Game",
      unit: "pts",
      team1Val: team1.points_per_game,
      team2Val: team2.points_per_game,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.points_per_game, team2.points_per_game, false)
    },
    {
      key: "margin",
      label: "Average Margin",
      unit: "pts",
      team1Val: team1.average_margin,
      team2Val: team2.average_margin,
      lowerIsBetter: false,
      advantage: evaluateFactorAdvantage(team1.average_margin, team2.average_margin, false)
    }
  ];
}

/**
 * Sort player stats array by a chosen field and direction.
 */
export function sortPlayerSeriesStats(
  players: PlayerSeriesStats[],
  field: keyof PlayerSeriesStats,
  direction: "asc" | "desc" = "desc"
): PlayerSeriesStats[] {
  return [...players].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];

    if (valA === null || valA === undefined) return direction === "asc" ? -1 : 1;
    if (valB === null || valB === undefined) return direction === "asc" ? 1 : -1;

    if (typeof valA === "number" && typeof valB === "number") {
      return direction === "asc" ? valA - valB : valB - valA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return direction === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });
}

const TWO_WORD_NICKNAMES = ["Trail Blazers"];

/** "Oklahoma City Thunder" → city "Oklahoma City", nickname "Thunder" (the hero's two lines). */
export function splitTeamName(name: string): { city: string; nickname: string } {
  const two = TWO_WORD_NICKNAMES.find(nickname => name.endsWith(` ${nickname}`));
  const nickname = two ?? name.split(" ").at(-1) ?? name;
  return { city: name.slice(0, name.length - nickname.length).trim(), nickname };
}

/** A paired bar row: each side's share of its bar, where the better side reads full. */
export interface ComparisonBar {
  key: string;
  label: string;
  team1: number | null;
  team2: number | null;
  /** 0–1 bar fill for each side. */
  fill1: number;
  fill2: number;
  better: "team1" | "team2" | null;
  format: (value: number | null) => string;
}

function bar(key: string, label: string, team1: number | null, team2: number | null, lowerIsBetter: boolean, format: (value: number | null) => string, signed = false): ComparisonBar {
  let fill1 = 0;
  let fill2 = 0;
  if (team1 != null && team2 != null) {
    if (signed) {
      const scale = Math.max(Math.abs(team1), Math.abs(team2)) || 1;
      fill1 = (team1 + scale) / (2 * scale);
      fill2 = (team2 + scale) / (2 * scale);
    } else if (lowerIsBetter) {
      const best = Math.min(team1, team2);
      fill1 = team1 > 0 ? best / team1 : 0;
      fill2 = team2 > 0 ? best / team2 : 0;
    } else {
      const best = Math.max(team1, team2) || 1;
      fill1 = team1 / best;
      fill2 = team2 / best;
    }
  }
  const advantage = evaluateFactorAdvantage(team1, team2, lowerIsBetter);
  return { key, label, team1, team2, fill1, fill2, better: advantage === "team1" || advantage === "team2" ? advantage : null, format };
}

const rating = (value: number | null) => formatStat(value, 1);
const signedRating = (value: number | null) => value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

/** Team Comparison (ORTG, DRTG, NET) and Four Factors rows, as Databallr's series page shows. */
export function seriesComparison(team1: TeamSeriesStats, team2: TeamSeriesStats): { ratings: ComparisonBar[]; factors: ComparisonBar[] } {
  return {
    ratings: [
      bar("ortg", "ORTG", team1.off_rating, team2.off_rating, false, rating),
      bar("drtg", "DRTG", team1.def_rating, team2.def_rating, true, rating),
      bar("net", "NET", team1.net_rating, team2.net_rating, false, signedRating, true)
    ],
    factors: [
      bar("efg", "eFG%", team1.efg_pct, team2.efg_pct, false, value => formatPercent(value)),
      bar("tov", "TOV%", team1.tov_pct, team2.tov_pct, true, value => formatPercent(value)),
      bar("oreb", "OREB%", team1.oreb_pct, team2.oreb_pct, false, value => formatPercent(value)),
      bar("ftr", "FTR%", team1.ftr, team2.ftr, false, value => formatPercent(value))
    ]
  };
}

export type MatchupPhase = "playoffs" | "regular_season" | "all";
export type MatchupSide = "offense" | "defense";

/** One opponent of the focus player, summed over the chosen phases. */
export interface MatchupLine {
  player_id: string;
  player_name: string;
  possessions: number;
  points: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  fta: number;
  assists: number;
  turnovers: number;
}

function emptyLine(player_id: string, player_name: string): MatchupLine {
  return { player_id, player_name, possessions: 0, points: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, fta: 0, assists: 0, turnovers: 0 };
}

function addTo(line: MatchupLine, row: SeriesMatchupRow): void {
  line.possessions += row.possessions;
  line.points += row.points;
  line.fgm += row.fgm;
  line.fga += row.fga;
  line.fg3m += row.fg3m;
  line.fg3a += row.fg3a;
  line.fta += row.fta;
  line.assists += row.assists;
  line.turnovers += row.turnovers;
}

/**
 * The team's players by matchup possessions in the chosen role: on offense the possessions they
 * had against the opponent's defenders, on defense the opponent possessions they were assigned.
 */
export function matchupPlayers(rows: SeriesMatchupRow[], team: string, side: MatchupSide, phase: MatchupPhase): MatchupLine[] {
  const players = new Map<string, MatchupLine>();
  for (const row of rows) {
    if (phase !== "all" && row.phase !== phase) continue;
    const offense = row.off_team_id === team;
    if (side === "offense" ? !offense : offense) continue;
    const [id, name] = side === "offense" ? [row.off_player_id, row.off_player_name] : [row.def_player_id, row.def_player_name];
    const line = players.get(id) ?? emptyLine(id, name);
    addTo(line, row);
    players.set(id, line);
  }
  return [...players.values()].sort((a, b) => b.possessions - a.possessions);
}

/** The focus player's opponents (defenders on offense, scorers on defense), most possessions first. */
export function matchupOpponents(rows: SeriesMatchupRow[], player: string, side: MatchupSide, phase: MatchupPhase): MatchupLine[] {
  const opponents = new Map<string, MatchupLine>();
  for (const row of rows) {
    if (phase !== "all" && row.phase !== phase) continue;
    if ((side === "offense" ? row.off_player_id : row.def_player_id) !== player) continue;
    const [id, name] = side === "offense" ? [row.def_player_id, row.def_player_name] : [row.off_player_id, row.off_player_name];
    const line = opponents.get(id) ?? emptyLine(id, name);
    addTo(line, row);
    opponents.set(id, line);
  }
  return [...opponents.values()].sort((a, b) => b.possessions - a.possessions);
}

export function matchupTotal(lines: MatchupLine[]): MatchupLine {
  const total = emptyLine("total", "Total");
  for (const line of lines) {
    total.possessions += line.possessions;
    total.points += line.points;
    total.fgm += line.fgm;
    total.fga += line.fga;
    total.fg3m += line.fg3m;
    total.fg3a += line.fg3a;
    total.fta += line.fta;
    total.assists += line.assists;
    total.turnovers += line.turnovers;
  }
  return total;
}

export function matchupEfg(line: MatchupLine): number | null {
  return line.fga ? (line.fgm + 0.5 * line.fg3m) / line.fga : null;
}

export function pointsPer75(line: MatchupLine): number | null {
  return line.possessions > 0 ? (line.points / line.possessions) * 75 : null;
}

/** "J. Brooks" style short name for dense rows. */
export function shortName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}
