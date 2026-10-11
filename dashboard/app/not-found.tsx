import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";

export default function NotFound() {
  return (
    <PageShell template="article">
      <PageHeader title="Page Not Found" subtitle="That page is not on this week's slate." actions={<Link className="ui-button ui-button-secondary ui-button-lg" href="/">Return home</Link>} />
    </PageShell>
  );
}
