"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { EntityField } from "./entity-picker";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/kit";
import { CompareEmptySlot } from "./compare-empty-slot";
import { ComparePlayerSeasonPicker } from "./compare-player-season-picker";
import { HonorChip } from "./compare-season-honors";
import { bioLine, teamRecord, type CompareSelection } from "./compare-player-slot";
import { comparisonFlags } from "./charts/semantics";
import { teamBrandColor } from "@/lib/team-colors";
import { bestColumns, MAX_GRID_PLAYERS } from "@/lib/compare-grid";
import { ACCOLADE_KINDS, honorMarks, honorRows, playerAccolades, type PlayerAccolades, type SeasonEnds } from "@/lib/compare-accolades";
import { availabilityShare, cardLabel, compareMetricKey, formatCardValue, isPercentUnit, isWholeCount, overallGroupStart, type CompareCountingMode } from "@/lib/comparison-metrics";
import type { GoodDirection } from "@/lib/percentile-display";
import type { ComparisonGroupPlayer, MetricDefinition, PlayerBio } from "@/lib/types";

/** One grid column: the player's row under their season, with what the tile and rows need. */
export type GridColumn = {
  player: ComparisonGroupPlayer;
  season: string;
  beforeDate: string;
  bio: PlayerBio | null;
  /** Seasons the player has games in, this phase; null while unknown. */
  played: string[] | null;
};

/** A grid row: the shown text per column, the numbers it compares, and its direction. */
export type GridLine = {
  key: string; label: string; title: string; direction: GoodDirection; digits: number;
  values: (number | null)[]; shown: string[]; titles?: (string | undefined)[];
  /** Overall's group heading before this row. */
  group?: string | null;
};

/**
 * The rows of a grid comparison, in card order: the preset's metrics, then Avail % (Overall),
 * Seasons (Career) and the career accolades. Values come only from each column's own row.
 */
export function gridLines({ columns, keys, mode, overall, career, definitions, ends }: {
  columns: GridColumn[]; keys: string[]; mode: CompareCountingMode; overall: boolean; career: boolean; definitions: MetricDefinition[];
  /** Completed seasons: their awards count although announced after the cutoff (75). */
  ends?: SeasonEnds;
}): { metrics: GridLine[]; accolades: GridLine[]; honors: PlayerAccolades[] } {
  const metrics: GridLine[] = keys.map(key => {
    const metric = compareMetricKey(key, mode);
    const definition = definitions.find(entry => entry.key === metric) ?? definitions.find(entry => entry.key === key);
    const unit = definition?.unit ?? "";
    const raw = columns.map(column => { const value = column.player.item?.metrics[metric]; return typeof value === "number" ? value : null; });
    const percent = isPercentUnit(unit);
    return { key: metric, label: cardLabel(metric, definition), title: definition?.display_name ?? metric,
      direction: comparisonFlags(definition ?? {}).direction, digits: isWholeCount(metric) ? 0 : 1, group: overall ? overallGroupStart(metric) : null,
      // Rates compare in percentage points, the precision the card shows.
      values: raw.map(value => value == null ? null : percent ? value * 100 : value),
      shown: raw.map(value => formatCardValue(value, unit, metric)) };
  });
  if (overall) {
    const shares = columns.map(column => { const share = availabilityShare(column.player.availability); return share == null ? null : share * 100; });
    if (shares.some(value => value != null)) metrics.push({ key: "availability", label: "Avail %", direction: "high", digits: 1,
      title: "Games played out of the teams' games over the same span, before the cutoff", values: shares,
      shown: shares.map(value => value == null ? "—" : value.toFixed(1)),
      titles: columns.map(column => column.player.availability ? `${column.player.availability.games} of ${column.player.availability.team_games} team games` : "Unknown") });
  }
  if (career) {
    const seasons = columns.map(column => column.player.seasons?.length ?? null);
    metrics.push({ key: "seasons", label: "Seasons", title: "Observed seasons through each player's compared season", direction: "high", digits: 0,
      values: seasons, shown: seasons.map(value => value == null ? "—" : String(value)) });
  }
  const honors = columns.map(column => playerAccolades(column.bio, column.player.championships, column.season, column.beforeDate, ends));
  // Like the duel, honours no player holds are left out; an unknown player keeps a row visible.
  const accolades = honors.some(entry => entry.known) ? ACCOLADE_KINDS.map(kind => {
    const values = honors.map(entry => entry.counts[kind.key] ?? null);
    return { key: kind.key, label: kind.label, title: kind.title, direction: "high" as const, digits: 0, values,
      shown: values.map(value => value == null ? "—" : String(value)) };
  }).filter(line => !line.values.every(value => value === 0)) : [];
  return { metrics, accolades, honors };
}

