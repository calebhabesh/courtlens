import Link from "next/link";

export interface CapabilityNoticeProps {
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
  const statusLabel =
    status === "gated"
      ? "Gated Implementation"
      : status === "in_progress"
      ? "Under Construction"
      : "Planned Block";

  return (
    <div className="workbench-content">
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span className="font-mono text-xs text-muted">{featureId}</span>
            <span className="replica-badge-gated">{statusLabel}</span>
            <span className="font-mono text-xs text-muted">Target: {targetBlock}</span>
          </div>
          <h1 className="page-title">{featureTitle}</h1>
          <p className="page-subtitle font-mono text-xs text-muted">{canonicalRoute}</p>
        </div>
      </div>

      <div className="panel" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem", color: "var(--accent)" }}>
          Capability Specification &amp; Data Gates
        </h2>
        <p style={{ color: "var(--text)", lineHeight: 1.6, marginBottom: "1rem" }}>
          {description}
        </p>

        <div className="notice-box" style={{ borderLeftColor: "var(--warning)", marginBottom: "1.25rem" }}>
          <strong style={{ color: "var(--warning)" }}>Prerequisites &amp; Admitted Inputs:</strong>
          <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {prerequisites}
          </p>
        </div>

        <p className="text-xs text-muted" style={{ fontStyle: "italic" }}>
          Per the CourtLoad Databallr replica implementation plan, destination routes do not render inert mockups or fabricate unverified outputs before their underlying warehouse and query blocks are admitted.
        </p>
      </div>

      <div className="panel" style={{ padding: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem", color: "var(--text)" }}>
          Active Workbench Tools Available Now
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {alternativeRoutes.map((route) => (
            <Link key={route.href} href={route.href} className="button button-small">
              {route.label} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
