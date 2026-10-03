import { CapabilityNotice } from "@/components/capability-notice";

export default function BlogPage() {
  return (
    <CapabilityNotice
      featureId="F38"
      featureTitle="CourtLoad Engineering & Research Blog"
      canonicalRoute="/blog"
      targetBlock="B35 (Methodology, Learning & Integration)"
      status="gated"
      prerequisites="Requires local static markdown renderer, code highlight blocks, and analytical article links (Block B35)."
      description="Technical articles exploring basketball analytics, reproducible pipeline design, temporal discipline in ML, and model calibration under uncertainty."
    />
  );
}
