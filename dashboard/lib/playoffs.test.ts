import { describe, it, expect } from "vitest";
import {
  formatPercent,
  formatStat,
  getSeriesStatusBadge,
  getGameCardDisplay,
  filterBracketRounds,
  evaluateFactorAdvantage,
  buildTeamSeriesComparison,
  sortPlayerSeriesStats
} from "./playoffs";
import type {
  PlayoffGameCard,
  PlayoffRoundResponse,
  PlayoffSeriesSummary,
  PlayerSeriesStats,
  TeamSeriesStats
} from "./types";

describe("Playoffs UI Utilities", () => {
  it("formats percentages and stats safely", () => {
    expect(formatPercent(0.5432)).toBe("54.3%");
    expect(formatPercent(0.5432, 2)).toBe("54.32%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(NaN)).toBe("—");

    expect(formatStat(112.456, 1)).toBe("112.5");
    expect(formatStat(112.456, 2)).toBe("112.46");
    expect(formatStat(null)).toBe("—");
    expect(formatStat(undefined)).toBe("—");
  });

  it("evaluates series status badges correctly", () => {
    const sweepSeries: PlayoffSeriesSummary = {
      series_id: "004230030",
      slug: "2024-r3-bos-ind",
      season: "2023-24",
      round_number: 3,
      round_name: "Conference Finals",
      conference: "East",
      matchup_index: 0,
      team1: { team_id: "1610612738", tricode: "BOS", name: "Boston Celtics", seed: 1, wins: 4 },
      team2: { team_id: "1610612754", tricode: "IND", name: "Indiana Pacers", seed: 6, wins: 0 },
      series_score: "4-0",
      status: "final",
      winner_team_id: "1610612738",
      winner_tricode: "BOS",
      games_count: 4,
      total_scheduled: 7,
      is_sweep: true,
      summary_text: "Boston Celtics won 4-0"
    };

    const finalBadge = getSeriesStatusBadge(sweepSeries);
    expect(finalBadge.label).toBe("SWEEP");
    expect(finalBadge.badgeClass).toBe("badge-positive");

    const inProgressSeries = { ...sweepSeries, is_sweep: false, status: "in_progress" };
    expect(getSeriesStatusBadge(inProgressSeries).label).toBe("IN PROGRESS");

    const scheduledSeries = { ...sweepSeries, is_sweep: false, status: "scheduled" };
    expect(getSeriesStatusBadge(scheduledSeries).label).toBe("SCHEDULED");
  });

  it("handles game card displays including unplayed placeholders", () => {
    const finalCard: PlayoffGameCard = {
      game_id: "0042300401",
      game_number: 1,
      game_date: "2024-06-06",
      home_team_id: "1610612738",
      home_team_tricode: "BOS",
      away_team_id: "1610612742",
      away_team_tricode: "DAL",
      home_score: 107,
      away_score: 89,
      status: "final",
      venue: "TD Garden",
      winner_team_id: "1610612738",
      margin: 18
    };

    const finalDisplay = getGameCardDisplay(finalCard);
    expect(finalDisplay.label).toBe("FINAL");
    expect(finalDisplay.note).toBe("Margin: +18 PTS");

    const scheduledCard: PlayoffGameCard = {
      ...finalCard,
      status: "scheduled",
      home_score: null,
      away_score: null,
      game_date: "2024-06-14"
    };
    const schedDisplay = getGameCardDisplay(scheduledCard);
    expect(schedDisplay.label).toBe("SCHEDULED");
    expect(schedDisplay.note).toBe("Replay Date: 2024-06-14");

    const unplayedCard: PlayoffGameCard = {
      ...finalCard,
      status: "unplayed_placeholder",
      game_number: 6,
      home_score: null,
      away_score: null
    };
    const unplayedDisplay = getGameCardDisplay(unplayedCard, "BOS");
    expect(unplayedDisplay.label).toBe("NOT NEEDED");
    expect(unplayedDisplay.note).toBe("Series concluded by BOS");
  });

  it("filters bracket rounds by conference and round number", () => {
    const mockRounds: PlayoffRoundResponse[] = [
      {
        round_number: 1,
        round_name: "First Round",
        eastern_series: [
          {
            series_id: "004230010",
            slug: "2024-r1-bos-mia",
            season: "2023-24",
            round_number: 1,
            round_name: "First Round",
            conference: "East",
            matchup_index: 0,
            team1: { team_id: "1", tricode: "BOS", name: "Boston Celtics", seed: 1, wins: 4 },
            team2: { team_id: "2", tricode: "MIA", name: "Miami Heat", seed: 8, wins: 1 },
            series_score: "4-1",
            status: "final",
            winner_team_id: "1",
            winner_tricode: "BOS",
            games_count: 5,
            total_scheduled: 7,
            is_sweep: false,
            summary_text: "Boston Celtics won 4-1"
          }
        ],
        western_series: [
          {
            series_id: "004230014",
            slug: "2024-r1-okc-nop",
            season: "2023-24",
            round_number: 1,
            round_name: "First Round",
            conference: "West",
            matchup_index: 4,
            team1: { team_id: "3", tricode: "OKC", name: "OKC Thunder", seed: 1, wins: 4 },
            team2: { team_id: "4", tricode: "NOP", name: "NO Pelicans", seed: 8, wins: 0 },
            series_score: "4-0",
            status: "final",
            winner_team_id: "3",
            winner_tricode: "OKC",
            games_count: 4,
            total_scheduled: 7,
            is_sweep: true,
            summary_text: "OKC Thunder won 4-0"
          }
        ],
        finals_series: [],
        series: []
      },
      {
        round_number: 4,
        round_name: "NBA Finals",
        eastern_series: [],
        western_series: [],
        finals_series: [
          {
            series_id: "004230040",
            slug: "2024-finals-bos-dal",
            season: "2023-24",
            round_number: 4,
            round_name: "NBA Finals",
            conference: null,
            matchup_index: 0,
            team1: { team_id: "1", tricode: "BOS", name: "Boston Celtics", seed: 1, wins: 4 },
            team2: { team_id: "5", tricode: "DAL", name: "Dallas Mavericks", seed: 5, wins: 1 },
            series_score: "4-1",
            status: "final",
            winner_team_id: "1",
            winner_tricode: "BOS",
            games_count: 5,
            total_scheduled: 7,
            is_sweep: false,
            summary_text: "Boston Celtics won 4-1"
          }
        ],
        series: []
      }
    ];

    // Populate series property
    mockRounds[0].series = [...mockRounds[0].eastern_series, ...mockRounds[0].western_series];
    mockRounds[1].series = [...mockRounds[1].finals_series];

    const eastOnly = filterBracketRounds(mockRounds, "all", "East");
    expect(eastOnly.length).toBe(1);
    expect(eastOnly[0].series[0].slug).toBe("2024-r1-bos-mia");

    const westOnly = filterBracketRounds(mockRounds, "all", "West");
    expect(westOnly.length).toBe(1);
    expect(westOnly[0].series[0].slug).toBe("2024-r1-okc-nop");

    const finalsOnly = filterBracketRounds(mockRounds, 4, "Finals");
    expect(finalsOnly.length).toBe(1);
    expect(finalsOnly[0].series[0].slug).toBe("2024-finals-bos-dal");
  });

  it("evaluates factor advantage for higher and lower is better", () => {
    // eFG%: higher is better
    expect(evaluateFactorAdvantage(0.55, 0.52, false)).toBe("team1");
    expect(evaluateFactorAdvantage(0.51, 0.53, false)).toBe("team2");
    expect(evaluateFactorAdvantage(0.50, 0.50, false)).toBe("tied");

    // TOV%: lower is better
    expect(evaluateFactorAdvantage(0.11, 0.14, true)).toBe("team1");
    expect(evaluateFactorAdvantage(0.15, 0.12, true)).toBe("team2");

    // Def Rating: lower is better
    expect(evaluateFactorAdvantage(104.5, 110.2, true)).toBe("team1");
  });

  it("builds team series four factors comparison rows", () => {
    const team1: TeamSeriesStats = {
      team_id: "1610612738",
      tricode: "BOS",
      team_name: "Boston Celtics",
      seed: 1,
      wins: 4,
      losses: 1,
      games_played: 5,
      points_per_game: 106.8,
      opponent_points_per_game: 99.2,
      average_margin: 7.6,
      pace: 93.4,
      off_rating: 114.2,
      def_rating: 106.1,
      net_rating: 8.1,
      efg_pct: 0.545,
      tov_pct: 0.108,
      oreb_pct: 0.285,
      ftr: 0.245,
      totals: {}
    };

    const team2: TeamSeriesStats = {
      team_id: "1610612742",
      tricode: "DAL",
      team_name: "Dallas Mavericks",
      seed: 5,
      wins: 1,
      losses: 4,
      games_played: 5,
      points_per_game: 99.2,
      opponent_points_per_game: 106.8,
      average_margin: -7.6,
      pace: 93.4,
      off_rating: 106.1,
      def_rating: 114.2,
      net_rating: -8.1,
      efg_pct: 0.512,
      tov_pct: 0.134,
      oreb_pct: 0.245,
      ftr: 0.210,
      totals: {}
    };

    const rows = buildTeamSeriesComparison(team1, team2);
    expect(rows.length).toBe(10);
    const netRow = rows.find((r) => r.key === "net_rating");
    expect(netRow?.advantage).toBe("team1");

    const tovRow = rows.find((r) => r.key === "tov_pct");
    expect(tovRow?.advantage).toBe("team1"); // lower TOV% is better

    const defRow = rows.find((r) => r.key === "def_rating");
    expect(defRow?.advantage).toBe("team1"); // lower def_rating is better
  });

  it("sorts player series stats numerically and alphabetically", () => {
    const players: PlayerSeriesStats[] = [
      {
        player_id: "1",
        player_name: "Luka Doncic",
        team_id: "1610612742",
        team_tricode: "DAL",
        games_played: 5,
        games_started: 5,
        minutes_total_seconds: 11640,
        minutes_per_game: 38.8,
        points_total: 146,
        points_per_game: 29.2,
        rebounds_total: 44,
        rebounds_per_game: 8.8,
        offensive_rebounds: 8,
        defensive_rebounds: 36,
        assists_total: 28,
        assists_per_game: 5.6,
        steals_total: 13,
        steals_per_game: 2.6,
        blocks_total: 2,
        blocks_per_game: 0.4,
        turnovers_total: 23,
        turnovers_per_game: 4.6,
        fouls_total: 18,
        fouls_per_game: 3.6,
        fgm: 54,
        fga: 115,
        fg_pct: 0.470,
        fg3m: 13,
        fg3a: 53,
        fg3_pct: 0.245,
        ftm: 25,
        fta: 43,
        ft_pct: 0.581,
        efg_pct: 0.526,
        ts_pct: 0.545
      },
      {
        player_id: "2",
        player_name: "Jayson Tatum",
        team_id: "1610612738",
        team_tricode: "BOS",
        games_played: 5,
        games_started: 5,
        minutes_total_seconds: 12060,
        minutes_per_game: 40.2,
        points_total: 111,
        points_per_game: 22.2,
        rebounds_total: 39,
        rebounds_per_game: 7.8,
        offensive_rebounds: 5,
        defensive_rebounds: 34,
        assists_total: 36,
        assists_per_game: 7.2,
        steals_total: 6,
        steals_per_game: 1.2,
        blocks_total: 3,
        blocks_per_game: 0.6,
        turnovers_total: 16,
        turnovers_per_game: 3.2,
        fouls_total: 14,
        fouls_per_game: 2.8,
        fgm: 37,
        fga: 95,
        fg_pct: 0.389,
        fg3m: 11,
        fg3a: 42,
        fg3_pct: 0.262,
        ftm: 26,
        fta: 35,
        ft_pct: 0.743,
        efg_pct: 0.447,
        ts_pct: 0.503
      }
    ];

    const sortedByPointsDesc = sortPlayerSeriesStats(players, "points_per_game", "desc");
    expect(sortedByPointsDesc[0].player_name).toBe("Luka Doncic");

    const sortedByAssistsDesc = sortPlayerSeriesStats(players, "assists_per_game", "desc");
    expect(sortedByAssistsDesc[0].player_name).toBe("Jayson Tatum");

    const sortedByNameAsc = sortPlayerSeriesStats(players, "player_name", "asc");
    expect(sortedByNameAsc[0].player_name).toBe("Jayson Tatum");
  });
});
