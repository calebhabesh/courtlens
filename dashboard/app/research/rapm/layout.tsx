import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TabbedPage } from "@/components/tabbed-page";
import { TABBED_PAGES } from "@/lib/route-consolidation";

export const metadata: Metadata = { title: TABBED_PAGES.rapm.title };

export default function Layout({ children }: { children: ReactNode }) {
  return <TabbedPage page={TABBED_PAGES.rapm} template="research">{children}</TabbedPage>;
}
