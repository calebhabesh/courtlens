import { SkelControl, SkelHeader, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Player Showcase: centred header, both consoles, the season banner and timeline, then the leader cards. */
export default function ShowcaseLoading() {
  return <div className="sc-page" role="status" aria-busy="true" aria-label="Loading Player Showcase">
    <SkelHeader align="center" title={253} subtitle={414} />
    <div className="sc-consoles" aria-hidden="true">
      <section className="sc-console sc-console-scope">{[180, 161, 159, 180, 161, 159, 180, 161, 159].map((width, index) => <SkelControl key={index} width={width} size={index === 3 ? "lg" : "sm"} />)}</section>
      <section className="sc-console sc-console-order">
        <SkelText size="sm" width={47} /><SkelControl width={231} /><SkelText size="sm" width={42} /><SkelControl width={110} /><span /><SkelControl width={85} /><span /><SkelControl width={180} />
      </section>
    </div>
    <Skeleton height={58} className="ui-skel-card" />
    <div className="sc-timeline" aria-hidden="true">{Array.from({ length: 81 }, (_, index) => <Skeleton key={index} width={33} height={28} />)}</div>
    <ol className="sc-grid" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <li key={index} className="sc-cell"><Skeleton height={318} className="ui-skel-card" /></li>)}</ol>
  </div>;
}
