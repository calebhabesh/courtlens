"use client";

import type { SeasonHonorBadge, SeasonHonors } from "@/lib/compare-accolades";
import { Badge } from "./ui/badge";

function HonorBadge({ badge }: { badge: SeasonHonorBadge }) {
  const icon = badge.code === "MVP-1" ? "medal" : badge.code === "TITLE" ? "trophy" : badge.code === "AS" ? "star" : undefined;
  return <Badge variant={badge.win || badge.code === "AS" ? "accent" : "default"} icon={icon} title={badge.description}>{badge.label}</Badge>;
}

/** Every season honor stays visible; each wrapped row centers on its player's numeric column. */
function HonorStrip({ honors, name, side }: { honors: SeasonHonors; name: string; side: "a" | "b" }) {
  const badges = honors.badges;
  const label = `${name}, ${honors.season} honors`;
  return <div className="pvp-honors-side" data-identity={side} role="group" aria-label={label}>
    <div className="pvp-honors-strip">
      {badges?.map(badge => <HonorBadge key={badge.code} badge={badge} />)}
      {(!badges || !badges.length) && <span className="pvp-honors-empty">{badges == null ? "—" : honors.pending ? "Pending" : "None recorded"}</span>}
    </div>
  </div>;
}

export function CompareSeasonHonors({ honors, names }: { honors: [SeasonHonors, SeasonHonors]; names: [string, string] }) {
  const seasons = [...new Set(honors.map(entry => entry.season))].join(" / ");
  return <section className="pvp-honors" aria-label="Season honors">
    <h3>{seasons} Honors</h3>
    <div className="pvp-honors-pair">
      <HonorStrip key={`a-${names[0]}-${honors[0].season}`} honors={honors[0]} name={names[0]} side="a" />
      <HonorStrip key={`b-${names[1]}-${honors[1].season}`} honors={honors[1]} name={names[1]} side="b" />
    </div>
    {honors.some(entry => entry.pending) && <p className="pvp-honors-note">End-of-season awards pending at this cutoff.</p>}
  </section>;
}
