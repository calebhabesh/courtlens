import { describe, expect, it, vi, afterEach } from "vitest";
import { flowDefaults, flowSensitivities, possessionFlow, researchRead } from "./advanced-research";

afterEach(() => vi.unstubAllGlobals());
describe("hypothetical-possession-flow-v1", () => {
  it("matches hand-calculated deterministic and recovery scenarios", () => {
    const two = {...flowDefaults,t:0,p2:1,p3:0,pft:0,m2:1,r:0};
    expect(possessionFlow(two).ortg).toBe(200);
    expect(possessionFlow({...two,m2:.5,r:.5})).toMatchObject({s:1,q:.25,ppp:4/3});
    expect(possessionFlow({...two,t:1}).ortg).toBe(0);
    expect(possessionFlow({...two,p2:0,p3:1,m3:1}).ortg).toBe(300);
    expect(possessionFlow({...two,p2:0,pft:1,mft:.75}).ortg).toBe(150);
  });
  it("rejects nonfinite, empty-converted, out-of-range and nonterminating probabilities", () => {
    for (const t of [NaN,Infinity,-.1,1.1]) expect(() => possessionFlow({...flowDefaults,t})).toThrow("between 0 and 1");
    expect(() => possessionFlow({...flowDefaults,p2:.6})).toThrow("sum to 1");
    expect(() => possessionFlow({...flowDefaults,t:0,m2:0,m3:0,mft:0,r:1})).toThrow("below 1");
  });
  it("accounts for every score contribution and discloses valid probability exchanges", () => {
    const result = possessionFlow(flowDefaults);
    expect(Object.values(result.components).reduce((s,v) => s+100*v/(1-result.q),0)).toBeCloseTo(result.ortg,10);
    const rows = flowSensitivities(flowDefaults);
    expect(rows.find(r => r.key === "m3")!.delta).toBeGreaterThan(0);
    expect(rows.find(r => r.key === "t")!.delta).toBeLessThan(0);
    expect(rows.find(r => r.key === "pft")!.offset).toBe("p2");
    expect(flowSensitivities({...flowDefaults,m3:1}).find(r => r.key === "m3")!.delta).toBeNull();
  });
});
describe("read-only research client", () => {
  it("keeps artifact rejection actionable and never requests fitting", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:"registered research artifact failed integrity verification"}),{status:503}));
    vi.stubGlobal("fetch",fetch);
    await expect(researchRead("runs/id",new AbortController().signal)).rejects.toThrow("integrity verification");
    expect(fetch.mock.calls[0][0]).toContain("/api/workbench/research/runs/id");
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });
});
