import { SkelControls, SkelHeader, SkelText } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** One conference: title, then the dense table (a 40 px header and fifteen 36 px rows of rank, logo, name and twelve figures). */
function ConferenceSkeleton() {
  return <section className="ui-skel-standings">
    <SkelText size="lg" width={180} />
    <div className="ui-skel-dense-table">
      <div className="ui-skel-dense-row ui-skel-dense-head"><span />{Array.from({ length: 12 }, (_, index) => <SkelText key={index} size="2xs" width={18} className="ui-skel-center" />)}</div>
      {Array.from({ length: 15 }, (_, row) => <div key={row} className="ui-skel-dense-row">
        <span className="ui-skel-labeled"><SkelText size="xs" width={12} /><Skeleton variant="circle" width={18} height={18} /><SkelText size="xs" width={56 + (row * 11) % 24} /></span>
        {Array.from({ length: 12 }, (_, index) => <SkelText key={index} size="xs" width={(row + index) % 3 ? 18 : 24} className="ui-skel-center" />)}
      </div>)}
    </div>
  </section>;
}

/** Standings: header, the grouping and season controls, then both conference tables side by side. */
export default function Loading() {
  return <PageShell template="explorer" className="standings-page"><div className="standings-view" role="status" aria-busy="true" aria-label="Loading standings">
    <SkelHeader icon={false} title={220} subtitle={360} />
    <SkelControls items={[{ segmented: [52, 88, 64] }, 80]} size="md" className="standings-controls" />
    <div className="standings-grid" aria-hidden="true"><ConferenceSkeleton /><ConferenceSkeleton /></div>
  </div></PageShell>;
}
