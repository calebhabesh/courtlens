import { describe, expect, it } from "vitest";
import { providerLine } from "./assistant-status-card";

describe("providerLine", () => {
  it("names each pool member and its quota state", () => {
    expect(providerLine({ provider: "groq", model: "openai/gpt-oss-120b", state: "ready" })).toBe("groq (openai/gpt-oss-120b): ready");
    expect(providerLine({ provider: "gemini", model: "gemini-3.5-flash-lite", state: "cooling_down", available_at: "2026-11-02T08:00:00+00:00" }))
      .toBe("gemini (gemini-3.5-flash-lite): rate-limited until 8:00 AM UTC");
    expect(providerLine({ provider: "gemini", model: "g", state: "cooling_down", available_at: null })).toBe("gemini (g): rate-limited");
  });
});
