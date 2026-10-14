"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "./ui/kit";
import { PlayerAvatar } from "./ui/identity";
import { TeamLogo } from "./team-logo";
import { PageHeader } from "./ui/panel";
import { formatDate } from "@/lib/format-date";
import catalog from "@/lib/team-branding.json";
import { teamBrandColor } from "@/lib/team-colors";
import { readStatsReturn, STATS_RETURN_PARAM, markStatsRestore } from "@/lib/stats-return";
import type { PlayerBio } from "@/lib/types";

/** Feet and inches with quarter-inch fractions: 79.25 → 6′7¼″. */
export function formatHeight(inches: number | null | undefined): string | null {
  if (inches == null) return null;
  const quarters = Math.round(inches * 4);
  const feet = Math.floor(quarters / 48);
  const rest = quarters - feet * 48;
  const whole = Math.floor(rest / 4);
  const fraction = ["", "¼", "½", "¾"][rest % 4];
  return `${feet}′${whole}${fraction}″`;
}

function teamName(tricode: string): string {
  return catalog.teams.find(entry => entry.tricode === tricode)?.artwork_name ?? tricode;
}

function ordinalSuffix(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return "th";
  return ["th", "st", "nd", "rd"][value % 10] ?? "th";
}

/**
 * The player page header: Back to table (only when opened from Stats), then the photo, a hairline
 * divider and one left-aligned column: name with the current team's logo, team · position ·
 * jersey, bio facts, and the combine line. Listings are team-reported; the combine line holds
 * measured values and appears only when the player attended a combine.
 */
export function PlayerBioHeader({ name, playerId, portraitUrl, team, bio, currentSeason, actions }: {
  name: string;
  playerId: string;
  portraitUrl?: string | null;
  team: { id: string; tricode: string; name: string } | null;
  bio: PlayerBio | null;
  /** The catalog's current season: age is dated only when the page looks at another one. */
  currentSeason: string | null;
  actions: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromStats = searchParams?.get(STATS_RETURN_PARAM) === "stats";
  const [returnHref, setReturnHref] = useState<string | null>(null);
  useEffect(() => {
    // Session storage is browser-only, so the button appears after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromStats) setReturnHref(readStatsReturn()?.href ?? null);
  }, [fromStats]);

  useEffect(() => {
    if (!returnHref) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[role='dialog'], [role='menu'], [role='listbox']")) return;
      event.preventDefault();
      markStatsRestore();
      router.push(returnHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [returnHref, router]);

  const listed = [formatHeight(bio?.listed_height_inches), bio?.listed_weight_lbs != null ? `${Math.round(bio.listed_weight_lbs)} lb` : null].filter(Boolean).join(" · ");
  const datedAge = bio?.age != null && currentSeason != null && bio.season !== currentSeason;
  const draftTeam = bio?.draft?.team_tricode ?? null;
  const draftPick = bio?.draft ? [String(bio.draft.year), bio.draft.round != null && bio.draft.pick != null ? `R${bio.draft.round} #${bio.draft.pick}` : null].filter(Boolean).join(" · ") : null;
  const experience = bio?.prior_seasons == null ? null : bio.prior_seasons === 0 ? "Rookie"
    : `${bio.prior_seasons + 1}${ordinalSuffix(bio.prior_seasons + 1)} season`;
  const origin = bio?.draft?.organization ?? bio?.college ?? null;
  // Born carries the age; outside the current season the age is dated to the page's cutoff.
  const born = bio?.birth_date
    ? { label: "Born", value: `${formatDate(bio.birth_date)}${bio.age != null && !datedAge ? ` (${bio.age})` : ""}`,
      detail: datedAge ? `Age ${bio.age} on ${formatDate(bio.as_of)}` : null }
    : { label: "Age", value: bio?.age != null ? String(bio.age) : null, detail: datedAge ? `On ${formatDate(bio?.as_of ?? "")}` : null };
  const facts: { label: string; value: ReactNode; detail?: string | null; title?: string }[] = [
    born,
    { label: "Listed", value: listed || null, title: "Team-reported height (in shoes) and weight" },
    { label: "Draft", value: bio?.draft ? <>{draftPick}{draftTeam && <> · <span className="player-bio-team">
      <TeamLogo team={draftTeam} size={18} />{draftTeam}</span></>}</> : bio?.undrafted ? "Undrafted" : null, detail: origin },
    { label: "Experience", value: experience },
    { label: "Country", value: bio?.country ?? null },
  ];
  const combine = bio?.combine;
  const measured = combine ? [
    ["Barefoot", formatHeight(combine.height_no_shoes_inches)],
    ["In shoes", formatHeight(combine.height_shoes_inches)],
    ["Wingspan", formatHeight(combine.wingspan_inches)],
    ["Reach", formatHeight(combine.standing_reach_inches)],
    ["Weight", combine.weight_lbs != null ? `${Math.round(combine.weight_lbs)} lb` : null],
  ].filter((entry): entry is [string, string] => entry[1] != null) : [];
  // The header names who the player plays for today; without a current listing (free agents,
  // retired players) it falls back to the team of the page's season.
  const listedTeam = bio?.current_team?.team_tricode ?? null;
  const headerTeam = listedTeam
    ? { tricode: listedTeam, name: teamName(listedTeam) }
    : team ? { tricode: team.tricode, name: team.name } : null;
  const identity = [headerTeam?.name, bio?.listed_position, bio?.jersey ? `#${bio.jersey}` : null].filter(Boolean) as string[];
  const glow = teamBrandColor(headerTeam?.tricode);

  return (
    <div className="player-bio-header" style={glow ? { "--team-glow": glow } as CSSProperties : undefined}>
      {returnHref && <Button size="xs" variant="primary" icon="left" onClick={() => { markStatsRestore(); router.push(returnHref); }}>
        Back to table<kbd className="player-back-kbd" aria-hidden="true">Esc</kbd>
      </Button>}
      <div className={`player-bio-main ${glow ? "has-glow" : ""}`}>
        <PlayerAvatar playerId={playerId} name={name} portraitUrl={portraitUrl} team={headerTeam?.tricode ?? null} size="xl" className="player-bio-photo" />
        <span className="player-bio-divider" aria-hidden="true" />
        <div className="player-bio-who">
          <PageHeader title={name} className="player-bio-name" />
          {identity.length > 0 && <p className="player-bio-identity">{identity.map(part => <span key={part}>{part}</span>)}</p>}
          <dl className="player-bio-facts">
            {facts.filter(fact => fact.value).map(fact => <div key={fact.label} title={fact.title}>
              <dt>{fact.label}</dt><dd><span>{fact.value}</span>{fact.detail && <small>{fact.detail}</small>}</dd>
            </div>)}
          </dl>
          {combine && measured.length > 0 && <dl className="player-bio-combine" title="Official NBA Draft Combine measurements">
            <dt>{combine.draft_year} Combine</dt>
            {measured.map(([label, value]) => <dd key={label}>{label} <strong>{value}</strong></dd>)}
          </dl>}
        </div>
        <div className="player-bio-actions">{actions}</div>
      </div>
    </div>
  );
}
