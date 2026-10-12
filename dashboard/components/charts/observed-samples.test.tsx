// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Result } from "@/lib/conversation";
import { ObservedSamples } from "./observed-samples";

afterEach(cleanup);
const result = (values: (number | null)[]): Result => ({ step_id: "dist", operation: "distribution", operation_version: "v1", arguments: { metric: "pts" }, operation_hash: "a", result_hash: "b", data: { metric_display_name: "Points", metric_unit: "points", samples: values.map((value, index) => ({ value, game_date: `2025-04-${String(13 - index).padStart(2, "0")}` })) }, rows: [], evidence: [], limitations: [], eligible_count: null, open_url: null });

describe("retained observed sample plots", () => {
  it("labels both axes, units and newest-first order without drawing unknowns", () => {
    const { container } = render(<ObservedSamples result={result([35, null, 0, 9])} />);
    expect(screen.getByText("Points (points)")).toBeTruthy();
    expect(screen.getByText("Returned Appearance · newest first")).toBeTruthy();
    expect(screen.getByText("#1 · Apr 13")).toBeTruthy();
    expect(screen.getByText("#4 · Apr 10")).toBeTruthy();
    expect(screen.getByText("Sample: 3 observed · 1 unknown")).toBeTruthy();
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(3);
    expect(circles[1].getAttribute("data-sample-index")).toBe("2");
    expect(circles[1].textContent).toContain("0 points");
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
  it("retains signed values and centers a singleton without nonfinite geometry", () => {
    const { container } = render(<ObservedSamples result={result([-4])} />);
    expect(container.querySelector("circle")?.getAttribute("cx")).toBe("250");
    expect(screen.getByText("-4")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("shows no invented point when every observation is unknown", () => {
    const { container } = render(<ObservedSamples result={result([null, null])} />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(screen.getByText("No observed values.")).toBeTruthy();
    expect(screen.getByText("Sample: 0 observed · 2 unknown")).toBeTruthy();
  });
});
