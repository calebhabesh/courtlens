import { SkelFilterBar, SkelHeader, SkelText } from "@/components/ui/content-skeletons";
import { PageShell } from "@/components/ui/page-shell";

/** Stat Line Shift: centred header, the season, team and phase bar, then the pick-players prompt. */
export default function Loading() {
  return <PageShell template="explorer" className="sls-page-shell"><div className="sls-page" role="status" aria-busy="true" aria-label="Loading Stat Line Shift">
    <SkelHeader align="center" title={220} subtitle={520} />
    <div className="sls-console"><SkelFilterBar fields={[88, 80, 104]} modes={[[150]]} meta={[108]} /></div>
    <div className="sls-empty" aria-hidden="true"><SkelText size="md" width={380} className="ui-skel-center" /></div>
  </div></PageShell>;
}
