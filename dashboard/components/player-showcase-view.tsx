"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ContextBar } from "./context-bar";
import { LookupInput } from "./lookup-input";
import { PlayerPortrait } from "./player-portrait";
import { ShowcaseCard, type ShowcaseCardStat } from "./showcase-card";
import { TeamLogo } from "./team-logo";
import { Button, IconButton } from "./ui/button";
import { Icon } from "./ui/icon";
import { PlayerIdentity } from "./ui/identity";
import { Menu, MenuItem } from "./ui/menu";
import { PageHeader } from "./ui/panel";
import { BoardLayout, PageShell } from "./ui/page-shell";
import { SegmentedControl } from "./ui/segmented-control";
import { Tooltip } from "./ui/tooltip";
import { buildPreservedContextUrl } from "@/lib/query-url";
import { exportSvgAsPng, exportSvgFile, inlineSvgImages } from "@/lib/image-export";
import { orientedPercentile, type GoodDirection } from "@/lib/percentile-display";
import { SHOWCASE_PRESETS, type ShowcasePresetId } from "@/lib/player-pages";
import { scopeContextLine } from "@/lib/scope-labels";
import { RANK_PAGE_LIMIT, useCohortRanks } from "@/lib/use-cohort-ranks";
import { useWorkspace } from "@/lib/workspace-context";
import type { PlayerResearchItem, QuerySpec, WorkbenchCatalog } from "@/lib/types";

const FOCUS_LABELS: Record<ShowcasePresetId, string> = {
  overall: "Overall",
  scoring: "Scoring",
  playmaking_defense: "Playmaking & Defense",
  per_36: "Per 36"
};

export interface PlayerShowcaseViewProps {
  players: PlayerResearchItem[];
  initialIndex: number;
  query: QuerySpec;
  catalog: WorkbenchCatalog | null;
  eligiblePlayers: number;
  goodDirections: Record<string, GoodDirection>;
  lastIncludedDate?: string | null;
}

function slug(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Arrow and Space shortcuts must not steal keys from controls that use them. */
function ownsKeys(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    "input, textarea, select, [contenteditable='true'], [role='radiogroup'], [role='menu'], [role='listbox'], [role='dialog']"
  ));
}

