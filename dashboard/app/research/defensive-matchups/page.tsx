import { CapabilityNotice } from "@/components/capability-notice";

export default function DefensiveMatchupsPage() {
  return (
    <CapabilityNotice
      featureId="F32"
      featureTitle="Defensive Contests & Matchups"
      canonicalRoute="/research/defensive-matchups"
      targetBlock="B23–B27 (Defensive Research)"
      status="gated"
      prerequisites="Requires verified nearest-defender contest inputs, rim protection tracking, and expected points allowed deltas (Blocks B23–B27)."
      description="Evaluates perimeter contest frequency, rim deterrence rates, and points saved per 100 possessions by defensive anchors and wing stoppers."
    />
  );
}
