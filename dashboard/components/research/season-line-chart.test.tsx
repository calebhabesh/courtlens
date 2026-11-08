// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SeasonLineChart, niceTicks } from "./season-line-chart";

describe("SeasonLineChart (RD06)", () => {
  afterEach(cleanup);

  it("chooses round ticks that cover the values", () => {
    const ticks = niceTicks([0.534, 0.581]);
    expect(ticks[0]).toBeLessThanOrEqual(0.534);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(0.581);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });

  it("draws one point per known season with its exact value and summarises the line", () => {
    const { container } = render(<SeasonLineChart label="League TS% by season" format={v => v.toFixed(3)}
      points={[{ season: "2014-15", value: 0.534 }, { season: "2015-16", value: null }, { season: "2016-17", value: 0.552 }]} />);
    const dots = [...container.querySelectorAll(".slc-dot")].map(dot => [dot.getAttribute("data-season"), dot.getAttribute("data-value")]);
    expect(dots).toEqual([["2014-15", "0.534"], ["2016-17", "0.552"]]);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("League TS% by season: 2014-15 0.534 to 2016-17 0.552; low 0.534, high 0.552.");
  });

  it("says so when there are fewer than two values", () => {
    render(<SeasonLineChart label="x" format={String} points={[{ season: "2014-15", value: 1 }]} />);
    expect(screen.getByText("Not enough seasons to draw a line.")).toBeTruthy();
  });
});
