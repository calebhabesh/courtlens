import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/kit";

/** A team id that names no franchise or former team (site links SL02): a way back, not an error. */
export default function TeamNotFound() {
  return (
    <PageShell template="article">
      <PageHeader title="Team Not Found" subtitle="CourtLens has no team with that id." actions={<ButtonLink size="lg" href="/teams">Return to All Teams</ButtonLink>} />
    </PageShell>
  );
}
