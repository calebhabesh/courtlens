// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ArticleLayout, ArticleSection, activeTocId } from "./article-layout";

describe("Article template (FO13)", () => {
  afterEach(cleanup);

  it("links each section from the table of contents and names regions by their titles", () => {
    render(
      <ArticleLayout toc={[{ id: "display", label: "Display" }, { id: "worker", label: "Background worker" }]}>
        <ArticleSection id="display" title="Display"><p>Body</p></ArticleSection>
        <ArticleSection id="worker" title="Background worker" label="Worker state"><p>Body</p></ArticleSection>
      </ArticleLayout>
    );
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(toc.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Background worker" }).getAttribute("href")).toBe("#worker");
    expect(screen.getByRole("region", { name: "Display" }).id).toBe("display");
    expect(screen.getByRole("region", { name: "Worker state" })).toBeDefined();
  });

  it("omits the contents for a single section", () => {
    render(<ArticleLayout toc={[{ id: "only", label: "Only" }]}><ArticleSection id="only" title="Only"><p>Body</p></ArticleSection></ArticleLayout>);
    expect(screen.queryByRole("navigation", { name: "On this page" })).toBeNull();
  });

  it("marks the last section whose title has passed the reading line", () => {
    const tops = [{ id: "a", top: -400 }, { id: "b", top: 80 }, { id: "c", top: 600 }];
    expect(activeTocId(tops, 120)).toBe("b");
    expect(activeTocId([{ id: "a", top: 300 }, { id: "b", top: 900 }], 120)).toBe("a");
    expect(activeTocId([], 120)).toBeUndefined();
  });
});
