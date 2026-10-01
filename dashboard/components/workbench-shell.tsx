"use client";

import { NavRail } from "./nav-rail";
import { ContextBar } from "./context-bar";

interface WorkbenchShellProps {
  children: React.ReactNode;
  sampleSize?: number;
  lastIncludedDate?: string | null;
  hideContextBar?: boolean;
}

export function WorkbenchShell({
  children,
  sampleSize,
  lastIncludedDate,
  hideContextBar = false
}: WorkbenchShellProps) {
  return (
    <div className="workbench-layout">
      <NavRail />
      <div className="workbench-main">
        {!hideContextBar && (
          <ContextBar
            sampleSize={sampleSize}
            lastIncludedDate={lastIncludedDate}
          />
        )}
        <main id="content" className="workbench-content">
          {children}
        </main>
      </div>
    </div>
  );
}
