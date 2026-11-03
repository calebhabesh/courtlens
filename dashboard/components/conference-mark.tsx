import type { CSSProperties } from "react";
import { conferenceMark } from "@/lib/team-era";

/**
 * The NBA's Eastern or Western Conference wordmark (team-branding.json `conferences`), drawn as a
 * mask in the current text colour so it reads like a label in the control around it: secondary at
 * rest, the accent when selected. The wordmark's shape is the league's; its colour follows the UI.
 */
export function ConferenceMark({ conference, className = "" }: { conference: "East" | "West"; className?: string }) {
  const mark = conferenceMark(conference);
  if (!mark) return <span className={className}>{conference}</span>;
  return <span role="img" aria-label={mark.artwork_name} title={mark.artwork_name} className={`conference-mark ${className}`}
    style={{ "--conference-mark": `url("${mark.asset}")`, "--conference-ratio": `${mark.width} / ${mark.height}` } as CSSProperties} />;
}
