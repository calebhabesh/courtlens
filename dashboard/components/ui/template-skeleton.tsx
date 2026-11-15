"use client";

import type { PageTemplate } from "./page-shell";
import { SkelBars, SkelChart, SkelControls, SkelFilterBar, SkelGrid, SkelHeader, SkelLines, SkelProfileCard, SkelResearchArticle, SkelText, SkelTiles } from "./content-skeletons";

function Body({ template }: { template: PageTemplate }) {
  switch (template) {
    case "explorer":
      return <SkelGrid label="Rows" rows={10} search groupSizes={[3, 4, 3]} />;
    case "profile":
      return <div className="ui-profile"><SkelProfileCard /><SkelTiles count={6} bar /><SkelGrid label="Career" rows={6} lead="text" columns={12} density="compact" /></div>;
    case "compare":
      return <div className="ui-compare"><div className="ui-compare-sides"><SkelProfileCard /><SkelProfileCard /></div><SkelBars rows={8} /></div>;
    case "board":
      return <div className="ui-board"><div className="ui-board-main"><SkelChart height={420} /></div><aside className="ui-board-rail"><SkelLines lines={8} size="md" /></aside></div>;
    case "research":
      return <SkelResearchArticle />;
    case "article":
      return <div className="ui-article">
        <nav className="ui-article-toc"><SkelText size="xs" width={72} className="ui-article-toc-title" /><ol className="ui-article-toc-list">{[56, 88, 120, 72, 96].map(width => <li key={width}><span className="ui-article-toc-link"><SkelText size="sm" width={width} /></span></li>)}</ol></nav>
        <div className="ui-article-body ui-skel-measure"><SkelText size="xl" width={180} /><SkelLines lines={4} size="md" /><SkelText size="xl" width={220} /><SkelLines lines={3} size="md" /></div>
      </div>;
  }
}

/**
 * A reference loading state per page template (D11), built from the content-shaped parts. Pages use
 * their own loader in their real layout's shape; this is the showcase of the parts on /design.
 */
export function TemplateSkeleton({ template }: { template: PageTemplate }) {
  return (
    <div className={`ui-page ui-page-${template}`} role="status" aria-busy="true" aria-label="Loading">
      <SkelHeader align={template === "research" ? "hero" : "left"} title={240} subtitle={420} />
      {template === "explorer" || template === "profile" ? <SkelFilterBar fields={[[44, 92], [40, 124], [50, 124]]} />
        : template !== "article" && template !== "research" ? <SkelControls items={[120, 140, 120]} /> : null}
      <Body template={template} />
    </div>
  );
}
