import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/kit";

/** A player id this release does not know (site links SL02): a way back, not an error. */
export default function PlayerNotFound() {
  return (
    <PageShell template="article">
      <PageHeader title="Player Not Found" subtitle="CourtLens has no player with that id." actions={<ButtonLink size="lg" href="/players">Return to Players</ButtonLink>} />
    </PageShell>
  );
}
