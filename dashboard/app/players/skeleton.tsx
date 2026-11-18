import { SkelControl, SkelHeader, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Player Dashboard's loading state in its layout: centred header, season and team, the row of
 * leader cards, the search field and the dashed Add Player panel.
 */
export default function PlayersLoading() {
  return (
    <div className="ui-page ui-page-explorer" role="status" aria-busy="true" aria-label="Loading Player Dashboard">
      <div className="pd-page" aria-hidden="true">
        <SkelHeader align="center" title={260} subtitle={540} />
        <div className="pd-scope"><SkelControl width={161} /><SkelControl width={102} /></div>
        <section className="pd-carousel">
          <SkelText size="xs" width={308} className="ui-skel-center" />
          <div className="pd-marquee"><div className="pd-marquee-track"><div className="pd-marquee-group">
            {Array.from({ length: 9 }, (_, index) => <Skeleton key={index} width={148} height={196} className="ui-skel-card" />)}
          </div></div></div>
        </section>
        <div className="pd-search"><SkelControl width="100%" size="lg" /></div>
        <div className="pd-panels"><div className="pd-add"><Skeleton variant="circle" width={40} height={40} /><SkelText size="sm" width={72} /></div></div>
      </div>
    </div>
  );
}
