import Link from "next/link";

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <Link className="brand" href="/" aria-label="CourtLens Research Workbench home">
      <span className="brand-mark-svg" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="24" height="24">
          <rect width="32" height="32" rx="7" fill="#0c0d10" />
          {/* Handle sits under the ring stroke: joined flush without entering the lens. */}
          <line x1="20.5" y1="20.5" x2="27.4" y2="27.4" stroke="#f2f3f5" strokeWidth="3.4" strokeLinecap="butt" />
          <circle cx="27.4" cy="27.4" r="1.7" fill="#f2f3f5" />
          <circle cx="14" cy="14" r="7" fill="#ff7a2f" />
          <path d="M7 14h14M14 7v14M9.2 9.2c2.6 2.6 2.6 7 0 9.6M18.8 9.2c-2.6 2.6-2.6 7 0 9.6" fill="none" stroke="#0c0d10" strokeWidth="1.2" />
          <circle cx="14" cy="14" r="9.2" fill="none" stroke="#f2f3f5" strokeWidth="2" />
        </svg>
      </span>
      <div className="brand-text">
        <span className="brand-title">COURTLENS</span>
        {subtitle && <span className="brand-subtitle">{subtitle}</span>}
      </div>
    </Link>
  );
}
