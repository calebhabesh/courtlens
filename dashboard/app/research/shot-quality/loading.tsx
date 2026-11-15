import { SkelControl, SkelGrid, SkelHeader, SkelSegmented } from "@/components/ui/content-skeletons";

/** Shot Quality: the hero, its four tabs, the table controls and the player table. */
export default function Loading() {
  return <div className="ui-page ui-page-research sq-shell" role="status" aria-busy="true" aria-label="Loading Shot Quality"><div className="rs-column sq-page">
    <SkelHeader align="hero" title={180} subtitle={760} />
    <div className="ui-skel-controls" data-align="center" aria-hidden="true"><SkelSegmented options={[120, 112, 72, 72]} size="md" /></div>
    <section className="sq-board-section" aria-hidden="true">
      <div className="ui-skel-chart-card"><div className="ui-skel-controls"><SkelControl width={159} size="lg" /><SkelControl width={120} size="md" /><SkelControl width={88} size="md" /><SkelControl width={130} size="md" /><SkelControl width={130} size="md" /></div><SkelSegmented options={[80, 80, 92]} /></div>
      <SkelGrid label="Shot-making" rows={12} search groupSizes={[4, 1]} />
    </section>
  </div></div>;
}
