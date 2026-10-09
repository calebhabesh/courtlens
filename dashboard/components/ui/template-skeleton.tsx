import type { PageTemplate } from "./page-shell";
import { Skeleton } from "./skeleton";

function Rows({ count, height = 40 }: { count: number; height?: number }) {
  return <>{Array.from({ length: count }, (_, index) => <Skeleton key={index} height={height} />)}</>;
}

function Body({ template }: { template: PageTemplate }) {
  switch (template) {
    case "explorer":
      return <div className="ui-skeleton-table"><Skeleton height={40} /><Rows count={10} height={48} /></div>;
    case "profile":
      return (
        <div className="ui-profile">
          <div className="ui-skeleton-hero"><Skeleton variant="circle" width={96} height={96} /><div className="ui-skeleton-stack"><Skeleton variant="text" width="40%" height={28} /><Skeleton variant="text" width="25%" /></div></div>
          <div className="ui-skeleton-tiles"><Rows count={4} height={88} /></div>
          <Skeleton height={320} />
        </div>
      );
    case "compare":
      return (
        <div className="ui-compare">
          <div className="ui-compare-sides"><Skeleton height={120} /><Skeleton height={120} /></div>
          <div className="ui-skeleton-stack"><Rows count={8} height={36} /></div>
        </div>
      );
    case "board":
      return (
        <div className="ui-board">
          <div className="ui-board-main"><Skeleton height={480} /></div>
          <aside className="ui-board-rail ui-skeleton-stack"><Skeleton height={64} /><Rows count={6} height={40} /></aside>
        </div>
      );
    case "research":
      return (
        <div className="ui-research">
          <div className="ui-findings"><Rows count={3} height={88} /></div>
          <Skeleton height={360} />
        </div>
      );
  }
}

/** Loading state shaped like the final layout of each template (D11), never a blank area. */
export function TemplateSkeleton({ template }: { template: PageTemplate }) {
  return (
    <div className={`ui-page ui-page-${template}`} aria-busy="true" aria-label="Loading">
      <div className="ui-skeleton-header"><Skeleton variant="text" width={240} height={32} /><Skeleton variant="text" width={420} /></div>
      <div className="ui-skeleton-filters"><Rows count={4} height={40} /></div>
      <Body template={template} />
    </div>
  );
}
