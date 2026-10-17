"use client";

import { useState } from "react";
import catalog from "@/lib/team-branding.json";

/** Only exact catalog IDs/codes resolve. Historical codes never migrate silently. */
export function TeamLogo({ team, size = 24 }: { team: string; size?: number }) {
  const record = catalog.teams.find((entry) => entry.team_id === team || entry.tricode === team);
  const [failedAsset, setFailedAsset] = useState<string | null>(null);
  const abbreviation = record?.tricode ?? team;
  return (
    <span
      className="team-logo"
      style={{ "--logo-size": `${size}px` } as React.CSSProperties}
      title={`${abbreviation}${record ? ` · ${record.artwork_name} artwork (current franchise)` : " · Artwork unavailable"}`}
      aria-label={abbreviation}
      role="img"
    >
      {record && failedAsset !== record.asset ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={record.asset} width={size} height={size} alt="" loading="lazy"
          onError={() => setFailedAsset(record.asset)} />
      ) : <span className="team-logo-fallback" aria-hidden="true">{abbreviation}</span>}
    </span>
  );
}

/**
 * Every represented team remains visible and named, independent of array order.
 *
 * A season split between teams keeps one shape (owner rule): two logos side by side, three in a
 * triangle, four in a 2x2 grid, each scaled down so the group fits the row a single logo fits.
 * `size` is that single logo's size; tables may set `--stack-logo` instead.
 */
export function TeamLogoStack({ teams, label = "Teams represented in selected scope", decorative = false, size }: {
  teams: string[]; label?: string; decorative?: boolean; size?: number;
}) {
  const represented = [...new Set(teams)].sort();
  if (represented.length === 0) return null;
  return (
    <span className="team-logo-stack" role="group" aria-hidden={decorative || undefined} tabIndex={decorative ? undefined : 0}
      data-count={represented.length > 4 ? "many" : represented.length}
      style={size ? { "--stack-logo": `${size}px` } as React.CSSProperties : undefined}
      aria-label={`${label}: ${represented.join(", ")}`} title={`${label}: ${represented.join(", ")}`}>
      {represented.map((team) => <TeamLogo key={team} team={team} size={size} />)}
    </span>
  );
}
