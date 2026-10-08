import { Skeleton } from "@/components/ui/skeleton";

export default function WowyLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="page-header">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={260} height={32} />
            <Skeleton variant="text" width={480} height={18} />
          </div>
        </div>
      </div>

      {/* Scope Controls */}
      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-bar">
          <Skeleton width={120} height={32} />
          <Skeleton width={180} height={32} />
          <Skeleton width={140} height={32} />
          <Skeleton width={100} height={32} />
        </div>
      </div>

      {/* Results Table Panel */}
      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-table-head">
          <Skeleton width="30%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="20%" height={16} />
          <Skeleton width="20%" height={16} />
        </div>

        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="ui-skeleton-table-row">
            <Skeleton width="30%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="20%" height={16} />
            <Skeleton width="20%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
