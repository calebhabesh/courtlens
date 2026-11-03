import { describe, expect, it } from "vitest";
import { activeFilters, assignRole, readState, requestParams, roleOf, shortName, signed, tone } from "./wowy";

const stateOf = (query: string) => { const params = new URLSearchParams(query); return readState(name => params.get(name)); };

describe("WOWY URL state", () => {
  it("reads roles, filters and defaults", () => {
    const state = stateOf("team=TOR&combo=1,2&on=3&off=4&clock=q4&garbage=1&tierMetric=defense&tier=top");
    expect(state.combo).toEqual(["1", "2"]);
    expect(roleOf(state, "3")).toBe("on");
    expect(roleOf(state, "9")).toBeNull();
    expect(state.phase).toBe("regular_season");
    expect(activeFilters(state)).toBe(3);
    expect(stateOf("tier=top").tier).toBeNull();
    expect(stateOf("clock=nope").clock).toBe("full");
    expect(stateOf("vs=5").vs).toBeNull();
  });

  it("moves a player between roles and clears a repeated one", () => {
    const state = stateOf("combo=1&on=2");
    expect(assignRole(state, "2", "combo")).toEqual({ combo: "1,2", on: null, off: null });
    expect(assignRole(state, "1", "combo")).toEqual({ combo: null, on: "2", off: null });
    expect(assignRole(state, "3", "off")).toEqual({ combo: "1", on: "2", off: "3" });
  });

  it("keeps five combo players, four beside a split opponent", () => {
    const full = stateOf("combo=1,2,3,4,5");
    expect(assignRole(full, "6", "combo").combo).toBe("2,3,4,5,6");
    const split = stateOf("combo=1,2,3,4&vsTeam=BOS&vs=9&vsState=split");
    expect(assignRole(split, "6", "combo").combo).toBe("2,3,4,6");
  });

  it("builds the request with repeated list keys and only the custom clock's window", () => {
    const params = requestParams(stateOf("team=TOR&combo=1,2&clock=custom&periods=4,5&cfrom=6&opp=BOS,NYK&vsTeam=BOS&vs=9&vsState=off"));
    expect(params.getAll("combo")).toEqual(["1", "2"]);
    expect(params.getAll("periods")).toEqual(["4", "5"]);
    expect(params.get("clock_from")).toBe("6");
    expect(params.get("clock_to")).toBe("0");
    expect(params.getAll("opponents")).toEqual(["BOS", "NYK"]);
    expect(params.get("vs_player")).toBe("9");
    expect(params.get("vs_state")).toBe("off");
    expect(requestParams(stateOf("team=TOR&clock=q4")).has("clock_from")).toBe(false);
  });

  it("tones a change by which way is better", () => {
    expect(tone(2, "up")).toBe("better");
    expect(tone(2, "down")).toBe("worse");
    expect(tone(0.01, "up")).toBeUndefined();
    expect(tone(3, null)).toBeUndefined();
  });

  it("shortens long or hyphenated names to initials, as Databallr's lineup cell", () => {
    expect(shortName("Scottie Barnes")).toBe("Barnes");
    expect(shortName("Collin Murray-Boyles")).toBe("CMB");
    expect(shortName("Sandro Mamukelashvili")).toBe("SM");
    expect(shortName("Nene")).toBe("Nene");
  });

  it("never shows a signed zero", () => {
    expect(signed(-0.04)).toBe("0.0");
    expect(signed(0.04)).toBe("0.0");
    expect(signed(-0.06)).toBe("−0.1");
    expect(signed(2)).toBe("+2.0");
  });
});
