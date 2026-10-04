import type { NextRequest } from "next/server";

export function isSameBrowserOrigin(request: NextRequest): boolean {
  // Next's internal URL may normalize 127.0.0.1 to localhost. Use the
  // incoming Host for the browser boundary; never trust a forwarded host.
  const origin = new URL(request.nextUrl.origin);
  const host = request.headers.get("host");
  if (host) origin.host = host;
  return request.headers.get("origin") === origin.origin;
}
