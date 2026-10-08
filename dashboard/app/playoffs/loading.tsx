import { Skeleton } from "@/components/ui/skeleton";

export default function PlayoffsLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="ui-skeleton-bar">
        <Skeleton width={140} height={28} />
        <Skeleton width={110} height={28} />
        <Skeleton width={150} height={28} />
      </div>

      <div className="page-header">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={320} height={32} />
            <Skeleton variant="text" width={540} height={18} />
          </div>
        </div>
      </div>

      {/* Bracket Rounds Grid */}
      <div className="ui-skeleton-grid-4">
        {Array.from({ length: 4 }).map((_, roundIdx) => (
          <div key={roundIdx} className="ui-skeleton-layout">
            <Skeleton variant="text" width={120} height={20} />
            {Array.from({ length: Math.max(1, 4 - roundIdx) }).map((_, seriesIdx) => (
              <div key={seriesIdx} className="ui-skeleton-panel">
                <div className="ui-skeleton-bar">
                  <Skeleton width={60} height={16} />
                  <Skeleton width={50} height={16} />
                </div>
                <div className="ui-skeleton-table-row">
                  <Skeleton variant="circle" width={20} height={20} />
                  <Skeleton width={100} height={16} />
                  <Skeleton width={30} height={18} />
                </div>
                <div className="ui-skeleton-table-row">
                  <Skeleton variant="circle" width={20} height={20} />
                  <Skeleton width={100} height={16} />
                  <Skeleton width={30} height={18} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
