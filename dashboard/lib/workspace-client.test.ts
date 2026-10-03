import { describe, expect, it, vi } from "vitest";
import {
  computeClientBundleChecksum,
  WorkspaceConflictError,
  WorkspaceApiError,
  getWorkspace,
  saveWorkspace,
  createCustomView,
  aggregateRankingBoards
} from "./workspace-client";
import type { PersonalWorkspaceState, WorkspaceBundle } from "./types";

describe("Workspace Client", () => {
  it("computes deterministic SHA-256 checksum ignoring checksum_sha256 field", async () => {
    const bundle: Partial<WorkspaceBundle> = {
      bundle_version: "1.0",
      workspace_id: "default",
      name: "Default Workspace",
      version: 1,
      views: [],
      favorites: ["1", "2"],
      compare_tray: [],
      ranking_boards: [],
      tier_lists: [],
      preferences: {
        density: "standard",
        identity_mode: "photos",
        counting_mode: "per_game",
        default_view_id: "overview",
        table_expanded: false,
        theme: "dark"
      },
      checksum_sha256: "some-old-checksum"
    };

    const hash1 = await computeClientBundleChecksum(bundle as Record<string, unknown>);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);

    // Modifying checksum_sha256 does not change the digest
    const bundle2 = { ...bundle, checksum_sha256: "different" };
    const hash2 = await computeClientBundleChecksum(bundle2 as Record<string, unknown>);
    expect(hash1).toBe(hash2);

    // Modifying favorites changes the digest
    const bundle3 = { ...bundle, favorites: ["1", "3"] };
    const hash3 = await computeClientBundleChecksum(bundle3 as Record<string, unknown>);
    expect(hash1).not.toBe(hash3);
  });

  it("handles 409 version conflicts with WorkspaceConflictError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          detail: {
            current_version: 5,
            expected_version: 4,
            message: "Workspace version conflict: expected 4, current 5"
          }
        })
      })
    );

    const dummyState: PersonalWorkspaceState = {
      workspace_id: "default",
      name: "Default",
      version: 4,
      views: [],
      favorites: [],
      compare_tray: [],
      ranking_boards: [],
      tier_lists: [],
      preferences: {
        density: "standard",
        identity_mode: "photos",
        counting_mode: "per_game",
        default_view_id: "overview",
        table_expanded: false,
        theme: "dark"
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    };

    await expect(saveWorkspace(dummyState, 4)).rejects.toThrow(WorkspaceConflictError);
    try {
      await saveWorkspace(dummyState, 4);
    } catch (err) {
      expect(err).toBeInstanceOf(WorkspaceConflictError);
      const conflict = err as WorkspaceConflictError;
      expect(conflict.currentVersion).toBe(5);
      expect(conflict.expectedVersion).toBe(4);
    }

    vi.unstubAllGlobals();
  });

  it("sends expected query params and returns typed result", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedMethod = init?.method ?? "GET";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspace_id: "test-ws",
            name: "Test",
            version: 2,
            views: [],
            favorites: ["p1"],
            compare_tray: [],
            ranking_boards: [],
            tier_lists: [],
            preferences: {
              density: "compact",
              identity_mode: "logos",
              counting_mode: "per_game",
              default_view_id: "overview",
              table_expanded: false,
              theme: "dark"
            },
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z"
          })
        });
      })
    );

    const res = await createCustomView(
      { name: "My scoring", columns: ["pts_per_game"] },
      1,
      "test-ws"
    );

    expect(capturedUrl).toContain("/views?");
    expect(capturedUrl).toContain("workspaceId=test-ws");
    expect(capturedUrl).toContain("expectedVersion=1");
    expect(capturedMethod).toBe("POST");
    expect(res.version).toBe(2);
    expect(res.favorites).toEqual(["p1"]);

    vi.unstubAllGlobals();
  });

  it("handles aggregate ranking boards call", async () => {
    let capturedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = String(init?.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            method: "borda",
            boards_evaluated: ["b1", "b2"],
            missing_rank_penalty: 10,
            ranked_players: [],
            methodology_notes: "Aggregated 2 boards"
          })
        });
      })
    );

    const agg = await aggregateRankingBoards(["b1", "b2"], "borda", 10, "default");
    expect(agg.method).toBe("borda");
    expect(agg.boards_evaluated).toEqual(["b1", "b2"]);
    expect(JSON.parse(capturedBody)).toEqual({
      board_ids: ["b1", "b2"],
      method: "borda",
      missing_rank_penalty: 10
    });

    vi.unstubAllGlobals();
  });

  it("fetches workspace and handles WorkspaceApiError on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: "Database connection failed" })
      })
    );

    await expect(getWorkspace("default")).rejects.toThrow(WorkspaceApiError);
    try {
      await getWorkspace("default");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkspaceApiError);
      expect((err as WorkspaceApiError).status).toBe(500);
      expect((err as WorkspaceApiError).message).toContain("Database connection failed");
    }

    vi.unstubAllGlobals();
  });
});
