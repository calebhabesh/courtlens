import { Skeleton } from "@/components/ui/skeleton";

export default function CompareLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="page-header">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={220} height={32} />
            <Skeleton variant="text" width={500} height={18} />
          </div>
        </div>
      </div>

      {/* Dual Selector Bar */}
      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-grid-2">
          <div className="ui-skeleton-hero">
            <Skeleton variant="circle" width={64} height={64} />
            <div className="ui-skeleton-hero-body">
              <Skeleton variant="text" width={180} height={24} />
              <Skeleton variant="text" width={120} height={16} />
            </div>
          </div>
          <div className="ui-skeleton-hero">
            <Skeleton variant="circle" width={64} height={64} />
            <div className="ui-skeleton-hero-body">
              <Skeleton variant="text" width={180} height={24} />
              <Skeleton variant="text" width={120} height={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Metrics Grid */}
      <div className="ui-skeleton-grid-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ui-skeleton-panel">
            <Skeleton variant="text" width={100} height={14} />
            <div className="ui-skeleton-bar">
              <Skeleton width="45%" height={24} />
              <Skeleton width="10%" height={16} />
              <Skeleton width="45%" height={24} />
            </div>
          </div>
        ))}
      </div>

      {/* Detailed comparison table */}
      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-table-head">
          <Skeleton width="35%" height={16} />
          <Skeleton width="30%" height={16} />
          <Skeleton width="35%" height={16} />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="ui-skeleton-table-row">
            <Skeleton width="35%" height={16} />
            <Skeleton width="30%" height={16} />
            <Skeleton width="35%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
