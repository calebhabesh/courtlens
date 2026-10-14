// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImpactPlayerCard } from "./impact-player-card";
import { ImpactDisclosure } from "./impact-disclosure";
import measuredFixture from "@/lib/impact-card-fixture.json";
import definitions from "@/lib/impact-metrics.json";
import { IMPACT_COLUMNS, STATS_PRESETS } from "@/lib/stats-presets";
import { normalizedColumn } from "@/lib/stats-query";
import type { ImpactResponse } from "@/lib/types";

afterEach(cleanup);
const fixture: ImpactResponse = measuredFixture;

describe("impact serving presentation", () => {
  it("renders served coefficients and explicit cohort coverage", () => {
    render(<ImpactPlayerCard data={fixture} />);
    expect(screen.getByText("9.12")).toBeTruthy();
    expect(screen.getByText("CourtLens model")).toBeTruthy();
    expect(screen.getByText(/1,227 \/ 1,230 games admitted/)).toBeTruthy();
    expect(screen.getByText(/exclusive fit cutoff 2026-07-01/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Methodology and definitions" }).getAttribute("href")).toBe("/methodology#impact");
  });
  it("retains null BPR and shows unsupported prior reason", () => {
    const unsupported = structuredClone(fixture);
    unsupported.players[0].metrics.bpr = null;
    unsupported.players[0].support.bpr = { qualified: false, reason: "No admitted historical prior" };
    render(<ImpactPlayerCard data={unsupported} />);
    expect(screen.getByText("No admitted historical prior")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
  it("renders a cutoff gate with methodology and wave-two disclosures", () => {
    render(<ImpactDisclosure data={{ ...fixture, status: "unavailable", reason: "No sealed fit wholly before this cutoff.", artifacts: [], coverage: [] }} />);
    expect(screen.getByRole("status").textContent).toContain("before this cutoff");
    expect(screen.getByText(/deflections: requires admitted hustle data/)).toBeTruthy();
  });
  it("all active columns are defined, formatted and independent of counting mode", () => {
    const keys = new Set(definitions.metrics.map(metric => metric.key));
    for (const preset of STATS_PRESETS) {
      for (const column of preset.columns) expect(column.key).toBeTruthy();
    }
    for (const [key, column] of Object.entries(IMPACT_COLUMNS)) {
      expect(keys.has(key)).toBe(true);
      expect(column.format?.(null)).toBe("—");
      expect(normalizedColumn(column, "per_36").key).toBe(key);
    }
    expect(IMPACT_COLUMNS.o_ts.format?.(0.5)).toBe("0.50");
    expect(IMPACT_COLUMNS.pbp_drb_pct.format?.(0.5)).toBe("50.0%");
  });
});
