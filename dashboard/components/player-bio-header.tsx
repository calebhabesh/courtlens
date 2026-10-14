"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "./ui/kit";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogo } from "./team-logo";
import { PageHeader } from "./ui/panel";
import { formatDate } from "@/lib/format-date";
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

function ordinalSuffix(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return "th";
  return ["th", "st", "nd", "rd"][value % 10] ?? "th";
}

/**
 * The player page header: Back to table (only when opened from Stats), photo, name, team,
 * position and jersey, then a compact bio grid. Listings are team-reported; the combine line
 * holds measured values and appears only when the player attended a combine.
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
  const draft = bio?.draft
    ? [String(bio.draft.year), bio.draft.round != null && bio.draft.pick != null ? `R${bio.draft.round}, #${bio.draft.pick}` : null, bio.draft.team_tricode].filter(Boolean).join(" · ")
    : bio?.undrafted ? "Undrafted" : null;
  const experience = bio?.prior_seasons == null ? null : bio.prior_seasons === 0 ? "Rookie"
    : `${bio.prior_seasons + 1}${ordinalSuffix(bio.prior_seasons + 1)} season`;
  const origin = bio?.draft?.organization ?? bio?.college;
  const facts: { label: string; value: string | null; title?: string }[] = [
    { label: "Age", value: bio?.age != null ? `${bio.age}${datedAge ? ` (as of ${formatDate(bio.as_of)})` : ""}` : null,
      title: bio?.birth_date ? `Born ${formatDate(bio.birth_date)}` : undefined },
    { label: "Listed", value: listed || null, title: "Team-reported height (in shoes) and weight" },
    { label: "Experience", value: experience },
    { label: "Draft", value: draft },
    { label: "Pre-draft", value: origin ?? null },
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
  const identity = [team?.name, bio?.listed_position, bio?.jersey ? `#${bio.jersey}` : null].filter(Boolean).join(" · ");

  return (
    <div className="player-bio-header">
      {returnHref && <Button size="xs" variant="primary" icon="left" onClick={() => { markStatsRestore(); router.push(returnHref); }}>
        Back to table<kbd className="player-back-kbd" aria-hidden="true">Esc</kbd>
      </Button>}
      <div className="player-bio-main">
        <PlayerPortrait playerId={playerId} name={name} portraitUrl={portraitUrl ?? undefined} size="lg" />
        <div className="player-bio-identity">
          <PageHeader title={name} subtitle={identity || undefined} className="player-bio-title" />
          {team && <TeamLogo team={team.tricode} size={20} />}
        </div>
        <dl className="player-bio-facts">
          {facts.filter(fact => fact.value).map(fact => <div key={fact.label} title={fact.title}>
            <dt>{fact.label}</dt><dd>{fact.value}</dd>
          </div>)}
          {combine && measured.length > 0 && <div className="player-bio-combine" title="Official NBA Draft Combine measurements">
            <dt>{combine.draft_year} Combine</dt>
            <dd>{measured.map(([label, value]) => <span key={label}><span className="player-bio-combine-label">{label}</span> {value}</span>)}</dd>
          </div>}
        </dl>
        <div className="player-bio-actions">{actions}</div>
      </div>
    </div>
  );
}
