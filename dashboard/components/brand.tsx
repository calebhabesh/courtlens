import Link from "next/link";

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <Link className="brand" href="/" aria-label="CourtLoad Research Workbench home">
      <span className="brand-mark-svg" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="24" height="24">
          <rect width="32" height="32" rx="6" fill="#0b0d10" />
          <circle cx="16" cy="16" r="11" fill="none" stroke="#ff7a2f" strokeWidth="2" />
          <line x1="5" y1="16" x2="27" y2="16" stroke="#ff7a2f" strokeWidth="1.75" />
          <line x1="16" y1="5" x2="16" y2="27" stroke="#ff7a2f" strokeWidth="1.75" />
          <path d="M 8.5 8.5 C 12.8 12.2 12.8 19.8 8.5 23.5" fill="none" stroke="#ff7a2f" strokeWidth="1.5" />
          <path d="M 23.5 8.5 C 19.2 12.2 19.2 19.8 23.5 23.5" fill="none" stroke="#ff7a2f" strokeWidth="1.5" />
        </svg>
      </span>
      <div className="brand-text">
        <span className="brand-title">COURTLOAD</span>
        {subtitle && <span className="brand-subtitle">{subtitle}</span>}
      </div>
    </Link>
  );
}
