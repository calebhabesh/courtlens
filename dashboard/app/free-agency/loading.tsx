import { Skeleton } from "@/components/ui/skeleton";

export default function FreeAgencyLoading() {
  return (
    <div className="finance-workspace" aria-busy="true" aria-live="polite">
      <div className="finance-heading">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={300} height={32} />
            <Skeleton variant="text" width={420} height={18} />
          </div>
        </div>
        <div className="ui-skeleton-bar">
          <Skeleton width={90} height={28} />
          <Skeleton width={100} height={28} />
        </div>
      </div>

      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-grid-4">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      </div>

      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-table-head">
          <Skeleton width="30%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="20%" height={16} />
          <Skeleton width="20%" height={16} />
        </div>

        {Array.from({ length: 10 }).map((_, i) => (
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
