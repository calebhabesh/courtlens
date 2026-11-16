import { describe, expect, it } from "vitest";
import { analyticalNavItems, moreLinks } from "./nav-model";
import { buildSitePages, groupBySection, isStrongPageMatch, searchSitePages, SITE_PAGES, sitePageFor } from "./site-pages";

const labels = (query: string) => searchSitePages(query).map(page => page.label);

describe("site page index", () => {
  it("holds every menu page and every ⋯ link once", () => {
    const hrefs = SITE_PAGES.map(page => page.href);
    for (const item of [...analyticalNavItems(), ...moreLinks()]) expect(hrefs).toContain(item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("adds the pages reached only from other pages", () => {
    for (const href of ["/stats/tracking", "/stats/glossary", "/research/rapm", "/evaluation", "/investigations", "/research/case-studies"]) {
      expect(sitePageFor(href)?.href).toBe(href);
    }
  });

  it("gives every page a description and a section", () => {
    for (const page of SITE_PAGES) {
      expect(page.description, page.href).not.toBe("");
      expect(page.section, page.href).not.toBe("");
    }
  });

  it("drops the planner on the hosted demo, as the ⋯ menu does", () => {
    expect(buildSitePages(true).some(page => page.href === "/planner")).toBe(false);
    expect(buildSitePages(false).some(page => page.href === "/planner")).toBe(true);
  });

  it("groups pages by section in menu order", () => {
    const sections = groupBySection(SITE_PAGES).map(group => group.section);
    expect(sections.slice(0, 2)).toEqual(["Stats", "Live"]);
    expect(sections).toContain("Research · Shooting");
    expect(new Set(sections).size).toBe(sections.length);
  });
});

describe("searchSitePages", () => {
  it("finds a page by name, by a word in its name and by prefix", () => {
    expect(labels("Shot Aftermath")[0]).toBe("Shot Aftermath");
    expect(labels("aftermath")[0]).toBe("Shot Aftermath");
    expect(labels("draft")[0]).toBe("Draft Classes");
    expect(labels("shot qu")[0]).toBe("Shot Quality");
  });

  it("finds a page by what people call it", () => {
    expect(labels("salary cap")[0]).toBe("Contracts");
    expect(labels("bracket")[0]).toBe("Playoffs");
    expect(labels("changelog")[0]).toBe("Patch Notes");
    expect(labels("on off")[0]).toBe("WOWY");
    expect(labels("rapm")).toEqual(expect.arrayContaining(["Six-Factor RAPM", "RAPM Ratings"]));
  });

  it("needs every word to match and ignores case and punctuation", () => {
    expect(labels("ORTG CALC")[0]).toBe("ORtg Calculator");
    expect(labels("zts")[0]).toBe("zTS");
    expect(labels("draft wingspan")).toEqual(["Combine & Wingspan"]);
    expect(labels("draft scoreboard")).toEqual([]);
  });

  it("forgives one typo past the first letter, and only in longer words", () => {
    expect(labels("standigns")[0]).toBe("Standings");
    expect(labels("james")).toEqual([]);
    expect(labels("star")).toEqual([]);
  });

  it("lists every page before typing", () => {
    expect(searchSitePages("")).toHaveLength(SITE_PAGES.length);
  });

  it("lets a page lead only when its name is what was typed", () => {
    const draft = sitePageFor("/draft")!;
    expect(isStrongPageMatch("draft", draft)).toBe(true);
    expect(isStrongPageMatch("lebron", sitePageFor("/research/backtest")!)).toBe(false);
  });
});
