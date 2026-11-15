// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MenuItem } from "./menu";

afterEach(cleanup);

it("renders a menu item with a destination as a real link without prefetch (site links SL03)", () => {
  render(<MenuItem label="Wingspan" icon="scale" href="/wingspan?playerId=2544" />);
  const link = screen.getByRole("menuitem", { name: "Wingspan" });
  expect(link.tagName).toBe("A");
  expect(link.getAttribute("href")).toBe("/wingspan?playerId=2544");
  expect(link.className).toContain("ui-menu-item");
});

it("keeps a disabled item, or one without a destination, as a button", () => {
  render(<><MenuItem label="Export" onClick={() => undefined} /><MenuItem label="Off" href="/x" disabled /></>);
  expect(screen.getByRole("menuitem", { name: "Export" }).tagName).toBe("BUTTON");
  expect(screen.getByRole("menuitem", { name: "Off" }).tagName).toBe("BUTTON");
});
