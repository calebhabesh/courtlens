import { AskCourtLens } from "@/components/ask-courtlens";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { GatedNote } from "@/components/ui/gated-note";
import { isHostedDemo } from "@/lib/hosted";
import { ButtonLink } from "@/components/ui/kit";

interface AskPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
  if (isHostedDemo) return (
    <PageShell template="research">
      <PageHeader title="Ask CourtLens" />
      <GatedNote why={<p>Ask calls a paid language model, so it runs only in a local CourtLens install. Every page, table and chart on this site works without it.</p>}>
        Ask is turned off on the hosted demo.
      </GatedNote>
    </PageShell>
  );

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
        actions={<ButtonLink size="xs" href="/research/ask">Open assistant</ButtonLink>}
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
