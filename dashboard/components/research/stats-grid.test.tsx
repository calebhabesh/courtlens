// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GridValue } from "./stats-grid";

describe("GridValue", () => {
  afterEach(cleanup);

  it("RD04: carries a good/bad tone only when given one, and unknown stays a plain dash", () => {
    const { container, rerender } = render(<GridValue text="+4.7" sub="+3.7 to +5.6" tone="good" title="80% interval +3.7 to +5.6" />);
    expect(container.querySelector(".rs-grid-value")?.getAttribute("data-tone")).toBe("good");
    expect(container.querySelector(".rs-grid-sub")?.textContent).toBe("+3.7 to +5.6");
    rerender(<GridValue text="+0.2" sub="−0.1 to +0.5" />);
    expect(container.querySelector(".rs-grid-value")?.hasAttribute("data-tone")).toBe(false);
    rerender(<GridValue text={null} tone="good" />);
    expect(container.querySelector(".rs-grid-value")?.hasAttribute("data-tone")).toBe(false);
    expect(container.textContent).toBe("—");
  });
});
