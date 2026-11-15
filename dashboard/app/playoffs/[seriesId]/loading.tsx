import { SkelControl, SkelFilterBar, SkelGrid, SkelSegmented, SkelText } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** One side of the series hero: logo, city, nickname, seed line and wins, centred. */
function HeroTeam() {
  return <div className="ps-hero-team ui-skel-header-center">
    <Skeleton variant="circle" width={112} height={112} />
    <SkelText size="xs" width={126} /><SkelText size="3xl" width={152} /><SkelText size="sm" width={116} /><SkelText size="3xl" width={28} />
  </div>;
}

/** A playoff series: back row, scope bar, the matchup hero, the games strip, two panels, then the stats table. */
export default function Loading() {
  return <PageShell template="board"><div className="playoffs-view-container ps-page" role="status" aria-busy="true" aria-label="Loading series">
    <div className="ps-top" aria-hidden="true"><SkelControl width={161} size="xs" /><SkelControl width={146} size="md" /></div>
    <SkelFilterBar fields={[[44, 92], [40, 90], [50, 124]]} meta={[73, 108]} />
    <section className="ps-hero" aria-hidden="true">
      <SkelText size="xs" width={160} className="ui-skel-center" />
      <div className="ps-hero-grid">
        <HeroTeam />
        <div className="ui-skel-header-center"><SkelText size="2xs" width={96} /><Skeleton variant="circle" width={40} height={40} /><SkelText size="md" width={170} /></div>
        <HeroTeam />
      </div>
      <SkelControl width={220} size="sm" />
    </section>
    <section className="player-glass ps-panel" aria-hidden="true"><SkelText size="xl" width={80} /><div className="ui-skel-controls">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} width={180} height={106} className="ui-skel-card" />)}</div></section>
    <div className="ps-pair" aria-hidden="true">{[0, 1].map(index => <section key={index} className="player-glass ps-panel"><SkelText size="xl" width={140} /><Skeleton height={220} /></section>)}</div>
    <div className="ps-switch"><SkelSegmented options={[76, 76]} size="md" /></div>
    <section className="player-glass ps-panel" aria-hidden="true"><SkelText size="xl" width={160} /><SkelGrid label="Series stats" rows={10} columns={12} density="compact" /></section>
  </div></PageShell>;
}
