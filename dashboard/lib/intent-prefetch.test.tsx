// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntentLink } from "@/components/intent-link";
import { INTENT_DELAY_MS, PREFETCH_WINDOW_MS, claimPrefetch, prefetchable, resetIntentPrefetch } from "./intent-prefetch";

const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch }) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  prefetch.mockReset();
  resetIntentPrefetch();
});

function links(count: number) {
  render(<>{Array.from({ length: count }, (_, i) => <IntentLink key={i} href={`/players/${i}`}>Player {i}</IntentLink>)}</>);
  return Array.from({ length: count }, (_, i) => screen.getByRole("link", { name: `Player ${i}` }));
}

const enter = (el: HTMLElement, pointerType = "mouse") => fireEvent.pointerEnter(el, { pointerType });
const leave = (el: HTMLElement) => fireEvent.pointerLeave(el, { pointerType: "mouse" });

describe("useIntentPrefetch", () => {
  it("prefetches the whole page once the pointer has rested for 80 ms", () => {
    const [link] = links(1);
    enter(link);
    act(() => { vi.advanceTimersByTime(INTENT_DELAY_MS - 1); });
    expect(prefetch).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/players/0", { kind: "full" });
  });

  it("cancels when the pointer leaves before the delay", () => {
    const [link] = links(1);
    enter(link);
    act(() => { vi.advanceTimersByTime(INTENT_DELAY_MS - 10); });
    leave(link);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("sends nothing for a pointer sweeping across 20 rows", () => {
    const rows = links(20);
    for (const row of rows) {
      enter(row);
      act(() => { vi.advanceTimersByTime(30); });
      leave(row);
    }
    act(() => { vi.advanceTimersByTime(1000); });
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("prefetches an href at most once per window", () => {
    const [link] = links(1);
    for (let i = 0; i < 3; i++) {
      enter(link);
      act(() => { vi.advanceTimersByTime(INTENT_DELAY_MS); });
      leave(link);
    }
    expect(prefetch).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(PREFETCH_WINDOW_MS); });
    enter(link);
    act(() => { vi.advanceTimersByTime(INTENT_DELAY_MS); });
    expect(prefetch).toHaveBeenCalledTimes(2);
  });

  it("prefetches on touch start, and ignores the touch's own pointerenter", () => {
    const [link] = links(1);
    enter(link, "touch");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(prefetch).not.toHaveBeenCalled();
    fireEvent.touchStart(link);
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it("prefetches on keyboard focus but not on the focus a mouse press gives", () => {
    const [keyboard, mouse] = links(2);
    vi.spyOn(keyboard, "matches").mockImplementation(selector => selector === ":focus-visible");
    vi.spyOn(mouse, "matches").mockReturnValue(false);
    fireEvent.focus(mouse);
    expect(prefetch).not.toHaveBeenCalled();
    fireEvent.focus(keyboard);
    expect(prefetch).toHaveBeenCalledWith("/players/0", { kind: "full" });
  });

  it("never prefetches Live pages, links that opt out, or outside a production build", () => {
    render(<>
      <IntentLink href="/live/games/401">Live game</IntentLink>
      <IntentLink href="/players/1" prefetch={false}>Opted out</IntentLink>
    </>);
    for (const name of ["Live game", "Opted out"]) {
      fireEvent.touchStart(screen.getByRole("link", { name }));
    }
    expect(prefetch).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "test");
    const [link] = links(1);
    fireEvent.touchStart(link);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("renders a plain next/link anchor that keeps the caller's handlers", () => {
    const onPointerEnter = vi.fn();
    render(<IntentLink href="/stats" onPointerEnter={onPointerEnter} className="nav">Stats</IntentLink>);
    const link = screen.getByRole("link", { name: "Stats" });
    expect(link.getAttribute("href")).toBe("/stats");
    expect(link.className).toBe("nav");
    enter(link);
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
  });
});

describe("claimPrefetch and prefetchable", () => {
  it("claims an href once per window", () => {
    expect(claimPrefetch("/teams/1", 0)).toBe(true);
    expect(claimPrefetch("/teams/1", PREFETCH_WINDOW_MS - 1)).toBe(false);
    expect(claimPrefetch("/teams/2", 1)).toBe(true);
    expect(claimPrefetch("/teams/1", PREFETCH_WINDOW_MS)).toBe(true);
  });
  it("leaves out Live pages and empty hrefs", () => {
    expect(prefetchable("/live")).toBe(false);
    expect(prefetchable("/live/open?game=1")).toBe(false);
    expect(prefetchable("/live/games/401")).toBe(false);
    expect(prefetchable("/livestock")).toBe(true);
    expect(prefetchable("/players/2544?season=2025-26")).toBe(true);
    expect(prefetchable(null)).toBe(false);
  });
});
