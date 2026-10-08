import { Skeleton } from "@/components/ui/skeleton";

export default function ForecastsLoading() {
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

      {/* Promotion status callout */}
      <div className="ui-skeleton-panel">
        <Skeleton variant="text" width={220} height={20} />
        <Skeleton variant="text" width="80%" height={16} />
      </div>

      {/* Gates grid */}
      <div className="ui-skeleton-grid-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="ui-skeleton-panel">
            <Skeleton variant="text" width={140} height={18} />
            <Skeleton width="100%" height={24} />
            <Skeleton variant="text" width={100} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}
