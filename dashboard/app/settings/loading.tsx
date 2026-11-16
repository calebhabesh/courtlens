import { SkelControl, SkelHeader, SkelLines, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

const TOC = [56, 64, 120, 100, 44, 124, 116];

/** Settings in its Article layout: header, the On this page list, then sections of rows and copy. */
export default function SettingsLoading() {
  return <div className="ui-page ui-page-article" role="status" aria-busy="true" aria-label="Loading Settings">
    <SkelHeader icon={false} title={91} subtitle={360} />
    <div className="ui-article" aria-hidden="true">
      <nav className="ui-article-toc"><SkelText size="xs" width={72} /><ol className="ui-article-toc-list">{TOC.map((width, index) => <li key={index}><span className="ui-article-toc-link"><SkelText size="sm" width={width} /></span></li>)}</ol></nav>
      <div className="ui-article-body">
        <section className="ui-article-section"><div className="ui-article-section-head"><SkelText size="xl" width={70} /></div><span className="ui-skel-labeled"><Skeleton width={40} height={24} className="ui-skel-card" /><SkelText size="sm" width={230} /></span><SkelLines lines={2} size="md" last="60%" /></section>
        <section className="ui-article-section"><div className="ui-article-section-head"><SkelText size="xl" width={93} /></div><SkelText size="md" width="80%" />
          {Array.from({ length: 5 }, (_, index) => <span key={index} className="ui-skel-controls"><SkelText size="sm" width={90} /><span className="ui-skel-push" /><SkelText size="sm" width={120 + (index % 3) * 60} /></span>)}
          <SkelLines lines={2} size="md" last="30%" /></section>
        <section className="ui-article-section"><div className="ui-article-section-head"><SkelText size="xl" width={150} /></div><SkelLines lines={2} size="md" last="70%" /><SkelControl width={96} size="xs" /></section>
      </div>
    </div>
  </div>;
}
