import { FreeAgencySkeleton } from "@/components/free-agency-view";
import { SkelControl, SkelLines, SkelText } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";

/** The Free Agency Tracker's loading state: eyebrow, title and source line, freshness, then the tracker body. */
export default function Loading() {
  return <PageShell template="explorer" className="fa-shell"><div className="fa-page" role="status" aria-busy="true" aria-label="Loading free agency">
    <header className="fa-header" aria-hidden="true">
      <div><SkelText size="xs" width={140} /><SkelText size="2xl" width={220} /><SkelLines lines={2} size="sm" last="70%" /></div>
      <div className="fa-freshness"><SkelControl width={132} size="xs" /><SkelText size="sm" width={150} /><SkelText size="sm" width={88} /><SkelText size="sm" width={80} /><SkelControl width={108} size="xs" /></div>
    </header>
    <FreeAgencySkeleton />
  </div></PageShell>;
}
