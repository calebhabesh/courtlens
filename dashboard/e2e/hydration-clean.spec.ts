import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Snappy pages (2026-11-17): most routes have no loader, so their content hydrates in the first pass
// and its effects run before the header's Suspense boundary hydrates. A header value that an effect
// had already changed (the Ask page context, the account read) then hydrated against HTML rendered
// without it: React #418 on /compare and an Ask button left disabled. Each page must hydrate with
// no recoverable error. Run four workers and repeat: the race showed in about half of loaded runs.
const PAGES = ["/compare", "/teams/100", "/stats", "/players", "/standings", "/showcase", "/players/23"];

for (const width of [1440, 390]) {
  for (const path of PAGES) {
    test(`${path} hydrates without errors at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await openWorkbench(page, path);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  }
}
