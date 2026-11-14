// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { positionChipStatus } from "@/lib/position-estimates";
import { StatsPositionChips } from "./stats-page-controls";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/stats",
  useSearchParams: () => search,
}));

const coverage = {
  version: "courtlens-position-estimates-v1", method_url: "/methodology#position-estimates",
  sealed_seasons: ["2024-25", "2025-26"], provisional_seasons: ["2026-27"], provisional_observed_at: null,
};

afterEach(cleanup);

describe("position chip coverage", () => {
  it("reads sealed, provisional and missing seasons", () => {
    expect(positionChipStatus(coverage, ["2025-26"])).toBe("sealed");
    expect(positionChipStatus(coverage, ["2026-27"])).toBe("provisional");
    expect(positionChipStatus(coverage, ["2025-26", "2026-27"])).toBe("provisional");
    expect(positionChipStatus(coverage, ["1990-91"])).toBe("none");
    expect(positionChipStatus(null, ["1990-91"])).toBe("sealed");
  });

  it("disables chips for a season without estimates but keeps a pressed one clearable", () => {
    search = new URLSearchParams("positions=PG");
    render(<StatsPositionChips status="none" seasons={["1990-91"]} />);
    expect(screen.getByRole("group").getAttribute("title")).toBe("No estimated positions for 1990-91 yet.");
    expect(screen.getByRole("button", { name: "Point Guards" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Centers" }).hasAttribute("disabled")).toBe(true);
  });

  it("labels provisional chips", () => {
    search = new URLSearchParams();
    render(<StatsPositionChips status="provisional" seasons={["2026-27"]} />);
    expect(screen.getByRole("button", { name: "Centers (provisional)" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("group").getAttribute("title")).toContain("2026-27 is in progress");
  });
});
