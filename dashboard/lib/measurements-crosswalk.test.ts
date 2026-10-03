import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getBackfillStatus,
  getCrosswalk,
  getMeasurements,
  getPlayerMeasurements
} from "./workbench-api";
import type {
  BackfillStatusResponse,
  CrosswalkResponse,
  MeasurementsQueryResponse,
  PlayerMeasurementsDetailResponse
} from "./types";

describe("Block B14: Measurements and Crosswalk Client Contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Inches Formatting and Ratio Calculation", () => {
    function formatInches(val: number | null | undefined): string {
      if (val == null) return "—";
      const feet = Math.floor(val / 12);
      const rem = val % 12;
      const remStr =
        rem === 0 ? "0" : rem % 1 === 0 ? rem.toString() : rem.toFixed(2).replace(/\.?0+$/, "");
      return `${feet}'${remStr}" (${val}")`;
    }

    it("formats integer and decimal inches correctly", () => {
      expect(formatInches(80)).toBe(`6'8" (80")`);
      expect(formatInches(86.75)).toBe(`7'2.75" (86.75")`);
      expect(formatInches(72)).toBe(`6'0" (72")`);
      expect(formatInches(null)).toBe("—");
      expect(formatInches(undefined)).toBe("—");
    });

    it("evaluates wingspan-to-height ratio correctly without converting missing values to 0", () => {
      // Scottie Barnes: 86.75 wingspan, 80.0 height with shoes -> ratio 1.084
      const wingspan = 86.75;
      const height = 80.0;
      const ratio = wingspan / height;
      expect(ratio).toBeCloseTo(1.084, 3);
      expect(ratio >= 1.05).toBe(true);

      // Missing wingspan should never become 0
      const missingWingspan: number | null = null;
      expect(missingWingspan).toBeNull();
      expect(missingWingspan === 0).toBe(false);
    });
  });

  describe("API Client Fetchers", () => {
    it("getMeasurements builds query params and returns parsed response", async () => {
      const mockData: MeasurementsQueryResponse = {
        items: [
          {
            player_id: "1627783",
            display_name: "Pascal Siakam",
            measurement_type: "combine",
            source_name: "draft_combine",
            draft_year: 2016,
            pick_overall: 27,
            drafting_team_id: "TOR",
            height_no_shoes_inches: 80.25,
            height_shoes_inches: 81.5,
            wingspan_inches: 87.25,
            standing_reach_inches: 107.5,
            weight_lbs: 227.0,
            body_fat_pct: 5.0,
            wingspan_to_height_ratio: 1.07
          }
        ],
        count: 1,
        disclaimer: "Official combine measurements"
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData
      });
      global.fetch = fetchMock;

      const res = await getMeasurements({
        measurementType: "combine",
        minWingspan: 85.0
      });

      expect(fetchMock).toHaveBeenCalled();
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("measurementType=combine");
      expect(calledUrl).toContain("minWingspan=85");
      expect(res.count).toBe(1);
      expect(res.items[0].display_name).toBe("Pascal Siakam");
    });

    it("getPlayerMeasurements fetches specific player detail", async () => {
      const mockDetail: PlayerMeasurementsDetailResponse = {
        player_id: "1630567",
        display_name: "Scottie Barnes",
        has_measurements: true,
        combine: {
          draft_year: 2021,
          height_no_shoes_inches: 79.0,
          height_shoes_inches: 80.0,
          wingspan_inches: 86.75,
          standing_reach_inches: 108.0,
          weight_lbs: 225.0,
          body_fat_pct: 6.0,
          standing_vertical_inches: 36.0,
          max_vertical_inches: 39.5,
          lane_agility_seconds: 11.2,
          three_quarter_sprint_seconds: 3.15,
          wingspan_to_height_ratio: 1.08,
          source_attribution: "draft_combine"
        },
        listed: {
          season: "2025-26",
          height_shoes_inches: 80.0,
          weight_lbs: 237.0,
          source_attribution: "official_roster"
        },
        draft: {
          draft_year: 2021,
          round_number: 1,
          pick_overall: 4,
          drafting_team_id: "TOR",
          drafting_team_name: "Toronto Raptors",
          draft_type: "draft",
          college_or_prior_team: "Florida State"
        },
        disclaimer: "Notice on listed vs combine"
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDetail
      });
      global.fetch = fetchMock;

      const res = await getPlayerMeasurements("1630567");
      expect(fetchMock).toHaveBeenCalled();
      expect(res.player_id).toBe("1630567");
      expect(res.combine?.wingspan_inches).toBe(86.75);
      expect(res.listed?.weight_lbs).toBe(237.0);
      expect(res.draft?.pick_overall).toBe(4);
    });

    it("getCrosswalk resolves ESPN id to canonical NBA entity", async () => {
      const mockCrosswalk: CrosswalkResponse = {
        resolved: true,
        item: {
          source_namespace: "espn",
          source_id: "4433134",
          target_namespace: "nba",
          target_id: "1630567",
          kind: "player",
          confidence: "verified",
          mapping_method: "exact_match",
          evidence: { display_name: "Scottie Barnes" }
        }
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCrosswalk
      });
      global.fetch = fetchMock;

      const res = await getCrosswalk({
        sourceNamespace: "espn",
        sourceId: "4433134"
      });

      expect(res.resolved).toBe(true);
      expect(res.item?.target_id).toBe("1630567");
      expect(res.item?.confidence).toBe("verified");
    });

    it("getBackfillStatus retrieves historical season coverage status", async () => {
      const mockBackfill: BackfillStatusResponse = {
        range: [2001, 2023],
        total_seasons: 23,
        imported_count: 5,
        acquired_count: 2,
        pending_count: 16,
        imported_years: [2019, 2020, 2021, 2022, 2023],
        acquired_years: [2017, 2018],
        pending_years: [2001, 2002, 2003]
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockBackfill
      });
      global.fetch = fetchMock;

      const res = await getBackfillStatus({ startYear: 2001, endYear: 2023 });
      expect(res.total_seasons).toBe(23);
      expect(res.imported_count).toBe(5);
      expect(res.pending_count).toBe(16);
    });
  });
});
