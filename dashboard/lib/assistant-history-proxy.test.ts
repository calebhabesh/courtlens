import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, POST } from "../app/api/assistant-v2/[[...path]]/route";

const id = "11111111-1111-4111-8111-111111111111";
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
function incoming(path: string, method = "GET", origin?: string, body?: string) {
  return new NextRequest(`http://localhost:3000/api/assistant-v2/${path}`, { method, headers: { host: "localhost:3000", ...(origin ? { origin } : {}) }, ...(body ? { body } : {}) });
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("durable assistant proxy trust boundary", () => {
  it("blocks cross-origin and missing-origin writes before forwarding", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const origin of [undefined, "https://other.example"]) {
      const response = await POST(incoming("threads", "POST", origin), context(["threads"]));
      expect(response.status).toBe(403);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("restricts credential-bearing targets and bounds buffered input", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(incoming("investigations", "POST", "http://localhost:3000"), context(["investigations"]))).status).toBe(404);
    expect((await POST(incoming("turn", "POST", "http://localhost:3000", "x".repeat(160 * 1024 + 1)), context(["turn"]))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards same-origin writes with server credentials and no redirects", async () => {
    vi.stubEnv("COURTLOAD_OPERATOR_TOKEN", "fixture-private-token");
    const fetch = vi.fn().mockResolvedValue(Response.json({ cleared: true })); vi.stubGlobal("fetch", fetch);
    const response = await DELETE(incoming(`threads/${id}`, "DELETE", "http://localhost:3000"), context(["threads", id]));
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][1].headers["X-Operator-Token"]).toBe("fixture-private-token");
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
    expect(await response.text()).not.toContain("fixture-private-token");
  });
  it("passes only pagination query parameters and omits credentials on reads", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ threads: [] })); vi.stubGlobal("fetch", fetch);
    await GET(incoming("threads?limit=2&cursor=abc&target=https://other.example"), context(["threads"]));
    const [url, options] = fetch.mock.calls[0];
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.has("target")).toBe(false);
    expect(options.headers["X-Operator-Token"]).toBeUndefined();
  });
});

describe("AR05 streamed turn proxy", () => {
  const stream = (text: string) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
  it("passes a same-origin event stream through with server credentials", async () => {
    vi.stubEnv("COURTLOAD_OPERATOR_TOKEN", "fixture-private-token");
    const frames = 'event: phase\ndata: {"event":"phase","phase":"understanding"}\n\n';
    const fetch = vi.fn().mockResolvedValue(new Response(stream(frames), { headers: { "Content-Type": "text/event-stream" } })); vi.stubGlobal("fetch", fetch);
    const response = await POST(incoming("turn/stream", "POST", "http://localhost:3000", "{}"), context(["turn", "stream"]));
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/workbench\/assistant\/v2\/turn\/stream$/);
    expect(fetch.mock.calls[0][1].headers["X-Operator-Token"]).toBe("fixture-private-token");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(frames);
  });
  it("keeps acceptance errors as JSON and applies the same write boundary", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ detail: "A turn is already running in this thread." }, { status: 409 })); vi.stubGlobal("fetch", fetch);
    expect((await POST(incoming("turn/stream", "POST"), context(["turn", "stream"]))).status).toBe(403);
    expect((await POST(incoming("turn/stream", "POST", "http://localhost:3000", "x".repeat(160 * 1024 + 1)), context(["turn", "stream"]))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
    const response = await POST(incoming("turn/stream", "POST", "http://localhost:3000", "{}"), context(["turn", "stream"]));
    expect(response.status).toBe(409);
    expect((await response.json()).detail).toContain("already running");
  });
});
