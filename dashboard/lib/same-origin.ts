import type { NextRequest } from "next/server";

export function isSameBrowserOrigin(request: NextRequest): boolean {
  // Next's internal URL may normalize 127.0.0.1 to localhost. Use the
  // incoming Host for the browser boundary; never trust a forwarded host.
  const origin = new URL(request.nextUrl.origin);
  const host = request.headers.get("host");
  if (host) origin.host = host;
  const sent = request.headers.get("origin");
  if (sent === origin.origin) return true;
  // Behind TLS termination (Cloudflare, then Caddy) the server sees http while the
  // browser's Origin is https. The same host over https is still this site.
  try {
    const parsed = new URL(sent ?? "");
    return !!host && parsed.protocol === "https:" && parsed.host === host && sent === parsed.origin;
  } catch {
    return false;
  }
}
