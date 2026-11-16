import { SkelControl, SkelFilterBar, SkelGrid, SkelHeader, SkelLines, SkelText, SkelTiles } from "./ui/content-skeletons";
import { Skeleton } from "./ui/skeleton";

/** Case Studies while it loads: header and actions, the case tabs, three stint tiles, the case hero, evidence table and guarantees. */
export function CaseStudiesSkeleton() {
  return <div className="ui-page ui-page-research research-view case-studies-view" role="status" aria-busy="true" aria-label="Loading Case Studies">
    <SkelHeader icon={false} title={144} subtitle={420} actions={[140, 114]} />
    <SkelFilterBar fields={[300]} modes={[[150, 160, 170]]} meta={[108]} className="is-fixed-scope" />
    <div className="ui-research" aria-hidden="true">
      <SkelTiles count={3} className="ui-findings" />
      <div className="ui-research-body">
        <section className="panel research-section case-study-hero">
          <span className="ui-skel-labeled"><Skeleton variant="circle" width={80} height={80} /><span className="ui-skel-identity"><SkelText size="lg" width={120} /><SkelText size="xs" width={80} /></span></span>
          <div className="case-study-heading"><SkelText size="lg" width={320} /><SkelText size="sm" width={420} /></div>
          <div className="research-result-actions"><SkelControl width={145} size="lg" /><SkelControl width={162} size="lg" /></div>
        </section>
        <SkelGrid label="Observed evidence" rows={3} lead="text" columns={9} density="compact" />
        <SkelText size="sm" width={300} />
        <section className="panel research-section"><SkelText size="lg" width={110} /><SkelLines lines={5} size="sm" last="50%" className="ui-skel-measure" /></section>
      </div>
    </div>
  </div>;
}
