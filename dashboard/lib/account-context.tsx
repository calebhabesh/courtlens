"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AccountUser, FavoritePlayer, FavoritesResponse } from "./account-types";

/**
 * Accounts and favourite players (finish plan F04). The session is an HttpOnly cookie that only
 * the dashboard's account proxy (`/api/account/*`) reads; this context sees the account and its
 * favourites, never a token. Signed out, favourite controls open the sign-in dialog instead.
 */
export type AccountStatus = "loading" | "signed-out" | "signed-in";

export class AccountRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: number | null = null) {
    super(message);
  }
}

export interface AccountContextValue {
  status: AccountStatus;
  user: AccountUser | null;
  favorites: string[];
  favoritePlayers: FavoritePlayer[];
  /** The demo account's list is shared by every visitor and reset nightly. */
  sharedFavorites: boolean;
  favoritesLimit: number;
  isFavorite: (playerId: string) => boolean;
  /** Signed out, opens the sign-in dialog and resolves without a change. */
  toggleFavorite: (playerId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  signInOpen: boolean;
  /** Why the dialog opened ("Sign in to save favourites"), shown above the form. */
  signInReason: string | null;
  openSignIn: (reason?: string) => void;
  closeSignIn: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);
const BASE = "/api/account";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({})) as { detail?: unknown };
  if (!response.ok) {
    const retry = Number(response.headers.get("retry-after"));
    const detail = typeof body.detail === "string" ? body.detail : "Something went wrong. Try again.";
    throw new AccountRequestError(detail, response.status, Number.isFinite(retry) && retry > 0 ? retry : null);
  }
  return body as T;
}

const EMPTY: FavoritesResponse = { player_ids: [], players: [], limit: 100, shared: false };

export function AccountProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AccountStatus>("loading");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [favorites, setFavorites] = useState<FavoritesResponse>(EMPTY);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInReason, setSignInReason] = useState<string | null>(null);
  // The toggle being written per player, so a double click cannot send two writes.
  const pending = useRef(new Set<string>());

  const loadFavorites = useCallback(async () => {
    try {
      setFavorites(await call<FavoritesResponse>("favorites"));
    } catch (error) {
      if (error instanceof AccountRequestError && error.status === 401) {
        setUser(null);
        setStatus("signed-out");
      }
      setFavorites(EMPTY);
    }
  }, []);

  const adopt = useCallback(async (next: AccountUser | null) => {
    setUser(next);
    setStatus(next ? "signed-in" : "signed-out");
    if (next) await loadFavorites();
    else setFavorites(EMPTY);
  }, [loadFavorites]);

  useEffect(() => {
    let ignore = false;
    call<{ user: AccountUser | null }>("me")
      .then(body => { if (!ignore) void adopt(body.user); })
      .catch(() => { if (!ignore) void adopt(null); });
    return () => { ignore = true; };
  }, [adopt]);

  const openSignIn = useCallback((reason?: string) => {
    setSignInReason(reason ?? null);
    setSignInOpen(true);
  }, []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  const finishSignIn = useCallback(async (next: AccountUser) => {
    await adopt(next);
    setSignInOpen(false);
    // Server-rendered pages (the Stats Favorites filter) read the new session.
    router.refresh();
  }, [adopt, router]);

  const signIn = useCallback(async (email: string, password: string) => {
    const body = await call<{ user: AccountUser }>("session", { method: "POST", body: JSON.stringify({ email, password }) });
    await finishSignIn(body.user);
  }, [finishSignIn]);

  const signInDemo = useCallback(async () => {
    const body = await call<{ user: AccountUser }>("demo", { method: "POST" });
    await finishSignIn(body.user);
  }, [finishSignIn]);

  const signOut = useCallback(async () => {
    await call("sign-out", { method: "POST" }).catch(() => undefined);
    await adopt(null);
    router.refresh();
  }, [adopt, router]);

  const isFavorite = useCallback((playerId: string) => favorites.player_ids.includes(playerId), [favorites.player_ids]);

  const toggleFavorite = useCallback(async (playerId: string) => {
    if (status !== "signed-in") {
      openSignIn("Sign in, or use the demo account, to save favourite players.");
      return;
    }
    if (pending.current.has(playerId)) return;
    pending.current.add(playerId);
    const before = favorites;
    const exists = before.player_ids.includes(playerId);
    setFavorites({
      ...before,
      player_ids: exists ? before.player_ids.filter(id => id !== playerId) : [...before.player_ids, playerId],
      players: exists ? before.players.filter(p => p.player_id !== playerId) : before.players,
    });
    try {
      setFavorites(await call<FavoritesResponse>(`favorites/${encodeURIComponent(playerId)}`, { method: exists ? "DELETE" : "POST" }));
    } catch (error) {
      setFavorites(before);
      if (error instanceof AccountRequestError && error.status === 401) {
        await adopt(null);
        openSignIn("Your session ended. Sign in again to save favourites.");
        return;
      }
      throw error;
    } finally {
      pending.current.delete(playerId);
    }
  }, [status, favorites, openSignIn, adopt]);

  const value = useMemo<AccountContextValue>(() => ({
    status, user,
    favorites: favorites.player_ids,
    favoritePlayers: favorites.players,
    sharedFavorites: favorites.shared,
    favoritesLimit: favorites.limit,
    isFavorite, toggleFavorite, signIn, signInDemo, signOut,
    signInOpen, signInReason, openSignIn, closeSignIn,
  }), [status, user, favorites, isFavorite, toggleFavorite, signIn, signInDemo, signOut, signInOpen, signInReason, openSignIn, closeSignIn]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/** Outside a provider (isolated component tests), accounts read as signed out. */
const SIGNED_OUT: AccountContextValue = {
  status: "signed-out", user: null, favorites: [], favoritePlayers: [], sharedFavorites: false, favoritesLimit: 100,
  isFavorite: () => false, toggleFavorite: async () => undefined, signIn: async () => undefined,
  signInDemo: async () => undefined, signOut: async () => undefined, signInOpen: false, signInReason: null,
  openSignIn: () => undefined, closeSignIn: () => undefined,
};

export function useAccount(): AccountContextValue {
  return useContext(AccountContext) ?? SIGNED_OUT;
}
