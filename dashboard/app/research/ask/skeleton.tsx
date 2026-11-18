import { SkelControl, SkelLines, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ask's loading state in its chat layout: the conversations sidebar, the top bar, the centred welcome
 * with the composer and example questions, then the scope line.
 */
export default function AskLoading() {
  return (
    <div className="ask-page" role="status" aria-busy="true" aria-label="Loading Ask">
      <section className="ask-chat" aria-hidden="true">
        <aside className="ask-sidebar">
          <div className="ask-sidebar-head"><SkelText size="sm" width={92} /></div>
          <nav className="ask-history"><div className="ask-history-group"><SkelText size="xs" width={40} />{[0, 1, 2].map(index => <span key={index} className="ask-history-item"><SkelText size="sm" width={`${88 - index * 14}%`} /></span>)}</div></nav>
          <div className="ask-sidebar-foot"><SkelText size="sm" width={140} /><SkelText size="sm" width={180} /></div>
        </aside>
        <div className="ask-main is-empty">
          <div className="ask-topbar"><SkelControl width={32} /><SkelText size="md" width={72} className="ask-title" /><SkelControl width={105} /><SkelControl width={32} /></div>
          <div className="ask-scroll"><div className="ask-column"><div className="ask-empty">
            <Skeleton variant="circle" width={44} height={44} />
            <SkelText size="2xl" width={314} className="ui-skel-center" />
            <SkelLines lines={2} size="md" last="50%" className="ui-skel-narrow ui-skel-wide" />
            <Skeleton height={47} className="ui-skel-card" />
            <div className="ask-examples">{Array.from({ length: 8 }, (_, index) => <span key={index} className="ask-example"><SkelText size="sm" width={64} /><SkelLines lines={index > 5 ? 1 : 2} size="md" last="60%" /></span>)}</div>
          </div></div></div>
          <div className="ask-dock"><SkelText size="xs" width={130} /></div>
        </div>
      </section>
    </div>
  );
}
