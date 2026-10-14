// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Segmented } from "./segmented";

afterEach(cleanup);

const options = [{ value: "table", label: "Table" }, { value: "off", label: "Unavailable", disabled: true }, { value: "cards", label: "Cards" }, { value: "chart", label: "Chart" }];

function Controlled() {
  const [value, setValue] = useState("table");
  return <Segmented label="View" options={options} value={value} onChange={setValue} />;
}

it("uses radio semantics, one tab stop, and one decorative sliding indicator", () => {
  render(<Controlled />);
  const group = screen.getByRole("radiogroup", { name: "View" });
  expect(screen.getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("true");
  expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  expect(group.querySelectorAll('.ui-sliding-indicator[aria-hidden="true"]')).toHaveLength(1);
  fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
  expect(screen.getByRole("radio", { name: "Cards" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("false");
});

it("wraps arrow navigation, skips disabled options, and supports Home and End", () => {
  render(<Controlled />);
  const group = screen.getByRole("radiogroup");
  for (const [key, label] of [["ArrowRight", "Cards"], ["ArrowDown", "Chart"], ["ArrowRight", "Table"], ["ArrowLeft", "Chart"], ["ArrowUp", "Cards"], ["Home", "Table"], ["End", "Chart"]]) {
    fireEvent.keyDown(group, { key });
    const selected = screen.getByRole("radio", { name: label });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(selected);
    expect(selected.getAttribute("tabindex")).toBe("0");
  }
});

it("keeps a tab stop when the selected option is unavailable and disables the whole group", () => {
  const change = vi.fn();
  const { rerender } = render(<Segmented label="View" options={options} value="off" onChange={change} />);
  expect(screen.getByRole("radio", { name: "Table" }).getAttribute("tabindex")).toBe("0");
  fireEvent.click(screen.getByRole("radio", { name: "Unavailable" }));
  expect(change).not.toHaveBeenCalled();
  rerender(<Segmented label="View" options={options} value="table" onChange={change} disabled />);
  fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "End" });
  fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole("radiogroup").querySelectorAll('[tabindex="0"]')).toHaveLength(0);
});

it("paints a deferred selection before notifying its owner and follows external changes", async () => {
  const change = vi.fn();
  const { rerender } = render(<Segmented label="View" options={options} value="table" onChange={change} deferChange />);
  fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
  expect(screen.getByRole("radio", { name: "Cards" }).getAttribute("aria-checked")).toBe("true");
  expect(change).not.toHaveBeenCalled();
  await waitFor(() => expect(change).toHaveBeenCalledWith("cards"));
  rerender(<Segmented label="View" options={options} value="chart" onChange={change} deferChange />);
  expect(screen.getByRole("radio", { name: "Chart" }).getAttribute("aria-checked")).toBe("true");
});

it("cancels deferred work on unmount and handles an empty group", async () => {
  const change = vi.fn();
  const { unmount } = render(<Segmented label="View" options={options} value="table" onChange={change} deferChange />);
  fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
  unmount();
  await new Promise(resolve => requestAnimationFrame(resolve));
  expect(change).not.toHaveBeenCalled();
  render(<Segmented label="Empty" options={[]} value="table" onChange={change} />);
  fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
  expect(change).not.toHaveBeenCalled();
});
