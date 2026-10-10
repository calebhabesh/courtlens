import type { Metadata } from "next";
import { CapabilityNotice } from "@/components/capability-notice";

export const metadata: Metadata = { title: "Defensive Matchups" };

export default async function DefensiveMatchupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const contextParams = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return (
    <CapabilityNotice
      contextParams={contextParams}
      featureId="F32"
      featureTitle="Defensive Matchups"
      summary="Contest, rim-deterrence and points-saved research for defenders."
      requiredSource="Defender tracking"
      canonicalRoute="/research/defensive-matchups"
      targetBlock="B23–B27 (Defensive Research)"
      status="gated"
      prerequisites="Requires verified nearest-defender contest inputs, rim protection tracking, and expected points allowed deltas (Blocks B23–B27)."
      description="Evaluates perimeter contest frequency, rim deterrence rates, and points saved per 100 possessions by defensive anchors and wing stoppers."
    />
  );
}
