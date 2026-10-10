import type { Metadata } from "next";
import { CapabilityNotice } from "@/components/capability-notice";

export const metadata: Metadata = { title: "Spatial EPV" };

export default async function EpvPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const contextParams = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return (
    <CapabilityNotice
      contextParams={contextParams}
      featureId="F33"
      featureTitle="Spatial EPV"
      summary="Possession value at every moment of a half-court possession."
      requiredSource="Optical tracking"
      canonicalRoute="/research/epv"
      targetBlock="B25–B27 (Spatial EPV Research)"
      status="gated"
      prerequisites="Requires 25Hz player and ball spatial optical tracking feeds, spatial court mesh models, and Markov possession transitions (Blocks B25–B27)."
      description="Microeconomic spatial tracking model calculating continuous possession value at every 40-millisecond frame of an NBA half-court possession."
    />
  );
}
