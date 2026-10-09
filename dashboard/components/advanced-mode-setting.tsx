"use client";

import { Section } from "@/components/ui/controls";
import { Switch } from "@/components/ui/switch";
import { useAdvancedMode } from "@/lib/advanced-mode";

export function AdvancedModeSetting() {
  const [enabled, setEnabled] = useAdvancedMode();
  return (
    <Section title="Advanced mode" description="Show release IDs, hashes and exclusive-cutoff rules on pages instead of only in Data details. Stored in this browser; results never change.">
      <Switch checked={enabled} onChange={setEnabled} label="Show raw data fields" id="advanced-mode-toggle" />
    </Section>
  );
}
