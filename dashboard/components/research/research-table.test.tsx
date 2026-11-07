// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResearchTable, sortRows, type ResearchColumn } from "./research-table";

interface Row { id: string; name: string; team: string | null; a: number | null; lo: number | null; hi: number | null; b: number | null; min: number }
const rows: Row[] = [
  { id: "1", name: "Ann Able", team: "BOS", a: 2, lo: 0.5, hi: 3, b: 1, min: 900 },
  { id: "2", name: "Ben Best", team: "DEN", a: null, lo: null, hi: null, b: 3, min: 300 },
  { id: "3", name: "Cal Cole", team: "BOS", a: -1, lo: -2, hi: 0.5, b: null, min: 1200 },
];
const colA: ResearchColumn<Row> = { key: "a", label: "A", title: "A", signedValue: true, value: r => r.a, interval: r => ({ low: r.lo, high: r.hi }) };
const colB: ResearchColumn<Row> = { key: "b", label: "B", title: "B", signedValue: true, value: r => r.b };
const table = () => render(<ResearchTable<Row> label="Test table" rows={rows} rowKey={r => r.id} name={r => r.name} team={r => r.team} season="2025-26"
  player={r => <span>{r.name}</span>} views={[{ value: "one", label: "One", columns: [colA] }, { value: "two", label: "Two", columns: [colB] }]}
  defaultSort="a" noun="players" minimum={{ label: "Min MIN", value: r => r.min, initial: 0, step: 100 }}
  csv={{ filename: "t.csv", columns: [{ header: "id", value: r => r.id }] }} />);
const order = () => within(screen.getByRole("region", { name: "Test table" })).getAllByRole("row").slice(1).map(row => row.getAttribute("data-row"));

describe("ResearchTable", () => {
  afterEach(cleanup);

  it("keeps unknowns last in both directions", () => {
    expect(sortRows(rows, r => r.a, "desc", r => r.id).map(r => r.id)).toEqual(["1", "3", "2"]);
    expect(sortRows(rows, r => r.a, "asc", r => r.id).map(r => r.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts, colours by interval and shows unknown as an em dash", () => {
    table();
    expect(order()).toEqual(["1", "3", "2"]);
    const cells = screen.getByRole("region", { name: "Test table" }).querySelectorAll('td[data-column="a"]');
    expect(cells[0].querySelector(".rt-value")?.getAttribute("data-tone")).toBe("good");
    expect(cells[1].querySelector(".rt-value")?.getAttribute("data-tone")).toBeNull();
    expect(cells[2].textContent).toBe("—");
    fireEvent.click(screen.getByRole("button", { name: "Sort by A" }));
    expect(order()).toEqual(["3", "1", "2"]);
  });

  it("filters by search, team and minimum, and counts what is shown", () => {
    table();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), { target: { value: "cal" } });
    expect(order()).toEqual(["3"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Team" }), { target: { value: "BOS" } });
    expect(order()).toEqual(["1", "3"]);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Min MIN" }), { target: { value: "1000" } });
    expect(order()).toEqual(["3"]);
    expect(screen.getByText("1 players")).toBeTruthy();
  });

  it("a view without the sorted column sorts by its own first column", () => {
    table();
    fireEvent.click(screen.getByRole("radio", { name: "Two" }));
    expect(order()).toEqual(["2", "1", "3"]);
    expect(screen.getByRole("region", { name: "Test table" }).querySelector("th[aria-sort=descending]")?.textContent).toContain("B");
  });

  it("RD04: a controlled view follows its prop, reports changes, filters on the view's own count and names the interval level", () => {
    const seen: string[] = [];
    render(<ResearchTable<Row> label="Test table" rows={rows} rowKey={r => r.id} name={r => r.name} season="2025-26" intervalLevel={95}
      player={r => <span>{r.name}</span>} views={[{ value: "one", label: "One", columns: [colA] }, { value: "two", label: "Two", columns: [colB] }]}
      view="two" onViewChange={next => seen.push(next)} defaultSort="a" noun="players"
      minimum={{ label: "Min", value: (r, view) => view === "two" ? r.min : 0, initial: 0, step: 100 }}
      csv={{ filename: "t.csv", columns: [{ header: "id", value: r => r.id }] }} />);
    expect(screen.getByRole("radio", { name: "Two" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Min" }), { target: { value: "1000" } });
    expect(order()).toEqual(["3"]);
    fireEvent.click(screen.getByRole("radio", { name: "One" }));
    expect(seen).toEqual(["one"]);
  });

  it("RD04 round 2: the team filter can be the logo-grid picker, with no team dropdown", () => {
    render(<ResearchTable<Row> label="Test table" rows={rows} rowKey={r => r.id} name={r => r.name} team={r => r.team} teamPicker season="2025-26"
      player={r => <span>{r.name}</span>} views={[{ value: "one", label: "One", columns: [colA] }]} defaultSort="a" noun="players"
      csv={{ filename: "t.csv", columns: [{ header: "id", value: r => r.id }] }} />);
    expect(screen.queryByRole("combobox", { name: "Team" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Boston Celtics" }));
    expect(order()).toEqual(["1", "3"]);
    expect(screen.getByRole("button", { name: /^Team, Boston Celtics/ })).toBeTruthy();
  });
});
