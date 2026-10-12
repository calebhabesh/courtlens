import type { ReactNode } from "react";

/** One prominent source credit for DARKO forecasts wherever they are displayed. */
export function DarkoSourceLink({ children = "DARKO", title }: { children?: ReactNode; title?: string }) {
  return <a className="darko-source-link" href="https://www.darko.app/about" target="_blank" rel="noreferrer"
    title={title ?? "DARKO Daily Plus-Minus by Kostya Medvedovsky (darko.app)"}>{children}</a>;
}
