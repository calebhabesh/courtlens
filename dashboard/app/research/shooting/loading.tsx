// Shot Aftermath draws its own hero (RD17: no Shooting tabs above it): hero, scope line, filter bar, then the sections.
import { SkelFilterBar, SkelHeader, SkelIntro, SkelResearchArticle } from "@/components/ui/content-skeletons";
import { FeedSkeleton } from "@/components/stats-feed-ui";

export default function Loading() {
  return <div className="ui-page ui-page-research"><div className="rs-column sa-page"><FeedSkeleton label="Loading Shot Aftermath">
    <SkelHeader align="hero" title={320} subtitle={480} />
    <SkelIntro tagline={500} links={[]} />
    <SkelFilterBar fields={[[44, 120], [92, 112], [112, 220]]} meta={[116]} />
    <SkelResearchArticle figure="bars" second="chart" />
  </FeedSkeleton></div></div>;
}
