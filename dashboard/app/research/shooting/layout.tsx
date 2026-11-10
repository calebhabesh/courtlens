import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MethodologyFrame } from "@/components/methodology-frame";
import { TabbedPage } from "@/components/tabbed-page";
import { TABBED_PAGES } from "@/lib/route-consolidation";

export const metadata: Metadata = { title: TABBED_PAGES.shooting.title };

/** Expected Shots and Adjusted Shooting under the Shooting header; Shot Aftermath (RD18) draws its own centred hero with these tabs. */
export default function Layout({ children }: { children: ReactNode }) {
  return <MethodologyFrame bare={children} tabbed={<TabbedPage page={TABBED_PAGES.shooting} template="research" carry={["playerId", "player_id"]}>{children}</TabbedPage>} />;
}
