// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChartFrame, DeltaChip, Donut, PercentileCell, Sankey, ShapePack, ThresholdBar, TimelineGrid, ValueBar, comparisonFlags, leadingIdentity, percentileBand, validFlow, type Category } from "./index";
import { resolveSvgTokens } from "@/lib/image-export";

afterEach(cleanup);
const meta = { title: "Observed result", source: "Retained source", sample: "82 games" };
const labels: Record<Category, string> = { 1: "Creator", 2: "Shooter", 3: "Finisher", 4: "Big", 5: "Wing", 6: "Other" };

describe("catalog direction and DeltaChip", () => {
  it("respects the existing lower-is-better catalog flag", () => {
    expect(comparisonFlags({ good_direction: "low" })).toEqual({ direction: "low", lowerIsBetter: true });
    render(<DeltaChip a={3.2} b={2.4} direction="low" names={["A", "B"]} />);
    expect(screen.getByText("B: 0.8 fewer").closest(".chart-delta")?.getAttribute("data-identity")).toBe("b");
  });
  it("colors a negative-valued higher-is-better metric by its leader", () => {
    render(<DeltaChip a={-1} b={-3} direction="high" names={["A", "B"]} />);
    expect(screen.getByText("A: 2.0 more").closest(".chart-delta")?.getAttribute("data-identity")).toBe("a");
  });
  it.each([null, undefined])("does not infer a favorable direction from an absent flag (%s)", direction => {
    expect(comparisonFlags({ good_direction: direction }).lowerIsBetter).toBeNull();
    expect(leadingIdentity(1, 2, direction)).toBeNull();
    render(<DeltaChip a={1} b={2} direction={direction} names={["A", "B"]} />);
    expect(screen.getByText(/no favorable direction declared/)).toBeTruthy();
  });
  it.each([null, NaN, Infinity])("keeps missing/nonfinite differences neutral (%s)", value => {
    render(<DeltaChip a={value} b={3} direction="high" names={["A", "B"]} />);
    expect(screen.getByText("Difference unknown")).toBeTruthy();
  });
  it("keeps ties neutral", () => expect(leadingIdentity(2, 2, "low")).toBeNull());
});

describe("ValueBar", () => {
  it("draws a negative value to the left of the zero baseline", () => {
    const { container } = render(<ValueBar {...meta} value={-2} domain={[-5, 5]} />);
    const bar = container.querySelector("[data-value-bar]")!;
    const baseline = container.querySelector("line")!;
    expect(Number(bar.getAttribute("x"))).toBeLessThan(Number(baseline.getAttribute("x1")));
    expect(Number(bar.getAttribute("width"))).toBeGreaterThan(0);
  });
  it("does not draw a missing value, but retains an observed zero", () => {
    const { container, rerender } = render(<ValueBar {...meta} value={null} domain={[0, 5]} />);
    expect(container.querySelector("[data-value-bar]")).toBeNull();
    rerender(<ValueBar {...meta} value={0} domain={[0, 5]} />);
    expect(container.querySelector("[data-value-bar]")?.getAttribute("width")).toBe("0");
  });
  it("rejects reversed/degenerate domains and labels clipped values honestly", () => {
    const { rerender } = render(<ValueBar {...meta} value={2} domain={[5, 0]} />);
    expect(screen.getByRole("alert").textContent).toContain("unavailable");
    rerender(<ValueBar {...meta} value={12} domain={[0, 10]} />);
    expect(screen.getByText(/full value/)).toBeTruthy();
  });
});

