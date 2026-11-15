"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "./ui/kit";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogo } from "./team-logo";
import { TeamLink } from "./entity-link";
import { PageHeader } from "./ui/panel";
import { honours } from "@/lib/awards";
import { countryFlag } from "@/lib/country-flags";
import { formatDate } from "@/lib/format-date";
import { teamBrandColor } from "@/lib/team-colors";
import { teamArtwork, teamNameAt } from "@/lib/team-era";
import { browserApi } from "@/lib/workbench-api";
import { readStatsReturn, STATS_RETURN_PARAM, markStatsRestore } from "@/lib/stats-return";
import { BackButton, onBareEscape, useNavLabel } from "./ui/back-button";
import type { PlayerBio, PositionEstimate } from "@/lib/types";
import { TeamWatermark } from "./team-watermark";
import { positionTitle } from "@/lib/position-estimates";

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

/** The team's name in that season (the Philadelphia Warriors in 1961-62), else today's. */
/** Franchises that drafted under their old name because they moved after that June's draft. */
const MOVED_AFTER_DRAFT: Record<string, number> = { MEM: 2001, OKC: 2008 };

/**
 * The season whose name a draft pick was made under. Moves and renames before the draft count
 * (New Orleans 2002, Charlotte Bobcats 2004, Brooklyn 2012, Pelicans 2013, Hornets 2014), so a
 * draft is named by the season it opens; Vancouver (2001) and Seattle (2008) moved after it.
 */
