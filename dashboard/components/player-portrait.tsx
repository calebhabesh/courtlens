"use client";

import { useState } from "react";
import { browserApi } from "@/lib/workbench-api";

interface PlayerPortraitProps {
  playerId?: string;
  name: string;
  portraitUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  alt?: string;
}

export function PlayerPortrait({
  playerId,
  name,
  portraitUrl,
  size = "sm",
  className = "",
  alt
}: PlayerPortraitProps) {
  const [error, setError] = useState(false);

  // Compute initials
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  const dimension = size === "lg" ? 80 : size === "md" ? 48 : 30;
  const sizeClass = size === "lg" ? "player-portrait-lg" : size === "md" ? "player-portrait-md" : "player-portrait-sm";

  // Use explicit portraitUrl, or player endpoint if playerId provided
  const portraitPath = portraitUrl || (playerId ? `/api/workbench/players/${playerId}/portrait` : null);
  const versionedPath = portraitPath?.match(/^\/api\/workbench\/players\/[^/]+\/portrait$/)
    ? `${portraitPath}?quality=1040x760` : portraitPath;
  const source = versionedPath?.startsWith("/")
    ? `${browserApi.replace(/\/$/, "")}${versionedPath}`
    : versionedPath;

  if (error || !source) {
    return (
      <div
        className={`player-portrait-fallback ${sizeClass} ${className}`}
        title={name}
        aria-label={alt ?? `${name} portrait placeholder`}
      >
        {initials || "🏀"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt={alt ?? `${name} portrait`}
      width={dimension}
      height={dimension}
      loading={size === "lg" ? "eager" : "lazy"}
      onError={() => setError(true)}
      className={`player-portrait ${sizeClass} ${className}`}
    />
  );
}
