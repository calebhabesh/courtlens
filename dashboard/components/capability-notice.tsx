import { buildPreservedContextUrl } from "@/lib/query-url";
import Link from "next/link";

export interface CapabilityNoticeProps {
  contextParams?: Record<string, string>;
  featureId: string;
  featureTitle: string;
  canonicalRoute: string;
  targetBlock: string;
  status?: "gated" | "planned" | "in_progress";
  prerequisites: string;
  description: string;
  alternativeRoutes?: Array<{ label: string; href: string }>;
}

export function CapabilityNotice({
  contextParams = {},
  featureId,
  featureTitle,
  canonicalRoute,
  targetBlock,
  status = "gated",
  prerequisites,
  description,
  alternativeRoutes = [
    { label: "Stats Explorer", href: "/stats" },
    { label: "Player Directory", href: "/players" },
    { label: "Team Cohorts", href: "/teams" },
    { label: "Head-to-Head Compare", href: "/compare" },
    { label: "Points Forecasts", href: "/forecasts" },
    { label: "Definitions & Methodology", href: "/methodology" },
  ]
}: CapabilityNoticeProps) {
  return (
    <div className="workbench-content">
      <div className="page-header"><div><h1 className="page-title">{featureTitle}</h1><p className="page-subtitle">{description}</p></div></div>
      <section className="panel"><h2>Required source unavailable</h2><p>{prerequisites.replace(/\s*\(Blocks? [^)]+\)\.?/g, "")}</p><p>This tool requires verified inputs before it can return an analytical result.</p></section>
      <section className="panel"><h2>Continue your research</h2><div className="toolbar">{alternativeRoutes.map(route => <Link key={route.href} href={buildPreservedContextUrl(route.href, new URLSearchParams(contextParams))} className="button button-small">{route.label}</Link>)}</div></section>
      <details className="panel"><summary>Capability details</summary><p>{featureId} · {canonicalRoute} · {status} · {targetBlock}</p></details>
    </div>
  );
}
