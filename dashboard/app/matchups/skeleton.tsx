import { MatchupsPageSkeleton } from "@/components/season-matchups-view";
import { PageShell } from "@/components/ui/page-shell";

export default function Loading() { return <PageShell template="compare"><MatchupsPageSkeleton /></PageShell>; }
