import { expect, it } from "vitest";
import measured from "../e2e/fixtures/im07-owner-warehouse.json";
import { resultColumnLabel } from "./agent-answer";

it("labels real impact coefficients and their samples using the recorded evidence units", () => {
  const result = measured.results[0].result;
  expect(resultColumnLabel("metrics · rapm", result)).toBe("Metrics · rapm (points per 100 controls)");
  expect(resultColumnLabel("sample sizes · rapm", result)).toBe("Sample sizes · rapm (observations)");
  expect(resultColumnLabel("impact support · rapm · games", result)).toBe("Impact support · rapm · games (games)");
});