/** One value cell: the row's best reads heavier on a gold tint; others say how far behind. */
function ValueCell({ line, index, best, names }: { line: GridLine; index: number; best: number[]; names: string[] }) {
  const value = line.values[index];
  const leading = best.includes(index);
  const top = best.length ? line.values[best[0]] : null;
  const behind = !leading && value != null && top != null ? Math.abs(top - value) : null;
  const title = line.titles?.[index] ?? (leading ? `Best of ${line.values.filter(entry => entry != null).length}`
    : behind != null && Number(behind.toFixed(line.digits)) > 0 ? `${behind.toFixed(line.digits)} behind ${best.map(entry => names[entry]).join(", ")}` : undefined);
  return <td className="pvp-grid-value" data-best={leading || undefined} title={title}><span>{line.shown[index]}</span></td>;
}

/** A section heading centred over the player columns, the stats it groups (68). */
function GroupRow({ label, columns, open }: { label: string; columns: number; open: boolean }) {
  return <tr className="pvp-group"><td className="pvp-grid-label" aria-hidden="true" /><th colSpan={columns} scope="colgroup">{label}</th>{open && <td aria-hidden="true" />}</tr>;
}

function Lines({ lines, columns, names, open }: { lines: GridLine[]; columns: number; names: string[]; open: boolean }) {
  return <>{lines.map(line => {
    const best = bestColumns(line.values, line.direction, line.digits);
    return <Fragment key={line.key}>
      {line.group && <GroupRow label={line.group} columns={columns} open={open} />}
      <tr>
        <th scope="row" className="pvp-label pvp-grid-label" title={line.title}>{line.label}</th>
        {line.values.map((_, index) => <ValueCell key={index} line={line} index={index} best={best} names={names} />)}
        {open && <td aria-hidden="true" />}
      </tr>
    </Fragment>;
  })}</>;
}

/**
 * The grid's column header: the duel's tile at a smaller size, with a remove control. Pressing
 * the photo searches for a replacement in place.
 */
function GridTile({ column, games, onReplace, onRemove, onSeason, excludedIds, ends }: {
  column: GridColumn; games?: number | null; excludedIds: string[]; ends?: SeasonEnds;
  onReplace: (selection: CompareSelection) => void; onRemove: () => void; onSeason: (season: string) => void;
}) {
  const params = useSearchParams();
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null), photoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (searching) searchRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus(); }, [searching]);
  const { player, season } = column;
  const teams = player.teams_chronological;
  const latest = teams.at(-1);
  const tint = teamBrandColor(latest, season);
  const record = teamRecord(latest, season);
  const inactive = column.played ? !column.played.includes(season) : !player.item?.games_played;
  const line = inactive ? null : bioLine(column.bio);
  const shownGames = games ?? player.item?.games_played ?? 0;
  return <div className="pvp-slot pvp-grid-tile pvp-fade" data-inactive={inactive || undefined}
    style={tint ? ({ "--team-tint": tint } as CSSProperties) : undefined}>
    <div className="pvp-photo-frame">
      <button ref={photoRef} type="button" className="pvp-photo" aria-expanded={searching} aria-label={`Change ${player.name}`} onClick={() => setSearching(open => !open)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG artwork, decorative */}
        {record && <img className="pvp-watermark" src={record.asset} alt="" aria-hidden="true" />}
        <PlayerPortrait playerId={player.player_id} name={player.name} size="xl" className="pvp-portrait" era={{ season, team: latest }} />
        <span className="pvp-badge">{inactive ? "No Games" : `${shownGames.toLocaleString("en-US")} GP`}</span>
        <span className="pvp-change" aria-hidden="true"><Icon name="user-edit" size={16} /></span>
      </button>
      <span className="pvp-grid-remove"><IconButton size="sm" variant="secondary" icon="close" label={`Remove ${player.name}`} onClick={onRemove} /></span>
    </div>
    {searching
      ? <div className="pvp-search" ref={searchRef}>
          <EntityField label={`Replace ${player.name}`} value="" excludedIds={excludedIds} portalDropdown openOnFocus={false} dropdownMinWidth={440} releaseId={params.get("releaseId") || params.get("release_id")} season={params.get("season")} phase={params.get("phase")} beforeDate={params.get("beforeDate") || params.get("before_date")}
            onChange={(id, items) => { if (id && items[0]) { setSearching(false); onReplace({ id, name: items[0].display_name });
              requestAnimationFrame(() => photoRef.current?.focus({ preventScroll: true })); } }} />
        </div>
      : <div className="pvp-who">
          <Link className="pvp-name" href={`/players/${player.player_id}`}>{player.name}</Link>
          {inactive && <span className="pvp-dnp">No Games in {season}</span>}
          {!inactive && teams.length > 0 && <span className="pvp-team">{teams.map(team => <span key={team} className="pvp-team-entry">
            <TeamLogo team={team} season={season} size={16} />{teamRecord(team, season)?.artwork_name ?? team}</span>)}</span>}
          {line && <span className="pvp-bio">{line}</span>}
          {column.played && <span className="pvp-season">
            <ComparePlayerSeasonPicker label={player.name} season={season} seasons={column.played} awards={column.bio?.reference?.awards}
              championshipSeasons={player.championships?.seasons ?? []} beforeDate={column.beforeDate} ends={ends} onSelect={onSeason} />
          </span>}
        </div>}
  </div>;
}

