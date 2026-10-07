import type { AssistantStatusResponse } from "@/lib/types";
import { Section } from "./ui/controls";

export function AssistantStatusCard({ status }: { status: AssistantStatusResponse | null }) {
  const limits = status?.limits;
  return <Section title="Assistant" aria-label="Assistant configuration">
    <p className="text-muted">NBA answers use CourtLens data first, then cited web sources. Provider keys are configured on the server.</p>
    <dl className="ask-facts">
      <div><dt>Provider</dt><dd>{status?.provider ?? "Unavailable"}</dd></div>
      <div><dt>Model</dt><dd>{status?.model ?? "Unavailable"}</dd></div>
      <div><dt>Limited mode</dt><dd>{status ? (status.limited_mode ?? !status.configured) ? "Yes" : "No" : "Unavailable"}</dd></div>
      <div><dt>Limits per turn</dt><dd>{limits?.max_steps != null ? `${limits.max_steps} steps · ${limits.max_web_searches ?? "unavailable"} searches · ${limits.max_tokens?.toLocaleString("en-US") ?? "unavailable"} tokens · ${limits.turn_timeout_seconds ?? "unavailable"}s deadline` : "Agent limits unavailable"}</dd></div>
    </dl>
    <p className="text-muted">Manual research needs no provider key. Configuration alone does not establish provider availability or answer accuracy.</p>
    {status ? <details><summary>Configuration details</summary><p>{status.setup_instructions}</p><p>Prompt: {status.prompt_version ?? "Unavailable"}</p><p>{status.privacy_notice}</p></details> : <p role="status">Assistant configuration is unavailable.</p>}
  </Section>;
}
