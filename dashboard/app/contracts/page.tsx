import { CapabilityNotice } from "@/components/capability-notice";

export default function ContractsPage() {
  return (
    <CapabilityNotice
      featureId="F21"
      featureTitle="Team Contracts & Payroll Timeline"
      canonicalRoute="/contracts"
      targetBlock="B28–B30 (Financial Acquisition, Operations & UI)"
      status="gated"
      prerequisites="Requires contract data acquisition, provenance correction ledger, financial query schema, and team allocation calculators (Blocks B28–B30)."
      description="Inspect multi-year team salary books, cap hits, luxury tax exposure, player option structures, and modeled financial value (Small vs Big salary splits)."
    />
  );
}
