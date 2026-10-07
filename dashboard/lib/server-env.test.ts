import { expect, it } from "vitest";
import { assertCurrentEnvironment } from "./server-env";

it("rejects every old server/public name and never exposes values", () => {
  expect(() => assertCurrentEnvironment({ COURTLOAD_OPERATOR_TOKEN: "never-log-this", NEXT_PUBLIC_COURTLOAD_API_URL: "private-value" })).toThrow("COURTLOAD_OPERATOR_TOKEN -> COURTLENS_OPERATOR_TOKEN");
  try { assertCurrentEnvironment({ NEXT_PUBLIC_COURTLOAD_API_URL: "private-value" }); } catch (error) {
    expect(String(error)).toContain("NEXT_PUBLIC_COURTLOAD_API_URL -> NEXT_PUBLIC_COURTLENS_API_URL");
    expect(String(error)).not.toContain("private-value");
  }
});
it("accepts current names and unchanged provider aliases", () => {
  expect(() => assertCurrentEnvironment({ COURTLENS_OPERATOR_TOKEN: "token", GEMINI_API_KEY: "key", ANTHROPIC_API_KEY: "key", OPENAI_API_KEY: "key" })).not.toThrow();
});
