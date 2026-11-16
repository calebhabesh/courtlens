import { PageShell } from "@/components/ui/page-shell";
import { TeamsPageSkeleton } from "@/components/teams-six-factor-view";

export default function Loading() { return <PageShell template="explorer" className="teams-page-shell"><TeamsPageSkeleton /></PageShell>; }
