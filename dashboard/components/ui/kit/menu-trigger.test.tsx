// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Menu, MenuItem, Popover } from "../menu";
import { MenuTrigger } from "./menu-trigger";

afterEach(cleanup);

it("opens a menu with one button, chooses an item, and returns focus", async () => {
  const choose = vi.fn();
  render(<Menu renderTrigger={props => <MenuTrigger {...props} selected>Team</MenuTrigger>}><MenuItem label="Boston" onClick={choose} /><MenuItem label="Unavailable" disabled /></Menu>);
  const trigger = screen.getByRole("button", { name: "Team" });
  expect(trigger.querySelector("button")).toBeNull();
  expect(trigger.getAttribute("data-selected")).toBe("true");
  expect(trigger.hasAttribute("aria-pressed")).toBe(false);
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const item = screen.getByRole("menuitem", { name: "Boston" });
  expect(document.activeElement).toBe(item);
  fireEvent.click(item);
  expect(choose).toHaveBeenCalledOnce();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
});

it("dismisses a custom menu by Escape and outside click", async () => {
  render(<Menu renderTrigger={props => <MenuTrigger {...props}>Actions</MenuTrigger>}><MenuItem label="Export" /></Menu>);
  const trigger = screen.getByRole("button", { name: "Actions" });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Escape" });
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("supports a controlled popover and restores its custom trigger on Escape", () => {
  const change = vi.fn();
  function Controlled() {
    const [open, setOpen] = useState(false);
    return <Popover open={open} onOpenChange={next => { setOpen(next); change(next); }} triggerLabel="Date choices" renderTrigger={props => <MenuTrigger {...props} icon="calendar">Date</MenuTrigger>}><button onClick={() => setOpen(false)}>Apply</button></Popover>;
  }
  render(<Controlled />);
  const trigger = screen.getByRole("button", { name: "Date choices" });
  fireEvent.click(trigger);
  expect(change).toHaveBeenCalledWith(true);
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  screen.getByRole("button", { name: "Apply" }).focus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(change).toHaveBeenCalledWith(false);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});
