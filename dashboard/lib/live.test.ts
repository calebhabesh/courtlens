import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptsDemand, createLiveSession, easternToday, gameStatus, LiveRequestError, shiftSlate, validSlate, type LiveGame, type LiveLease } from "./live";
import { GET, POST, DELETE } from "../app/api/live/[[...path]]/route";
import { NextRequest } from "next/server";

const id = "11111111-1111-4111-8111-111111111111";
const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
const request = (path: string, method: string, body?: string, origin = "http://localhost:3000") => new NextRequest(`http://localhost:3000/api/live${path}`, {method, headers:{origin}, body});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Live credential proxy", () => {
  it("blocks cross-origin, missing origin, arbitrary targets and invalid selections", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request("/subscriptions", "POST", "{}", "http://other.test"),context(["subscriptions"]))).status).toBe(403);
    expect((await DELETE(new NextRequest(`http://localhost:3000/api/live/subscriptions/${id}`,{method:"DELETE"}),context(["subscriptions",id]))).status).toBe(403);
    expect((await GET(request("/jobs", "GET"),context(["jobs"]))).status).toBe(404);
    for (const body of ['{"slate_date":"2026-02-30"}', '{"slate_date":"2026-10-03","game_id":"../jobs"}', '{"slate_date":"2026-10-03","token":"invented"}', 'null', '[]']) expect((await POST(request("/subscriptions","POST",body), context(["subscriptions"]))).status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps credentials server-side and preserves cache GET and idempotent 204 semantics", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({data:null})); vi.stubGlobal("fetch",fetch);
    const read = await GET(request("?slate_date=2026-10-03&target=http://other.test","GET"),context());
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(fetch.mock.calls[0][0].pathname).toBe("/api/live"); expect(fetch.mock.calls[0][0].search).toBe("?slate_date=2026-10-03"); expect(fetch.mock.calls[0][1].headers["X-Operator-Token"]).toBeUndefined();
    fetch.mockResolvedValue(new Response(null,{status:204}));
    const result = await DELETE(request(`/subscriptions/${id}`,"DELETE"),context(["subscriptions",id]));
    expect(result.status).toBe(204); expect(await result.text()).toBe(""); expect(fetch.mock.calls[1][1].headers["X-Operator-Token"]).toBeTruthy();
  });
  it("accepts the actual loopback Host when Next normalizes its internal hostname", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id })); vi.stubGlobal("fetch", fetch);
    const sameOrigin = new NextRequest("http://localhost:3140/api/live/subscriptions", {
      method: "POST", headers: { host: "127.0.0.1:3140", origin: "http://127.0.0.1:3140" }, body: '{"slate_date":"2026-10-03"}',
    });
    expect((await POST(sameOrigin, context(["subscriptions"]))).status).toBe(200);
    const forged = new NextRequest("http://localhost:3140/api/live/subscriptions", {
      method: "POST", headers: { host: "127.0.0.1:3140", origin: "http://attacker.test", "x-forwarded-host": "attacker.test" }, body: '{"slate_date":"2026-10-03"}',
    });
    expect((await POST(forged, context(["subscriptions"]))).status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("passes rejection codes without leaking upstream bodies and fails closed on network errors", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({detail:"private upstream payload"},{status:429})); vi.stubGlobal("fetch",fetch);
    const response = await POST(request("/subscriptions","POST",'{"slate_date":"2026-10-03","game_id":null}'),context(["subscriptions"]));
    expect(response.status).toBe(429);expect(await response.text()).not.toContain("private");
    fetch.mockRejectedValue(new Error("secret"));expect((await GET(request("?slate_date=2026-10-03","GET"),context())).status).toBe(502);
  });
});

describe("Live demand lifecycle", () => {
  it("reads and renews at 60 seconds, then releases and stops after pause/unmount", async () => {
    vi.useFakeTimers();const read=vi.fn().mockResolvedValue(undefined);const report=vi.fn();const api=vi.fn().mockResolvedValue({id});
    const stop=createLiveSession({slate_date:"2026-10-03",game_id:"123"},read,report,api);
    await vi.advanceTimersByTimeAsync(0);expect(read).toHaveBeenCalledTimes(1);expect(api.mock.calls[0][0]).toBe("/subscriptions");
    await vi.advanceTimersByTimeAsync(59999);expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);expect(read).toHaveBeenCalledTimes(2);expect(api.mock.calls[1][0]).toBe(`/subscriptions/${id}/heartbeat`);
    stop();expect(api.mock.calls[2]).toEqual([`/subscriptions/${id}`,"DELETE",undefined,true]);await vi.advanceTimersByTimeAsync(180000);expect(read).toHaveBeenCalledTimes(2);
  });
  it("releases a lease arriving after unmount without renewing or updating state", async () => {
    vi.useFakeTimers();let resolve: (value: LiveLease) => void = () => {};const api=vi.fn().mockImplementationOnce(()=>new Promise<LiveLease>(r=>{resolve=r;})).mockResolvedValue(undefined);const report=vi.fn();
    const stop=createLiveSession({slate_date:"2026-10-03"},vi.fn().mockResolvedValue(undefined),report,api);stop();resolve({id,expires_at:"later",heartbeat_seconds:60});await vi.advanceTimersByTimeAsync(0);
    expect(api.mock.calls[1]).toEqual([`/subscriptions/${id}`,"DELETE",undefined,true]);expect(report).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(60000);expect(api).toHaveBeenCalledTimes(2);
  });
  it("recovers expired heartbeat on the next bounded tick and waits after capacity rejection", async () => {
    vi.useFakeTimers();const api=vi.fn().mockResolvedValueOnce({id}).mockRejectedValueOnce(new LiveRequestError(404)).mockRejectedValueOnce(new LiveRequestError(429)).mockResolvedValue({id});const report=vi.fn();const read=vi.fn().mockResolvedValue(undefined);
    const stop=createLiveSession({slate_date:"2026-10-03"},read,report,api);await vi.advanceTimersByTimeAsync(120000);expect(api.mock.calls[2][0]).toBe("/subscriptions");expect(report).toHaveBeenLastCalledWith(expect.stringContaining("capacity"));await vi.advanceTimersByTimeAsync(59999);expect(api).toHaveBeenCalledTimes(3);await vi.advanceTimersByTimeAsync(1);expect(api).toHaveBeenCalledTimes(4);stop();
  });
});
it("keeps Eastern date boundaries and unknown source clock/score explicit",()=>{
  expect(easternToday(new Date("2026-10-03T02:00:00Z"))).toBe("2026-10-02");expect(validSlate("2026-02-30")).toBe(false);expect(validSlate("2024-02-29")).toBe(true);expect(shiftSlate("2026-12-31",1)).toBe("2027-01-01");expect(acceptsDemand("2026-09-25","2026-10-03")).toBe(false);expect(acceptsDemand("2026-09-26","2026-10-03")).toBe(true);
  const game:LiveGame={source_id:"1",canonical_id:null,identity_status:"unmapped",namespace:"espn",slate_date:"2026-10-03",event_time:null,status:"in_progress",period:5,clock:null,teams:[],provisional:true};expect(gameStatus(game)).toBe("OT 1 · Clock unknown");
});
