import { createHash } from "node:crypto";

/**
 * Server side of accounts (finish plan F04). The session token lives only in an HttpOnly cookie
 * that the account proxy sets; server code forwards it to the API as a bearer token, with the
 * proxy's own credential. The operator token and JWT secret are never used here.
 */
export const SESSION_COOKIE = "courtlens-session";
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function apiBase(): string {
  return process.env.COURTLENS_API_INTERNAL_URL || process.env.NEXT_PUBLIC_COURTLENS_API_URL || "http://localhost:8000";
}

export function validSession(value: string | undefined | null): string | null {
  return value && value.length < 4096 && TOKEN.test(value) ? value : null;
}

/** The proxy's credential and a salted hash of the client address (for sign-in limits). */
export function proxyHeaders(address: string): Record<string, string> {
  const token = process.env.COURTLENS_ACCOUNT_PROXY_TOKEN || "";
  const salt = token || "courtlens-local";
  const client = createHash("sha256").update(`${salt}:client:${address}`).digest("hex");
  return { ...(token ? { "X-CourtLens-Account-Token": token } : {}), "X-CourtLens-Client": client };
}

/** The signed-in account's favourite player IDs, or null when signed out or unavailable. */
export async function serverFavoriteIds(session: string | null, address = "server"): Promise<string[] | null> {
  if (!session) return null;
  try {
    const response = await fetch(new URL("/api/me/favorites", apiBase()), {
      headers: { ...proxyHeaders(address), Authorization: `Bearer ${session}` },
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { player_ids?: unknown };
    return Array.isArray(body.player_ids) ? body.player_ids.filter((id): id is string => typeof id === "string") : null;
  } catch {
    return null;
  }
}
