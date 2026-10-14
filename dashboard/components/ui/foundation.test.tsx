// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { DatePicker } from "./date-picker";
import { GatedNote } from "./gated-note";
import { PageHeader } from "./panel";
import { StatTile, ordinal } from "./stat-tile";
import { readAdvancedMode, useAdvancedMode } from "../../lib/advanced-mode";
import { storageKeys } from "../../lib/storage-keys";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DatePicker", () => {
  function Controlled({ initial = "2026-04-10", onChange = () => {}, disabled }: { initial?: string; onChange?: (v: string) => void; disabled?: (v: string) => boolean }) {
    const [value, setValue] = useState(initial);
    return <DatePicker label="Game day" value={value} isDateDisabled={disabled} min="2026-03-01" max="2026-04-30"
      onChange={(next) => { setValue(next); onChange(next); }} />;
  }

  it("shows the single display format and exposes the ISO value", () => {
    render(<Controlled />);
    const trigger = screen.getByRole("button", { name: "Game day: Apr 10, 2026" });
    expect(trigger.getAttribute("data-value")).toBe("2026-04-10");
    expect(trigger.textContent).toContain("Apr 10, 2026");
  });

  it("moves by keyboard and selects with Enter", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Game day/ }));
    const grid = screen.getByRole("grid", { name: "Game day" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2026-04-18");
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("refuses disabled dates by click and keyboard, and marks them unavailable", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} disabled={(value) => value === "2026-04-11"} />);
    fireEvent.click(screen.getByRole("button", { name: /Game day/ }));
    const off = screen.getByRole("button", { name: "Apr 11, 2026, unavailable" });
    expect(off.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(off);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables dates outside min/max and month navigation past them", () => {
    render(<Controlled initial="2026-04-29" />);
    fireEvent.click(screen.getByRole("button", { name: /Game day/ }));
    expect(screen.getByRole("button", { name: "May 1, 2026, unavailable" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Controlled />);
    const trigger = screen.getByRole("button", { name: /Game day/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });
    expect(screen.queryByRole("grid")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("GatedNote Why? disclosure", () => {
  it("shows one line and keeps the required wording rendered while collapsed", () => {
    render(<GatedNote why={<p>Missing participation is not a confirmed zero or roster exclusion.</p>}>No observed participation.</GatedNote>);
    expect(screen.getByRole("note").textContent).toContain("No observed participation.");
    const details = screen.getByText("Why?").closest("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByText(/not a confirmed zero/)).toBeTruthy();
    fireEvent.click(screen.getByText("Why?"));
    expect(details.open).toBe(true);
  });

  it("omits the disclosure when there is nothing to explain", () => {
    render(<GatedNote>No games on Oct 8.</GatedNote>);
    expect(screen.queryByText("Why?")).toBeNull();
  });
});

describe("Advanced mode", () => {
  it("defaults off, persists locally and notifies subscribers", () => {
    const { result } = renderHook(() => useAdvancedMode());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(storageKeys.advancedMode)).toBe("on");
    expect(readAdvancedMode()).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(storageKeys.advancedMode)).toBeNull();
  });

  it("follows changes made in another tab", () => {
    const { result } = renderHook(() => useAdvancedMode());
    act(() => {
      window.localStorage.setItem(storageKeys.advancedMode, "on");
      window.dispatchEvent(new StorageEvent("storage", { key: storageKeys.advancedMode }));
    });
    expect(result.current[0]).toBe(true);
  });
});

describe("PageHeader and StatTile", () => {
  it("puts the title and actions on one row with a single subtitle line", () => {
    render(<PageHeader title="Player Showcase" subtitle="Shareable stat cards." actions={<button>Export</button>} />);
    const heading = screen.getByRole("heading", { level: 1, name: "Player Showcase" });
    expect(heading.parentElement?.querySelector(".ui-page-header-actions")?.textContent).toBe("Export");
    expect(document.querySelectorAll(".ui-page-header-subtitle")).toHaveLength(1);
  });

  it("formats ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111, 113].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th", "113th"]);
  });

  it("shows value, rank and a percentile meter, and an em dash for unknown values", () => {
    render(<><StatTile label="Points" value="33.5" unit="PPG" rank={1} rankOf={591} percentile={100} /><StatTile label="Steals" value={null} /></>);
    expect(screen.getByText("1st").getAttribute("title")).toBe("1st of 591");
    expect(screen.getByRole("meter", { name: "Points percentile" }).getAttribute("aria-valuenow")).toBe("100");
    const unavailable = screen.getByText("Steals unavailable");
    expect(unavailable.className).toBe("sr-only");
    expect(unavailable.previousElementSibling?.textContent).toBe("—");
    expect(unavailable.previousElementSibling?.getAttribute("aria-hidden")).toBe("true");
  });
});
