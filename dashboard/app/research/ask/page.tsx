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
          <h1 className="page-title">Ask CourtLoad</h1>
          <p className="page-subtitle">
            Ask follow-up questions or run manual research against a pinned release, with exact results and evidence.
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
