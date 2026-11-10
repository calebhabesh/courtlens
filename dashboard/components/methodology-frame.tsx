"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { OWN_HEADER_TABS } from "@/lib/route-consolidation";

/** RD06: Learning keeps its route under Methodology but draws its own centred hero, so it skips the tabbed header. */

export function MethodologyFrame({ tabbed, bare }: { tabbed: ReactNode; bare: ReactNode }) {
  const pathname = usePathname();
  return <>{OWN_HEADER_TABS.has(pathname) ? bare : tabbed}</>;
}
