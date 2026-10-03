import { CapabilityNotice } from "@/components/capability-notice";

export default function LivePage() {
  return (
    <CapabilityNotice
      featureId="F09"
      featureTitle="Live Scoreboard & In-Game Analytics"
      canonicalRoute="/live"
      targetBlock="B31–B32 (Shared Live Service & Live Interface)"
      status="gated"
      prerequisites="Requires lightweight true Live poller with bounded client demand leases, provisional in-game observations, and finalized score reconciliation (Block B31)."
      description="Live game strip, real-time clock, box score cards, provisional observations, and historical final game detail without multiplying upstream traffic or leaking provisional live data into historical snapshots."
    />
  );
}
