import { describe, expect, it, vi, afterEach } from "vitest";
import { researchRead } from "./advanced-research";

afterEach(() => vi.unstubAllGlobals());
describe("read-only research client", () => {
  it("keeps artifact rejection actionable and never requests fitting", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:"registered research artifact failed integrity verification"}),{status:503}));
    vi.stubGlobal("fetch",fetch);
    await expect(researchRead("runs/id",new AbortController().signal)).rejects.toThrow("integrity verification");
    expect(fetch.mock.calls[0][0]).toContain("/api/workbench/research/runs/id");
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });
});
