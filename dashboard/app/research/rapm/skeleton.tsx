// Renders inside the tabbed page, whose header and tabs stay visible: skeleton the tab body only.
import { SkelFilterBar, SkelIntro, SkelResearchArticle } from "@/components/ui/content-skeletons";
import { FeedSkeleton } from "@/components/stats-feed-ui";

export default function Loading() {
  return <div className="rs-column"><FeedSkeleton label="Loading RAPM">
    <SkelFilterBar fields={[[44, 99], [40, 130], [52, 126]]} />
    <SkelIntro tagline={620} links={[204, 134]} />
    <SkelResearchArticle figure="bars" second="grid" />
  </FeedSkeleton></div>;
}
