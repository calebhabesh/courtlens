import type { CSSProperties } from "react";

export type AnchoredTooltip = {
  style: CSSProperties & { "--tooltip-left": string; "--tooltip-top": string };
  "data-side": "left" | "right";
  "data-align": "above" | "center" | "below";
};

/**
 * Place a hover card beside its data point. Coordinates are in the chart's viewBox units and the
 * card is positioned in percentages of the same plot frame, so it stays on the point however the
 * SVG is scaled. It sits right of the point (left past 60% of the width) and flips above/below
 * near the top and bottom edges.
 */
export function anchoredTooltip(x: number, y: number, width: number, height: number): AnchoredTooltip {
  const fx = x / width, fy = y / height;
  return {
    style: { "--tooltip-left": `${(fx * 100).toFixed(3)}%`, "--tooltip-top": `${(fy * 100).toFixed(3)}%` },
    "data-side": fx > 0.6 ? "left" : "right",
    "data-align": fy < 0.2 ? "below" : fy > 0.8 ? "above" : "center"
  };
}
