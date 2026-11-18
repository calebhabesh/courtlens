import { SkelHeader, SkelLines, SkelText } from "@/components/ui/content-skeletons";

/**
 * The loader for article routes whose server render waits on a read (Methodology, the glossary,
 * account links, the planner): the page header, then headed blocks of copy. Every data page has its
 * own loader in its layout's shape.
 *
 * It was the root `app/loading.tsx` until 2026-11-17 (Stats speed). A root loader wraps every route,
 * so its skeleton flashed before each page's own and, once shown, React held the page back for its
 * 300 ms reveal batch. Stats, the page `/` opens, now has no loader at all; routes that do not wait
 * on the server have none either, since there is nothing to show a skeleton for.
 */
export function ArticleLoading() {
  return <div className="ui-page ui-page-article" role="status" aria-busy="true" aria-label="Loading">
    <SkelHeader icon={false} title={220} subtitle={420} />
    <div className="ui-skel-article ui-skel-measure" aria-hidden="true">
      {[3, 4, 2].map((lines, index) => <section key={index} className="ui-skel-lines"><SkelText size="xl" width={180 + index * 40} /><SkelLines lines={lines} size="md" /></section>)}
    </div>
  </div>;
}
