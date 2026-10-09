"use client";

import { useEffect, useMemo, useState } from "react";
import { executeWorkbenchQuery } from "./workbench-api";
import { bestFirst, rankInSortedPage, type GoodDirection } from "./percentile-display";
import type { QuerySpec } from "./types";

// Ranks are read from the server's own ordering of the eligible cohort (same QuerySpec and
// presentation as Stats); no ranking formula is computed here beyond counting better values.
export const RANK_PAGE_LIMIT = 100;

type RankTable = Record<string, Record<string, number | null>>;

/** For each metric, rank of every player on the server's best-first page (top RANK_PAGE_LIMIT). */
export function useCohortRanks(baseQuery: QuerySpec, metrics: string[], directions: Record<string, GoodDirection>) {
  const scopeKey = JSON.stringify({ ...baseQuery, sort: undefined, page: undefined });
  const [table, setTable] = useState<{ scopeKey: string; ranks: RankTable }>({ scopeKey, ranks: {} });
  const known = useMemo<RankTable>(() => (table.scopeKey === scopeKey ? table.ranks : {}), [table, scopeKey]);
  const missing = useMemo(() => metrics.filter((metric) => !(metric in known)), [metrics, known]);
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!missingKey) return;
    let active = true;
    const pending = missingKey.split(",");
    Promise.all(pending.map(async (metric) => {
      const direction = directions[metric];
      try {
        const result = await executeWorkbenchQuery(
          { ...baseQuery, sort: [{ field: metric, direction: bestFirst(direction), nulls_last: true }], page: { limit: RANK_PAGE_LIMIT } },
          { player_ids: null }
        );
        const page = result.items.map((item) => ({ playerId: item.player_id, value: item.metrics[metric] }));
        const ranks: Record<string, number | null> = {};
        for (const row of page) ranks[row.playerId] = rankInSortedPage(page, row.playerId, direction);
        return [metric, ranks] as const;
      } catch {
        return [metric, {}] as const;
      }
    })).then((entries) => {
      if (!active) return;
      setTable((previous) => ({
        scopeKey,
        ranks: { ...(previous.scopeKey === scopeKey ? previous.ranks : {}), ...Object.fromEntries(entries) }
      }));
    });
    return () => { active = false; };
    // baseQuery and directions are captured through scopeKey and missingKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, missingKey]);

  return { ranks: known, loading: missing.length > 0 };
}
