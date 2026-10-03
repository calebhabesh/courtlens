import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "../app/api/workspace/[[...path]]/route";

const context = { params: Promise.resolve({ path: [] }) };

afterEach(() => vi.unstubAllGlobals());

describe("workspace server proxy", () => {
  it("rejects cross-origin writes before contacting the backend", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await PUT(new NextRequest("http://localhost:3000/api/workspace", {
      method: "PUT", headers: { origin: "http://other.test" }, body: "{}",
    }), context);
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not attach operator credentials to reads", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ version: 1 }));
    vi.stubGlobal("fetch", fetch);
    const response = await GET(new NextRequest("http://localhost:3000/api/workspace?workspaceId=local&unexpected=ignored"), context);
    expect(response.status).toBe(200);
    const [url, options] = fetch.mock.calls[0];
    expect(url.pathname).toBe("/api/workbench/workspace");
    expect(url.search).toBe("?workspaceId=local");
    expect(options.headers["X-Operator-Token"]).toBeUndefined();
  });
  it("forwards same-origin mutation versions and upstream conflicts", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ detail: "Version conflict" }, { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    const response = await PUT(new NextRequest("http://localhost:3000/api/workspace?expectedVersion=2", {
      method: "PUT", headers: { origin: "http://localhost:3000" }, body: '{"version":2}',
    }), context);
    expect(response.status).toBe(409);
    const [url, options] = fetch.mock.calls[0];
    expect(url.search).toBe("?expectedVersion=2");
    expect(options.headers["X-Operator-Token"]).toBeTruthy();
    expect(await response.text()).not.toContain(options.headers["X-Operator-Token"]);
  });
  it("rejects paths outside workspace CRUD", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(new NextRequest("http://localhost:3000/api/workspace/jobs"), {
      params: Promise.resolve({ path: ["jobs"] }),
    });
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
