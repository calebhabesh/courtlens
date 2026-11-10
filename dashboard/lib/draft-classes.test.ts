import { describe, expect, it } from "vitest";
import { feetInchTicks, intervalTone, rookieTone, signed, statText, whole } from "./draft-classes";

describe("Draft Classes formatting and tones", () => {
  it("tones an interval only when it sits on one side of zero", () => {
    expect(intervalTone(0.2, 3)).toBe("positive");
    expect(intervalTone(-3, -0.1)).toBe("negative");
    expect(intervalTone(-0.1, 2)).toBeUndefined();
    expect(intervalTone(null, 2)).toBeUndefined();
  });

  it("tones a rookie stat only outside the past rookies' 10th-90th range, turnovers reversed", () => {
    const c = { value: 25, n: 40, median: 17, p10: 10, p90: 23, percentile: 95 };
    expect(rookieTone("pts36", c)).toBe("positive");
    expect(rookieTone("tov36", c)).toBe("negative");
    expect(rookieTone("pts36", { ...c, value: 9 })).toBe("negative");
    expect(rookieTone("pts36", { ...c, value: 18 })).toBeUndefined();
    expect(rookieTone("pts36", { ...c, n: 4 })).toBeUndefined();
    expect(rookieTone("mpg", c)).toBeUndefined();
  });

  it("formats unknowns as a dash and signs with a true minus", () => {
    expect(signed(-1.25)).toBe("−1.3");
    expect(signed(2)).toBe("+2.0");
    expect(signed(null)).toBe("—");
    expect(signed(-0.001, 2)).toBe("0.00");
    expect(statText("ts", 0.5467)).toBe("54.7%");
    expect(whole(1234.4)).toBe("1,234");
  });
});

describe("feetInchTicks", () => {
  it("marks every three inches when there is room", () => {
    expect(feetInchTicks(68.25, 85.75, 1000)).toEqual([66, 69, 72, 75, 78, 81, 84, 87]);
  });
  it("widens the marks where labels would crowd, still on familiar heights", () => {
    expect(feetInchTicks(68.25, 85.75, 270)).toEqual([66, 72, 78, 84, 90]);
    expect(feetInchTicks(88.5, 117, 120)).toEqual([84, 96, 108, 120]);
  });
});
