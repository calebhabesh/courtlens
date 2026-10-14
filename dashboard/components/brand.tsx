import Link from "next/link";
import { useId } from "react";
import { CourtLensWordmark } from "./courtlens-wordmark";

/** The ball-lens mark; also the assistant avatar on /ask. */
export function BrandMark({ size = 24, framed = true }: { size?: number; framed?: boolean }) {
  const silverId = useId();
  const silver = `url(#${silverId})`;

  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={silverId} x1="5" y1="5" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#eef3f8" />
          <stop offset="0.22" stopColor="#a1adbd" />
          <stop offset="0.42" stopColor="#f8fbff" />
          <stop offset="0.58" stopColor="#8795a8" />
          <stop offset="0.78" stopColor="#d5dfe9" />
          <stop offset="1" stopColor="#a3b0c2" />
        </linearGradient>
      </defs>
      {framed && <rect width="32" height="32" rx="7" fill="#0c0d10" />}
      {/* Handle sits under the ring stroke: joined flush without entering the lens. */}
      <line x1="20.5" y1="20.5" x2="27.4" y2="27.4" stroke={silver} strokeWidth="3.4" strokeLinecap="butt" />
      <circle cx="27.4" cy="27.4" r="1.7" fill={silver} />
      <circle cx="14" cy="14" r="7" fill="#ff7a2f" />
      <path d="M7 14h14M14 7v14M9.2 9.2c2.6 2.6 2.6 7 0 9.6M18.8 9.2c-2.6 2.6-2.6 7 0 9.6" fill="none" stroke="#0c0d10" strokeWidth="1.2" />
      <circle cx="14" cy="14" r="9.2" fill="none" stroke={silver} strokeWidth="2" />
    </svg>
  );
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <Link className="brand" href="/" aria-label="CourtLens Research Workbench home">
      <span className="brand-mark-svg" aria-hidden="true">
        <BrandMark framed={false} />
      </span>
      <div className="brand-text">
        <span className="brand-title"><CourtLensWordmark /></span>
        {subtitle && <span className="brand-subtitle">{subtitle}</span>}
      </div>
    </Link>
  );
}
