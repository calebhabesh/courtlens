// @vitest-environment happy-dom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ComparisonRows } from "./comparison-rows";

afterEach(cleanup);
test("unknown values remain distinct from a documented zero and have no percentile claim", () => {
  const {container}=render(<ComparisonRows names={["A","B"]} rows={[{key:"missing",label:"Points",a:null,b:0}]} />);
  expect(screen.getByText("—")).toBeTruthy();expect(screen.getByText("0")).toBeTruthy();
  expect(container.querySelector(".font-bold")).toBeNull();expect(container.querySelector(".ui-comparison-percentile")).toBeNull();
});
test("negative values retain their sign and the numerically larger value is bold", () => {
  const {container}=render(<ComparisonRows names={["A","B"]} rows={[{key:"net",label:"NET",a:-8,b:-2,percentileA:10,percentileB:30}]} />);
  expect(screen.getByText("-2").className).toBe("font-bold");expect(screen.getByText("-8").className).not.toBe("font-bold");
  expect(screen.getByText("30%ile")).toBeTruthy();expect(container.textContent).not.toMatch(/winner|verdict/i);
});
