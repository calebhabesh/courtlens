import { SkelControl, SkelFilterBar, SkelHeader, SkelText } from "@/components/ui/content-skeletons";

/** Retained source books: back button, header, the two-row book filter bar and its note. */
export default function Loading() {
  return <div className="ui-page ui-page-explorer finance-workspace" role="status" aria-busy="true" aria-label="Loading source books">
    <div className="back-button-row"><SkelControl width={173} size="xs" /></div>
    <SkelHeader icon={false} title={250} subtitle={260} actions={[70]} />
    <SkelFilterBar fields={[[32, 172], [48, 52], [80, 112], [56, 112]]} page={[160, 160, 160]} meta={[108]} className="finance-filter-bar" />
    <SkelText size="sm" width={300} />
  </div>;
}
