// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GridSearch, GridValue, StatsGrid } from "./stats-grid";

describe("GridValue", () => {
  afterEach(cleanup);

  it("RD04: carries a good/bad tone only when given one, and unknown stays a plain dash", () => {
    const { container, rerender } = render(<GridValue text="+4.7" sub="+3.7 to +5.6" tone="good" title="80% interval +3.7 to +5.6" />);
    expect(container.querySelector(".rs-grid-value")?.getAttribute("data-tone")).toBe("good");
    expect(container.querySelector(".rs-grid-sub")?.textContent).toBe("+3.7 to +5.6");
    rerender(<GridValue text="+0.2" sub="−0.1 to +0.5" />);
    expect(container.querySelector(".rs-grid-value")?.hasAttribute("data-tone")).toBe(false);
    rerender(<GridValue text={null} tone="good" />);
    expect(container.querySelector(".rs-grid-value")?.hasAttribute("data-tone")).toBe(false);
    expect(container.textContent).toBe("—");
  });

  it("RD04 round 5: the header search is the Stats table's markup, and Escape clears it", () => {
    const seen: string[] = [];
    const { container } = render(<GridSearch value="jok" onChange={v => seen.push(v)} />);
    expect(container.querySelector(".stats-header-search > .lookup-input-wrapper > input.lookup-input")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search players" }), { key: "Escape" });
    expect(seen).toEqual([""]);
  });

  it("RD04 round 5: a keepCase column marks its header so oTS isn't capitalised", () => {
    const { container } = render(<StatsGrid<{ id: string }> label="T" rows={[{ id: "1" }]} rowKey={r => r.id} lead={{ label: "Player", cell: r => r.id }}
      columns={[{ key: "ts", label: "oTS", keepCase: true, cell: () => "+1" }, { key: "n", label: "Shots", cell: () => "2" }]} />);
    const heads = [...container.querySelectorAll("thead th")];
    expect(heads.find(th => th.textContent === "oTS")?.classList.contains("rs-grid-keep-case")).toBe(true);
    expect(heads.find(th => th.textContent === "Shots")?.classList.contains("rs-grid-keep-case")).toBe(false);
  });

  it("RD16: a column's headerAfter is drawn whether or not the grid sorts", () => {
    const after = <span data-testid="scale">0 to 40</span>;
    const { container } = render(<StatsGrid<{ id: string }> label="T" rows={[{ id: "1" }]} rowKey={r => r.id} lead={{ label: "Player", cell: r => r.id }}
      columns={[{ key: "range", label: "Range", headerAfter: after, cell: () => "1" }]} />);
    expect(container.querySelector("thead [data-testid=scale]")?.textContent).toBe("0 to 40");
  });
});
