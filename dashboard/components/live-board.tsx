"use client";

import { Suspense, type ReactNode } from "react";
import { acceptsDemand, validSlate } from "@/lib/live";
import { PageHeader } from "./ui/panel";
import { RouteTabs } from "./ui/route-tabs";

export type LiveSection = "live" | "finals" | "playoffs";

/** Live · Finals · Playoffs (D19). The selected slate date travels between Live and Finals. */
export function liveTabs(slate?: string) {
  const day = slate && validSlate(slate) ? slate : undefined;
  return {
    // A date outside the lease window always opens finalized research, so Live goes to today.
    live: { label: "Live", href: day && acceptsDemand(day) ? `/live/${day}` : "/live" },
    finals: { label: "Finals", href: day ? `/live/${day}?live_mode=history` : "/live?live_mode=history" },
    playoffs: { label: "Playoffs", href: "/playoffs" },
  };
}

/** Page header and section tabs shared by the Live board and the playoff explorer. */
export function LiveBoardHeader({ section, slate, subtitle, actions }: {
  section: LiveSection;
  slate?: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  const tabs = liveTabs(slate);
  return (
    <>
      <PageHeader title="Live" subtitle={subtitle} actions={actions} />
      <Suspense fallback={<div className="ui-route-tabs" aria-hidden="true" />}>
        <RouteTabs tabs={[tabs.live, tabs.finals, tabs.playoffs]} active={tabs[section].href} aria-label="Live sections" />
      </Suspense>
    </>
  );
}
