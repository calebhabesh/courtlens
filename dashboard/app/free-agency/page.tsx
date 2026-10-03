import { CapabilityNotice } from "@/components/capability-notice";

export default function FreeAgencyPage() {
  return (
    <CapabilityNotice
      featureId="F23"
      featureTitle="Free Agency Tracker"
      canonicalRoute="/free-agency"
      targetBlock="B28–B30 (Financial Acquisition, Operations & UI)"
      status="gated"
      prerequisites="Requires free-agent status definitions (UFA, RFA, Player Option, Team Option), source notes, and operator import workflow (Blocks B28–B30)."
      description="Track upcoming free agents, player options, contract statuses, and verified market signings with transparent provenance and timestamps."
    />
  );
}
