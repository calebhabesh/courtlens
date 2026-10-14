import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/kit";

export default function NotFound() {
  return (
    <PageShell template="article">
      <PageHeader title="Page Not Found" subtitle="That page is not on this week's slate." actions={<ButtonLink size="lg" href="/">Return home</ButtonLink>} />
    </PageShell>
  );
}
