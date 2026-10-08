import { Skeleton } from "@/components/ui/skeleton";

export default function InvestigationsLoading() {
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

      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-table-head">
          <Skeleton width="40%" height={16} />
          <Skeleton width="20%" height={16} />
          <Skeleton width="20%" height={16} />
          <Skeleton width="20%" height={16} />
        </div>

        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="ui-skeleton-table-row">
            <Skeleton width="40%" height={16} />
            <Skeleton width="20%" height={16} />
            <Skeleton width="20%" height={16} />
            <Skeleton width="20%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
