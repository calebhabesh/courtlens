import { describe, expect, it } from "vitest";
import { portraitSource } from "./portrait-source";
import { browserApi } from "./workbench-api";

const api = browserApi.replace(/\/$/, "");

describe("portraitSource", () => {
  it("offers every derivative width for the player portrait endpoint", () => {
    const source = portraitSource("/api/workbench/players/201939/portrait", undefined, 96);
    expect(source?.src).toBe(`${api}/api/workbench/players/201939/portrait.webp?size=96&crop=face-v6`);
    expect(source?.srcSet?.split(", ")).toEqual([64, 96, 128, 192, 288].map(
      (width) => `${api}/api/workbench/players/201939/portrait.webp?size=${width}&crop=face-v6 ${width}w`
    ));
  });

  it("asks for the .webp path whichever path the API names (SP06)", () => {
    const fromOld = portraitSource("/api/workbench/players/2544/portrait", undefined, 288, { season: "2003-04", team: "CLE" });
    const fromNew = portraitSource("/api/workbench/players/2544/portrait.webp", undefined, 288, { season: "2003-04", team: "CLE" });
    expect(fromNew).toEqual(fromOld);
    expect(fromOld?.src).toBe(`${api}/api/workbench/players/2544/portrait.webp?size=288&season=2003-04&team=CLE&crop=face-v6`);
    expect(portraitSource("/api/workbench/players/2544/portrait.png", undefined, 64)).toEqual({ src: `${api}/api/workbench/players/2544/portrait.png` });
  });

  it("builds the endpoint from a player id when no URL is given", () => {
    expect(portraitSource(null, "2544", 64)?.src).toBe(`${api}/api/workbench/players/2544/portrait.webp?size=64&crop=face-v6`);
  });

  it("uses other portrait URLs as given, without derivatives", () => {
    expect(portraitSource("/api/workbench/media/players/abc", "2544", 64)).toEqual({ src: `${api}/api/workbench/media/players/abc` });
    expect(portraitSource("https://example.test/a.png", undefined, 64)).toEqual({ src: "https://example.test/a.png" });
  });

  it("returns nothing when there is no portrait to load", () => {
    expect(portraitSource(undefined, undefined, 64)).toBeNull();
  });

  it("asks every derivative for the season and team headshot when given an era", () => {
    const source = portraitSource(null, "201142", 288, { season: "2015-16", team: "OKC" });
    expect(source?.src).toBe(`${api}/api/workbench/players/201142/portrait.webp?size=288&season=2015-16&team=OKC&crop=face-v6`);
    expect(source?.srcSet?.split(", ").every(entry => entry.includes("&season=2015-16&team=OKC"))).toBe(true);
    expect(portraitSource(null, "201142", 64, { season: "2015-16" })?.src).toBe(`${api}/api/workbench/players/201142/portrait.webp?size=64&season=2015-16&crop=face-v6`);
  });
});