function draftedAs(tricode: string, year: number): string {
  const start = MOVED_AFTER_DRAFT[tricode] === year ? year - 1 : year;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function teamName(tricode: string, season?: string | null): string {
  return teamNameAt(tricode, season) ?? tricode;
}

function ordinalSuffix(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return "th";
  return ["th", "st", "nd", "rd"][value % 10] ?? "th";
}

/**
 * The player page header: Back to table (only when opened from Stats), then the photo on the
 * team's colour with its logo behind the head (as on PvP and ESPN), a hairline divider and one
 * left-aligned column: name, a large team logo with team · position · jersey, bio facts, and
 * the combine line. Listings are team-reported; the combine line holds
 * measured values and appears only when the player attended a combine.
 */
export function PlayerBioHeader({ name, playerId, portraitUrl, team, bio, currentSeason, positionEstimate, actions }: {
  name: string;
  playerId: string;
  portraitUrl?: string | null;
  team: { id: string; tricode: string; name: string } | null;
  bio: PlayerBio | null;
  /** The catalog's current season: age is dated only when the page looks at another one. */
  currentSeason: string | null;
  /** The page season's estimated five-position label, shown after the NBA listing. */
  positionEstimate?: PositionEstimate | null;
  actions: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromStats = searchParams?.get(STATS_RETURN_PARAM) === "stats";
  const [returnHref, setReturnHref] = useState<string | null>(null);
  useNavLabel(name);
  useEffect(() => {
    // Session storage is browser-only, so the button appears after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromStats) setReturnHref(readStatsReturn()?.href ?? null);
  }, [fromStats]);

  // A layout effect attaches Esc before the browser paints the button, so it never shows dead.
  useLayoutEffect(() => {
    if (!returnHref) return;
    return onBareEscape(() => { markStatsRestore(); router.push(returnHref); });
  }, [returnHref, router]);

  const listed = [formatHeight(bio?.listed_height_inches), bio?.listed_weight_lbs != null ? `${Math.round(bio.listed_weight_lbs)} lb` : null].filter(Boolean).join(" · ");
  const datedAge = bio?.age != null && currentSeason != null && bio.season !== currentSeason;
  const draftTeam = bio?.draft?.team_tricode ?? null;
  const draftSeason = bio?.draft && draftTeam ? draftedAs(draftTeam, bio.draft.year) : null;
  const draftPick = bio?.draft ? [String(bio.draft.year), bio.draft.round != null && bio.draft.pick != null ? `R${bio.draft.round} #${bio.draft.pick}` : null].filter(Boolean).join(" · ") : null;
  const experience = bio?.prior_seasons == null ? null : bio.prior_seasons === 0 ? "Rookie"
    : `${bio.prior_seasons + 1}${ordinalSuffix(bio.prior_seasons + 1)} season`;
  const college = bio?.reference?.college ?? null;
  // The College fact names the school, so Draft repeats only an origin that is not it (a club).
  const draftOrigin = bio?.draft?.organization ?? bio?.college ?? null;
  const originIsCollege = bio?.draft?.organization_type === "College/University" || draftOrigin === bio?.college;
  const origin = college && originIsCollege ? null : draftOrigin;
  const flag = countryFlag(bio?.country);
  // Born carries the age; outside the current season the age is dated to the page's cutoff.
  const ref = bio?.reference ?? null;
  const born = bio?.birth_date
    ? { label: "Born", value: `${formatDate(bio.birth_date)}${bio.age != null && !datedAge ? ` (${bio.age})` : ""}`,
      detail: [ref?.birthplace, datedAge ? `Age ${bio.age} on ${formatDate(bio.as_of)}` : null].filter(Boolean).join(" · ") || null }
    : { label: "Age", value: bio?.age != null ? String(bio.age) : null, detail: datedAge ? `On ${formatDate(bio?.as_of ?? "")}` : null };
  // "King in Riverside, California" -> school "King", place "Riverside, California".
  const school = ref?.high_school?.match(/^(.*?)\s+in\s+(.+)$/) ?? null;
  const facts: { label: string; value: ReactNode; detail?: ReactNode; title?: string }[] = [
    born,
    { label: "Listed", value: listed || null, detail: ref?.shoots ? `Shoots ${ref.shoots.toLowerCase()}` : null,
      title: "Team-reported height (in shoes) and weight" },
    // The pick on top, the team that made it underneath (like the school's town), then any
    // non-college origin.
    { label: "Draft", value: bio?.draft ? draftPick : bio?.undrafted ? "Undrafted" : null,
      detail: draftTeam ? <span className="player-bio-team"><TeamLogo team={draftTeam} season={draftSeason} size={16} />
        <TeamLink team={draftTeam} scope={{ season: draftSeason }}>{teamName(draftTeam, draftSeason)}</TeamLink>{origin && ` · ${origin}`}</span> : origin },
    { label: "Experience", value: experience, detail: ref?.debut_date ? `Debut ${formatDate(ref.debut_date)}` : null },
    { label: "College", value: college ? <span className="player-bio-college">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 96 px logo the API keeps needs no image optimisation */}
      {college.logo_url && <img src={`${browserApi.replace(/\/$/, "")}${college.logo_url}`} width={18} height={18} alt="" loading="lazy" />}{college.name}</span> : null,
      detail: college?.location ?? null,
      title: college?.school ? `${college.school}${college.location ? ` · ${college.location}` : ""} · ${college.attribution ?? ""}${college.logo_url ? " · logo: ESPN" : ""}` : undefined },
    { label: "High school", value: school ? school[1] : ref?.high_school ?? null, detail: school ? school[2] : null },
    { label: "Country", value: bio?.country ? <span className="player-bio-country">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 1 KB static flag needs no image optimisation */}
      {flag && <img src={flag} width={20} height={15} alt="" loading="lazy" />}{bio.country}</span> : null },
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
  // retired players) it uses the index's last team. Missing index evidence falls back to
  // the page's observed season team, explicitly labelled as observed.
  const listedTeam = bio?.current_team?.team_tricode ?? null;
  const lastTeam = bio?.last_team?.team_tricode;
  // A last team is drawn as it was in the season he last played for it (the 1961-62 Warriors).
  const lastSeason = bio?.last_team?.listing_season ?? null;
  const headerTeam = listedTeam
    ? { tricode: listedTeam, name: teamName(listedTeam), season: null, linkSeason: currentSeason }
    : lastTeam ? { tricode: lastTeam, name: teamName(lastTeam, lastSeason), season: lastSeason, linkSeason: lastSeason }
    : team ? { tricode: team.tricode, name: team.name, season: null, linkSeason: currentSeason } : null;
  const teamPrefix = listedTeam ? "" : lastTeam ? "Last with " : "Observed with ";
  // Off every NBA roster today (the free-agency tracker's evidence): the state leads the details.
  const status = bio?.current_status;
  const state = status?.state === "abroad" ? `Abroad${status.move?.club ? ` · ${status.move.club}` : ""}`
    : status?.state === "retired" ? "Retired" : status?.state === "free_agent" ? "Free agent" : null;
  // The NBA listing (G, F, C) and, beside it, the season's estimated five-position label.
  const estimate = positionEstimate
    ? <span title={`${positionTitle(positionEstimate.position, positionEstimate.listed, positionEstimate.provisional)} (${positionEstimate.season})`}>plays {positionEstimate.position} (est.)</span>
    : null;
  const details: { key: string; node: ReactNode }[] = [];
  if (state) details.push({ key: "state", node: state });
  if (bio?.listed_position) details.push({ key: "listed", node: bio.listed_position });
  if (estimate) details.push({ key: "estimate", node: estimate });
  if (bio?.jersey && !status) details.push({ key: "jersey", node: `#${bio.jersey}` });
  const tint = teamBrandColor(headerTeam?.tricode, headerTeam?.season);
  const watermark = teamArtwork(headerTeam?.tricode, headerTeam?.season)?.asset ?? null;

  return (
    <div className="player-bio-header" style={tint ? { "--team-tint": tint } as CSSProperties : undefined}>
      {/* From the Stats table: back to its exact rows and scroll; from anywhere else, the shared Back. */}
      {returnHref ? <Button size="xs" variant="primary" icon="left" onClick={() => { markStatsRestore(); router.push(returnHref); }}>
        Back to table<kbd className="player-back-kbd" aria-hidden="true">Esc</kbd>
      </Button> : !fromStats && <BackButton parent={{ href: "/players", label: "Player Dashboard" }} />}
      <div className="player-bio-main">
        <span className="player-bio-photo">
          {watermark && <TeamWatermark asset={watermark} className="player-bio-watermark" />}
          <PlayerPortrait playerId={playerId} name={name} portraitUrl={portraitUrl} size="xl" className="player-bio-portrait" priority />
        </span>
        <span className="player-bio-divider" aria-hidden="true" />
        <div className="player-bio-who">
          <PageHeader title={name} className="player-bio-name" />
          {(headerTeam || details.length > 0) && <p className="player-bio-identity">
            {headerTeam && <span className="player-bio-identity-team">
              <TeamLogo team={headerTeam.tricode} season={headerTeam.season} size={36} />{teamPrefix}<TeamLink team={headerTeam.tricode} scope={{ season: headerTeam.linkSeason }}>{headerTeam.name}</TeamLink>
            </span>}
            {details.length > 0 && <span className="player-bio-identity-details">{details.map(part => <span key={part.key}>{part.node}</span>)}</span>}
          </p>}
          <dl className="player-bio-facts">
            {facts.filter(fact => fact.value).map(fact => <div key={fact.label} title={fact.title}>
              <dt>{fact.label}</dt><dd><span>{fact.value}</span>{fact.detail && <small>{fact.detail}</small>}</dd>
            </div>)}
          </dl>
          {combine && measured.length > 0 && <dl className="player-bio-combine" title="Official NBA Draft Combine measurements">
            <dt>{combine.draft_year} Combine</dt>
            {measured.map(([label, value]) => <dd key={label}>{label} <strong>{value}</strong></dd>)}
          </dl>}
          {ref && ref.honours.length > 0 && <ul className="player-bio-honours" aria-label="Career honours"
            title={`Career honours from ${ref.source}, as of ${formatDate(ref.as_of)}`}>
            {honours(ref.honours).map(item => <li key={item.label} className={item.top ? "is-top" : undefined}>{item.label}</li>)}
          </ul>}
        </div>
        <div className="player-bio-actions">{actions}</div>
      </div>
    </div>
  );
}
