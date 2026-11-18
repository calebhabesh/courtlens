import { PlayoffsBracketSkeleton } from "@/components/playoffs-bracket";
import { SkelFilterBar, SkelHeader, SkelText } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";

/** The playoffs loading state: scope bar, the note line, the centred season title, then the bracket. */
export default function Loading() {
  return <PageShell template="board"><div className="playoffs-view-container" role="status" aria-busy="true" aria-label="Loading playoffs">
    <SkelFilterBar fields={[[44, 92], [40, 90], [50, 124]]} modes={[[76, 64, 84]]} meta={[76, 108]} />
    <SkelText size="sm" width={360} />
    <SkelHeader align="center" icon={false} title={266} subtitle={242} className="pb-head" />
    <PlayoffsBracketSkeleton />
  </div></PageShell>;
}
