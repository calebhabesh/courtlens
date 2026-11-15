"use client";

// Site links SL05: one Related row, at the end of each hub page (player, team, game, series).
// Built from links the page derives from data it already loads (lib/related-links.ts). A
// destination the release cannot serve in that scope is left out, not shown disabled, using the
// catalog the header has already loaded (shared cache, no extra read).
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EntityAnchor } from "./entity-link";
import { TeamLogo } from "./team-logo";
import { getSharedCatalog } from "@/lib/route-availability";
import { availableRelated, type RelatedLink } from "@/lib/related-links";
import type { WorkbenchCatalog } from "@/lib/types";

/** `checked`: the server already left out what the release cannot serve (the team page), so the
 * row neither waits for nor reads the catalog. Otherwise pass the page's catalog, or the row uses
 * the header's shared one. */
export function RelatedRow({ links, catalog: given, checked = false }: { links: readonly RelatedLink[]; catalog?: WorkbenchCatalog | null; checked?: boolean }) {
  const searchParams = useSearchParams();
  const releaseId = searchParams.get("releaseId") ?? searchParams.get("release_id") ?? undefined;
  const [catalog, setCatalog] = useState<WorkbenchCatalog | null>(given ?? null);
  useEffect(() => {
    if (given || checked) return;
    let live = true;
    getSharedCatalog(releaseId)
      .then(value => { if (live) setCatalog(value); })
      .catch(() => { if (live) setCatalog(null); });
    return () => { live = false; };
  }, [given, checked, releaseId]);

  const shown = checked ? links : availableRelated(links, catalog);
  if (!shown.length) return null;
  return (
    <nav className="related-row" aria-label="Related">
      <h2 className="related-row-title">Related</h2>
      <ul className="related-row-list">
        {shown.map(link => (
          <li key={link.key}>
            <EntityAnchor href={link.href} variant={link.team ? "block" : "entity"} className="related-row-link">
              {link.team && <span className="related-row-logo" aria-hidden="true"><TeamLogo team={link.team.id} season={link.team.season} size={18} /></span>}
              <span className="entity-link-text">{link.label}</span>
            </EntityAnchor>
          </li>
        ))}
      </ul>
    </nav>
  );
}
