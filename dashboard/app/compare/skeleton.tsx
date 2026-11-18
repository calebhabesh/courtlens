import { Skeleton } from "@/components/ui/skeleton";

/** Rows per group in the default Overall view: counting, efficiency, availability. */
const GROUPS = [6, 3, 3];

/**
 * Compare's loading state in the duel card's own layout (DL Loading: no layout shift): the same
 * centered column, card, portrait slots, controls and mirrored pill · value · label · value · pill
 * rows, so the card fills in where its skeleton stood.
 */
export default function CompareLoading() {
  const slot = <div className="pvp-slot">
    <span className="pvp-photo-frame"><Skeleton className="pvp-skeleton-photo" height="auto" /></span>
    <Skeleton variant="text" width={132} height={16} />
    <Skeleton variant="text" width={108} />
    <Skeleton width={96} height={28} />
  </div>;
  return (
    <div className="ui-page ui-page-compare fo11-player-comparison" role="status" aria-busy="true" aria-label="Loading comparison">
      <div className="pvp">
        <div className="pvp-skeleton-header">
          <Skeleton width={300} height={32} />
          <Skeleton width={260} height={14} />
        </div>
        <div className="pvp-scope"><div className="pvp-skeleton-scope">
          {[148, 168, 136, 160, 120, 128].map((width, index) => <Skeleton key={index} width={width} height={32} />)}
        </div></div>
        <div className="pvp-column">
          <section className="pvp-card">
            <div className="pvp-players">{slot}<span className="pvp-pair-actions" />{slot}</div>
            <div className="pvp-controls"><Skeleton height={28} /><Skeleton height={28} /></div>
            <div className="pvp-skeleton-rows">
              {GROUPS.map((count, group) => <div key={group} className="pvp-skeleton-group">
                <Skeleton variant="text" width={72} height={10} className="pvp-skeleton-group-label" />
                {Array.from({ length: count }, (_, row) => {
                  // The leader's pill sits on one side only, as on the card.
                  const pill = (side: number) => (row + group) % 2 === side ? <Skeleton width={52} height={20} className="pvp-skeleton-pill" /> : <span />;
                  return <div key={row} className="pvp-skeleton-row">
                    {pill(0)}
                    <Skeleton variant="text" width={40} height={16} />
                    <Skeleton variant="text" width={64} height={12} />
                    <Skeleton variant="text" width={40} height={16} />
                    {pill(1)}
                  </div>;
                })}
              </div>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
