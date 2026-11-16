import { WowySkeleton } from "@/components/wowy-view";
import { SkelFilterBar, SkelHeader } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";

/** WOWY's loading state: centred header, the team and season bar, then its three columns. */
export default function Loading() {
  return <PageShell template="explorer"><div className="wowy-page" role="status" aria-busy="true" aria-label="Loading WOWY">
    <SkelHeader align="center" title={136} subtitle={440} />
    <div className="wowy-console"><SkelFilterBar fields={[80, 88, 104]} meta={[108]} /></div>
    <WowySkeleton />
  </div></PageShell>;
}
