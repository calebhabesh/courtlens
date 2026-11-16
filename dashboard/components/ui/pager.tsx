import { pagerItems } from "@/lib/pager";
import { Button, IconButton } from "./kit";

export interface PagerProps {
  /** Current page, 1-based. */
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  /** Names the navigation landmark ("Stats pages"). */
  label: string;
}

/**
 * Numbered paging for a table: first, previous, page numbers with gaps, next, last. Built from
 * kit controls only; the current page carries `aria-current` and the kit's selected look.
 */
export function Pager({ page, pageCount, onPage, label }: PagerProps) {
  if (pageCount <= 1) return null;
  const atStart = page <= 1;
  const atEnd = page >= pageCount;
  return (
    <nav className="ui-pager" aria-label={label}>
      <IconButton size="xs" variant="ghost" icon="first" label="First page" disabled={atStart} onClick={() => onPage(1)} />
      <IconButton size="xs" variant="ghost" icon="left" label="Previous page ([)" disabled={atStart} onClick={() => onPage(page - 1)} />
      {pagerItems(page, pageCount).map((item, index) => item === "gap"
        ? <span key={`gap-${index}`} className="ui-pager-gap" aria-hidden="true">…</span>
        : <Button key={item} size="xs" variant="ghost" dense className="ui-pager-page"
            aria-current={item === page ? "page" : undefined} aria-label={`Page ${item} of ${pageCount}`}
            onClick={() => { if (item !== page) onPage(item); }}>{item}</Button>)}
      <IconButton size="xs" variant="ghost" icon="right" label="Next page (])" disabled={atEnd} onClick={() => onPage(page + 1)} />
      <IconButton size="xs" variant="ghost" icon="last" label="Last page" disabled={atEnd} onClick={() => onPage(pageCount)} />
    </nav>
  );
}
