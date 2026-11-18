import { SkelControl, SkelHeader, SkelLines, SkelSegmented, SkelText } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Contracts without a team: centred header, team and season controls, the tabs and the Select a Team prompt. */
export default function Loading() {
  return <PageShell template="explorer" className="ctr-shell"><div className="ctr-page" role="status" aria-busy="true" aria-label="Loading contracts">
    <SkelHeader align="center" title={175} subtitle={147} />
    <div className="ctr-console" aria-hidden="true"><SkelControl width={145} size="lg" /><SkelControl width={88} size="lg" /></div>
    <SkelSegmented options={[84, 100]} size="md" className="ctr-tabs" />
    <div className="ctr-empty" aria-hidden="true"><Skeleton variant="circle" width={64} height={64} /><SkelText size="xl" width={112} className="ui-skel-center" /><SkelLines lines={3} size="md" last="60%" className="ui-skel-narrow" /><SkelControl width={108} size="md" /></div>
  </div></PageShell>;
}
