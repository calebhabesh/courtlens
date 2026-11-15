"use client";

import { Fragment } from "react";
import { SkelControl, SkelControls, SkelFilterBar, SkelHeader, SkelLines, SkelPlayerCell, SkelSegmented, SkelText } from "./ui/content-skeletons";
import { Skeleton } from "./ui/skeleton";

/** Columns per group in the default Overall preset; a photo guide column starts each group after the first. */
const GROUPS = [3, 3, 4, 2, 5, 4];

/**
 * The Stats table while its frame loads: the toolbar band, the two header tiers and photo-led rows, in
 * the explorer's own classes so the real table replaces it without a shift.
 */
export function StatsTableSkeleton({ rows = 12, rail = true }: { rows?: number; rail?: boolean }) {
  const cells = (row: number) => GROUPS.map((count, group) => <Fragment key={group}>
    {group > 0 && <td className="stats-guide-cell"><span className="stats-guide-marker"><Skeleton variant="circle" width={30} height={30} /></span></td>}
    {Array.from({ length: count }, (_, index) => <td key={index} className={`stats-metric-cell stats-group-${group % 2}`}><Skeleton variant="text" className="ui-skel-cell" width={(row + index) % 3 ? 32 : 26} /></td>)}
  </Fragment>);
  return <div className={`stats-frame-layout ${rail ? "has-rail" : ""}`} aria-hidden="true">
    <div className="stats-table-frame is-table">
      <div className="stats-controls-row">
        <SkelText size="lg" width={110} />
        <SkelSegmented options={[76, 64, 64, 72, 64]} />
        <SkelControl width={85} />
        <span className="ui-skel-controls">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} width={36} height={36} />)}</span>
        <span className="ui-skel-controls">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} width={36} height={36} />)}</span>
      </div>
      <div className="stats-table-layout"><div className="table-wrapper stats-scroll-region density-standard">
        <table className="data-table dense-stats-table">
          <thead>
            <tr className="stats-header-tier-1">
              <th className="pinned-col pinned-col-select" /><th className="pinned-col pinned-col-name" />
              {GROUPS.map((count, group) => <th key={group} colSpan={count + (group > 0 ? 1 : 0)} className="stats-group-th"><SkelText size="2xs" width={64} className="ui-skel-center" /></th>)}
            </tr>
            <tr className="stats-header-tier-2">
              <th className="pinned-col pinned-col-select" />
              <th className="pinned-col pinned-col-name"><Skeleton className="ui-skel-search" height={28} /></th>
              {GROUPS.map((count, group) => <Fragment key={group}>
                {group > 0 && <th className="stats-guide-cell" />}
                {Array.from({ length: count }, (_, index) => <th key={index} className="num"><SkelText size="2xs" width={28} className="ui-skel-center" /></th>)}
              </Fragment>)}
            </tr>
          </thead>
          <tbody className="stats-skeleton-body">
            {Array.from({ length: rows }, (_, row) => <tr key={row} className="stats-table-row stats-skeleton-row">
              <td className="pinned-col pinned-col-select"><Skeleton variant="circle" width={16} height={16} /></td>
              <td className="pinned-col pinned-col-name"><SkelPlayerCell index={row} /></td>
              {cells(row)}
            </tr>)}
          </tbody>
        </table>
      </div></div>
    </div>
    {rail && <aside className="stats-preview-rail">
      <SkelText size="sm" width={100} />
      <div className="ui-skel-rail-body">
        <SkelText size="2xs" width={90} />
        {Array.from({ length: 5 }, (_, index) => <span key={index} className="ui-skel-labeled"><Skeleton width={28} height={18} /><SkelText size="xs" width={96 + (index % 2) * 20} /></span>)}
        <SkelLines lines={2} size="xs" last="70%" />
      </div>
    </aside>}
  </div>;
}

/** The Stats page while it loads: header, what's new, help buttons, filter bar, preset tabs, then the table. */
export function StatsPageSkeleton() {
  return <section className="stats-workspace" role="status" aria-busy="true" aria-label="Loading Stats">
    <div className="workbench-content">
      <SkelHeader title={227} subtitle={null} />
      <SkelText size="md" width={340} className="stats-whats-new" />
      <SkelControls items={[185, 141, 100]} className="stats-help-row" />
      <SkelFilterBar fields={[176, 155, [50, 124], [49, 144]]} page={[102, 42, 43, 41, 40, 33, 133]} meta={[115]} />
      <div className="player-explorer-container">
        <div className="stats-preset-tabs-wrapper" aria-hidden="true">
          <SkelSegmented options={[72, 68, 60, 56, 72, 64, 88, 88, 80]} />
          <span className="ui-skel-labeled"><SkelText size="xs" width={79} /><SkelSegmented options={[64, 60, 64, 52]} /></span>
          <span className="ui-skel-controls"><SkelControl width={106} /><SkelControl width={100} /></span>
        </div>
        <StatsTableSkeleton />
      </div>
    </div>
  </section>;
}
