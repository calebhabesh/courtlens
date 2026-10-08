import { Skeleton } from "@/components/ui/skeleton";

export default function LiveGameLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      {/* Back button and breadcrumb */}
      <div className="ui-skeleton-bar">
        <Skeleton width={120} height={28} />
        <Skeleton width={180} height={28} />
      </div>

      {/* Game scoreboard banner */}
      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-grid-2">
          <div className="ui-skeleton-hero">
            <Skeleton variant="circle" width={60} height={60} />
            <div className="ui-skeleton-hero-body">
              <Skeleton variant="text" width={160} height={26} />
              <Skeleton variant="text" width={60} height={32} />
            </div>
          </div>
          <div className="ui-skeleton-hero">
            <Skeleton variant="circle" width={60} height={60} />
            <div className="ui-skeleton-hero-body">
              <Skeleton variant="text" width={160} height={26} />
              <Skeleton variant="text" width={60} height={32} />
            </div>
          </div>
        </div>
      </div>

      {/* Box scores table */}
      <div className="ui-skeleton-panel">
        <Skeleton variant="text" width={180} height={20} />
        <div className="ui-skeleton-table-head">
          <Skeleton width="25%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="ui-skeleton-table-row">
            <Skeleton width="25%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="12%" height={16} />
            <Skeleton width="12%" height={16} />
            <Skeleton width="12%" height={16} />
            <Skeleton width="12%" height={16} />
            <Skeleton width="12%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
