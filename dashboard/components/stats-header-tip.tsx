"use client";

import { OverlayPortal } from "./ui/overlay-portal";
import { DarkoSourceLink } from "./darko-source-link";
import { DARKO_COLUMNS } from "@/lib/stats-presets";

export type HeaderTip = {
  key: string;
  label: string;
  name: string;
  description: string | null;
  sortable: boolean;
  /** Viewport coordinates of the header cell's top centre. */
  x: number;
  y: number;
};

type TipGeometry = React.CSSProperties & { "--tip-x": string; "--tip-y": string };
const tipGeometry = (tip: HeaderTip): TipGeometry => ({ "--tip-x": `${Math.round(tip.x)}px`, "--tip-y": `${Math.round(tip.y)}px` });

/** Databallr-style column hint above a Stats header: abbreviation, definition, "Click to sort". */
export function StatsHeaderTip({ tip, onEnter, onLeave, onClose }: { tip: HeaderTip | null; onEnter?: () => void; onLeave?: () => void; onClose?: () => void }) {
  if (!tip) return null;
  const darko = tip.key in DARKO_COLUMNS;
  return (
    <OverlayPortal>
      <div className={`stats-header-tip${darko ? " is-interactive" : ""}`} role={darko ? "dialog" : "tooltip"}
        aria-label={darko ? `${tip.label} definition and source` : undefined} style={tipGeometry(tip)}
        onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) onLeave?.();
        }} onKeyDown={event => { if (event.key === "Escape") onClose?.(); }}>
        <strong>{tip.label}</strong>
        {tip.name !== tip.label && <span className="stats-header-tip-name">{tip.name}</span>}
        {tip.description && <span>{tip.description}</span>}
        {darko && <DarkoSourceLink>DARKO · Kostya Medvedovsky</DarkoSourceLink>}
        {tip.sortable && <em>Click to sort</em>}
      </div>
    </OverlayPortal>
  );
}
