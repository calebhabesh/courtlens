import { CapabilityNotice } from "@/components/capability-notice";

export default function LearningPage() {
  return (
    <CapabilityNotice
      featureId="F36"
      featureTitle="Interactive Learning & Methodology Tutorials"
      canonicalRoute="/learning"
      targetBlock="B35 (Methodology, Learning & Integration)"
      status="gated"
      prerequisites="Requires curated walkthrough modules linking mathematical definitions (e.g. TS%, EWMA, Bayes shrinkage) to interactive queries (Block B35)."
      description="Tutorial lessons with worked mathematical derivations and interactive query editors explaining modern NBA analytics concepts."
    />
  );
}
