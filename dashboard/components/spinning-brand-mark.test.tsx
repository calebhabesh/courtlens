// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { REST_SEAM_PATH } from "@/lib/ball-seams";
import { Brand } from "./brand";

let reduce = false;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  reduce = false;
  frames = [];
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: query.includes("reduce") && reduce, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as MediaQueryList);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderBrand() {
  const { container } = render(<Brand />);
  const link = container.querySelector("a.brand")!;
  const seams = container.querySelector("path.brand-seams")!;
  /** Runs the queued frames `count` times, 16 ms apart. */
  const play = (count: number) => {
    let now = performance.now();
    for (let i = 0; i < count && frames.length; i++) {
      const pending = frames;
      frames = [];
      now += 16;
      pending.forEach(callback => callback(now));
    }
  };
  return { link, seams, play };
}

describe("SpinningBrandMark", () => {
  it("rests on the mark's own seams", () => {
    const { seams } = renderBrand();
    expect(seams.getAttribute("d")).toBe(REST_SEAM_PATH);
    expect(seams.getAttribute("transform")).toBeNull();
  });

  it("spins while pointed at and winds back to rest after", () => {
    const { link, seams, play } = renderBrand();
    fireEvent.pointerEnter(link, { pointerType: "mouse" });
    play(20);
    expect(seams.getAttribute("transform")).toMatch(/^rotate\(\d+(\.\d+)? 14 14\)$/);
    fireEvent.pointerLeave(link, { pointerType: "mouse" });
    play(400);
    expect(frames).toHaveLength(0);
    expect(seams.getAttribute("transform")).toBeNull();
  });

  it("stays still for touch and under reduced motion", () => {
    const touch = renderBrand();
    fireEvent.pointerEnter(touch.link, { pointerType: "touch" });
    expect(frames).toHaveLength(0);
    cleanup();
    reduce = true;
    const reduced = renderBrand();
    fireEvent.pointerEnter(reduced.link, { pointerType: "mouse" });
    expect(frames).toHaveLength(0);
    expect(reduced.seams.getAttribute("transform")).toBeNull();
  });
});
