import { ContractsSkeleton } from "@/components/contracts-view";
import { SkelControl, SkelHeader, SkelSegmented } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";

/** A team's contracts: header with the team logo, controls, tabs, then the banner and the overview panels. */
export default function Loading() {
  return <PageShell template="explorer" className="ctr-shell"><div className="ctr-page" role="status" aria-busy="true" aria-label="Loading contracts">
    <SkelHeader title={260} subtitle={150} />
    <div className="ctr-console" aria-hidden="true"><SkelControl width={160} size="lg" /><SkelControl width={88} size="lg" /><SkelControl width={108} size="xs" /></div>
    <SkelSegmented options={[84, 100]} size="md" className="ctr-tabs" />
    <ContractsSkeleton />
  </div></PageShell>;
}
