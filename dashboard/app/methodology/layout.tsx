import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MethodologyFrame } from "@/components/methodology-frame";
import { TabbedPage } from "@/components/tabbed-page";
import { TABBED_PAGES } from "@/lib/route-consolidation";

export const metadata: Metadata = { title: TABBED_PAGES.methodology.title };

/** Definitions under the Methodology tabs; Learning (RD06) under its own centred hero. */
export default function Layout({ children }: { children: ReactNode }) {
  return <MethodologyFrame bare={children} tabbed={<TabbedPage page={TABBED_PAGES.methodology} template="article">{children}</TabbedPage>} />;
}
