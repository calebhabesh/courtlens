"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatRecord } from "@/lib/live";
import { useLiveRead } from "@/lib/use-live-read";
import {
  CLINCH_MARKS, gamesBehind, seedLines, sortValue, standingsSeasons, standingsTables, STANDINGS_COLUMNS, STANDINGS_GROUPS,
  type StandingEntry, type StandingsColumn, type StandingsData, type StandingsGroup, type StandingsTable,
} from "@/lib/standings";
import { SortHeader } from "./table-ui";
import { TeamLogo } from "./team-logo";
import { PageHeader } from "./ui/panel";
import { Segmented, Select } from "./ui/kit";
import { DataDetailsButton } from "./ui/data-details";

type Sort = { key: StandingsColumn | "seed"; direction: "asc" | "desc" };

function cell(row: StandingEntry, key: StandingsColumn, group: readonly StandingEntry[]) {
  switch (key) {
    case "w": return row.wins ?? "—";
    case "l": return row.losses ?? "—";
    case "pct": return row.pct ?? "—";
    case "gb": return gamesBehind(row, group) ?? "—";
    case "strk": return row.streak ?? "—";
    default: return formatRecord((row as unknown as Record<string, string | null | undefined>)[key]) ?? "—";
  }
}

function Table({ table, season, sort, onSort }: { table: StandingsTable; season: string; sort: Sort; onSort: (key: string) => void }) {
  const rows = sort.key === "seed" ? table.rows : [...table.rows].sort((a, b) => {
    const d = sortValue(a, sort.key as StandingsColumn, table.rows) - sortValue(b, sort.key as StandingsColumn, table.rows);
    return sort.direction === "asc" ? d : -d;
  });
  // The seeding lines only mean something in seed order.
  const lines = table.lines && sort.key === "seed" ? seedLines(season) : [];
  return <section className="standings-table" aria-label={table.title}>
    <h2 className="standings-title">{table.title}</h2>
    <div className="standings-scroll" role="region" aria-label={`${table.title} standings`} tabIndex={0}>
      <table data-wide-rank={rows.length >= 10 || undefined}>
        <thead><tr>
          <th scope="col" className="standings-team-col"><span className="sr-only">Team</span></th>
          {STANDINGS_COLUMNS.map(c => <SortHeader key={c.key} label={c.label} metric={c.key} description={c.title} sortable={c.sortable}
            active={sort.key === c.key} direction={sort.direction} onSort={onSort} />)}
        </tr></thead>
        <tbody>{rows.map((row, i) => {
          const mark = row.clincher && CLINCH_MARKS[row.clincher] ? row.clincher : null;
          const diff = Number(row.diff?.replace("+", ""));
          return <tr key={row.team_source_id} data-line={lines.includes(i + 1) || undefined}>
            <th scope="row" className="standings-team-col">
              <span className="standings-team">
                <span className="standings-rank">{i + 1}</span>
                {row.tricode && <TeamLogo team={row.tricode} season={season} size={20} />}
                {/* Side by side, the short name ("Pistons") keeps every column in view. */}
                {row.tricode ? <Link href={`/teams/${row.tricode}?season=${season}`} title={row.name ?? undefined}><span className="standings-name-full">{row.name}</span><span className="standings-name-short" aria-hidden="true">{row.short_name ?? row.name}</span></Link>
                  : <span>{row.name}</span>}
                {mark && <abbr className="standings-clinch" title={CLINCH_MARKS[mark]}>{mark}</abbr>}
              </span>
            </th>
            {STANDINGS_COLUMNS.map(c => <td key={c.key} data-tone={c.key === "diff" && Number.isFinite(diff) && diff !== 0 ? (diff > 0 ? "positive" : "negative") : undefined}>{cell(row, c.key, table.rows)}</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

/**
 * ESPN's NBA Standings (alignment row 23): League / Conference / Division and a season selector
 * over ESPN's standings feed, ESPN's columns, sortable headers, seeding lines and clinch marks.
 */
export function StandingsView({ season, current, group }: { season: string; current: string; group: StandingsGroup }) {
  const router = useRouter();
  const { read, error } = useLiveRead<StandingsData>(`/standings?season=${season}`);
  const [sort, setSort] = useState<Sort>({ key: "seed", direction: "asc" });
  const go = (next: { season?: string; group?: string }) => {
    const params = new URLSearchParams({ season: next.season ?? season, group: next.group ?? group });
    router.replace(`/standings?${params}`, { scroll: false });
  };
  const onSort = (key: string) => setSort(s => s.key === key ? (s.direction === "desc" ? { key, direction: "asc" } as Sort : { key: "seed", direction: "asc" }) : { key: key as StandingsColumn, direction: key === "l" || key === "gb" || key === "opp_ppg" ? "asc" : "desc" });
  const data = read?.data?.season === season ? read.data : null;
  const tables = useMemo(() => data?.standings ? standingsTables(data.standings, group) : [], [data, group]);
  const marks = new Set(tables.flatMap(t => t.rows.map(r => r.clincher).filter((m): m is string => !!m && !!CLINCH_MARKS[m])));
  return <div className="standings-view">
    <PageHeader title={`NBA Standings ${season}`} subtitle="ESPN's official standings: NBA tiebreakers decide the order within each conference." />
    <div className="standings-controls">
      <Segmented label="Group" size="md" value={group} onChange={value => go({ group: value })} options={STANDINGS_GROUPS} />
      <Select size="md" aria-label="Season" value={season} onChange={event => go({ season: event.target.value })}>
        {standingsSeasons(current).map(s => <option key={s} value={s}>{s}</option>)}
      </Select>
    </div>
    {error && !data && <p className="standings-note" role="alert">{error}</p>}
    {!data && !error && <p className="standings-note">Loading standings…</p>}
    {data && !tables.length && <p className="standings-note">ESPN lists no standings for {season}.</p>}
    {/* Follow-up 3: conferences (and the six divisions, East left, West right) side by side. */}
    {tables.length > 0 && <div className="standings-grid" data-group={group}>
      {tables.map(table => <Table key={table.key} table={table} season={season} sort={sort} onSort={onSort} />)}
    </div>}
    {data && <footer className="standings-foot">
      {group === "conference" && sort.key === "seed" && <p className="standings-note">{seedLines(season).length === 2 ? "Lines after 6th (playoffs) and 10th (play-in)." : "Line after 8th: the playoff teams."} GB is games behind the table&apos;s leader.</p>}
      {marks.size > 0 && <p className="standings-note">{[...marks].map(m => `${m}: ${CLINCH_MARKS[m]}`).join(" · ")}</p>}
      <DataDetailsButton rows={[
        { label: "Source", value: "ESPN standings feed (free), read on demand through the Live cache" },
        { label: "Season", value: data.season },
        { label: "Read", value: read?.acquired_at ?? "—" },
        { label: "State", value: read?.final ? "Final season: kept, not read again" : "Current season: refreshed every 10 minutes while open" },
        { label: "Order", value: "Conference and division tables follow ESPN's playoff seed (NBA tiebreakers); the league table sorts by record" },
      ]} />
    </footer>}
  </div>;
}
