"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import catalog from "../../lib/team-branding.json";
import { teamAccent } from "../../lib/team-colors";
import type { PortraitEra } from "@/lib/portrait-source";
import { PlayerPortrait } from "../player-portrait";
import { TeamLogo } from "../team-logo";

export type IdentitySize = "sm" | "md" | "lg" | "xl";

const LOGO_SIZE: Record<IdentitySize, number> = { sm: 16, md: 20, lg: 28, xl: 40 };

export function teamStyle(team?: string | null): CSSProperties | undefined {
  const accent = teamAccent(team);
  return accent ? ({ "--team-color": accent } as CSSProperties) : undefined;
}

function teamName(team: string): string {
  return catalog.teams.find((entry) => entry.team_id === team || entry.tricode === team)?.artwork_name ?? team;
}

function teamCode(team: string): string {
  return catalog.teams.find((entry) => entry.team_id === team || entry.tricode === team)?.tricode ?? team;
}

function Name({ href, children }: { href?: string; children: ReactNode }) {
  return href ? <Link className="ui-identity-name" href={href}>{children}</Link> : <span className="ui-identity-name">{children}</span>;
}

function IdentityMedia({ playerId, name, team, size, portraitUrl, era }: { playerId?: string; name: string; team?: string | null; size: IdentitySize; portraitUrl?: string | null; era?: PortraitEra | null }) {
  return (
    <span className="ui-identity-media">
      <PlayerPortrait playerId={playerId} name={name} portraitUrl={portraitUrl} size={size} era={era} className="ui-identity-portrait" />
      {team && <span className="ui-identity-badge"><TeamLogo team={team} season={era?.season} size={LOGO_SIZE[size]} /></span>}
    </span>
  );
}

/**
 * The identity photo on its own: the team-colour ring with the team logo badge, as in Compare,
 * for headers that lay out the name themselves.
 */
/** `era` shows the player's headshot from that team-season (2015-16 on), else the current one. */
export function PlayerAvatar({ playerId, name, team, size = "xl", portraitUrl, era, className = "" }: {
  playerId?: string; name: string; team?: string | null; size?: IdentitySize; portraitUrl?: string | null; era?: PortraitEra | null; className?: string;
}) {
  return (
    <span className={`ui-identity ui-identity-${size} ${team ? "has-team" : ""} ${className}`} style={teamStyle(team)}>
      <IdentityMedia playerId={playerId} name={name} team={team} size={size} portraitUrl={portraitUrl} era={era} />
    </span>
  );
}

export interface PlayerIdentityProps {
  playerId?: string;
  name: string;
  /** Team ID or tricode for the logo badge and accent; omitted when the team scope is unknown. */
  team?: string | null;
  subtitle?: ReactNode;
  size?: IdentitySize;
  href?: string;
  portraitUrl?: string | null;
  /** The team-season under analysis (Design Language, Identity); the current photo when absent. */
  era?: PortraitEra | null;
  className?: string;
}

/**
 * A player as a primary subject (D10): headshot with a team-logo badge and a team-color accent.
 * A missing photo falls back to initials on the team color; identity is never removed.
 */
export function PlayerIdentity({ playerId, name, team, subtitle, size = "md", href, portraitUrl, era, className = "" }: PlayerIdentityProps) {
  return (
    <div className={`ui-identity ui-identity-${size} ${team ? "has-team" : ""} ${className}`} style={teamStyle(team)}>
      <IdentityMedia playerId={playerId} name={name} team={team} size={size} portraitUrl={portraitUrl} era={era} />
      <span className="ui-identity-text">
        <Name href={href}>{name}</Name>
        {(team || subtitle) && (
          <span className="ui-identity-subtitle">
            {team && <span>{teamCode(team)}</span>}
            {team && subtitle && <span aria-hidden="true">·</span>}
            {subtitle}
          </span>
        )}
      </span>
    </div>
  );
}

export interface TeamIdentityProps {
  /** Team ID or tricode. */
  team: string;
  name?: string;
  subtitle?: ReactNode;
  size?: IdentitySize;
  href?: string;
  className?: string;
}

/** A team as a primary subject: logo, name and team-color accent. */
export function TeamIdentity({ team, name, subtitle, size = "md", href, className = "" }: TeamIdentityProps) {
  const logo = { sm: 20, md: 32, lg: 56, xl: 80 }[size];
  return (
    <div className={`ui-identity ui-identity-team ui-identity-${size} ${className}`} style={teamStyle(team)}>
      <span className="ui-identity-media"><TeamLogo team={team} size={logo} /></span>
      <span className="ui-identity-text">
        <Name href={href}>{name ?? teamName(team)}</Name>
        {subtitle && <span className="ui-identity-subtitle">{subtitle}</span>}
      </span>
    </div>
  );
}
