import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/assistant-v2/[[...path]]/route";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
const browser = "22222222-2222-4222-8222-222222222222";
function incoming(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new NextRequest(`http://localhost:3000/api/assistant-v2/${path}`, {
    method, headers: { host: "localhost:3000", origin: "http://localhost:3000", ...headers }, ...(method === "POST" ? { body: "{}" } : {}),
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("public Ask identity on the hosted demo", () => {
  it("sends nothing extra locally", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ enabled: false })); vi.stubGlobal("fetch", fetch);
    const response = await GET(incoming("limits"), context(["limits"]));
    expect(fetch.mock.calls[0][1].headers["X-CourtLens-Visitor"]).toBeUndefined();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("forwards salted hashes of the browser and the Cloudflare client address, never the raw values", async () => {
    vi.stubEnv("COURTLENS_PUBLIC_ASK", "true");
    vi.stubEnv("COURTLENS_PUBLIC_ASK_TOKEN", "ask-only");
    const fetch = vi.fn().mockResolvedValue(Response.json({ threads: [] })); vi.stubGlobal("fetch", fetch);
    await GET(incoming("threads", { cookie: `courtlens-ask-visitor=${browser}`, "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" }), context(["threads"]));
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers["X-CourtLens-Visitor"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["X-CourtLens-Client"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(headers)).not.toContain("203.0.113.9");
    expect(JSON.stringify(headers)).not.toContain(browser);
    // Same browser, same visitor; a different address is a different client.
    await GET(incoming("threads", { cookie: `courtlens-ask-visitor=${browser}`, "cf-connecting-ip": "203.0.113.10" }), context(["threads"]));
    expect(fetch.mock.calls[1][1].headers["X-CourtLens-Visitor"]).toBe(headers["X-CourtLens-Visitor"]);
    expect(fetch.mock.calls[1][1].headers["X-CourtLens-Client"]).not.toBe(headers["X-CourtLens-Client"]);
  });

  it("gives a new browser an HttpOnly cookie and uses Caddy's appended hop without Cloudflare", async () => {
    vi.stubEnv("COURTLENS_PUBLIC_ASK", "true");
    const fetch = vi.fn().mockResolvedValue(Response.json({ remaining: 3 })); vi.stubGlobal("fetch", fetch);
    const spoof = await GET(incoming("limits", { "x-forwarded-for": "1.1.1.1, 198.51.100.7" }), context(["limits"]));
    expect(spoof.headers.get("set-cookie")).toMatch(/^courtlens-ask-visitor=[0-9a-f-]{36}; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);
    const honest = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", honest);
    await GET(incoming("limits", { "x-forwarded-for": "198.51.100.7" }), context(["limits"]));
    expect(honest.mock.calls[0][1].headers["X-CourtLens-Client"]).toBe(fetch.mock.calls[0][1].headers["X-CourtLens-Client"]);
  });

  it("sends only the Ask token on public writes, and refuses hosted writes without public Ask", async () => {
    vi.stubEnv("NEXT_PUBLIC_COURTLENS_HOSTED", "true");
    vi.stubEnv("COURTLENS_OPERATOR_TOKEN", "operator-secret");
    const fetch = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetch);
    expect((await POST(incoming("threads", {}, "POST"), context(["threads"]))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("COURTLENS_PUBLIC_ASK", "true");
    vi.stubEnv("COURTLENS_PUBLIC_ASK_TOKEN", "ask-only");
    await POST(incoming("threads", {}, "POST"), context(["threads"]));
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers["X-CourtLens-Ask-Token"]).toBe("ask-only");
    expect(headers["X-Operator-Token"]).toBeUndefined();
  });

  it("passes a limit refusal through with its status and details", async () => {
    vi.stubEnv("COURTLENS_PUBLIC_ASK", "true");
    vi.stubEnv("COURTLENS_PUBLIC_ASK_TOKEN", "ask-only");
    const detail = { code: "visitor_limit", message: "used", remaining: 0, per_visitor: 3, resets_at: "2026-11-11T08:00:00+00:00" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail }, { status: 429 })));
    const response = await POST(incoming("turn/stream", { cookie: `courtlens-ask-visitor=${browser}` }, "POST"), context(["turn", "stream"]));
    expect(response.status).toBe(429);
    expect((await response.json()).detail).toEqual(detail);
  });
});
