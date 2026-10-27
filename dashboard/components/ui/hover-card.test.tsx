// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HoverCard, HoverCardBody } from "./hover-card";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const card = <HoverCard content={<HoverCardBody eyebrow="Dashboard stat" pill="Per 36" title="TOV" lead="Turnovers." />}>
  <span tabIndex={0}>TOV 2.1</span>
</HoverCard>;

it("opens at once on focus at document.body, and Esc closes it", () => {
  render(card);
  fireEvent.focus(screen.getByText("TOV 2.1"));
  const tip = screen.getByRole("tooltip");
  expect(tip.parentElement).toBe(document.body);
  expect(tip.textContent).toContain("Dashboard stat");
  expect(tip.textContent).toContain("Per 36");
  expect(screen.getByText("TOV 2.1").parentElement?.getAttribute("aria-describedby")).toBe(tip.id);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("waits for the hover delay and closes when the pointer leaves", () => {
  vi.useFakeTimers();
  render(card);
  const anchor = screen.getByText("TOV 2.1").parentElement!;
  fireEvent.mouseEnter(anchor);
  expect(screen.queryByRole("tooltip")).toBeNull();
  act(() => { vi.advanceTimersByTime(300); });
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.mouseLeave(anchor);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
