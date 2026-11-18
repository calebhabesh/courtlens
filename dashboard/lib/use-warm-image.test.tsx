// @vitest-environment happy-dom
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWarmImage, warmQueuedImages } from "./use-warm-image";

function Img({ id, loading = "lazy", hidden = false }: { id: string; loading?: "lazy" | "eager"; hidden?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  useWarmImage(ref);
  // happy-dom has no layout, so a closed tab's image reports what checkVisibility() would.
  // eslint-disable-next-line @next/next/no-img-element -- a bare img is what the hook is given
  return <img id={id} ref={node => { ref.current = node; if (node && hidden) node.checkVisibility = () => false; }} loading={loading} alt="" src={`/${id}.webp`} />;
}

const loadingOf = (id: string) => (document.getElementById(id) as HTMLImageElement).loading;

let idle: typeof window.requestIdleCallback;
beforeEach(() => {
  vi.useFakeTimers();
  idle = window.requestIdleCallback;
  // Fake timers drive the idle fallback (200 ms).
  (window as { requestIdleCallback?: unknown }).requestIdleCallback = undefined;
});
afterEach(() => {
  (window as { requestIdleCallback?: unknown }).requestIdleCallback = idle;
  vi.useRealTimers();
});

it("starts mounted lazy images once idle, not before, and leaves hidden and eager ones", async () => {
  render(<><Img id="row" /><Img id="hero" loading="eager" /><Img id="tab" hidden /></>);
  expect(loadingOf("row")).toBe("lazy");
  await act(async () => { vi.advanceTimersByTime(250); });
  expect(loadingOf("row")).toBe("eager");
  expect(loadingOf("hero")).toBe("eager");
  expect(loadingOf("tab")).toBe("lazy");
});

it("queues images that mount later, and drops unmounted ones", async () => {
  const { rerender, unmount } = render(<Img id="first" />);
  rerender(<><Img id="first" /><Img id="later" /></>);
  await act(async () => { vi.advanceTimersByTime(250); });
  expect(loadingOf("first")).toBe("eager");
  expect(loadingOf("later")).toBe("eager");
  unmount();
  expect(warmQueuedImages()).toBe(0);
});
