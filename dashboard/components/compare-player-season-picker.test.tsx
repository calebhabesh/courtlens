// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ComparePlayerSeasonPicker } from "./compare-player-season-picker";
import { noteLanding } from "@/lib/landing-season";

afterEach(cleanup);
const props = {
  label: "Player A", season: "2024-25", seasons: ["2022-23", "2023-24", "2024-25"],
  awards: { "2022-23": ["MVP-2", "AS"], "2023-24": ["MVP-1", "AS"], "2024-25": ["MVP-1", "AS"] },
  championshipSeasons: ["2023-24"], beforeDate: "2025-04-13", onSelect: vi.fn(),
};

it("distinguishes a won MVP, championship and All-Star selection without counting a vote finish", () => {
  render(<ComparePlayerSeasonPicker {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Player A season, 2024-25, All-Star" }));
  const decorated = screen.getByRole("menuitem", { name: "2023-24 MVP winner, NBA champion, All-Star" });
  expect(decorated.querySelectorAll("svg")).toHaveLength(3);
  expect(screen.getByRole("menuitem", { name: "2022-23 All-Star" }).querySelectorAll("svg")).toHaveLength(1);
  expect(screen.getByRole("menuitem", { name: "2024-25 All-Star, selected" }).querySelectorAll("svg")).toHaveLength(1);
  fireEvent.click(decorated);
  expect(props.onSelect).toHaveBeenCalledWith("2023-24");
});

it("leaves missing sources unmarked and returns focus on Escape", () => {
  render(<ComparePlayerSeasonPicker {...props} awards={undefined} championshipSeasons={[]} />);
  const trigger = screen.getByRole("button", { name: "Player A season, 2024-25" });
  fireEvent.click(trigger);
  expect(screen.getByRole("menuitem", { name: "2023-24" }).querySelectorAll("svg")).toHaveLength(0);
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

it("keeps later seasons' honours when an early season is compared", () => {
  // Shai's rookie year: the cutoff ends 2018-19, yet the menu still marks his later seasons.
  render(<ComparePlayerSeasonPicker {...props} season="2022-23" beforeDate="2023-04-10"
    championshipSeasons={[]} recordedChampionships={["2023-24"]} />);
  fireEvent.click(screen.getByRole("button", { name: "Player A season, 2022-23, All-Star" }));
  expect(screen.getByRole("menuitem", { name: "2024-25 MVP winner, All-Star" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "2023-24 MVP winner, NBA champion, All-Star" })).toBeTruthy();
  // The compared season itself stays dated: its All-Star was announced before the cutoff.
  expect(screen.getByRole("menuitem", { name: "2022-23 All-Star, selected" })).toBeTruthy();
});

it("marks the best season and explains it on hover", () => {
  render(<ComparePlayerSeasonPicker {...props} season="2023-24" best={{ season: "2023-24", basis: "bpm" }} />);
  const trigger = screen.getByRole("button", { name: /^Player A season, 2023-24, best season/ });
  expect(trigger.getAttribute("title")).toContain("Box Plus/Minus");
  fireEvent.click(trigger);
  expect(screen.getByRole("menuitem", { name: /^2023-24 Best/ })).toBeTruthy();
  expect(screen.getByText("Best: highest Box Plus/Minus in a full season")).toBeTruthy();
});

it("opens by itself once after a pick moved the player, and says why", () => {
  noteLanding("893", { season: "2023-24", kind: "best" });
  vi.useFakeTimers();
  const { unmount } = render(<ComparePlayerSeasonPicker {...props} playerId="893" season="2023-24" best={{ season: "2023-24", basis: "ws_per_48" }} />);
  // It waits for the new card to settle before dropping down.
  expect(screen.queryByText(/Showing the best season/)).toBeNull();
  act(() => { vi.advanceTimersByTime(500); });
  vi.useRealTimers();
  expect(screen.getByText("Showing the best season by Win Shares per 48 minutes. Pick another:")).toBeTruthy();
  const trigger = screen.getByRole("button", { name: /^Player A season, 2023-24/ });
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  unmount();
  // Closed once, it stays closed when the card renders again.
  render(<ComparePlayerSeasonPicker {...props} playerId="893" season="2023-24" best={{ season: "2023-24", basis: "ws_per_48" }} />);
  expect(screen.getByRole("button", { name: /^Player A season, 2023-24/ }).getAttribute("aria-expanded")).toBe("false");
});
