import { describe, expect, it } from "vitest";
import { portraitSource } from "./portrait-source";
import { browserApi } from "./workbench-api";

const api = browserApi.replace(/\/$/, "");

describe("portraitSource", () => {
  it("offers every derivative width for the player portrait endpoint", () => {
    const source = portraitSource("/api/workbench/players/201939/portrait", undefined, 96);
    expect(source?.src).toBe(`${api}/api/workbench/players/201939/portrait?size=96`);
    expect(source?.srcSet?.split(", ")).toEqual([64, 96, 128, 192, 288].map(
      (width) => `${api}/api/workbench/players/201939/portrait?size=${width} ${width}w`
    ));
  });

  it("builds the endpoint from a player id when no URL is given", () => {
    expect(portraitSource(null, "2544", 64)?.src).toBe(`${api}/api/workbench/players/2544/portrait?size=64`);
  });

  it("uses other portrait URLs as given, without derivatives", () => {
    expect(portraitSource("/api/workbench/media/players/abc", "2544", 64)).toEqual({ src: `${api}/api/workbench/media/players/abc` });
    expect(portraitSource("https://example.test/a.png", undefined, 64)).toEqual({ src: "https://example.test/a.png" });
  });

  it("returns nothing when there is no portrait to load", () => {
    expect(portraitSource(undefined, undefined, 64)).toBeNull();
  });
});
