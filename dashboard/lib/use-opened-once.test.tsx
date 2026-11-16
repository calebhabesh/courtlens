// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import dynamic from "next/dynamic";
import { Suspense, useState, type ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useOpenedOnce } from "./use-opened-once";

type OverlayProps = { isOpen: boolean };
// A stand-in overlay loaded the way the header and the Stats table load theirs.
const LazyOverlay = dynamic(() => import("./use-opened-once.fixture").then(mod => mod.FixtureOverlay), { loading: () => null });

// Loaders held open until the test releases them, to look at the page while the code loads.
let release: () => void = () => undefined;
const held = () => new Promise<void>(resolve => { release = resolve; });
let gate = held();
const HeldOverlay = dynamic(() => gate.then(() => import("./use-opened-once.fixture")).then(mod => mod.FixtureOverlay), { loading: () => null });

function Host({ initiallyOpen = false, Overlay = LazyOverlay }: { initiallyOpen?: boolean; Overlay?: ComponentType<OverlayProps> }) {
  const [open, setOpen] = useState(initiallyOpen);
  const mounted = useOpenedOnce(open);
  return <>
    <button type="button" onClick={() => setOpen(value => !value)}>toggle</button>
    <span data-testid="mounted">{String(mounted)}</span>
    {mounted && <Overlay isOpen={open} />}
  </>;
}

const page = (overlay?: ComponentType<OverlayProps>) =>
  <Suspense fallback={<p>page fallback</p>}><Host Overlay={overlay} /></Suspense>;

describe("useOpenedOnce with a next/dynamic overlay", () => {
  afterEach(cleanup);

  it("renders nothing and loads nothing until the first opening", () => {
    render(<Host />);
    expect(screen.getByTestId("mounted").textContent).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("overlay-closed")).toBeNull();
  });

  it("loads the overlay on first opening, then keeps it mounted (closed) so its state survives", async () => {
    render(<Host />);
    await act(async () => screen.getByText("toggle").click());
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await act(async () => screen.getByText("toggle").click());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("overlay-closed")).toBeTruthy();
    expect(screen.getByTestId("mounted").textContent).toBe("true");
  });

  it("mounts at once when the overlay starts open", async () => {
    render(<Host initiallyOpen />);
    expect(screen.getByTestId("mounted").textContent).toBe("true");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("keeps the page (and the button that opened it) on screen while the overlay's code loads", async () => {
    gate = held();
    render(page(HeldOverlay));
    const button = screen.getByText("toggle");
    button.focus();
    await act(async () => button.click());
    // Loading: its own empty fallback, never the page's.
    expect(screen.queryByText("page fallback")).toBeNull();
    expect(screen.getByText("toggle")).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => release());
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
