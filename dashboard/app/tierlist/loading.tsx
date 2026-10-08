import { Skeleton } from "@/components/ui/skeleton";

export default function TierListLoading() {
  return (
    <div className="workbench-content" aria-busy="true" aria-live="polite">
      <div className="page-header">
        <div>
          <div className="ui-skeleton-header">
            <Skeleton variant="text" width={240} height={32} />
            <Skeleton variant="text" width={480} height={18} />
          </div>
        </div>
      </div>

      <div className="ui-skeleton-bar">
        <Skeleton width={100} height={32} />
        <Skeleton width={100} height={32} />
        <Skeleton width={120} height={32} />
      </div>

      {/* Tier rows */}
      <div className="ui-skeleton-layout">
        {["S", "A", "B", "C", "D"].map((tier) => (
          <div key={tier} className="ui-skeleton-hero">
            <Skeleton width={48} height={48} />
            <div className="ui-skeleton-bar">
              <Skeleton width={120} height={32} />
              <Skeleton width={140} height={32} />
              <Skeleton width={110} height={32} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
