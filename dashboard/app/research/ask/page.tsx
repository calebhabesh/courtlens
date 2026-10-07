import { AskCourtLens } from "@/components/ask-courtlens";
import Link from "next/link";

interface AskPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
  const params = await searchParams;
  const threaded = params.experience !== "manual";
  const season = (params.season as string) || (threaded ? undefined : "2025-26");
  const phase = (params.phase as string) || (threaded ? undefined : "regular_season");
  const beforeDate = (params.beforeDate as string) || (params.before_date as string) || (threaded ? undefined : "2026-06-30");
  const windowParam = (params.window as string) || (threaded ? undefined : "season");
  const releaseId = (params.releaseId as string) || (params.release_id as string) || undefined;

  if (threaded) return (
    <div className="ask-page">
      <h1 className="sr-only">Ask CourtLens</h1>
      <AskCourtLens initialReleaseId={releaseId} initialSeason={season} initialPhase={phase} initialBeforeDate={beforeDate} initialWindow={windowParam} />
    </div>
  );

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ask CourtLens</h1>
          <p className="page-subtitle">
            Ask follow-up questions or run manual research against a pinned release, with exact results and evidence.
          </p>
        </div>
      </div>

      <p><Link href="/research/ask">Open assistant</Link></p>

      <AskCourtLens
        initialReleaseId={releaseId}
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        initialWindow={windowParam}
      />
    </div>
  );
}
