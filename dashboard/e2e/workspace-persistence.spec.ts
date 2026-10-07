import { expect, test } from "@playwright/test";

test("real workspace proxy persists, conflicts, exports and restores", async ({ page, request }) => {
  test.skip(!process.env.COURTLENS_REAL_WORKSPACE_TEST, "Requires migrated real FastAPI/PostgreSQL service");
  const playerId = process.env.COURTLENS_REAL_WORKSPACE_PLAYER_ID || "1630567";
  const workspaceId = `b08-${Date.now()}`;
  const root = `/api/workspace?workspaceId=${workspaceId}`;
  await page.goto(root);
  const state = await (await request.get(root)).json();
  expect(state.version).toBe(1);
  state.preferences.density = "compact";
  state.favorites = [playerId];
  state.compare_tray = [playerId];
  state.views = [{ id: "custom", name: "My scoring", columns: ["pts_per_game"] }];
  state.ranking_boards = [{ id: "board", title: "Personal", entries: [{ rank: 1, player_id: playerId }] }];
  state.tier_lists = [{ id: "tiers", title: "Personal tiers", tiers: [{ tier_id: "a", label: "A", player_ids: [playerId] }] }];
  const saved = await page.evaluate(async ({ root, state }) => {
    const response = await fetch(`${root}&expectedVersion=1`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state),
    });
    return { status: response.status, data: await response.json() };
  }, { root, state });
  expect(saved.status, JSON.stringify(saved.data)).toBe(200);
  expect(saved.data.version).toBe(2);
  await page.reload();
  expect(await (await request.get(root)).json()).toEqual(saved.data);
  const stale = await page.evaluate(async ({ root, state }) => (await fetch(`${root}&expectedVersion=1`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state),
  })).status, { root, state });
  expect(stale).toBe(409);
  const bundle = await (await request.get(`/api/workspace/export?workspaceId=${workspaceId}`)).json();
  expect(bundle.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
  const restored = await page.evaluate(async ({ workspaceId, bundle }) => {
    const response = await fetch(`/api/workspace/import?workspaceId=${workspaceId}-copy&expectedVersion=1`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundle }),
    });
    return { status: response.status, data: await response.json() };
  }, { workspaceId, bundle });
  expect(restored.status).toBe(200);
  expect(restored.data.favorites).toEqual([playerId]);
  expect(restored.data.preferences.density).toBe("compact");
  for (const key of ["views", "compare_tray", "ranking_boards", "tier_lists"]) {
    expect(restored.data[key]).toEqual(saved.data[key]);
  }
  expect((await request.put(`${root}&expectedVersion=2`, {
    headers: { Origin: "https://different.example" }, data: saved.data,
  })).status()).toBe(403);
});
