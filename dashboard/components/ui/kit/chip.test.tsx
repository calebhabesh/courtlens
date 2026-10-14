// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Chip, RemovableChip } from "./chip";

afterEach(cleanup);

it("toggles a chosen filter and refuses disabled actions", () => {
  const change = vi.fn();
  function Filter() {
    const [pressed, setPressed] = useState(false);
    return <><Chip pressed={pressed} onClick={() => setPressed(!pressed)}>Guards</Chip><Chip disabled onClick={change}>Centers</Chip></>;
  }
  render(<Filter />);
  const chip = screen.getByRole("button", { name: "Guards" });
  expect(chip.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(chip);
  expect(chip.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Centers" }));
  expect(change).not.toHaveBeenCalled();
});

it("removes the named entity only when its separate remove button is clicked", () => {
  const remove = vi.fn();
  render(<RemovableChip removeLabel="Remove Boston Celtics" onRemove={remove} icon="users">Boston Celtics</RemovableChip>);
  fireEvent.click(screen.getByText("Boston Celtics"));
  expect(remove).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: "Remove Boston Celtics" });
  expect(button.getAttribute("title")).toBe("Remove Boston Celtics");
  expect(button.querySelector("button")).toBeNull();
  fireEvent.click(button);
  expect(remove).toHaveBeenCalledOnce();
});
