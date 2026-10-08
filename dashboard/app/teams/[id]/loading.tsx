import { Skeleton } from "@/components/ui/skeleton";

export default function TeamDetailLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="ui-skeleton-bar">
        <Skeleton width={140} height={28} />
        <Skeleton width={100} height={28} />
        <Skeleton width={120} height={28} />
      </div>

      {/* Team Hero */}
      <div className="ui-skeleton-hero">
        <div className="ui-skeleton-hero-avatar">
          <Skeleton variant="circle" width={80} height={80} />
        </div>
        <div className="ui-skeleton-hero-body">
          <Skeleton variant="text" width={260} height={32} />
          <div className="ui-skeleton-bar">
            <Skeleton width={100} height={24} />
            <Skeleton width={80} height={24} />
            <Skeleton width={120} height={24} />
          </div>
        </div>
      </div>

      {/* Four Factors Cards */}
      <div className="ui-skeleton-grid-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ui-skeleton-panel">
            <Skeleton variant="text" width={100} height={14} />
            <Skeleton variant="text" width={70} height={28} />
            <Skeleton variant="text" width={120} height={12} />
          </div>
        ))}
      </div>

      {/* Roster & Stats Panel */}
      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-tabs">
          <Skeleton width={90} height={32} />
          <Skeleton width={110} height={32} />
          <Skeleton width={100} height={32} />
        </div>

        <div className="ui-skeleton-table-head">
          <Skeleton width="30%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="25%" height={16} />
        </div>

        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="ui-skeleton-table-row">
            <Skeleton width="30%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="25%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
