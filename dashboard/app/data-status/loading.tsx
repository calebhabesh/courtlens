import { Skeleton } from "@/components/ui/skeleton";

export default function DataStatusLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="page-header">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={280} height={32} />
            <Skeleton variant="text" width={520} height={18} />
          </div>
        </div>
      </div>

      {/* Release cards */}
      <div className="ui-skeleton-grid-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="ui-skeleton-panel">
            <Skeleton variant="text" width={140} height={18} />
            <Skeleton variant="text" width="90%" height={14} />
            <Skeleton variant="text" width="60%" height={14} />
          </div>
        ))}
      </div>

      {/* Worker jobs table */}
      <div className="ui-skeleton-panel">
        <Skeleton variant="text" width={200} height={22} />
        <div className="ui-skeleton-table-head">
          <Skeleton width="20%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="20%" height={16} />
          <Skeleton width="25%" height={16} />
          <Skeleton width="20%" height={16} />
        </div>

        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ui-skeleton-table-row">
            <Skeleton width="20%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="20%" height={16} />
            <Skeleton width="25%" height={16} />
            <Skeleton width="20%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
