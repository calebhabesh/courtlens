import { LastGamesSkeleton } from "@/components/last-games-view";
import { SkelFilterBar, SkelHeader, SkelText } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";

/** Last X Games: centred header, the example line, the scope and view bar, then the window, comparison and game log. */
export default function Loading() {
  return <PageShell template="explorer"><div className="lg-page" role="status" aria-busy="true" aria-label="Loading Last X Games">
    <SkelHeader align="center" title={360} subtitle={420} />
    <SkelText size="xs" width={460} className="feed-example ui-skel-center" />
    <div className="lg-console"><SkelFilterBar fields={[88, 135]} modes={[[96, 88], [129], [103], [116, 116]]} meta={[108]} /></div>
    <LastGamesSkeleton />
  </div></PageShell>;
}
