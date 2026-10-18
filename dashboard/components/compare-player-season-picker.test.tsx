// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ComparePlayerSeasonPicker } from "./compare-player-season-picker";

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
