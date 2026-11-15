import { RookieTrackerSkeleton } from "@/components/draft-classes-research";
import { FeedSkeleton } from "@/components/stats-feed-ui";
import { SkelControl, SkelHeader, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Draft Classes: the hero and its scope line, then the section index beside the rookie tracker. */
export default function Loading() {
  return <div className="ui-page ui-page-research dc-shell" role="status" aria-busy="true" aria-label="Loading Draft Classes"><div className="rs-column dc-page">
    <SkelHeader align="hero" title={200} subtitle={560} />
    <div className="rs-intro" aria-hidden="true"><SkelText size="sm" width={300} className="ui-skel-center" /><div className="rs-intro-links"><SkelControl width={90} /><SkelControl width={80} /><SkelControl width={84} /></div></div>
    <div className="dc-layout" aria-hidden="true">
      <aside className="dc-aside"><div className="ui-skel-lines">{[120, 116, 104, 124, 112, 132, 84, 100].map((width, index) => <SkelText key={index} size="sm" width={width} className="ui-skel-index" />)}</div></aside>
      <div className="ui-skel-article"><section className="rs-section ui-skel-section-first">
        <div className="rs-section-head"><span className="rs-heading"><Skeleton width={20} height={20} /><SkelText size="2xl" width={220} /></span></div>
        <FeedSkeleton label="Loading the rookie tracker"><RookieTrackerSkeleton /></FeedSkeleton>
      </section></div>
    </div>
  </div></div>;
}
