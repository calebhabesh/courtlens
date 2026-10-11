import { buildPreservedContextUrl } from "@/lib/query-url";
import Link from "next/link";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";

export interface CapabilityNoticeProps {
  contextParams?: Record<string, string>;
  featureId: string;
  /** Page title; matches the nav label (D7). */
  featureTitle: string;
  /** One short subtitle line. */
  summary: string;
  /** Short name of the missing source for the findings row, e.g. "Defender tracking". */
  requiredSource: string;
  canonicalRoute: string;
  targetBlock: string;
  status?: "gated" | "planned" | "in_progress";
  prerequisites: string;
  description: string;
  alternativeRoutes?: Array<{ label: string; href: string }>;
}

/** A Research page whose required source is not admitted: one gated line, Why?, and next steps (D4). */
export function CapabilityNotice({
  contextParams = {},
  featureId,
  featureTitle,
  summary,
  requiredSource,
  canonicalRoute,
  targetBlock,
  status = "gated",
  prerequisites,
  description,
  alternativeRoutes = [
    { label: "Stats Explorer", href: "/stats" },
    { label: "RAPM Research", href: "/research/rapm" },
    { label: "Player Matchups", href: "/matchups" },
    { label: "Player Comparison", href: "/compare" },
    { label: "Methodology", href: "/methodology" },
  ]
}: CapabilityNoticeProps) {
  const context = new URLSearchParams(contextParams);
  return (
    <PageShell template="research" className="research-view capability-page">
      <PageHeader title={featureTitle} subtitle={summary} actions={<DataDetailsButton rows={[
        { label: "Feature", value: featureId, mono: true },
        { label: "Route", value: canonicalRoute, mono: true },
        { label: "Status", value: status },
        { label: "Target block", value: targetBlock }
      ]} />} />
      <ResearchLayout findings={<>
        <StatTile label="Status" value="Unavailable" footnote="No analytical result is returned" />
        <StatTile label="Required Source" value={requiredSource} footnote="Not admitted in this release" />
      </>}>
        <GatedNote why={<><p>{prerequisites.replace(/\s*\(Blocks? [^)]+\)\.?/g, ".")}</p><p>{description}</p><p>This tool requires verified inputs before it can return an analytical result.</p></>}>
          Required source unavailable.
        </GatedNote>
        <nav className="capability-alternatives" aria-label="Continue your research">
          {alternativeRoutes.map(route => <Link key={route.href} href={buildPreservedContextUrl(route.href, context)} className="button">{route.label}</Link>)}
        </nav>
      </ResearchLayout>
    </PageShell>
  );
}
