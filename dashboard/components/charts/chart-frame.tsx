import React, { useId, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface ChartMeta {
  title: string;
  source: string;
  sample: string;
  note?: string;
  state?: "ready" | "loading" | "empty" | "error";
  action?: ReactNode;
}

/** Source and sample stay beside the main result, including loading and unavailable states. */
export function ChartFrame({ title, source, sample, note, state = "ready", action, children }: ChartMeta & { children: ReactNode }) {
  const titleId = useId();
  return <figure className="chart-frame" aria-labelledby={titleId} data-state={state}>
    <figcaption id={titleId} className="chart-title">{title}</figcaption>
    <div className="chart-content">
      {state === "loading" ? <div className="chart-loading" role="status"><span className="sr-only">Loading {title}</span><div className="chart-loading-layout" aria-hidden="true" inert>{children}</div><Skeleton className="chart-skeleton" /></div>
        : state !== "ready" ? <p className="chart-state" role={state === "error" ? "alert" : "status"}>{state === "error" ? "Chart unavailable." : "No observed values."} {action}</p>
          : children}
    </div>
    <div className="chart-meta"><span>Source: {source}</span><span>Sample: {sample}</span>{note && <span>{note}</span>}</div>
  </figure>;
}

/** Remount only the visual on a data change: fade to final values, never redraw through zero. */
export function ChartData({ fingerprint, children }: { fingerprint: string; children: ReactNode }) {
  return <div className="chart-data" key={fingerprint}>{children}</div>;
}

export function UnknownPattern({ id }: { id: string }) {
  return <defs><pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="8" height="8" fill="var(--color-status-unknown-soft)" />
    <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-status-unknown)" strokeWidth="2" />
  </pattern></defs>;
}
