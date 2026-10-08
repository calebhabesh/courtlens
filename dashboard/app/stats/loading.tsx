import { Skeleton } from "@/components/ui/skeleton";

export default function StatsLoading() {
  return (
    <section className="stats-workspace" aria-busy="true" aria-live="polite">
      <div className="workbench-content">
        <div className="page-header">
          <div>
            <div className="ui-skeleton-header">
              <Skeleton variant="text" width={280} height={32} />
              <Skeleton variant="text" width={520} height={18} />
            </div>
          </div>
        </div>

        {/* Context bar skeleton */}
        <div className="context-bar">
          <div className="ui-skeleton-bar">
            <Skeleton width={140} height={28} />
            <Skeleton width={100} height={28} />
            <Skeleton width={120} height={28} />
            <Skeleton width={180} height={28} />
          </div>
        </div>

        {/* Stats controls and Table */}
        <div className="ui-skeleton-panel">
          <div className="ui-skeleton-bar">
            <Skeleton width={240} height={32} />
            <Skeleton width={110} height={32} />
            <Skeleton width={110} height={32} />
            <Skeleton width={90} height={32} />
          </div>

          <div className="ui-skeleton-table-head">
            <Skeleton width="22%" height={16} />
            <Skeleton width="10%" height={16} />
            <Skeleton width="8%" height={16} />
            <Skeleton width="8%" height={16} />
            <Skeleton width="8%" height={16} />
            <Skeleton width="8%" height={16} />
            <Skeleton width="8%" height={16} />
            <Skeleton width="8%" height={16} />
            <Skeleton width="10%" height={16} />
            <Skeleton width="10%" height={16} />
          </div>

          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="ui-skeleton-table-row">
              <Skeleton width="22%" height={16} />
              <Skeleton width="10%" height={16} />
              <Skeleton width="8%" height={16} />
              <Skeleton width="8%" height={16} />
              <Skeleton width="8%" height={16} />
              <Skeleton width="8%" height={16} />
              <Skeleton width="8%" height={16} />
              <Skeleton width="8%" height={16} />
              <Skeleton width="10%" height={16} />
              <Skeleton width="10%" height={16} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
