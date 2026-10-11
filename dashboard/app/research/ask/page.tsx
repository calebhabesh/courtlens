import { AskCourtLens } from "@/components/ask-courtlens";
import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";

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
      <PageHeader title="Ask CourtLens" className="sr-only" />
      <AskCourtLens initialReleaseId={releaseId} initialSeason={season} initialPhase={phase} initialBeforeDate={beforeDate} initialWindow={windowParam} />
    </div>
  );

  return (
    <PageShell template="research" className="ask-manual-page">
      <PageHeader
        title="Ask CourtLens"
        subtitle="Ask follow-up questions or run manual research against a pinned release, with exact results and evidence."
        actions={<Link href="/research/ask" className="ui-button ui-button-secondary ui-button-sm">Open assistant</Link>}
      />
      <AskCourtLens
        initialReleaseId={releaseId}
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        initialWindow={windowParam}
      />
    </PageShell>
  );
}
