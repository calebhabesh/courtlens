import { expect, test } from "@playwright/test";
import type { HybridTurnResponse } from "../lib/assistant-v2.generated";
import { waitForStreamedPage } from "./workbench-navigation";

// Launched by the isolated PostgreSQL/FastAPI pytest harness, with a deterministic fixture planner.
const release = process.env.COURTLENS_AR07_RELEASE_ID;
test.skip(!release, "AR07 disposable PostgreSQL/FastAPI fixture required");
for (const width of [1440, 375]) {
  test(`AR07 real server resolves his and this team at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height:900});
    for (const [route, question, field, identity] of [
      ["/players/1630567", "Show his profile", "player_id", "1630567"],
      ["/teams/1610612761", "Show this team", "team_id", "1610612761"],
    ]) {
      await page.goto(`${route}?releaseId=${release}&season=2024-25&beforeDate=2025-04-15`);
      await waitForStreamedPage(page);
      await page.getByRole("button",{name:"Ask",exact:true}).click();
      const panel = page.getByRole("dialog");
      await expect(panel.getByLabel("Attached page context")).toContainText(field === "player_id" ? "Scottie Barnes" : "Toronto Raptors");
      await expect(panel.getByRole("button",{name:"New chat",exact:true})).toBeEnabled();
      await panel.getByRole("button",{name:"New chat",exact:true}).click();
      await panel.getByLabel("Your question",{exact:true}).fill(question);
      const final = page.waitForResponse(response => response.url().endsWith("/turn/stream"));
      await panel.getByRole("button",{name:"Send question",exact:true}).click();
      const response = await final;
      expect(response.headers()["content-type"]).toContain("text/event-stream");
      const request = response.request().postDataJSON();
      // The client closes SSE after final; Chromium cannot retrieve that aborted body.
      // Inspect the same immutable final response through the durable history proxy.
      let answer: HybridTurnResponse | undefined;
      await expect.poll(async () => {
        const history = await page.request.get(`/api/assistant-v2/threads/${request.thread_id}/turns`);
        const records = await history.json();
        answer = records.turns.find((turn: {request: {request_id: string}}) => turn.request.request_id === request.request_id)?.response;
        return answer?.status;
      }).toBe("answered");
      expect(answer!.status).toBe("answered");
      expect(answer!.plan!.steps?.[0]?.arguments?.[field]).toBe(identity);
      expect(answer!.scope!.selections.release_id).toBe(release);
      expect(answer!.scope!.assumptions!.join(" ")).toContain(`${field}=${identity}`);
      await expect(panel.getByLabel("Messages")).toContainText(question);
      await expect(panel.getByRole("button",{name:"Send question",exact:true})).toBeDisabled();
      await page.screenshot({path:test.info().outputPath(`ar07-real-${field}-${width}.png`)});
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button",{name:"Ask",exact:true})).toBeFocused();
    }
  });
}
