import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getTeamFourFactors,
  getTeamPeers,
  getTeamSchedule,
  getTeamThreePointVariation,
} from "./workbench-api";
import type {
  TeamFourFactorsResponse,
  TeamPeersResponse,
  TeamScheduleResponse,
  ThreePointVariationResponse,
} from "./types";

describe("Block B15: Team Operations, Schedule and Four Factors Client Contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Four Factors Domain Expectations", () => {
    it("preserves Oliver's Four Factors formula weights summing to 1.0", () => {
      const weights = {
        efg: 0.4,
        tov: 0.25,
        orb: 0.2,
        ftr: 0.15,
      };
      const sum = weights.efg + weights.tov + weights.orb + weights.ftr;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it("handles rest days calculation (calendar days diff - 1)", () => {
      // Back to back: game on Jan 2 following game on Jan 1
      const d1 = new Date("2026-01-01");
      const d2 = new Date("2026-01-02");
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24));
      const restDays = diffDays - 1;
      expect(restDays).toBe(0);

      // Normal 1 day off: Jan 3 following Jan 1
      const d3 = new Date("2026-01-03");
      const diffDays2 = Math.round((d3.getTime() - d1.getTime()) / (1000 * 3600 * 24));
      expect(diffDays2 - 1).toBe(1);
    });
  });

  describe("API Client Fetchers", () => {
    it("getTeamSchedule fetches schedule progression with rest context", async () => {
      const mockSchedule: TeamScheduleResponse = {
        team: { id: "1610612761", tricode: "TOR", name: "Toronto Raptors" },
        context: {},
        overall_record: {
          games_played: 2,
          wins: 1,
          losses: 1,
          win_pct: 0.5,
          differential: 0,
          current_streak: "L1",
        },
        home_split: {
          games_played: 1,
          wins: 1,
          losses: 0,
          win_pct: 1.0,
          ppg: 115.0,
          opp_ppg: 108.0,
          differential: 7.0,
        },
        away_split: {
          games_played: 1,
          wins: 0,
          losses: 1,
          win_pct: 0.0,
          ppg: 102.0,
          opp_ppg: 110.0,
          differential: -8.0,
        },
        back_to_back_summary: {
          first_leg_games: { games: 1, wins: 1, losses: 0, win_pct: 1.0 },
          second_leg_games: { games: 1, wins: 0, losses: 1, win_pct: 0.0 },
        },
        longest_homestand: 1,
        longest_road_trip: 1,
        rest_splits: [
          {
            bucket_key: "0_days",
            bucket_label: "0 Days (B2B)",
            games_played: 1,
            wins: 0,
            losses: 1,
            win_pct: 0.0,
            ppg: 102.0,
            opp_ppg: 110.0,
            differential: -8.0,
          },
        ],
        games: [
          {
            game_id: "g1",
            game_date: "2025-10-22",
            side: "home",
            opponent_id: "1610612738",
            opponent_tricode: "BOS",
            opponent_name: "Boston Celtics",
            team_points: 115,
            opponent_points: 108,
            differential: 7,
            is_win: true,
            result: "W",
            rest_days: 3,
            is_back_to_back: false,
            rest_bucket: "3+_days",
            streak: "W1",
            venue_streak: "H1",
          },
        ],
        warnings: [],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSchedule,
      });
      global.fetch = fetchMock;

      const res = await getTeamSchedule("TOR", { season: "2025-26" });
      expect(fetchMock).toHaveBeenCalled();
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/workbench/teams/TOR/schedule");
      expect(calledUrl).toContain("season=2025-26");
      expect(res.team.tricode).toBe("TOR");
      expect(res.back_to_back_summary.second_leg_games.games).toBe(1);
      expect(res.games).toHaveLength(1);
      expect(res.games[0].result).toBe("W");
    });

    it("getTeamFourFactors fetches offensive and defensive ratings and factors", async () => {
      const mockFourFactors: TeamFourFactorsResponse = {
        team: { id: "1610612761", tricode: "TOR", name: "Toronto Raptors" },
        context: {},
        games_played: 82,
        pace: 98.4,
        off_rating: 115.2,
        def_rating: 112.5,
        net_rating: 2.7,
        ratings: [
          {
            key: "net_rating",
            display_name: "Net Rating",
            value: 2.7,
            league_avg: 0.0,
            rank: 9,
            percentile: 72.4,
            total_teams: 30,
            good_direction: "higher",
            unit: "points_per_100",
            formula: "off_rating - def_rating",
          },
        ],
        offense_factors: [
          {
            key: "efg_pct",
            display_name: "Effective Field Goal %",
            factor: "Shooting",
            weight: 0.4,
            value: 0.545,
            league_avg: 0.535,
            rank: 7,
            percentile: 79.3,
            total_teams: 30,
            good_direction: "higher",
            unit: "percentage",
            formula: "(fgm + 0.5 * fg3m) / fga",
          },
        ],
        defense_factors: [
          {
            key: "opp_efg_pct",
            display_name: "Opponent eFG%",
            factor: "Shooting",
            weight: 0.4,
            value: 0.528,
            league_avg: 0.535,
            rank: 9,
            percentile: 72.4,
            total_teams: 30,
            good_direction: "lower",
            unit: "percentage",
            formula: "(opp_fgm + 0.5 * opp_fg3m) / opp_fga",
          },
        ],
        shooting_percentages: {
          fg_pct: 0.472,
          fg3_pct: 0.366,
          ft_pct: 0.785,
          efg_pct: 0.545,
        },
        league_averages: {
          fg3_pct: 0.36,
          pace: 99.1,
        },
        three_point_scenario: {
          observed_fg3m: 980,
          observed_fg3a: 2700,
          observed_3p_pct: 0.363,
          league_3p_pct: 0.366,
          hypothetical_fg3m: 988,
          delta_points: 24,
          actual_ppg: 112.5,
          hypothetical_ppg: 112.8,
          actual_off_rating: 115.2,
          hypothetical_off_rating: 115.5,
          delta_off_rating: 0.3,
          actual_net_rating: 2.7,
          hypothetical_net_rating: 3.0,
          delta_net_rating: 0.3,
          disclaimer:
            "What-if accounting counterfactual holding shot attempt volumes constant.",
        },
        warnings: [],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockFourFactors,
      });
      global.fetch = fetchMock;

      const res = await getTeamFourFactors("TOR");
      expect(fetchMock).toHaveBeenCalled();
      expect(res.team.tricode).toBe("TOR");
      expect(res.off_rating).toBe(115.2);
      expect(res.def_rating).toBe(112.5);
      expect(res.net_rating).toBe(2.7);
      expect(res.offense_factors[0].good_direction).toBe("higher");
      expect(res.defense_factors[0].good_direction).toBe("lower");
    });

    it("getTeamPeers fetches similar teams by standardized profile distance", async () => {
      const mockPeers: TeamPeersResponse = {
        team: { id: "1610612761", tricode: "TOR", name: "Toronto Raptors" },
        context: {},
        peers: [
          {
            team_id: "1610612754",
            tricode: "IND",
            name: "Indiana Pacers",
            similarity_score: 91.5,
            distance: 0.42,
            dimension_diffs: {
              net_rating: { target: 2.7, peer: 2.5, diff: 0.2 },
            },
          },
        ],
        dimensions_used: ["net_rating", "pace", "off_rating", "def_rating"],
        warnings: [],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPeers,
      });
      global.fetch = fetchMock;

      const res = await getTeamPeers("TOR", { limit: 5 });
      expect(fetchMock).toHaveBeenCalled();
      expect(res.team.tricode).toBe("TOR");
      expect(res.peers[0].tricode).toBe("IND");
      expect(res.peers[0].similarity_score).toBe(91.5);
    });

    it("getTeamThreePointVariation evaluates Feature F18 what-if scenario with non-inferential disclaimer", async () => {
      const mockF18: ThreePointVariationResponse = {
        team: { id: "1610612761", tricode: "TOR", name: "Toronto Raptors" },
        context: {},
        scenario: {
          observed_fg3m: 980,
          observed_fg3a: 2700,
          observed_3p_pct: 0.363,
          league_3p_pct: 0.366,
          hypothetical_fg3m: 988,
          delta_points: 24,
          actual_ppg: 112.5,
          hypothetical_ppg: 112.8,
          actual_off_rating: 115.2,
          hypothetical_off_rating: 115.5,
          delta_off_rating: 0.3,
          actual_net_rating: 2.7,
          hypothetical_net_rating: 3.0,
          delta_net_rating: 0.3,
          disclaimer:
            "What-if accounting counterfactual holding shot attempt volumes constant. Not a causal luck-removal guarantee.",
        },
        warnings: [],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockF18,
      });
      global.fetch = fetchMock;

      const res = await getTeamThreePointVariation("TOR");
      expect(fetchMock).toHaveBeenCalled();
      expect(res.team.tricode).toBe("TOR");
      expect(res.scenario.delta_points).toBe(24);
      expect(res.scenario.disclaimer).toContain("What-if accounting counterfactual");
    });
  });
});
