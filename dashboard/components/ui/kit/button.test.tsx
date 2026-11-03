// @vitest-environment happy-dom
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, ButtonLink, ButtonSummary, IconButton, IconButtonLink } from "./button";

afterEach(cleanup);

it("invokes an enabled action and forwards its button ref without submitting a form", () => {
  const click = vi.fn();
  const ref = createRef<HTMLButtonElement>();
  render(<Button ref={ref} icon="plus" iconAfter="chevron-down" onClick={click}>Add view</Button>);
  const button = screen.getByRole("button", { name: "Add view" });
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  expect(button.getAttribute("type")).toBe("button");
  expect(ref.current).toBe(button);
  expect(button.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
});

it("announces toggle state and blocks loading and disabled actions", () => {
  const click = vi.fn();
  const { rerender } = render(<Button pressed onClick={click}>Filter</Button>);
  expect(screen.getByRole("button", { name: "Filter" }).getAttribute("aria-pressed")).toBe("true");
  rerender(<Button loading icon="plus" onClick={click}>Filter</Button>);
  const loading = screen.getByRole("button", { name: "Filter" });
  expect(loading.getAttribute("aria-busy")).toBe("true");
  expect(loading.hasAttribute("disabled")).toBe(true);
  expect(loading.querySelectorAll("svg")).toHaveLength(1);
  fireEvent.click(loading);
  rerender(<Button disabled onClick={click}>Filter</Button>);
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  expect(click).not.toHaveBeenCalled();
});

it("keeps link navigation and current-page semantics", () => {
  const ref = createRef<HTMLAnchorElement>();
  render(<ButtonLink ref={ref} href="/stats" current>Stats</ButtonLink>);
  const link = screen.getByRole("link", { name: "Stats" });
  expect(link.getAttribute("href")).toBe("/stats");
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(ref.current).toBe(link);
});

it("opens a native disclosure through its summary", () => {
  render(<details><ButtonSummary>Why?</ButtonSummary><p>Method details</p></details>);
  const summary = screen.getByText("Why?");
  const details = summary.closest("details");
  expect(details?.open).toBe(false);
  fireEvent.click(summary);
  expect(details?.open).toBe(true);
});

it("requires an icon label and uses it for the accessible name and tooltip", () => {
  const click = vi.fn();
  const { rerender } = render(<IconButton icon="star" label="Favorite player" pressed onClick={click} />);
  const button = screen.getByRole("button", { name: "Favorite player" });
  expect(button.getAttribute("title")).toBe("Favorite player");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  rerender(<IconButton icon="star" label="Favorite player" loading onClick={click} />);
  expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
  fireEvent.click(screen.getByRole("button"));
  expect(click).toHaveBeenCalledOnce();
});

it("renders an icon-only link square, named by its label", () => {
  render(<IconButtonLink href="/last-games" icon="history" label="Recent games" size="sm" variant="secondary" />);
  const link = screen.getByRole("link", { name: "Recent games" });
  expect(link.getAttribute("href")).toBe("/last-games");
  expect(link.getAttribute("title")).toBe("Recent games");
  expect(link.className).toContain("kit:w-control-sm");
});

it("selects in a comparison side's identity colour and beckons only while unpressed", () => {
  const { rerender } = render(<IconButton icon="swap" label="Compare" identity="b" beckon />);
  const button = screen.getByRole("button", { name: "Compare" });
  expect(button.className).toContain("kit:animate-beckon");
  expect(button.className).toContain("kit:motion-reduce:animate-none");
  expect(button.className).toContain("kit:selected:text-identity-b");
  expect(button.className).not.toContain("kit:selected:text-accent");
  rerender(<IconButton icon="swap" label="Compare" identity="b" beckon pressed />);
  expect(button.className).not.toContain("kit:animate-beckon");
});
