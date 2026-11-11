import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isSameBrowserOrigin } from "./same-origin";

const request = (url: string, host: string, origin?: string) =>
  new NextRequest(url, { method: "POST", headers: { host, ...(origin ? { origin } : {}) } });

describe("same-origin browser boundary", () => {
  it("accepts the exact origin locally", () => {
    expect(isSameBrowserOrigin(request("http://localhost:3000/api/x", "localhost:3000", "http://localhost:3000"))).toBe(true);
  });
  it("accepts the site's https origin behind TLS termination", () => {
    // The hosted demo: the container sees http with the public Host; the browser sends https.
    expect(isSameBrowserOrigin(request("http://dashboard:3000/api/x", "courtlens.calebhabesh.com", "https://courtlens.calebhabesh.com"))).toBe(true);
  });
  it("refuses other sites, other ports, a missing origin and downgrades", () => {
    const url = "http://dashboard:3000/api/x", host = "courtlens.calebhabesh.com";
    expect(isSameBrowserOrigin(request(url, host, "https://evil.example"))).toBe(false);
    expect(isSameBrowserOrigin(request(url, host, "https://courtlens.calebhabesh.com.evil.example"))).toBe(false);
    expect(isSameBrowserOrigin(request(url, host, "https://courtlens.calebhabesh.com:8443"))).toBe(false);
    expect(isSameBrowserOrigin(request(url, host))).toBe(false);
    expect(isSameBrowserOrigin(request(url, host, "null"))).toBe(false);
    expect(isSameBrowserOrigin(request("https://localhost:3000/api/x", "localhost:3000", "http://localhost:3000"))).toBe(false);
  });
});
