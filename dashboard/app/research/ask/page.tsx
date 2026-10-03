import { AskCourtLoad } from "@/components/ask-courtload";

interface AskPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
  const params = await searchParams;
  const season = (params.season as string) || "2025-26";
  const phase = (params.phase as string) || "regular_season";
  const beforeDate = (params.beforeDate as string) || (params.before_date as string) || "2026-06-30";
  const windowParam = (params.window as string) || "season";
  const releaseId = (params.releaseId as string) || (params.release_id as string) || undefined;

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span className="font-mono text-xs text-muted">F41</span>
            <span className="replica-badge-gated" style={{ background: "rgba(96, 211, 148, 0.15)", color: "var(--positive)" }}>
              Interactive Research AI
            </span>
            <span className="font-mono text-xs text-muted">Blocks B33–B34</span>
          </div>
          <h1 className="page-title">Ask CourtLoad</h1>
          <p className="page-subtitle">
            Conversational NBA analytical research interface with context bindings, verifiable evidence citations, and entity resolution.
          </p>
        </div>
      </div>

      <AskCourtLoad
        initialReleaseId={releaseId}
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        initialWindow={windowParam}
      />
    </div>
  );
}
