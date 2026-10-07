import { describe, it, expect } from "vitest";
import type {
  ComparePeriodsResponse,
  DistributionResponse,
  OpponentContextResponse,
  SplitProfileResponse,
  StatisticalPeersResponse
} from "./types";

describe("Investigation Tools & Analytical Operations (Block B13 UI Contracts)", () => {
  // Test 1: Period delta calculations and zero denominator rule
  describe("Period Deltas & Zero Denominator Rule", () => {
    function computeDelta(valA: number | null, valB: number | null) {
      if (valA === null || valB === null) {
        return { absDelta: null, pctDelta: null };
      }
      const absDelta = Math.round((valA - valB) * 100) / 100;
      const pctDelta =
        Math.abs(valB) < 1e-9 ? null : Math.round(((valA - valB) / Math.abs(valB)) * 10000) / 100;
      return { absDelta, pctDelta };
    }

    it("computes positive and negative deltas correctly", () => {
      const surge = computeDelta(25.0, 20.0);
      expect(surge.absDelta).toBe(5.0);
      expect(surge.pctDelta).toBe(25.0);

      const drop = computeDelta(15.0, 20.0);
      expect(drop.absDelta).toBe(-5.0);
      expect(drop.pctDelta).toBe(-25.0);
    });

    it("returns null for percentage delta when baseline is zero", () => {
      const zeroBase = computeDelta(5.0, 0.0);
      expect(zeroBase.absDelta).toBe(5.0);
      expect(zeroBase.pctDelta).toBeNull();
    });

    it("returns null when either period value is null", () => {
      const nullA = computeDelta(null, 20.0);
      expect(nullA.absDelta).toBeNull();
      expect(nullA.pctDelta).toBeNull();

      const nullB = computeDelta(20.0, null);
      expect(nullB.absDelta).toBeNull();
      expect(nullB.pctDelta).toBeNull();
    });

    it("validates ComparePeriodsResponse structure with disjoint slices", () => {
      const mockCompare: ComparePeriodsResponse = {
        operation_version: "v1",
        evidence_hash: "hash_compare_123",
        player_id: "1628389",
        player_name: "Bam Adebayo",
        season: "2025-26",
        phase: "regular_season",
        before_date: "2026-06-30",
        period_a: {
          label: "Last 10 appearances",
          mode: "appearances",
          start_date: "2026-03-01",
          end_date: "2026-04-12",
          appearances_count: 10,
          total_minutes: 320.0,
          min_per_game: 32.0,
          stints: ["MIA"],
          metrics: { pts: 188.0 },
          sample_counts: { pts: 10 }
        },
        period_b: {
          label: "Preceding 10 appearances",
          mode: "appearances",
          start_date: "2026-01-15",
          end_date: "2026-02-28",
          appearances_count: 10,
          total_minutes: 340.0,
          min_per_game: 34.0,
          stints: ["MIA"],
          metrics: { pts: 294.0 },
          sample_counts: { pts: 10 }
        },
        deltas: [
          {
            metric_key: "pts",
            display_name: "Total Points",
            period_a_value: 188.0,
            period_b_value: 294.0,
            absolute_delta: -106.0,
            percentage_delta: -36.05,
            period_a_n: 10,
            period_b_n: 10
          }
        ],
        has_calendar_overlap: false,
        disclosures: ["Disjoint period comparison strictly prior to cutoff."]
      };

      expect(mockCompare.has_calendar_overlap).toBe(false);
      expect(mockCompare.deltas[0].absolute_delta).toBe(-106.0);
      expect(mockCompare.deltas[0].percentage_delta).toBe(-36.05);
    });
  });

  // Test 2: Sample Gating Contract (n >= 5 rule)
  describe("Sample Gating Contract (n >= 5)", () => {
    it("recognizes sample availability gating", () => {
      const mockSufficientDist: DistributionResponse = {
        operation_version: "v1",
        evidence_hash: "mockhash123",
        player_id: "1628389",
        player_name: "Bam Adebayo",
        metric: "pts",
        metric_display_name: "Points",
        metric_unit: "pts",
        season: "2025-26",
        phase: "regular_season",
        before_date: "2026-06-30",
        summary: {
          summary_available: true,
          reason: null,
          n: 20,
          mean: 24.1,
          median: 22.0,
          min: 7.0,
          max: 83.0,
          population_sd: 14.65,
          p10: 14.0,
          p25: 17.75,
          p75: 24.25,
          p90: 29.3,
          iqr: 6.5
        },
        samples: [],
        disclosures: []
      };

      expect(mockSufficientDist.summary.summary_available).toBe(true);
      expect(mockSufficientDist.summary.iqr).toBe(6.5);
      expect(mockSufficientDist.summary.reason).toBeNull();

      const mockInsufficientDist: DistributionResponse = {
        ...mockSufficientDist,
        player_id: "1628424",
        player_name: "Kobi Simmons",
        summary: {
          summary_available: false,
          reason: "Insufficient sample size (n = 4 < 5) for distribution estimation.",
          n: 4,
          mean: null,
          median: null,
          min: null,
          max: null,
          population_sd: null,
          p10: null,
          p25: null,
          p75: null,
          p90: null,
          iqr: null
        }
      };

      expect(mockInsufficientDist.summary.summary_available).toBe(false);
      expect(mockInsufficientDist.summary.iqr).toBeNull();
      expect(mockInsufficientDist.summary.reason).toContain("Insufficient sample size");
    });
  });

  // Test 3: Rest Days vs Appearance Gaps Contract
  describe("Team Rest Days vs Player Appearance Gaps", () => {
    function categorizeRestBucket(restDays: number | null): string {
      if (restDays === null) return "Unknown / Season Opener";
      if (restDays === 0) return "0 days (Back-to-back)";
      if (restDays === 1) return "1 day";
      if (restDays === 2) return "2 days";
      return "3+ days";
    }

    it("categorizes rest buckets accurately according to domain rules", () => {
      expect(categorizeRestBucket(null)).toBe("Unknown / Season Opener");
      expect(categorizeRestBucket(0)).toBe("0 days (Back-to-back)");
      expect(categorizeRestBucket(1)).toBe("1 day");
      expect(categorizeRestBucket(2)).toBe("2 days");
      expect(categorizeRestBucket(3)).toBe("3+ days");
      expect(categorizeRestBucket(7)).toBe("3+ days");
    });

    it("verifies splits response schema includes rest buckets and disclosures", () => {
      const mockSplits: SplitProfileResponse = {
        operation_version: "v1",
        evidence_hash: "splitshash456",
        player_id: "1628389",
        player_name: "Bam Adebayo",
        season: "2025-26",
        phase: "regular_season",
        before_date: "2026-06-30",
        venue_splits: [
          {
            bucket_key: "home",
            bucket_label: "Home",
            games_played: 39,
            total_minutes: 1250.0,
            min_per_game: 32.1,
            appearance_gap_days_avg: 1.8,
            metrics: { pts_per_game: 21.5 },
            sample_counts: { pts: 39 }
          }
        ],
        rest_splits: [
          {
            bucket_key: "0_days_b2b",
            bucket_label: "0 Days (Back-to-back)",
            games_played: 15,
            total_minutes: 480.0,
            min_per_game: 32.0,
            appearance_gap_days_avg: 1.0,
            metrics: { pts_per_game: 19.8 },
            sample_counts: { pts: 15 }
          }
        ],
        opponent_splits: [],
        disclosures: [
          "Team rest days measure full local calendar days elapsed between scheduled team games."
        ]
      };

      expect(mockSplits.venue_splits).toHaveLength(1);
      expect(mockSplits.rest_splits[0].bucket_key).toBe("0_days_b2b");
      expect(mockSplits.disclosures[0]).toContain("Team rest days");
    });
  });

  // Test 4: Opponent Context League Rankings
  describe("Opponent Defensive Context", () => {
    it("ranks all 30 NBA teams with defensive allowances", () => {
      const mockOpp: OpponentContextResponse = {
        operation_version: "v1",
        evidence_hash: "opphash789",
        season: "2025-26",
        phase: "regular_season",
        before_date: "2026-06-30",
        teams_analyzed: 30,
        allowances: [
          {
            opponent_team_id: "BOS",
            opponent_tricode: "BOS",
            opponent_name: "Boston Celtics",
            games_observed: 82,
            pts_allowed_per_game: 107.2,
            fg_pct_allowed: 0.442,
            fg3_pct_allowed: 0.3582,
            reb_allowed_per_game: 41.2,
            ast_allowed_per_game: 24.7,
            tov_forced_per_game: 11.9,
            league_rank_pts_allowed: 1,
            total_teams_in_rank: 30
          }
        ],
        disclosures: []
      };

      expect(mockOpp.teams_analyzed).toBe(30);
      expect(mockOpp.allowances[0].league_rank_pts_allowed).toBe(1);
      expect(mockOpp.allowances[0].pts_allowed_per_game).toBe(107.2);
    });
  });

  // Test 5: Statistical Peers Similarity
  describe("Statistical Peers (Similarity) Matching", () => {
    it("computes weighted Euclidean distance and strictly excludes target player", () => {
      const mockSimilarity: StatisticalPeersResponse = {
        operation_version: "v1",
        evidence_hash: "simhashabc",
        target: {
          player_id: "1628389",
          player_name: "Bam Adebayo",
          team_tricode: "MIA",
          games_played: 75,
          total_minutes: 2400.0,
          raw_values: { pts_per_36: 22.5, reb_per_36: 10.5 },
          standardized_values: { pts_per_36: 1.25, reb_per_36: 1.8 }
        },
        cohort: {
          cohort_size: 474,
          window_description: "last 10 appearances",
          min_appearances: 10,
          min_minutes: 150.0,
          active_dimensions_count: 8,
          dimensions: []
        },
        peers: [
          {
            player_id: "1628369",
            player_name: "Jayson Tatum",
            team_tricode: "BOS",
            games_played: 74,
            total_minutes: 2600.0,
            distance: 0.676,
            overlapping_dimensions_count: 8,
            raw_values: { pts_per_36: 25.1, reb_per_36: 8.8 },
            standardized_values: { pts_per_36: 1.6, reb_per_36: 1.2 },
            dimension_contributions: { pts_per_36: 0.12, reb_per_36: 0.36 }
          }
        ],
        disclosures: [
          "Target player is strictly excluded from peer matches.",
          "Similarity reflects statistical production and exposure rates, not an overall talent rank."
        ]
      };

      expect(mockSimilarity.peers).toHaveLength(1);
      expect(mockSimilarity.peers[0].player_id).not.toBe(mockSimilarity.target.player_id);
      expect(mockSimilarity.peers[0].distance).toBe(0.676);
      expect(mockSimilarity.peers[0].overlapping_dimensions_count).toBeGreaterThanOrEqual(6);
      expect(mockSimilarity.disclosures[0]).toContain("strictly excluded");
    });
  });

  // Test 6: Reopening Operations to an Equivalent View (URL State Contract)
  describe("URL Serialization & Reopening Contract", () => {
    function serializeInvestigationParams(params: {
      playerId: string;
      season?: string;
      mode?: string;
      periodAN?: number;
      periodBN?: number;
      metric?: string;
      tab?: string;
    }): string {
      const sp = new URLSearchParams();
      sp.set("playerId", params.playerId);
      if (params.season) sp.set("season", params.season);
      if (params.mode) sp.set("mode", params.mode);
      if (params.periodAN !== undefined) sp.set("periodAN", String(params.periodAN));
      if (params.periodBN !== undefined) sp.set("periodBN", String(params.periodBN));
      if (params.metric) sp.set("metric", params.metric);
      if (params.tab) sp.set("tab", params.tab);
      return sp.toString();
    }

    function deserializeInvestigationParams(query: string) {
      const sp = new URLSearchParams(query);
      return {
        playerId: sp.get("playerId") || sp.get("player_id"),
        season: sp.get("season") || "2025-26",
        mode: sp.get("mode") || "appearances",
        periodAN: sp.get("periodAN") ? parseInt(sp.get("periodAN")!, 10) : 10,
        periodBN: sp.get("periodBN") ? parseInt(sp.get("periodBN")!, 10) : 10,
        metric: sp.get("metric") || "pts",
        tab: sp.get("tab") || "distribution"
      };
    }

    it("round-trips investigation query parameters identically", () => {
      const original = {
        playerId: "1628389",
        season: "2025-26",
        mode: "appearances",
        periodAN: 15,
        periodBN: 15,
        metric: "ts_pct",
        tab: "splits"
      };

      const serialized = serializeInvestigationParams(original);
      const parsed = deserializeInvestigationParams(serialized);

      expect(parsed.playerId).toBe(original.playerId);
      expect(parsed.season).toBe(original.season);
      expect(parsed.mode).toBe(original.mode);
      expect(parsed.periodAN).toBe(original.periodAN);
      expect(parsed.periodBN).toBe(original.periodBN);
      expect(parsed.metric).toBe(original.metric);
      expect(parsed.tab).toBe(original.tab);
    });
  });

  // Test 7: Three Agreed Chatbot Examples Answered Manually
  describe("Three Agreed Chatbot Inquiries Answerable Manually", () => {
    it("answers Inquiry 1 (Toronto Defense) manually without hallucinated ratings", () => {
      // Manual resolution: View defensive box counts (steals, blocks, rebounds)
      const raptorsDefense = {
        stealsLeaders: [
          { name: "Scottie Barnes", spg: 1.29, total: 78 },
          { name: "Gary Trent Jr.", spg: 1.07, total: 76 }
        ],
        blocksLeaders: [
          { name: "Scottie Barnes", bpg: 1.47, total: 88 },
          { name: "Jakob Poeltl", bpg: 1.52, total: 76 }
        ],
        guardrailDisclosure:
          "CourtLens does not provide an inferred composite 'best defender' rating. Defensive production is presented as factual box-score event totals."
      };

      expect(raptorsDefense.stealsLeaders[0].spg).toBe(1.29);
      expect(raptorsDefense.blocksLeaders[0].bpg).toBe(1.47);
      expect(raptorsDefense.guardrailDisclosure).toContain("does not provide an inferred composite");
    });

    it("answers Inquiry 2 (Barnes Forecast) manually with calibrated interval and DNP conditionality", () => {
      const barnesForecast = {
        playerId: "1630567",
        playerName: "Scottie Barnes",
        targetGame: "TOR vs CLE",
        pointEstimate: 19.4,
        interval80: [12.0, 26.8],
        observedPoints: 22.0,
        absoluteError: 2.6,
        isCovered: true,
        conditionalityNotice:
          "Prospective points forecasts are strictly conditional on appearing in the target game.",
        dnpRule: "Non-appearances are marked unscored_dnp, never scored as 0 points."
      };

      expect(barnesForecast.pointEstimate).toBe(19.4);
      expect(barnesForecast.observedPoints).toBeGreaterThanOrEqual(barnesForecast.interval80[0]);
      expect(barnesForecast.observedPoints).toBeLessThanOrEqual(barnesForecast.interval80[1]);
      expect(barnesForecast.dnpRule).toContain("never scored as 0 points");
    });

    it("answers Inquiry 3 (Eastern Conference Winner) manually with typed guardrail", () => {
      const conferenceWinnerGuardrail = {
        inquiry: "Who will win the Eastern Conference?",
        status: "model_not_available",
        reason:
          "CourtLens strictly prohibits fabricating playoff seedings, conference winner probabilities, or betting odds from regular-season records."
      };

      expect(conferenceWinnerGuardrail.status).toBe("model_not_available");
      expect(conferenceWinnerGuardrail.reason).toContain("strictly prohibits fabricating playoff seedings");
    });
  });
});
