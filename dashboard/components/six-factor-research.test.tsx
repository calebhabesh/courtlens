// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImpactTree } from "./six-factor-research";
import type { ImpactNode, ImpactTreeData, NodeKey, Reconstruction } from "@/lib/six-factor-research";

const estimate = (value: number): ImpactNode => ({ value, low: value - 1, high: value + 1, replicates: 200, percentile: 50, status: "estimate" });
const hidden: ImpactNode = { value: null, low: null, high: null, replicates: null, percentile: null, status: "below_qualification" };
const noInterval = (value: number): ImpactNode => ({ value, low: null, high: null, replicates: null, percentile: 50, status: "no_interval" });
const absent: ImpactNode = { ...hidden, status: "not_in_fit" };
const keys: NodeKey[] = ["rapm", "orapm", "drapm", "o_ts", "o_tov", "o_reb", "d_ts", "d_tov", "d_reb"];
const tree = (metrics: Partial<Record<NodeKey, ImpactNode>>, fallback = estimate(1.25), rebuilt: number | null = 2): ImpactTreeData => ({
  status: "available", season: "2025-26", phase: "regular_season", in_fit: true, rated_seasons: ["2025-26"],
  provenance: { version: "v", manifest_sha256: "m", artifact_sha256: "a", cutoff: "c", last_included_date: "d", interval_sha256: "i", interval_registration: "r" },
  player_id: "1", player_name: "Test Player", team: "DAL", games: 70, minutes: 2000,
  metrics: Object.fromEntries(keys.map(key => [key, metrics[key] ?? fallback])) as Record<NodeKey, ImpactNode>,
  composites: { net_efficiency: rebuilt, possession_control: rebuilt, reconstructed_rapm: rebuilt },
});
const fit = { players: 253, in_sample: { value: 0.955, p10: 0.94, p90: 0.96 } } as unknown as Reconstruction;
const nodeOf = (container: HTMLElement, key: NodeKey) => container.querySelector<HTMLElement>(`[data-node="${key}"]`)!;

describe("Impact Tree", () => {
  afterEach(cleanup);

  it("draws all nine nodes with the served value and interval on the element", () => {
    const { container } = render(<ImpactTree tree={tree({ rapm: estimate(1.23456789) })} reconstruction={fit} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(9);
    const root = nodeOf(container, "rapm");
    expect(root.dataset.value).toBe("1.23456789");
    expect(root.dataset.low).toBe(String(1.23456789 - 1));
    expect(within(root).getByText("+1.23")).toBeTruthy();
  });

  it("shows a hidden factor as unknown with no interval and no zero", () => {
    const { container } = render(<ImpactTree tree={tree({ o_reb: hidden }, estimate(1.25), null)} reconstruction={fit} />);
    const node = nodeOf(container, "o_reb");
    expect(within(node).getByText("Unknown")).toBeTruthy();
    expect(within(node).getByText("80% interval unknown")).toBeTruthy();
    expect(within(node).getByText("Below the fit's qualification")).toBeTruthy();
    expect(node.dataset.value).toBeUndefined();
    expect(screen.getByTestId("tree-reconstruction").textContent).toContain("unknown");
  });

  it("keeps a value whose interval is missing, and says the interval is unknown", () => {
    const { container } = render(<ImpactTree tree={tree({ rapm: noInterval(2.5) })} reconstruction={null} />);
    const node = nodeOf(container, "rapm");
    expect(within(node).getByText("+2.50")).toBeTruthy();
    expect(within(node).getByText("80% interval unknown")).toBeTruthy();
    expect(node.querySelector(".sf-range-span")).toBeNull();
  });

  it("leaves every node unknown for a player outside the fit", () => {
    const { container } = render(<ImpactTree tree={{ ...tree({}, absent, null), in_fit: false }} reconstruction={fit} />);
    expect(within(container).getAllByText("Unknown")).toHaveLength(9);
    expect(within(container).getAllByText("Not in this fit")).toHaveLength(9);
    expect(container.querySelector(".sf-range-dot")).toBeNull();
  });
});
