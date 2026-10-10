"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface ArticleTocItem {
  /** The section's element id; the link target. */
  id: string;
  label: string;
}

/**
 * Article template body (FO13, owner decision 2026-10-09): a table of contents beside one readable
 * column. Used by Methodology, What's New and Settings, which none of the five data templates fit.
 * Below 1024px the contents become one scrolling row of links above the column.
 */
export function ArticleLayout({ toc, children, className = "" }: { toc: readonly ArticleTocItem[]; children: ReactNode; className?: string }) {
  return (
    <div className={`ui-article ${toc.length > 1 ? "" : "ui-article-no-toc"} ${className}`}>
      {toc.length > 1 && <ArticleToc items={toc} />}
      <div className="ui-article-body">{children}</div>
    </div>
  );
}

/** One article section: an anchored `h2` and its content. `wide` lets a table use the full body width. */
export function ArticleSection({ id, title, label, actions, wide = false, children, className = "" }: {
  id: string;
  title: ReactNode;
  /** Accessible region name when it should differ from the visible title. */
  label?: string;
  /** Section-level actions, right-aligned on the heading row. */
  actions?: ReactNode;
  wide?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`ui-article-section ${wide ? "is-wide" : ""} ${className}`} {...(label ? { "aria-label": label } : { "aria-labelledby": `${id}-heading` })}>
      <div className="ui-article-section-head">
        <h2 id={`${id}-heading`} className="ui-article-section-title">{title}</h2>
        {actions && <div className="ui-article-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** The section in view: the last one whose top has passed the reading line below the sticky header. */
export function activeTocId(tops: readonly { id: string; top: number }[], readingLine: number): string | undefined {
  let active = tops[0]?.id;
  for (const entry of tops) if (entry.top <= readingLine) active = entry.id;
  return active;
}

function ArticleToc({ items }: { items: readonly ArticleTocItem[] }) {
  const [active, setActive] = useState<string | undefined>(items[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const tops = items.flatMap(item => {
          const element = document.getElementById(item.id);
          return element ? [{ id: item.id, top: element.getBoundingClientRect().top }] : [];
        });
        // Reading line: the sticky header plus a little room, so a section counts once its title is read.
        const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        setActive(atEnd ? tops.at(-1)?.id : activeTocId(tops, 120));
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  return (
    <nav className="ui-article-toc" aria-label="On this page">
      <p className="ui-article-toc-title">On this page</p>
      <ol className="ui-article-toc-list">
        {items.map(item => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="ui-article-toc-link" aria-current={item.id === active ? "location" : undefined}>{item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