/**
 * Compare's grid card (alignment row 3, 64): one column per player, metric labels at the left,
 * and an open slot while fewer than five are chosen. Each row's best value reads heavier;
 * there is no overall winner or tally.
 */
export function CompareGrid({ columns, lines, controls, career, onReplace, onRemove, onAdd, onSeason, footer, adding = true, onCloseAdd, ends }: {
  ends?: SeasonEnds;
  columns: GridColumn[]; lines: ReturnType<typeof gridLines>; controls: ReactNode; career: boolean;
  /** Whether the open "Add Player" tile shows; closing it leaves the toolbar's add button (67). */
  adding?: boolean; onCloseAdd?: () => void;
  onReplace: (index: number, selection: CompareSelection) => void; onRemove: (index: number) => void;
  onAdd: (selection: CompareSelection) => void; onSeason: (index: number, season: string) => void; footer: ReactNode;
}) {
  const open = adding && columns.length < MAX_GRID_PLAYERS;
  const names = columns.map(column => column.player.name);
  const ids = columns.map(column => column.player.player_id);
  const honors = honorRows(lines.honors.map(entry => entry.honors));
  const span = columns.length + 1 + (open ? 1 : 0);
  // Photos, then the presets, then the stats (72): the duel's order. Both rows share one column
  // template, so each photo sits over its column; phones scroll them together.
  return <section className="pvp-card pvp-grid-card" aria-label="Comparison card" data-columns={columns.length + (open ? 1 : 0)}>
    <div className="pvp-grid-scroll">
      <div className="pvp-grid-players" role="group" aria-label="Compared players">
        <span className="pvp-grid-corner" aria-hidden="true" />
        {columns.map((column, index) => <div key={`${column.player.player_id}-${column.season}`} className="pvp-grid-head">
          <GridTile column={column} games={career ? column.player.item?.games_played : undefined} excludedIds={ids} ends={ends}
            onReplace={selection => onReplace(index, selection)} onRemove={() => onRemove(index)} onSeason={season => onSeason(index, season)} />
        </div>)}
        {open && <div className="pvp-grid-head"><CompareEmptySlot side="a" label="Add Player" selection={null} excludedIds={ids} onPick={onAdd} onDismiss={onCloseAdd} /></div>}
      </div>
      {/* Pinned to the visible width, so a phone keeps the presets whole while columns scroll. */}
      <div className="pvp-grid-controls">{controls}</div>
      <table className="pvp-grid" aria-label="Descriptive comparison">
        <caption className="sr-only">{career ? "Careers through each player's compared season" : "Each player's compared season"}</caption>
        <colgroup><col className="pvp-grid-col-label" />{columns.map(column => <col key={column.player.player_id} />)}{open && <col />}</colgroup>
        <thead className="sr-only"><tr><th scope="col">Metric</th>{names.map(name => <th key={name} scope="col">{name}</th>)}{open && <td />}</tr></thead>
        <tbody>
          <Lines lines={lines.metrics} columns={columns.length} names={names} open={open} />
          {lines.accolades.length > 0 && <GroupRow label="Accolades" columns={columns.length} open={open} />}
          <Lines lines={lines.accolades} columns={columns.length} names={names} open={open} />
          {!lines.accolades.length && <tr className="pvp-pending"><td colSpan={span}>No accolades on record for these players.</td></tr>}
          <GroupRow label="Season Honors" columns={columns.length} open={open} />
          {/* One row per award any player holds, each result in its player's column (76). */}
          {honors.map(row => {
            // Wins, selections and the better vote finish take the grid's gold best-value tint (honorMarks).
            const { marks, tied } = honorMarks(row.key, row.cells);
            return <tr key={row.key}>
              <th scope="row" className="pvp-label pvp-grid-label">{row.label}</th>
              {row.cells.map((cell, index) => { const mark = marks[index]; return <td key={index} className="pvp-grid-honors" data-best={mark ? true : undefined}>
                <HonorChip cell={cell} category={row.label} lead={mark ? { strength: mark } : null} tied={tied} /></td>; })}
              {open && <td aria-hidden="true" />}
            </tr>;
          })}
          {!honors.length && <tr className="pvp-pending"><td colSpan={span}>No season honors for these players.</td></tr>}
        </tbody>
      </table>
    </div>
    {footer}
  </section>;
}
