import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TABBED_PAGES } from "@/lib/route-consolidation";

export const metadata: Metadata = { title: TABBED_PAGES.whatsNew.title };

/** RD07: Patch Notes draws its own centred hero (`PatchNotesView`), so no tabbed header. */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
