import { SkelFilterBar, SkelGrid, SkelHeader, SkelText, SkelTiles } from "@/components/ui/content-skeletons";

/** Data Status: header and job actions, the release line, four status tiles, then the background jobs table. */
export default function DataStatusLoading() {
  return <div className="ui-page ui-page-research research-view data-status-view" role="status" aria-busy="true" aria-label="Loading Data Status">
    <SkelHeader icon={false} title={128} subtitle={300} actions={[140, 100]} />
    <SkelFilterBar fields={[300]} meta={[87, 108]} className="is-fixed-scope" />
    <div className="ui-research" aria-hidden="true">
      <SkelTiles count={4} className="ui-findings" />
      <div className="ui-research-body"><section className="research-section"><SkelText size="lg" width={140} /><SkelGrid label="Background jobs" rows={13} lead="text" columns={7} density="compact" /></section></div>
    </div>
  </div>;
}
