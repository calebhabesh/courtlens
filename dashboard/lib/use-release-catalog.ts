"use client";
import { useEffect, useState } from "react";
import { getSharedCatalog } from "./route-availability";
import type { WorkbenchCatalog } from "./types";

export function useReleaseCatalog(releaseId: string | null) {
  const [loaded, setLoaded] = useState<{ key: string | null; catalog: WorkbenchCatalog | null } | null>(null);
  useEffect(() => {
    let active = true;
    getSharedCatalog(releaseId ?? undefined).then(catalog => { if (active) setLoaded({ key: releaseId, catalog }); }).catch(() => { if (active) setLoaded({ key: releaseId, catalog: null }); });
    return () => { active = false; };
  }, [releaseId]);
  return loaded?.key === releaseId ? loaded.catalog : undefined;
}
