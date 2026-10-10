"use client";

import { ArticleSection } from "@/components/ui/article-layout";
import { Switch } from "@/components/ui/switch";
import { useAdvancedMode } from "@/lib/advanced-mode";

export function AdvancedModeSetting() {
  const [enabled, setEnabled] = useAdvancedMode();
  return (
    <ArticleSection id="display" title="Display">
      <Switch checked={enabled} onChange={setEnabled} label="Advanced mode: show raw data fields" id="advanced-mode-toggle" />
      <p>Shows release IDs, hashes and exclusive-cutoff rules on pages instead of only in Data details. Stored in this browser; results never change.</p>
    </ArticleSection>
  );
}
