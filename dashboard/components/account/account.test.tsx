// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountProvider, useAccount } from "../../lib/account-context";
import { SignInDialog } from "./sign-in-dialog";
import { FavoritePlayersList } from "./favorite-players";
import { AccountMenu, FavoritesPopover } from "./account-controls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));

const OWNER = { id: "u1", name: "Owner", email: "owner@example.com", is_demo: false };
const DEMO = { id: "d", name: "Demo account", email: null, is_demo: true };
const JOKIC = { player_id: "203999", name: "Nikola Jokić", season: "2025-26", team: "DEN" };
const list = (players: typeof JOKIC[], shared = false) => ({ player_ids: players.map(p => p.player_id), players, limit: 100, shared });

type Route = (init?: RequestInit) => Response;
function api(routes: Record<string, Route>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace("/api/account/", "");
    const key = `${init?.method ?? "GET"} ${path}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(init);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function Probe() {
  const account = useAccount();
  return <>
    <span data-testid="status">{account.status}</span>
    <span data-testid="favorites">{account.favorites.join(",")}</span>
    <button type="button" onClick={() => void account.toggleFavorite("203999").catch(() => undefined)}>toggle</button>
  </>;
}

function mount() {
  return render(<AccountProvider><Probe /><FavoritesPopover /><AccountMenu /><FavoritePlayersList /><SignInDialog /></AccountProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset(); });

describe("accounts (finish plan F04)", () => {
  it("signed out, favourite controls open sign-in instead of writing", async () => {
    const fetch = api({ "GET me": () => Response.json({ user: null }) });
    mount();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-out"));
    expect(screen.getByText("Keep a list of favourite players and filter Stats to them.")).toBeTruthy();
    fireEvent.click(screen.getByText("toggle"));
    expect(await screen.findByRole("dialog", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Sign in, or use the demo account, to save favourite players.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("signs in with a password, loads favourites and refreshes server pages", async () => {
    let signedIn = false;
    const fetch = api({
      "GET me": () => Response.json({ user: null }),
      "POST session": () => { signedIn = true; return Response.json({ user: OWNER }); },
      "GET favorites": () => signedIn ? Response.json(list([JOKIC])) : Response.json({}, { status: 401 }),
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-out"));
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Sign in" });
    fireEvent.change(dialog.querySelector("input[type=email]")!, { target: { value: " owner@example.com " } });
    fireEvent.change(dialog.querySelector("input[type=password]")!, { target: { value: "a long password" } });
    await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-in"));
    const body = JSON.parse(String(fetch.mock.calls.find(call => call[1]?.method === "POST")![1]!.body));
    expect(body).toEqual({ email: "owner@example.com", password: "a long password" });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId("favorites").textContent).toBe("203999");
    expect(screen.getByRole("link", { name: /Nikola Jokić/ }).getAttribute("href")).toBe("/players/203999");
    expect(screen.getByText("Owner")).toBeTruthy();
    // The password never stays in the DOM after sign-in.
    expect(document.body.innerHTML).not.toContain("a long password");
  });

  it("shows the sign-in limit in words", async () => {
    api({
      "GET me": () => Response.json({ user: null }),
      "POST session": () => Response.json({ detail: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": "540" } }),
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-out"));
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Sign in" });
    fireEvent.change(dialog.querySelector("input[type=email]")!, { target: { value: "a@b.co" } });
    fireEvent.change(dialog.querySelector("input[type=password]")!, { target: { value: "x" } });
    await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Try again in 9 minutes.");
  });

  it("the demo account says its list is shared and reset nightly", async () => {
    api({ "GET me": () => Response.json({ user: DEMO }), "GET favorites": () => Response.json(list([JOKIC], true)) });
    mount();
    expect(await screen.findByText("Demo account: one list shared by every visitor, reset each night.")).toBeTruthy();
  });

  it("toggles optimistically and rolls back a failed write", async () => {
    api({
      "GET me": () => Response.json({ user: OWNER }),
      "GET favorites": () => Response.json(list([])),
      "POST favorites/203999": () => Response.json({ detail: "Too many attempts. Try again later." }, { status: 429 }),
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-in"));
    await act(async () => { fireEvent.click(screen.getByText("toggle")); });
    expect(screen.getByTestId("favorites").textContent).toBe("");
  });

  it("an ended session signs out and asks to sign in again", async () => {
    api({
      "GET me": () => Response.json({ user: OWNER }),
      "GET favorites": () => Response.json(list([JOKIC])),
      "DELETE favorites/203999": () => Response.json({ detail: "Your session has ended. Sign in again." }, { status: 401 }),
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("favorites").textContent).toBe("203999"));
    await act(async () => { fireEvent.click(screen.getByText("toggle")); });
    expect(screen.getByTestId("status").textContent).toBe("signed-out");
    expect(await screen.findByText("Your session ended. Sign in again to save favourites.")).toBeTruthy();
  });

  it("removes a favourite from the list", async () => {
    const fetch = api({
      "GET me": () => Response.json({ user: OWNER }),
      "GET favorites": () => Response.json(list([JOKIC])),
      "DELETE favorites/203999": () => Response.json(list([])),
    });
    mount();
    const remove = await screen.findByRole("button", { name: "Remove Nikola Jokić from favorites" });
    await act(async () => { fireEvent.click(remove); });
    expect(fetch.mock.calls.some(call => call[1]?.method === "DELETE")).toBe(true);
    expect(screen.getByText("No favourites yet. Use the star on a player page or in Stats.")).toBeTruthy();
  });

  it("outside a provider, components read as signed out", () => {
    render(<FavoritePlayersList />);
    expect(screen.getByRole("button", { name: "Use the demo account" })).toBeTruthy();
  });
});
