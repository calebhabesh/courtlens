import { StatsTableSkeleton } from "@/components/stats-page-skeleton";
import { SkelControl, SkelFilterBar, SkelGrid, SkelSegmented, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The team page's loading state in its layout: back button, logo beside the name, the twelve rank
 * tiles, the filter bar and roster table, then the standings and schedule sections.
 */
export default function Loading() {
  return (
    <div className="ui-page ui-page-profile team-profile-page" role="status" aria-busy="true" aria-label="Loading team">
      <section className="stats-workspace" aria-hidden="true">
        <div className="workbench-content">
          <div className="team-profile-top">
            <div className="back-button-row"><SkelControl width={155} size="xs" /></div>
            <div className="team-profile-head">
              <Skeleton variant="circle" width={72} height={72} />
              <header className="ui-page-header team-profile-title">
                <div className="ui-page-header-title-row"><SkelText size="2xl" width={200} /><div className="ui-page-header-actions"><SkelControl width={142} /></div></div>
                <SkelText size="sm" width={320} />
              </header>
            </div>
            <section className="team-ranks"><ul className="team-ranks-list">{Array.from({ length: 12 }, (_, index) => <li key={index}><span className="team-rank-tile">
              <SkelText size="xs" width={64 + (index % 3) * 16} /><SkelText size="xl" width={72} /><SkelText size="xs" width={80} />
            </span></li>)}</ul></section>
          </div>
          <SkelFilterBar fields={[176, 155, [50, 124], [49, 144]]} page={[42, 43, 41, 40, 33]} meta={[115]} />
          <div className="player-explorer-container">
            <div className="stats-preset-tabs-wrapper"><SkelSegmented options={[72, 68, 60, 56, 72, 64, 88, 88, 80]} /></div>
            <StatsTableSkeleton rows={8} />
          </div>
        </div>
      </section>
      <div className="team-profile-sections" aria-hidden="true">
        {[3, 5].map((rows, index) => <section key={index} className="player-open-section player-glass team-profile-section">
          <header className="player-open-heading"><SkelText size="xl" width={index ? 160 : 200} /></header>
          <SkelGrid label="Team section" rows={rows} lead="team" columns={8} density="compact" />
        </section>)}
      </div>
    </div>
  );
}
