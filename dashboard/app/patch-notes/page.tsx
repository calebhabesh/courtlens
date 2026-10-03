import { CapabilityNotice } from "@/components/capability-notice";

export default function PatchNotesPage() {
  return (
    <CapabilityNotice
      featureId="F38"
      featureTitle="CourtLoad Patch Notes & Changelog"
      canonicalRoute="/patch-notes"
      targetBlock="B35 (Methodology, Learning & Integration)"
      status="gated"
      prerequisites="Requires local Markdown publication system, versioned change records, and block release evidence (Block B35)."
      description="Detailed historical changelog tracking engine enhancements, schema upgrades, evaluation experiments, and frontend release milestones."
    />
  );
}
