import { Suspense, type ReactNode } from "react";
import { PageHeader } from "./ui/panel";
import { PageShell, type PageTemplate } from "./ui/page-shell";
import { RouteTabs } from "./ui/route-tabs";
import type { TabbedPage as TabbedPageSpec } from "@/lib/route-consolidation";

/**
 * Frame for an FO07 merged page, rendered from the route segment's layout so the header and tabs
 * persist while the tab body changes: page header (D7), route tabs, then the selected tab.
 */
export function TabbedPage({ page, template, carry, children }: {
  page: TabbedPageSpec;
  template: PageTemplate;
  carry?: readonly string[];
  children: ReactNode;
}) {
  return (
    <PageShell template={template} className="ui-tabbed-page">
      <PageHeader title={page.title} subtitle={page.subtitle} />
      <Suspense fallback={<div className="ui-route-tabs" aria-hidden="true" />}>
        <RouteTabs tabs={page.tabs} aria-label={`${page.title} sections`} carry={carry} />
      </Suspense>
      <div className="ui-tabbed-page-body">{children}</div>
    </PageShell>
  );
}
