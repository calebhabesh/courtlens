import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import measured from "./fixtures/im07-owner-warehouse.json";
import { waitForStreamedPage } from "./workbench-navigation";

// Real read-only warehouse response with authored transport, not live language accuracy.
for (const width of [1440, 375]) {
  test(`IM07 recorded warehouse RAPM renders its CourtLens chip at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const threadId = "11111111-1111-4111-8111-000000000707";
    const header = { thread_id: threadId, title: "New conversation", created_at: "2026-10-08T12:00:00Z", updated_at: "2026-10-08T12:00:00Z" };
    const turns: unknown[] = [];
    let created = false;
    await page.route("**/api/assistant-v2/**", async route => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname.replace("/api/assistant-v2/", "");
      if (endpoint === "threads") {
        if (request.method() === "POST") { created = true; return route.fulfill({ json: header }); }
        return route.fulfill({ json: { threads: created ? [header] : [], next_cursor: null } });
      }
      if (endpoint.startsWith("threads/")) return route.fulfill({ json: { thread: header, turns, next_cursor: null } });
      if (endpoint === "turn/stream") return route.fulfill({ status: 404, json: { detail: "Recorded response uses request/response" } });
      const body = request.postDataJSON();
      const response = { ...measured, request_id: body.request_id, thread_id: body.thread_id, turn_id: body.request_id };
      turns.push({ thread_id: body.thread_id, turn_id: body.request_id, request: body, request_sha256: "a".repeat(64), accepted_at: header.created_at, state: "completed", response });
      return route.fulfill({ json: response });
    });
    await page.goto("/research/ask");
    await waitForStreamedPage(page);
    const content = page.locator("#content");
    await content.getByLabel("Your question", { exact: true }).fill("What was Victor Wembanyama's RAPM last season?");
    await content.getByRole("button", { name: "Send question", exact: true }).click();
    const prose = content.locator(".agent-prose");
    await expect(prose).toContainText("+9.1230 in 2025-26");
    const chip = prose.getByRole("button", { name: "CourtLens", exact: true });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(prose.getByRole("link", { name: "View CourtLens result" })).toHaveAttribute("href", /#answer-/);
    const result = content.getByRole("region", { name: "query results", exact: true });
    await expect(result).toContainText("Victor Wembanyama");
    await expect(result).toContainText("9.123");
    await expect(result.locator("dt").filter({ hasText: /^Metrics · rapm \(points per 100 controls\)$/ })).toBeVisible();
    await expect(content.getByRole("link", { name: "Open equivalent analysis", exact: true })).toHaveAttribute("href", /2cd9c98b2594d948/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const directory = path.resolve(process.cwd(), "../docs/evidence/im07/screenshots");
    await fs.mkdir(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `warehouse-rapm-${width}.png`), fullPage: true });
  });
}
