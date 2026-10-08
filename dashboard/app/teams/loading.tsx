import { Skeleton } from "@/components/ui/skeleton";

export default function TeamsLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="page-header">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={320} height={32} />
            <Skeleton variant="text" width={560} height={18} />
          </div>
        </div>
      </div>

      <div className="ui-skeleton-bar">
        <Skeleton width={140} height={28} />
        <Skeleton width={120} height={28} />
        <Skeleton width={100} height={28} />
      </div>

      <div className="ui-skeleton-panel">
        <div className="ui-skeleton-bar">
          <Skeleton width={200} height={32} />
          <Skeleton width={120} height={32} />
          <Skeleton width={140} height={32} />
        </div>

        <div className="ui-skeleton-table-head">
          <Skeleton width="25%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
          <Skeleton width="12%" height={16} />
        </div>

        {Array.from({ length: 15 }).map((_, i) => (
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
