import { Skeleton } from "@/components/ui/skeleton";

export default function LiveLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      {/* Date navigation bar */}
      <div className="ui-skeleton-bar">
        <Skeleton width={110} height={28} />
        <Skeleton width={140} height={28} />
        <Skeleton width={110} height={28} />
        <Skeleton width={180} height={28} />
      </div>

      {/* Observation status badge */}
      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-bar">
          <Skeleton variant="circle" width={10} height={10} />
          <Skeleton variant="text" width={220} height={16} />
          <Skeleton variant="text" width={180} height={14} />
        </div>
      </div>

      {/* Live games tiles grid */}
      <div className="ui-skeleton-grid-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ui-skeleton-panel">
            <div className="ui-skeleton-bar">
              <Skeleton width={80} height={18} />
              <Skeleton width={60} height={18} />
            </div>
            <div className="ui-skeleton-table-row">
              <Skeleton variant="circle" width={24} height={24} />
              <Skeleton width={100} height={18} />
              <Skeleton width={40} height={22} />
            </div>
            <div className="ui-skeleton-table-row">
              <Skeleton variant="circle" width={24} height={24} />
              <Skeleton width={100} height={18} />
              <Skeleton width={40} height={22} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
