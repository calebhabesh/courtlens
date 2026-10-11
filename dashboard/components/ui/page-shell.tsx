import type { HTMLAttributes, ReactNode } from "react";

/**
 * The page templates: the five of frontend overhaul D22 plus Article (FO13 owner decision) for
 * reading and configuration pages. Every page uses exactly one.
 */
export type PageTemplate = "explorer" | "profile" | "compare" | "board" | "research" | "article";

export interface PageShellProps extends HTMLAttributes<HTMLDivElement> {
  template: PageTemplate;
  children: ReactNode;
}

/** Page frame: consistent gutters, left-aligned full-width content, template-specific spacing. */
export function PageShell({ template, className = "", children, ...props }: PageShellProps) {
  return (
    <div className={`ui-page ui-page-${template} ${className}`} data-template={template} {...props}>
      {children}
    </div>
  );
}

/** Board template body: the main surface (card, board, date strip) plus a right rail. */
export function BoardLayout({ main, rail, className = "" }: { main: ReactNode; rail?: ReactNode; className?: string }) {
  return (
    <div className={`ui-board ${rail ? "" : "ui-board-no-rail"} ${className}`}>
      <div className="ui-board-main">{main}</div>
      {rail && <aside className="ui-board-rail">{rail}</aside>}
    </div>
  );
}

/** Profile template body: hero, then tabs, then the selected tab's content. */
export function ProfileLayout({ hero, tabs, children, className = "" }: { hero: ReactNode; tabs?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`ui-profile ${className}`}>
      <div className="ui-profile-hero">{hero}</div>
      {tabs && <div className="ui-profile-tabs">{tabs}</div>}
      <div className="ui-profile-body">{children}</div>
    </div>
  );
}

/** Compare template body: one header per entity side by side, then per-stat rows. */
export function CompareLayout({ sides, children, className = "", sidePanels = true }: { sides: ReactNode[]; children: ReactNode; className?: string; sidePanels?: boolean }) {
  return (
    <div className={`ui-compare ${className}`}>
      <div className="ui-compare-sides">
        {sides.map((side, index) => <div className={`ui-compare-side ${sidePanels ? "" : "ui-compare-side-bare"}`} key={index}>{side}</div>)}
      </div>
      <div className="ui-compare-rows">{children}</div>
    </div>
  );
}

/** Research template body: a key-findings row leads, then charts and tables. */
export function ResearchLayout({ findings, children, className = "" }: { findings?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`ui-research ${className}`}>
      {findings && <section className="ui-findings" aria-label="Key findings">{findings}</section>}
      <div className="ui-research-body">{children}</div>
    </div>
  );
}
