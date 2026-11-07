import type { ReactNode } from "react";
import { TabbedPage } from "@/components/tabbed-page";
import { TABBED_PAGES } from "@/lib/route-consolidation";

export default function Layout({ children }: { children: ReactNode }) {
  return <TabbedPage page={TABBED_PAGES.wingspan} template="research">{children}</TabbedPage>;
}
