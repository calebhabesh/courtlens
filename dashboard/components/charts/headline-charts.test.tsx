// @vitest-environment happy-dom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PairedBars, ReliabilityPlot } from "./index";

afterEach(cleanup);
const meta = { source: "Sealed report", sample: "20 observations" };

describe("headline chart semantics", () => {
  it("shares a signed scale and keeps a missing value distinct from an observed zero", () => {
    const { container } = render(<PairedBars {...meta} title="Signed comparison" names={["A", "B"]}
      rows={[{key: "signed", label: "Signed", a: -2, b: 4}, {key: "unknown", label: "Unknown", a: null, b: 0}]} />);
    const svgs = container.querySelectorAll("svg");
    const negative = svgs[0].querySelectorAll("rect")[1], positive = svgs[1].querySelectorAll("rect")[1];
    expect(Number(positive.getAttribute("width"))).toBeCloseTo(Number(negative.getAttribute("width")) * 2);
    expect(Number(positive.getAttribute("x"))).toBeCloseTo(Number(negative.getAttribute("width")));
    expect(svgs[2].querySelectorAll("rect")).toHaveLength(1);
    expect(svgs[3].querySelectorAll("rect")).toHaveLength(2);
    expect(svgs[3].querySelectorAll("rect")[1].getAttribute("width")).toBe("0");
    expect(screen.getByRole("img", {name: "Unknown, A: unknown"})).toBeTruthy();
    expect(screen.getByRole("img", {name: "Unknown, B: 0"})).toBeTruthy();
  });
  it("keeps nominal coverage and the observed coverage on a fixed 0–100 scale", () => {
    const { container } = render(<PairedBars {...meta} title="Coverage" names={["Observed", "Nominal"]} domain={[0, 100]}
      rows={[{key: "coverage", label: "Core", a: 75, b: 80}]} />);
    const bars = [...container.querySelectorAll("svg")].map(svg => Number(svg.querySelectorAll("rect")[1].getAttribute("width")));
    expect(bars).toEqual([150, 160]);
    expect(container.textContent).toContain("Sealed report");
  });
  it("plots only measured nonempty calibration bins with separate subject shapes", () => {
    const bin = {lower: .2, upper: .3, rows: 10, mean_probability: .25, observed_rate: .3};
    const { container } = render(<ReliabilityPlot {...meta} title="Reliability" series={[
      {name: "Baseline", bins: [bin, {...bin, rows: 0}, {...bin, observed_rate: null}]},
      {name: "Candidate", bins: [{...bin, mean_probability: .5}]},
    ]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelectorAll("rect")).toHaveLength(1);
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.querySelector("circle")?.getAttribute("cx")).toBe("156");
    expect(container.querySelector("title")?.textContent).toContain("10 shots");
  });
});
