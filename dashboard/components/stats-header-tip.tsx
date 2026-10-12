"use client";

import { OverlayPortal } from "./ui/overlay-portal";

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
export function StatsHeaderTip({ tip }: { tip: HeaderTip | null }) {
  if (!tip) return null;
  return (
    <OverlayPortal>
      <div className="stats-header-tip" role="tooltip" style={tipGeometry(tip)}>
        <strong>{tip.label}</strong>
        {tip.name !== tip.label && <span className="stats-header-tip-name">{tip.name}</span>}
        {tip.description && <span>{tip.description}</span>}
        {tip.sortable && <em>Click to sort</em>}
      </div>
    </OverlayPortal>
  );
}
