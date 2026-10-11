import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OriginalArticle, articleSections } from "./original-article";

const source = `# Patch notes: retained operations

2026-10-04 · Original project change record

## What changed

Use [saved investigations](/investigations).

## Open gates

- One gate
`;

describe("OriginalArticle on the Article template (FO13)", () => {
  it("leads with the level-1 heading and starts a section at each level-2 heading", () => {
    const sections = articleSections(source);
    expect(sections.map(section => [section.id, section.title])).toEqual([
      ["patch-notes-retained-operations", "Patch notes: retained operations"],
      ["what-changed", "What changed"],
      ["open-gates", "Open gates"],
    ]);
  });

  it("renders anchored sections, a table of contents and one date format", () => {
    const html = renderToStaticMarkup(<OriginalArticle source={source} />);
    expect(html).toContain('aria-label="On this page"');
    expect(html).toContain('href="#open-gates"');
    expect(html).toContain('id="what-changed"');
    expect(html).toContain("Oct 4, 2026 · Original project change record");
    expect(html).not.toContain("2026-10-04");
  });
});
