import type {
  PlayoffGameCard,
  PlayoffRoundResponse,
  PlayoffSeriesSummary,
  PlayerSeriesStats,
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
  if (series.status === "final") {
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
