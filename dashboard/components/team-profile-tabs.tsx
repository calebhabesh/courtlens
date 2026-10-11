"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ProfileLayout } from "./ui/page-shell";
import { Tabs, TabsList, TabTrigger, TabsContent } from "./ui/tabs";

export function TeamProfileTabs({ hero, overview, factors, schedule }: { hero: ReactNode; overview: ReactNode; factors: ReactNode; schedule: ReactNode }) {
  const params = useSearchParams();
  const tab = ["factors", "schedule"].includes(params.get("tab") ?? "") ? params.get("tab")! : "overview";
  return <Tabs value={tab} onChange={value => {
    const next = new URLSearchParams(window.location.search); next.set("tab", value);
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }}>
    <ProfileLayout hero={hero} tabs={<TabsList aria-label="Team profile sections"><TabTrigger value="overview">Overview</TabTrigger><TabTrigger value="factors">Four Factors</TabTrigger><TabTrigger value="schedule">Schedule</TabTrigger></TabsList>}>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="factors">{factors}</TabsContent>
      <TabsContent value="schedule">{schedule}</TabsContent>
    </ProfileLayout>
  </Tabs>;
}
