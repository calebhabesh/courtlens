import { SkelHeader, SkelLines, SkelText } from "@/components/ui/content-skeletons";

/**
 * The fallback for routes without a loader of their own (articles such as Methodology and What's New):
 * the page header, then headed blocks of copy. Every data page has its own loader in its layout's shape.
 */
export default function RootLoading() {
  return <div className="ui-page ui-page-article" role="status" aria-busy="true" aria-label="Loading">
    <SkelHeader icon={false} title={220} subtitle={420} />
    <div className="ui-skel-article ui-skel-measure" aria-hidden="true">
      {[3, 4, 2].map((lines, index) => <section key={index} className="ui-skel-lines"><SkelText size="xl" width={180 + index * 40} /><SkelLines lines={lines} size="md" /></section>)}
    </div>
  </div>;
}
