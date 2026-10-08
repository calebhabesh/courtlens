import { Skeleton } from "@/components/ui/skeleton";

export default function AskLoading() {
  return (
    <div className="ask-page" aria-busy="true" aria-live="polite">
      <div className="ui-skeleton-layout">
        {/* Ask Top Context Bar */}
        <div className="ui-skeleton-bar">
          <Skeleton width={130} height={28} />
          <Skeleton width={110} height={28} />
          <Skeleton width={160} height={28} />
        </div>

        {/* Chat message stream skeleton */}
        <div className="ui-skeleton-panel">
          <div className="ui-skeleton-hero">
            <Skeleton variant="circle" width={32} height={32} />
            <div className="ui-skeleton-hero-body">
              <Skeleton variant="text" width={140} height={16} />
              <Skeleton variant="text" width="70%" height={16} />
            </div>
          </div>

          <div className="ui-skeleton-hero">
            <Skeleton variant="circle" width={32} height={32} />
            <div className="ui-skeleton-hero-body">
              <Skeleton variant="text" width={180} height={16} />
              <Skeleton variant="text" width="90%" height={16} />
              <Skeleton variant="text" width="60%" height={16} />
            </div>
          </div>
        </div>

        {/* Input prompt tray skeleton */}
        <div className="ui-skeleton-bar">
          <Skeleton width="85%" height={44} />
          <Skeleton width={80} height={44} />
        </div>
      </div>
    </div>
  );
}
