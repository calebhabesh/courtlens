import { CapabilityNotice } from "@/components/capability-notice";

export default async function EpvPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const contextParams = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return (
    <CapabilityNotice
      contextParams={contextParams}
      featureId="F33"
      featureTitle="Spatial Expected Possession Value (EPV)"
      canonicalRoute="/research/epv"
      targetBlock="B25–B27 (Spatial EPV Research)"
      status="gated"
      prerequisites="Requires 25Hz player and ball spatial optical tracking feeds, spatial court mesh models, and Markov possession transitions (Blocks B25–B27)."
      description="Microeconomic spatial tracking model calculating continuous possession value at every 40-millisecond frame of an NBA half-court possession."
    />
  );
}