export function PlayerShowcaseView({
  players, initialIndex, query, catalog, eligiblePlayers, goodDirections, lastIncludedDate
}: PlayerShowcaseViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { favorites, toggleFavorite, compareTray, toggleCompare } = useWorkspace();
  const [index, setIndex] = useState(initialIndex);
  const [focus, setFocus] = useState<ShowcasePresetId>("overall");
  const [playing, setPlaying] = useState(false);
  const [lookupText, setLookupText] = useState("");
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<SVGSVGElement | null>(null);

  const count = players.length;
  const player = players[Math.min(index, count - 1)];
  const preset = SHOWCASE_PRESETS.find((entry) => entry.id === focus) ?? SHOWCASE_PRESETS[0];
  const metrics = useMemo(() => preset.metrics.slice(0, 6), [preset]);
  const metricKeys = useMemo(() => metrics.map((metric) => metric.key), [metrics]);
  const { ranks } = useCohortRanks(query, metricKeys, goodDirections);
  const contextLine = scopeContextLine(query.season, query.phase, query.before_date);
  const season = query.season;
  const scopeParams = `season=${query.season}&phase=${query.phase}&beforeDate=${query.before_date ?? ""}`;

  const step = (delta: number) => setIndex((current) => (current + delta + count) % count);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || ownsKeys(event.target)) return;
      if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === " " && !(event.target instanceof HTMLButtonElement) && !event.repeat) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // step only depends on count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // Manually started slideshow (F12); under reduced motion it still never starts by itself.
  useEffect(() => {
    if (!playing || count <= 1) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [playing, count]);

  if (!player) return null;

  const stats: ShowcaseCardStat[] = metrics.map((metric) => {
    const direction = goodDirections[metric.key];
    return {
      key: metric.key,
      label: metric.label,
      value: metric.format(player.metrics[metric.key]),
      percentile: orientedPercentile(player.percentiles?.[metric.key], direction),
      rank: ranks[metric.key]?.[player.player_id] ?? null
    };
  });

  const isFavorite = favorites.includes(player.player_id);
  const inTray = compareTray.includes(player.player_id);
  const currentTeam = player.teams[player.teams.length - 1];
  const fileBase = `${slug(player.player_name)}-showcase-${focus}`;
  const exportContext = { season: query.season, phase: query.phase, before_date: query.before_date ?? undefined, release_id: query.release_id ?? undefined };

  const exportCard = async (format: "png" | "svg") => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const prepared = await inlineSvgImages(cardRef.current);
      const options = { title: `${player.player_name} · Player Showcase`, subtitle: `${FOCUS_LABELS[focus]} · ${contextLine}`, context: exportContext, filename: `${fileBase}.${format}` };
      if (format === "png") await exportSvgAsPng(prepared, options);
      else exportSvgFile(prepared, `${fileBase}.svg`, options);
    } finally {
      setExporting(false);
    }
  };

  const linkButton = (href: string, label: string, icon: "history" | "user" | "swap") => (
    <Tooltip content={label}>
      <Link href={buildPreservedContextUrl(href, searchParams)} aria-label={label}
        className="ui-button ui-button-secondary ui-button-md ui-icon-button showcase-rail-action">
        <Icon name={icon} size={16} />
      </Link>
    </Tooltip>
  );

  return (
    <PageShell template="board" className="showcase-page">
      <PageHeader
        title="Player Showcase"
        subtitle="Shareable stat cards with league percentiles and ranks."
        actions={<>
          <div className="showcase-search">
            <LookupInput label="Find player" value={lookupText} onChange={setLookupText} kinds={["player"]}
              releaseId={query.release_id ?? undefined} season={season} placeholder="Find player" compactResults portalDropdown
              onSelect={(item) => {
                setLookupText("");
                if (item.kind !== "player") return;
                const known = players.findIndex((entry) => entry.player_id === item.canonical_id);
                if (known >= 0) setIndex(known);
                else router.push(buildPreservedContextUrl(`/showcase?playerId=${item.canonical_id}`, searchParams));
              }} />
          </div>
          <Menu align="right" className="showcase-export" trigger={<span className="ui-button ui-button-primary ui-button-md">
            <Icon name="download" size={16} />{exporting ? "Exporting…" : "Export"}<Icon name="chevron-down" size={14} />
          </span>}>
            <MenuItem icon="download" label="PNG image" disabled={exporting} onClick={() => void exportCard("png")} />
            <MenuItem icon="page" label="SVG file" disabled={exporting} onClick={() => void exportCard("svg")} />
          </Menu>
        </>}
      />

      <ContextBar
        catalog={catalog ?? undefined}
        sampleNoun="eligible players"
        initialSeason={query.season}
        initialPhase={query.phase}
        initialBeforeDate={query.before_date ?? undefined}
        initialReleaseId={query.release_id ?? undefined}
        sampleSize={eligiblePlayers}
        lastIncludedDate={lastIncludedDate}
        showWindow={false}
        filters={<SegmentedControl<ShowcasePresetId> name="showcase-focus" value={focus} onChange={setFocus}
          options={SHOWCASE_PRESETS.map((entry) => ({ value: entry.id, label: FOCUS_LABELS[entry.id] }))} />}
      />

      <BoardLayout
        className="showcase-board"
        main={<div className="showcase-stage">
          <div className="showcase-card-frame">
            <ShowcaseCard ref={cardRef} player={player} focusLabel={FOCUS_LABELS[focus]} stats={stats} contextLine={contextLine} />
          </div>
          <dl className="sr-only" aria-label={`${player.player_name} ${FOCUS_LABELS[focus]} stats`}>
            {stats.map((stat) => <div key={stat.key}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}{stat.rank ? `, rank ${stat.rank} of ${eligiblePlayers}` : ""}{stat.percentile !== null ? `, ${Math.round(stat.percentile)}th percentile` : ""}</dd>
            </div>)}
          </dl>
          <div className="showcase-playback" role="group" aria-label="Card playback">
            <IconButton icon="left" label="Previous player" variant="secondary" onClick={() => step(-1)} />
            <Button variant={playing ? "primary" : "secondary"} icon={playing ? "pause" : "play"} aria-pressed={playing}
              onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</Button>
            <IconButton icon="right" label="Next player" variant="secondary" onClick={() => step(1)} />
            <span className="showcase-counter" aria-live="polite">{index + 1} / {count}</span>
          </div>
          <p className="showcase-footnote">Percentile among {eligiblePlayers.toLocaleString("en-US")} eligible players, the Stats cohort. Ranks shown within the top {RANK_PAGE_LIMIT}.</p>
        </div>}
        rail={<>
          <section className="showcase-rail-card" aria-label="Current player">
            <PlayerIdentity size="lg" playerId={player.player_id} name={player.player_name} team={currentTeam}
              portraitUrl={player.portrait_url} subtitle={`${player.games_played} games`}
              href={buildPreservedContextUrl(`/players/${player.player_id}`, searchParams)} />
            <div className="showcase-rail-actions">
              <Tooltip content={isFavorite ? "Remove from favorites" : "Add to favorites"}>
                <IconButton icon="star" label={isFavorite ? "Remove from favorites" : "Add to favorites"} variant="secondary"
                  aria-pressed={isFavorite} className={`showcase-fav ${isFavorite ? "is-active" : ""}`} onClick={() => toggleFavorite(player.player_id)} />
              </Tooltip>
              <Tooltip content={inTray ? "Remove from compare tray" : "Add to compare tray"}>
                <IconButton icon={inTray ? "check" : "plus"} label={inTray ? "Remove from compare tray" : "Add to compare tray"} variant="secondary"
                  aria-pressed={inTray} className={inTray ? "is-active" : ""} onClick={() => toggleCompare(player.player_id)} />
              </Tooltip>
              {linkButton(`/last-games?playerId=${player.player_id}&${scopeParams}`, "Recent games", "history")}
              {linkButton(`/players/${player.player_id}?${scopeParams}`, "Player profile", "user")}
              {linkButton(`/compare?playerA=${player.player_id}&${scopeParams}`, "Compare head to head", "swap")}
            </div>
          </section>
          <section className="showcase-roster" aria-label="Showcase roster">
            <h2 className="showcase-roster-title">Roster <span>{count}</span></h2>
            <ol className="showcase-roster-list">
              {players.map((entry, position) => {
                const team = entry.teams[entry.teams.length - 1];
                return <li key={entry.player_id}>
                  <button type="button" className={`showcase-roster-item ${position === index ? "is-active" : ""}`}
                    aria-current={position === index ? "true" : undefined} onClick={() => setIndex(position)}>
                    <PlayerPortrait playerId={entry.player_id} name={entry.player_name} portraitUrl={entry.portrait_url} size="sm" />
                    <span className="showcase-roster-name">{entry.player_name}</span>
                    {team && <TeamLogo team={team} size={16} />}
                  </button>
                </li>;
              })}
            </ol>
          </section>
        </>}
      />
    </PageShell>
  );
}
