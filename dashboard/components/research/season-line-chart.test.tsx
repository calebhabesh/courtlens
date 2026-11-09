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

  it("draws an interval band only when named, keeps each point's interval and shows only the chosen x labels (RD08)", () => {
    const points = [{ season: "1", value: 24.8, low: 21.2, high: 28.6 }, { season: "2", value: 17.5, low: 14.8, high: 20.3 }, { season: "3", value: 20.3, low: 17.5, high: 23.4 }];
    const plain = render(<SeasonLineChart label="a" format={v => v.toFixed(1)} points={points} />);
    expect(plain.container.querySelector(".slc-band")).toBeNull();
    expect(plain.container.querySelectorAll(".slc-x-label")).toHaveLength(3);
    cleanup();
    const { container } = render(<SeasonLineChart label="b" format={v => v.toFixed(1)} band="95%" xTicks={[0, 2]} points={points} />);
    expect(container.querySelector(".slc-band")?.getAttribute("d")).toMatch(/^M.*Z$/);
    const dot = container.querySelector('.slc-dot[data-season="2"]');
    expect([dot?.getAttribute("data-low"), dot?.getAttribute("data-high")]).toEqual(["14.8", "20.3"]);
    expect([...container.querySelectorAll(".slc-x-label")].map(l => l.textContent)).toEqual(["1", "3"]);
    expect([...container.querySelectorAll(".slc-y-label")].every(l => Number(l.textContent) >= 0)).toBe(true);
  });

  it("keeps zero on the axis and marks it when asked (RD10)", () => {
    const { container } = render(<SeasonLineChart label="Gain" format={v => v.toFixed(2)} band="95%" zero
      points={[{ season: "24-25", value: 0.6, low: 0.4, high: 0.8 }, { season: "25-26", value: 1.2, low: 1, high: 1.4 }]} />);
    expect(container.querySelectorAll('.slc-grid[data-zero]')).toHaveLength(1);
    expect([...container.querySelectorAll(".slc-y-label")].map(l => Number(l.textContent))).toContain(0);
  });

  it("says so when there are fewer than two values", () => {
    render(<SeasonLineChart label="x" format={String} points={[{ season: "2014-15", value: 1 }]} />);
    expect(screen.getByText("Not enough seasons to draw a line.")).toBeTruthy();
  });
});
