import { Skeleton } from "@/components/ui/skeleton";

export default function RootLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="ui-skeleton-header">
        <Skeleton variant="text" width={260} height={32} />
        <Skeleton variant="text" width={480} height={18} />
      </div>

      <div className="ui-skeleton-bar">
        <Skeleton width={120} height={28} />
        <Skeleton width={160} height={28} />
        <Skeleton width={140} height={28} />
      </div>

      <div className="ui-skeleton-panel">
        <Skeleton variant="text" width={180} height={20} />
        <div className="ui-skeleton-table-head">
          <Skeleton width="25%" height={16} />
          <Skeleton width="20%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="15%" height={16} />
          <Skeleton width="15%" height={16} />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="ui-skeleton-table-row">
            <Skeleton width="25%" height={16} />
            <Skeleton width="20%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="15%" height={16} />
            <Skeleton width="15%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
