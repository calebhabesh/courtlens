import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerProfileLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      {/* Context bar skeleton */}
      <div className="ui-skeleton-bar">
        <Skeleton width={140} height={28} />
        <Skeleton width={110} height={28} />
        <Skeleton width={160} height={28} />
      </div>

      {/* Player Hero Banner */}
      <div className="ui-skeleton-hero">
        <div className="ui-skeleton-hero-avatar">
          <Skeleton variant="circle" width={96} height={96} />
        </div>
        <div className="ui-skeleton-hero-body">
          <Skeleton variant="text" width={280} height={32} />
          <div className="ui-skeleton-bar">
            <Skeleton width={90} height={24} />
            <Skeleton width={120} height={24} />
            <Skeleton width={80} height={24} />
          </div>
        </div>
      </div>

      {/* Four Factors / Key Stats Cards */}
      <div className="ui-skeleton-grid-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ui-skeleton-panel">
            <Skeleton variant="text" width={80} height={14} />
            <Skeleton variant="text" width={60} height={28} />
            <Skeleton variant="text" width={100} height={12} />
          </div>
        ))}
      </div>

      {/* Tabs Row */}
      <div className="ui-skeleton-tabs">
        <Skeleton width={100} height={32} />
        <Skeleton width={100} height={32} />
        <Skeleton width={100} height={32} />
        <Skeleton width={120} height={32} />
      </div>

      {/* Content Chart / Table Panel */}
      <div className="ui-skeleton-panel">
        <Skeleton variant="text" width={220} height={22} />
        <Skeleton width="100%" height={260} />
      </div>
    </div>
  );
}
