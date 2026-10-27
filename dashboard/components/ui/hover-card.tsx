"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { OverlayPortal } from "./overlay-portal";

/** Gap between the anchor and the card, and the card's minimum distance from the viewport edge. */
const GAP = 8;
const EDGE = 8;

type Place = { x: number; y: number; side: "below" | "above" };

/**
 * A rich hover card (Databallr's stat cards): opens after a short delay on hover, at once on keyboard
 * focus, and renders at document.body so no panel clips it. It sits below its anchor, or above when
 * the viewport has no room, and stays inside the viewport. Esc, leaving, blur and scrolling close it.
 * The card is a description, not a dialog: it takes no pointer events and holds no controls.
 */
export function HoverCard({ content, children, className = "", delayMs = 250 }: {
  content: ReactNode;
  children: ReactNode;
  /** Layout only, applied to the anchor wrapper (for example `display: grid` inside a row). */
  className?: string;
  delayMs?: number;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = useCallback(() => { clear(); setOpen(false); setPlace(null); }, []);
  const show = (delay: number) => {
    clear();
    if (delay <= 0) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };

  // Measure once the card has rendered (hidden), then place it.
  useLayoutEffect(() => {
    if (!open || !anchor.current || !card.current) return;
    const target = anchor.current.getBoundingClientRect();
    const { width, height } = card.current.getBoundingClientRect();
    const x = Math.min(Math.max(EDGE, target.left + target.width / 2 - width / 2), window.innerWidth - width - EDGE);
    const below = target.bottom + GAP;
    const fits = below + height <= window.innerHeight - EDGE || target.top - GAP - height < EDGE;
    // Placement depends on a DOM measurement, so it can only be set after layout.
    setPlace({ x: Math.max(EDGE, x), y: fits ? below : target.top - GAP - height, side: fits ? "below" : "above" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  useEffect(() => clear, []);

  return <span ref={anchor} className={`ui-hover-anchor ${className}`.trim()} aria-describedby={open ? id : undefined}
    onMouseEnter={() => show(delayMs)} onMouseLeave={close} onFocus={() => show(0)} onBlur={close}>
    {children}
    {open && <OverlayPortal>
      <div ref={card} id={id} role="tooltip" className="ui-hover-card" data-placed={place ? place.side : undefined}
        style={place ? ({ "--hover-x": `${place.x}px`, "--hover-y": `${place.y}px` } as CSSProperties) : undefined}>
        {content}
      </div>
    </OverlayPortal>}
  </span>;
}

/** The card's standard layout: eyebrow and optional pill, title, lead line, then free content. */
export function HoverCardBody({ eyebrow, pill, title, lead, children }: {
  eyebrow: string; pill?: string | null; title: ReactNode; lead?: ReactNode; children?: ReactNode;
}) {
  return <>
    <div className="ui-hover-card-top">
      <span className="ui-hover-card-eyebrow">{eyebrow}</span>
      {pill && <span className="ui-hover-card-pill">{pill}</span>}
    </div>
    <strong className="ui-hover-card-title">{title}</strong>
    {lead && <p className="ui-hover-card-lead">{lead}</p>}
    {children}
  </>;
}
