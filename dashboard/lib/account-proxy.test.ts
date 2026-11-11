import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, POST } from "../app/api/account/[[...path]]/route";

// Finish plan F04: the account proxy keeps the session in an HttpOnly cookie the browser can't read.
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
const SESSION = "aaa.bbb.ccc";
function incoming(path: string, { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new NextRequest(`http://localhost:3000/api/account/${path}`, {
    method, headers: { host: "localhost:3000", origin: "http://localhost:3000", ...headers }, ...(body !== undefined ? { body } : {}),
  });
}
const signedIn = { cookie: `courtlens-session=${SESSION}` };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("account proxy", () => {
  it("serves only its own routes and methods", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await GET(incoming("register"), context(["register"]))).status).toBe(404);
    expect((await GET(incoming("favorites/abc"), context(["favorites", "abc"]))).status).toBe(404);
    expect((await GET(incoming("session"), context(["session"]))).status).toBe(405);
    expect((await DELETE(incoming("favorites", { method: "DELETE" }), context(["favorites"]))).status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses cross-site writes", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await POST(incoming("session", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }), context(["session"]));
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sets the session as an HttpOnly, Secure, SameSite=Lax cookie and never returns the token", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ user: { id: "u", name: "Owner", email: "o@x.co", is_demo: false }, token: SESSION, expires_in: 43200 }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(incoming("session", { method: "POST", body: JSON.stringify({ email: "o@x.co", password: "pw" }) }), context(["session"]));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe(`courtlens-session=${SESSION}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`);
    const body = await response.json();
    expect(body).toEqual({ user: { id: "u", name: "Owner", email: "o@x.co", is_demo: false } });
    expect(JSON.stringify(body)).not.toContain(SESSION);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("http://localhost:8000/api/auth/session");
    expect(init.body).toContain("o@x.co");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("starts a demo session without a body", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ user: { id: "d", name: "Demo account", email: null, is_demo: true }, token: SESSION, expires_in: 3600 }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(incoming("demo", { method: "POST" }), context(["demo"]));
    expect(String(fetch.mock.calls[0][0])).toBe("http://localhost:8000/api/auth/demo-session");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=3600; HttpOnly; Secure; SameSite=Lax");
  });

  it("passes a sign-in limit through with Retry-After and sets no cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": "540" } })));
    const response = await POST(incoming("session", { method: "POST", body: "{}" }), context(["session"]));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("540");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("forwards the cookie as a bearer token with the proxy credential and a hashed client address", async () => {
    vi.stubEnv("COURTLENS_ACCOUNT_PROXY_TOKEN", "proxy-only");
    vi.stubEnv("COURTLENS_OPERATOR_TOKEN", "operator-secret");
    const fetch = vi.fn().mockResolvedValue(Response.json({ player_ids: ["203999"], players: [], limit: 100, shared: false }));
    vi.stubGlobal("fetch", fetch);
    await POST(incoming("favorites/203999", { method: "POST", headers: { ...signedIn, "cf-connecting-ip": "203.0.113.9" } }), context(["favorites", "203999"]));
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("http://localhost:8000/api/me/favorites/203999");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${SESSION}`);
    expect(init.headers["X-CourtLens-Account-Token"]).toBe("proxy-only");
    expect(init.headers["X-CourtLens-Client"]).toMatch(/^[0-9a-f]{64}$/);
    expect(init.headers["X-Operator-Token"]).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toContain("203.0.113.9");
  });

  it("answers signed-out reads without calling the API, and refuses signed-out writes", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await (await GET(incoming("me"), context(["me"]))).json()).toEqual({ user: null });
    expect((await GET(incoming("favorites"), context(["favorites"]))).status).toBe(401);
    expect((await POST(incoming("favorites/1", { method: "POST" }), context(["favorites", "1"]))).status).toBe(401);
    // A malformed cookie counts as none.
    expect((await GET(incoming("me", { headers: { cookie: "courtlens-session=<script>" } }), context(["me"]))).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears the cookie when the API says the session ended", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Your session has ended. Sign in again." }, { status: 401 })));
    const me = await GET(incoming("me", { headers: signedIn }), context(["me"]));
    expect(await me.json()).toEqual({ user: null });
    expect(me.headers.get("set-cookie")).toBe("courtlens-session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    const write = await DELETE(incoming("favorites/1", { method: "DELETE", headers: signedIn }), context(["favorites", "1"]));
    expect(write.status).toBe(401);
    expect(write.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("signs out by clearing the cookie", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await POST(incoming("sign-out", { method: "POST", headers: signedIn }), context(["sign-out"]));
    expect(response.headers.get("set-cookie")).toContain("courtlens-session=; Path=/; Max-Age=0; HttpOnly");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds the sign-in body before forwarding", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await POST(incoming("session", { method: "POST", body: "x".repeat(5000) }), context(["session"]));
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("dev account auto sign-in (local development only)", () => {
  const dev = { user: { id: "d", name: "Dev", email: "dev@courtlens.local", is_demo: false }, token: SESSION, expires_in: 43200 };
  const devMode = () => { vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("COURTLENS_DEV_ACCOUNT_AUTO_LOGIN", "true"); };

  it("signs a visitor with no session into the dev account and sets the cookie", async () => {
    devMode();
    const fetch = vi.fn().mockResolvedValue(Response.json(dev)); vi.stubGlobal("fetch", fetch);
    const response = await GET(incoming("me"), context(["me"]));
    expect(String(fetch.mock.calls[0][0])).toBe("http://localhost:8000/api/auth/dev-session");
    expect(await response.json()).toEqual({ user: dev.user });
    expect(response.headers.get("set-cookie")).toBe(`courtlens-session=${SESSION}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`);
  });

  it("is off without the flag, outside next dev, and on a hosted build", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    vi.stubEnv("COURTLENS_DEV_ACCOUNT_AUTO_LOGIN", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(await (await GET(incoming("me"), context(["me"]))).json()).toEqual({ user: null });
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_COURTLENS_HOSTED", "true");
    expect(await (await GET(incoming("me"), context(["me"]))).json()).toEqual({ user: null });
    vi.stubEnv("NEXT_PUBLIC_COURTLENS_HOSTED", "");
    vi.stubEnv("COURTLENS_DEV_ACCOUNT_AUTO_LOGIN", "");
    expect(await (await GET(incoming("me"), context(["me"]))).json()).toEqual({ user: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays signed out after a sign-out until the next real sign-in", async () => {
    devMode();
    const fetch = vi.fn().mockResolvedValue(Response.json(dev)); vi.stubGlobal("fetch", fetch);
    const out = await POST(incoming("sign-out", { method: "POST", headers: signedIn }), context(["sign-out"]));
    expect(out.headers.getSetCookie()).toContain("courtlens-dev-signed-out=1; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax");
    const me = await GET(incoming("me", { headers: { cookie: "courtlens-dev-signed-out=1" } }), context(["me"]));
    expect(await me.json()).toEqual({ user: null });
    expect(fetch).not.toHaveBeenCalled();
    const back = await POST(incoming("demo", { method: "POST", headers: { cookie: "courtlens-dev-signed-out=1" } }), context(["demo"]));
    expect(back.headers.getSetCookie()).toContain("courtlens-dev-signed-out=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  });

  it("falls back to signed out when the API has no dev account", async () => {
    devMode();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Not Found" }, { status: 404 })));
    const response = await GET(incoming("me"), context(["me"]));
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
