import { RosterShapesPageSkeleton } from "@/components/roster-shapes-view";
import { PageShell } from "@/components/ui/page-shell";

export default function RosterShapesLoading() {
  return <PageShell template="explorer" className="shapes-page-shell"><RosterShapesPageSkeleton /></PageShell>;
}
