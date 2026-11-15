import { SkelControl, SkelFilterBar, SkelHeader, SkelLines, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Saved Investigations: header, the retained-findings bar, then the finding cards two to a row. */
export default function InvestigationsLoading() {
  return <div className="ui-page ui-page-research research-view investigations-view" role="status" aria-busy="true" aria-label="Loading Saved Investigations">
    <SkelHeader icon={false} title={227} subtitle={280} actions={[171]} />
    <SkelFilterBar fields={[320]} meta={[130]} className="is-fixed-scope" />
    <section className="pc12-public-findings" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <article key={index} className="panel pc12-public-finding">
      <span className="ui-skel-labeled"><Skeleton variant="circle" width={32} height={32} /><span className="ui-skel-identity"><SkelText size="sm" width={100} /><SkelText size="2xs" width={32} /></span></span>
      <SkelText size="lg" width="56%" />
      <SkelText size="md" width="72%" />
      <SkelLines lines={2} size="sm" last="50%" />
      <span className="ui-skel-controls"><SkelControl width={104} size="md" /><SkelControl width={100} size="md" /></span>
    </article>)}</section>
  </div>;
}
