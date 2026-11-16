"use client";

import type { CSSProperties } from "react";
import { SkelControl, SkelLines, SkelText } from "./ui/content-skeletons";
import { PageShell } from "./ui/page-shell";
import { Skeleton } from "./ui/skeleton";

/*
 * Live's loading states in the board's and game page's own classes: the date strip, game cards,
 * the game banner, tabs and the three summary columns.
 */

function CardTeam() {
  return <span className="live-card-team">
    <span className="ui-skel-labeled"><Skeleton variant="circle" width={32} height={32} /><span className="ui-skel-identity"><SkelText size="md" width={56} /><SkelText size="2xs" width={36} /></span></span>
    <SkelText size="xl" width={40} />
  </span>;
}

/** The slate's game cards. */
export function LiveCardsSkeleton({ count = 8 }: { count?: number }) {
  return <section aria-hidden="true"><ol className="live-grid">{Array.from({ length: count }, (_, index) => <li key={index}><article className="live-card">
    <span className="live-card-head"><SkelText size="xs" width={48} /><SkelText size="xs" width={32} /></span>
    <CardTeam />
    <CardTeam />
    <span className="live-card-call"><SkelText size="xs" width={160} /></span>
  </article></li>)}</ol></section>;
}

/** The board's date strip with its picker, and the hotkey tip. */
function StripSkeleton() {
  return <>
    <div className="live-strip-row" aria-hidden="true">
      <div className="live-strip"><ol className="live-strip-days">{Array.from({ length: 7 }, (_, index) => <li key={index}><Skeleton width={52} height={56} /></li>)}</ol></div>
      <span className="live-strip-picker"><SkelControl width={123} size="lg" /></span>
    </div>
    <div className="live-tip-row" aria-hidden="true"><SkelControl width={435} size="xs" /></div>
  </>;
}

/** One banner side in the real order and classes (logo, name, score); `data-side` places them as the banner does. */
function BannerTeam({ side }: { side: "away" | "home" }) {
  return <div className="live-banner-team" data-side={side}>
    <span className="live-banner-logo"><Skeleton variant="circle" width={64} height={64} /></span>
    <span className="live-banner-name"><SkelText size="lg" width={150} /><SkelText size="xs" width={80} /></span>
    <span className="live-banner-score"><SkelText size="3xl" width={60} /></span>
  </div>;
}

/** Neutral team colours: the banner and accents draw from these variables, so the placeholder keeps the banner's surface. */
const NEUTRAL_TEAMS = { "--live-away": "var(--color-text-secondary)", "--live-home": "var(--color-text-secondary)", "--live-away-brand": "transparent", "--live-home-brand": "transparent" } as CSSProperties;

/** A summary panel: its heading, then rows. */
function PanelSkeleton({ title, rows }: { title: number; rows: number }) {
  return <section className="live-panel">
    <header className="live-panel-head"><SkelText size="xl" width={title} /></header>
    {Array.from({ length: rows }, (_, index) => <span key={index} className="ui-skel-labeled ui-skel-row"><Skeleton variant="circle" width={36} height={36} /><span className="ui-skel-identity"><SkelText size="sm" width="60%" /><SkelText size="2xs" width="40%" /></span><SkelText size="xl" width={28} /></span>)}
  </section>;
}

/** The game page: banner, tabs and the three summary columns. */
export function LiveGameSkeleton() {
  return <div className="live-game" style={NEUTRAL_TEAMS} aria-hidden="true">
    <header className="live-banner">
      <SkelControl width={109} />
      <div className="live-banner-board">
        <BannerTeam side="away" />
        <div className="live-banner-center"><SkelText size="sm" width={40} className="ui-skel-center" /><SkelLines lines={3} size="2xs" /></div>
        <BannerTeam side="home" />
      </div>
    </header>
    <div className="ui-tabs live-tabs">
      <div className="live-tabs-bar"><div className="ui-tabs-list">{[61, 62, 79, 64].map((width, index) => <span key={index} className="ui-skel-tab"><SkelText size="sm" width={width} /></span>)}</div></div>
      <div className="live-summary">
        <div className="live-col"><PanelSkeleton title={169} rows={6} /></div>
        <div className="live-col"><section className="live-panel"><header className="live-panel-head"><SkelText size="xl" width={90} /></header><span className="ui-skel-labeled"><Skeleton width={88} height={52} /><SkelLines lines={4} size="sm" /></span></section>
          <section className="live-panel"><header className="live-panel-head"><SkelText size="xl" width={220} /></header><Skeleton height={220} /></section></div>
        <div className="live-col"><PanelSkeleton title={120} rows={4} /><PanelSkeleton title={180} rows={4} /></div>
      </div>
    </div>
  </div>;
}

/** Route loading for the board. */
export function LivePageSkeleton() {
  return <PageShell template="board" className="live-page" data-view="board" role="status" aria-busy="true" aria-label="Loading games">
    <StripSkeleton />
    <LiveCardsSkeleton />
  </PageShell>;
}

/** Route loading for one game. */
export function LiveGamePageSkeleton() {
  return <PageShell template="board" className="live-page" data-view="game" role="status" aria-busy="true" aria-label="Loading game">
    <LiveGameSkeleton />
  </PageShell>;
}
