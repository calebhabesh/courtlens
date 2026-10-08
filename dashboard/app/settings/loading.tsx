import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="page-header">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={200} height={32} />
            <Skeleton variant="text" width={480} height={18} />
          </div>
        </div>
      </div>

      <div className="ui-skeleton-panel">
        <Skeleton variant="text" width={180} height={20} />
        <Skeleton variant="text" width="60%" height={14} />
        <div className="ui-skeleton-bar">
          <Skeleton width={120} height={32} />
          <Skeleton width={140} height={32} />
        </div>
      </div>

      <div className="ui-skeleton-panel">
        <Skeleton variant="text" width={220} height={20} />
        <Skeleton variant="text" width="70%" height={14} />
        <div className="ui-skeleton-layout">
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      </div>
    </div>
  );
}
