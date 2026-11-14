import { useId, type ReactNode } from "react";
import { REST_SEAM_PATH } from "@/lib/ball-seams";

/** The ball-lens mark; also the assistant avatar on /ask. `seams` replaces the drawn seams (the spinning header mark). */
export function BrandMark({ size = 24, framed = true, seams }: { size?: number; framed?: boolean; seams?: ReactNode }) {
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
      <circle cx="14" cy="14" r="8.4" fill="#b44d28" />
      {seams ?? <path d={REST_SEAM_PATH} fill="none" stroke="#0c0d10" strokeWidth="1.2" />}
      <circle cx="14" cy="14" r="9.2" fill="none" stroke={silver} strokeWidth="2" />
    </svg>
  );
}
