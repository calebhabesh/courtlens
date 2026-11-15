import { SkelControl, SkelFilterBar, SkelGrid, SkelSegmented, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The player page's loading state in its own layout: back button, photo beside the name, team line,
 * facts and honours, the season filter bar, six summary tiles, the tabs and the career table.
 */
export default function PlayerProfileLoading() {
  return (
    <div className="ui-page ui-page-profile player-detail-container" role="status" aria-busy="true" aria-label="Loading player">
      <div className="player-bio-header" aria-hidden="true">
        <div className="back-button-row"><SkelControl width={219} size="xs" /></div>
        <div className="player-bio-main">
          <span className="player-bio-photo"><Skeleton className="ui-skel-fill" /></span>
          <span className="player-bio-divider" />
          <div className="player-bio-who">
            <header className="ui-page-header player-bio-name"><div className="ui-page-header-title-row"><SkelText size="3xl" width={220} /></div></header>
            <div className="player-bio-identity"><span className="ui-skel-labeled"><Skeleton variant="circle" width={36} height={36} /><SkelText size="md" width={110} /><SkelText size="sm" width={180} /></span></div>
            <dl className="player-bio-facts">{[112, 87, 200, 73].map((width, index) => <div key={index}><dt><SkelText size="2xs" width={44} /></dt><dd><SkelText size="md" width={width} /><SkelText size="xs" width={width * 0.8} /></dd></div>)}</dl>
            <ul className="player-bio-honours">{[116, 59, 130, 72, 112, 96, 84].map((width, index) => <li key={index}><Skeleton width={width} height={20} /></li>)}</ul>
          </div>
          <div className="player-bio-actions"><SkelControl width={32} /><SkelControl width={32} /><SkelControl width={32} /><SkelControl width={90} /></div>
        </div>
      </div>
      <SkelFilterBar fields={[[44, 92], [40, 124], [50, 124], [49, 144]]} meta={[80, 115]} />
      <div className="ui-profile" aria-hidden="true">
        <div className="ui-profile-hero"><section className="player-season-summary">
          <div className="player-season-summary-heading"><SkelText size="md" width={297} /></div>
          <dl className="player-summary-strip">{Array.from({ length: 6 }, (_, index) => <div key={index} className="player-summary-stat player-glass">
            <SkelText size="xs" width={40} /><SkelText size="2xl" width={72} /><Skeleton className="ui-skel-bar" height={4} /><SkelText size="xs" width={72} />
          </div>)}</dl>
        </section></div>
        <div className="ui-profile-tabs"><div className="ui-tabs-list">{[56, 64, 56].map((width, index) => <span key={index} className="ui-skel-tab"><SkelText size="sm" width={width} /></span>)}</div></div>
        <div className="ui-profile-body">
          <div className="player-career-controls"><SkelSegmented options={[72, 68, 60, 56, 72, 64, 88, 88, 80]} /></div>
          <SkelGrid label="Career" rows={8} lead="text" leadLabel="Year" columns={18} density="compact" />
        </div>
      </div>
    </div>
  );
}
