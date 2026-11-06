"use client";

import { useMemo } from "react";
import { ResearchTable, type ResearchColumn } from "./research/research-table";
import { PlayerIdentity } from "./ui/identity";
import { ButtonLink, IconButtonLink } from "./ui/kit";
import { seasonEra } from "@/lib/portrait-source";
import { IMPACT_COLUMNS } from "@/lib/stats-presets";
import type { ImpactResponse } from "@/lib/types";

/*
 * RAPM Ratings tab table (RD00 round 3): the served 1Y / 2Y / 3Y ratings on the shared Research
 * table. The feed serves no intervals and no team for these rows, so values stay neutral (the colour
 * rule needs an interval) and there is no logo column; intervals live on the Six-Factor tab.
 */

type Row = ImpactResponse["players"][number];

export const RAPM_RATING_METRICS = ["rapm", "orapm", "drapm", "bpr", "rapm_2y", "rapm_3y"] as const;

const minutes = (row: Row) => row.support.rapm?.seconds == null ? null : row.support.rapm.seconds / 60;
const games = (row: Row) => row.support.rapm?.games ?? null;

export function RapmRatingsTable({ players, season, phase, scope, statsHref }: { players: readonly Row[]; season: string; phase: string; scope: string; statsHref: string }) {
  const columns = useMemo<ResearchColumn<Row>[]>(() => RAPM_RATING_METRICS.map(key => ({
    key, label: IMPACT_COLUMNS[key].label, title: IMPACT_COLUMNS[key].tooltip ?? IMPACT_COLUMNS[key].label, signedValue: true,
    value: row => row.metrics[key] ?? null,
  })), []);
  const trailing = useMemo<ResearchColumn<Row>[]>(() => [
    { key: "games", label: "1Y GP", title: "Games in the 1Y fit", value: games },
    { key: "minutes", label: "1Y MIN", title: "Minutes in the 1Y fit", value: minutes },
  ], []);
  const csvColumns = useMemo(() => [
    { header: "player_id", value: (row: Row) => row.player_id }, { header: "player", value: (row: Row) => row.player_name },
    ...RAPM_RATING_METRICS.map(key => ({ header: key, value: (row: Row) => row.metrics[key] ?? null })),
    { header: "games_1y", value: games }, { header: "minutes_1y", value: minutes },
  ], []);
  const tree = (id: string) => `/research/rapm/six-factor?${new URLSearchParams({ season, ...(phase === "playoffs" ? { phase } : {}), player: id })}#impact-tree`;
  return <ResearchTable label="Served impact ratings" rows={players} rowKey={row => row.player_id} name={row => row.player_name} season={season}
    player={row => <PlayerIdentity playerId={row.player_id} name={row.player_name} era={seasonEra(season)} size="sm" href={`/players/${row.player_id}?${scope}`} />}
    views={[{ value: "ratings", label: "Ratings", columns }]} trailingColumns={trailing} defaultSort="rapm" noun="players"
    minimum={{ label: "Min MIN", value: minutes, initial: 0, step: 100 }}
    csv={{ filename: `courtlens-rapm-ratings-${season}-${phase}.csv`, columns: csvColumns }}
    rowAction={row => <IconButtonLink size="sm" icon="split" label={`Open ${row.player_name}'s Impact Tree`} href={tree(row.player_id)} />}
    footnote={<>The top 20 by qualified 1Y RAPM, in points per 100 counted controls. No interval is served here, so values are never coloured; each 1Y value&apos;s 80% interval is on the Six-Factor tab. <ButtonLink size="sm" variant="text" href={statsHref}>All players in Stats</ButtonLink></>} />;
}
