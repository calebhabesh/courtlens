// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Icon } from "./icon";

afterEach(cleanup);

describe("Icon wrapper (D26)", () => {
  it("is decorative, uses one stroke width and defaults to 16px", () => {
    const { container } = render(<Icon name="swap" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke-width")).toBe("2");
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.classList.contains("ui-icon-filled")).toBe(false);
  });

  it("marks an active outline glyph as filled only when asked", () => {
    const { container } = render(<Icon name="star" size={14} filled />);
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("ui-icon-filled")).toBe(true);
    expect(svg.getAttribute("width")).toBe("14");
  });
});
