// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LeaderBars } from "./leader-bars";

afterEach(cleanup);
const meta = { title: "Leaders", source: "Retained source", sample: "5 players", measure: "points", zeroMeans: "an average player" };

describe("LeaderBars (RD12 round 4)", () => {
  it("draws every row on one scale from zero, gold above zero, and says what the two ends are", () => {
    const { container } = render(<LeaderBars {...meta} items={[{ key: "a", name: "Alpha", label: "Alpha", value: 8, formatted: "8.00" }, { key: "b", name: "Beta", label: "Beta", value: 4, formatted: "4.00" }]} />);
    const fills = container.querySelectorAll(".rs-leaders-fill");
    expect(fills[0].getAttribute("data-identity")).toBe("a");
    expect(fills[0].getAttribute("data-width")).toBe("100");
    expect(fills[1].getAttribute("data-width")).toBe("50");
    expect(screen.getByText("0 is an average player")).toBeTruthy();
    expect(screen.getByText("8 is the top of this list")).toBeTruthy();
    expect(container.querySelectorAll(".rs-leaders-zero")).toHaveLength(0);
  });

  it("marks zero and turns blue below it, and keeps an unknown row with no bar", () => {
    const { container } = render(<LeaderBars {...meta} items={[{ key: "a", name: "Alpha", label: "Alpha", value: 2 }, { key: "b", name: "Beta", label: "Beta", value: -2 }, { key: "c", name: "Gamma", label: "Gamma", value: null }]} />);
    const fills = container.querySelectorAll(".rs-leaders-fill");
    expect(fills).toHaveLength(2);
    expect(fills[1].getAttribute("data-identity")).toBe("b");
    expect(fills[1].getAttribute("data-left")).toBe("0");
    expect(fills[1].getAttribute("data-width")).toBe("50");
    expect(container.querySelectorAll(".rs-leaders-zero")).toHaveLength(3);
    expect(screen.getByRole("img", { name: "Gamma: unknown points" })).toBeTruthy();
  });

  it("renders the empty state, never an empty scale", () => {
    render(<LeaderBars {...meta} items={[]} />);
    expect(screen.getByText(/No observed values/)).toBeTruthy();
  });
});
