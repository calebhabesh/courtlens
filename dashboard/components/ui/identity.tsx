"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import catalog from "../../lib/team-branding.json";
import { teamAccent } from "../../lib/team-colors";
import { PlayerPortrait } from "../player-portrait";
import { TeamLogo } from "../team-logo";
import { Icon } from "./icon";

export type IdentitySize = "sm" | "md" | "lg" | "xl";

const LOGO_SIZE: Record<IdentitySize, number> = { sm: 16, md: 20, lg: 28, xl: 40 };
const PORTRAIT_SIZE: Record<IdentitySize, "sm" | "md" | "lg"> = { sm: "sm", md: "md", lg: "lg", xl: "lg" };

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

export interface PlayerIdentityProps {
  playerId?: string;
  name: string;
  /** Team ID or tricode for the logo badge and accent; omitted when the team scope is unknown. */
  team?: string | null;
  subtitle?: ReactNode;
  size?: IdentitySize;
  href?: string;
  portraitUrl?: string | null;
  className?: string;
}

/**
 * A player as a primary subject (D10): headshot with a team-logo badge and a team-color accent.
 * A missing photo falls back to initials on the team color; identity is never removed.
 */
export function PlayerIdentity({ playerId, name, team, subtitle, size = "md", href, portraitUrl, className = "" }: PlayerIdentityProps) {
  return (
    <div className={`ui-identity ui-identity-${size} ${team ? "has-team" : ""} ${className}`} style={teamStyle(team)}>
      <span className="ui-identity-media">
        <PlayerPortrait playerId={playerId} name={name} portraitUrl={portraitUrl} size={PORTRAIT_SIZE[size]} className="ui-identity-portrait" />
        {team && <span className="ui-identity-badge"><TeamLogo team={team} size={LOGO_SIZE[size]} /></span>}
      </span>
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

export interface EntityChipProps {
  kind: "player" | "team";
  id: string;
  name: string;
  /** For players: team ID or tricode for the accent. */
  team?: string | null;
  href?: string;
  onRemove?: () => void;
  className?: string;
}

/** Compact pill for trays, roster lanes and selections: 24px headshot or logo plus the name. */
export function EntityChip({ kind, id, name, team, href, onRemove, className = "" }: EntityChipProps) {
  return (
    <span className={`ui-entity-chip ${className}`} style={teamStyle(kind === "team" ? id : team)}>
      {kind === "player"
        ? <PlayerPortrait playerId={id} name={name} size="sm" className="ui-entity-chip-media" />
        : <TeamLogo team={id} size={20} />}
      <Name href={href}>{name}</Name>
      {onRemove && (
        <button type="button" className="ui-entity-chip-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      )}
    </span>
  );
}