describe("ThresholdBar", () => {
  it("keeps close thresholds separately labeled instead of colliding SVG text", () => {
    render(<ThresholdBar {...meta} value={80} maximum={100} thresholds={[{ label: "Tax", value: 82 }, { label: "Apron", value: 83 }]} />);
    expect(screen.getByText("Tax")).toBeTruthy(); expect(screen.getByText("Apron")).toBeTruthy();
  });
  it("rejects invalid threshold domains", () => {
    render(<ThresholdBar {...meta} value={20} maximum={0} thresholds={[]} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("does not assign an area to unknown amounts", () => {
    const { container } = render(<ThresholdBar {...meta} value={null} maximum={100} thresholds={[]} />);
    expect(container.querySelector("[data-value-bar]")).toBeNull();
  });
});

describe("Donut", () => {
  it("uses the known denominator and discloses excluded unknowns", () => {
    const { container } = render(<Donut {...meta} items={[{ id: "a", label: "A", value: 75 }, { id: "b", label: "B", value: 25 }, { id: "c", label: "C", value: null }]} />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(screen.getByText("75.0% of known")).toBeTruthy();
    expect(screen.getByText(/full total is unknown/)).toBeTruthy();
  });
  it("replaces more than six nonzero slices with readable share bars", () => {
    const { container } = render(<Donut {...meta} items={Array.from({ length: 7 }, (_, i) => ({ id: String(i), label: `Row ${i}`, value: i + 1 }))} />);
    expect(container.querySelector(".chart-donut")).toBeNull();
    expect(container.querySelectorAll(".chart-share-bar")).toHaveLength(7);
  });
  it("shows observed zero without an invented slice", () => {
    const { container } = render(<Donut {...meta} items={[{ id: "zero", label: "Zero", value: 0 }]} />);
    expect(container.querySelector("path")).toBeNull(); expect(screen.getByText("Observed zero")).toBeTruthy();
  });
  it("rejects negative area values", () => {
    render(<Donut {...meta} items={[{ id: "bad", label: "Bad", value: -1 }]} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("Sankey", () => {
  const nodes = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  it("copies inputs before d3 layout, keeps missing edges out of geometry, and renders exact values", () => {
    const links = [{ source: "a", target: "b", value: 5 }, { source: "a", target: "b", value: null }];
    const before = JSON.stringify([nodes, links]);
    const { container } = render(<Sankey {...meta} nodes={nodes} links={links} />);
    expect(JSON.stringify([nodes, links])).toBe(before);
    expect(container.querySelectorAll(".chart-flow-desktop path")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Exact flow values" }).textContent).toContain("Unknown");
    expect(container.querySelector(".chart-flow-phone")).toBeTruthy();
  });
  it.each([
    [{ source: "a", target: "b", value: 5 }, { source: "b", target: "a", value: 5 }],
    [{ source: "a", target: "missing", value: 5 }],
    [{ source: "a", target: "b", value: -5 }]
  ].map(links => ({ links })))("rejects unsafe graphs without throwing", ({ links }) => {
    expect(validFlow(nodes, links)).toBe(false);
    render(<Sankey {...meta} nodes={nodes} links={links} />); expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("handles unknown-only and zero-only graphs without d3 divide-by-zero paths", () => {
    const { container } = render(<Sankey {...meta} nodes={nodes} links={[{ source: "a", target: "b", value: null }, { source: "a", target: "b", value: 0 }]} />);
    expect(container.querySelector("path")).toBeNull(); expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe("TimelineGrid", () => {
  it("labels status, hatches absent periods, and preserves a real zero", () => {
    const { container } = render(<TimelineGrid {...meta} periods={["2026-27", "2027-28"]} rows={[{ id: "a", label: "A", cells: [{ period: "2026-27", value: 0, status: "player-option" }] }]} />);
    expect(container.querySelector("td")?.textContent).toBe("0Player option");
    expect(container.querySelector(".chart-hatched")?.textContent).toBe("—Unknown");
    expect(screen.getByRole("region", { name: "Observed result by period" }).tabIndex).toBe(0);
  });
});

describe("PercentileCell", () => {
  it("uses already-oriented percentiles without reversing lower-is-better twice", () => {
    const { container } = render(<PercentileCell value={2} percentile={90} qualified label="TOV" cohort="500 minutes" />);
    expect(screen.getByText("90 pct")).toBeTruthy(); expect(container.innerHTML).toContain("--color-percentile-5");
  });
  it("mutes small samples even when a raw percentile is supplied", () => {
    const { container } = render(<PercentileCell value={4} percentile={99} qualified={false} label="PTS" cohort="500 minutes" />);
    expect(screen.getByText("Small sample")).toBeTruthy(); expect(container.innerHTML).not.toContain("--color-percentile-5");
  });
  it.each([-1, 101, NaN, null])("rejects invalid percentile %s", p => expect(percentileBand(p)).toBeNull());
});

describe("ShapePack", () => {
  it("sizes known positive values and leaves unknown/zero rows in readable labels", () => {
    const { container } = render(<ShapePack {...meta} sizeLabel="units" categoryLabels={labels} capacity={100} items={[{ id: "a", label: "A", value: 40, category: 1, fit: "observed" }, { id: "b", label: "B", value: null, category: null, fit: "unknown" }, { id: "c", label: "C", value: 0, category: 2, fit: "projected" }]} />);
    expect(container.querySelectorAll("[data-shape-id]")).toHaveLength(1);
    expect(container.querySelector(".chart-pack-labels")?.textContent).toContain("BCategory unknown · unknown fit—");
    expect(screen.getByText(/Capacity use is incomplete/)).toBeTruthy();
  });
  it("produces finite in-bounds geometry with unique hatch IDs across instances", () => {
    const items = [{ id: "a", label: "A", value: 10, category: null, fit: "unknown" as const }];
    const { container } = render(<><ShapePack {...meta} sizeLabel="units" categoryLabels={labels} items={items} /><ShapePack {...meta} sizeLabel="units" categoryLabels={labels} items={items} /></>);
    const ids = Array.from(container.querySelectorAll("pattern")).map(p => p.id);
    expect(new Set(ids).size).toBe(2); expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("rejects negative size rather than silently transforming impact", () => {
    render(<ShapePack {...meta} sizeLabel="signed impact" categoryLabels={labels} items={[{ id: "a", label: "A", value: -2, category: 1, fit: "observed" }]} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("shared chart states and portable exports", () => {
  it.each(["loading", "empty", "error"] as const)("keeps provenance and an action for %s", state => {
    render(<ChartFrame {...meta} state={state} action={<button>Retry</button>}><svg /></ChartFrame>);
    expect(screen.getByText("Source: Retained source")).toBeTruthy(); expect(screen.getByText("Sample: 82 games")).toBeTruthy();
    if (state === "loading") expect(screen.getByText("Loading Observed result")).toBeTruthy();
    else expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
  it("resolves tokens in standalone exports without mutating the on-screen SVG", () => {
    document.documentElement.style.setProperty("--color-identity-b", "#80bfff");
    const { container } = render(<svg><rect fill="var(--color-identity-b)" /><line stroke="var(--color-identity-b)" /></svg>);
    const original = container.querySelector("svg")!;
    const clone = resolveSvgTokens(original);
    expect(clone.querySelector("rect")?.getAttribute("fill")).toBe("#80bfff");
    expect(clone.querySelector("line")?.getAttribute("stroke")).toBe("#80bfff");
    expect(original.querySelector("rect")?.getAttribute("fill")).toContain("var(");
  });
});
