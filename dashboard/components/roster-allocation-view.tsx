"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { ContextBar } from "./context-bar";
import { PlayerPortrait } from "./player-portrait";
import { TeamGrid, teamDisplayName } from "./team-grid";
import { AccordionItem } from "./ui/accordion";
import { GatedNote } from "./ui/gated-note";
import { TeamIdentity } from "./ui/identity";
import { Input } from "./ui/input";
import { Menu, MenuItem } from "./ui/menu";
import { Modal } from "./ui/modal";
import { PageHeader } from "./ui/panel";
import { BoardLayout, PageShell } from "./ui/page-shell";
import { Select } from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { downloadResearch } from "@/lib/advanced-research";
import { buildPreservedContextUrl } from "@/lib/query-url";
import {
  ALLOCATION_EXPORT_FILENAME, LANES, POSITION_LANES, REGULATION_TEAM_MINUTES, allocationExport, buildAllocations,
  gaugeStatus, isValidMinutes, summarize, type Allocation, type AllocationMode, type Lane
} from "@/lib/roster-allocation";
import { teamAccent } from "@/lib/team-colors";
import { getTeamDetail } from "@/lib/workbench-api";
import type { TeamDetailResponse, WorkbenchCatalog } from "@/lib/types";
import { Button, IconButton, Segmented } from "./ui/kit";

export interface RosterAllocationViewProps {
  catalog: WorkbenchCatalog | null;
  teamId: string | null;
  scope: { releaseId?: string; season?: string; phase?: string; beforeDate?: string };
  /** Rendered as a section inside another page (the team profile since alignment row 12). */
  embedded?: boolean;
}

type Result = { key: string } & ({ status: "error"; message: string } | { status: "ready"; data: TeamDetailResponse });
type Load = { status: "idle" | "loading" } | Result;

const DRAG_TYPE = "application/x-courtlens-player";
const LANE_LABELS: Record<Lane, string> = { PG: "Point guard", SG: "Shooting guard", SF: "Small forward", PF: "Power forward", C: "Center", Unassigned: "Unassigned" };

// Unknown minutes render as an em dash, never as zero.
const wholeMinutes = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const tenthMinutes = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const percent = (share: number | null) => (share === null ? "—" : `${(share * 100).toFixed(1)}%`);

export function RosterAllocationView({ catalog, teamId, scope, embedded = false }: RosterAllocationViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<AllocationMode>("observed");
  const [positions, setPositions] = useState<Record<string, Lane>>({});
  const [projected, setProjected] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dropLane, setDropLane] = useState<Lane | null>(null);
  const boardRef = useRef<HTMLElement | null>(null);
  const focusAfterMove = useRef<string | null>(null);

  // Loads as soon as a team and scope are known (D6: no Load button). The page remounts per team,
  // so assignments reset with the team but survive scope changes for the same team.
  const requestKey = JSON.stringify([teamId, scope.releaseId, scope.season, scope.phase, scope.beforeDate, attempt]);
  useEffect(() => {
    if (!teamId) return;
    let active = true;
    getTeamDetail(teamId, scope)
      .then((data) => { if (active) setResult({ key: requestKey, status: "ready", data }); })
      .catch((error: unknown) => { if (active) setResult({ key: requestKey, status: "error", message: error instanceof Error ? error.message : String(error) }); });
    return () => { active = false; };
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const load: Load = !teamId ? { status: "idle" } : result?.key === requestKey ? result : { status: "loading" };

  const data = load.status === "ready" ? load.data : null;
  const rows = useMemo(() => data?.player_cohort ?? [], [data]);
  const allocations = useMemo(() => buildAllocations(rows, mode, positions, projected), [rows, mode, positions, projected]);
  const summary = useMemo(() => summarize(allocations), [allocations]);
  // Chips keep a stable order (observed minutes) so typing projections never moves the chip in use.
  const byLane = useMemo(() => {
    const ordered = [...allocations].sort((a, b) => (b.total_minutes ?? -1) - (a.total_minutes ?? -1));
    return Object.fromEntries(LANES.map((lane) => [lane, ordered.filter((row) => row.allocation_position === lane)])) as Record<Lane, Allocation[]>;
  }, [allocations]);

  const teamName = data?.team.name ?? (teamId ? teamDisplayName(teamId) ?? teamId : "");
  const accent = teamAccent(data?.team.id ?? teamId);
  const fmt = mode === "observed" ? wholeMinutes : tenthMinutes;
  const unit = mode === "observed" ? "min" : "min/g";

  const selectTeam = (id: string) => {
    setPickerOpen(false);
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("teamId");
    next.set("team", id);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const move = (playerId: string, lane: Lane) => setPositions((current) => ({ ...current, [playerId]: lane }));

  // A chip moved from its menu remounts in the new lane; keep keyboard focus on its menu button.
  useEffect(() => {
    const playerId = focusAfterMove.current;
    if (!playerId) return;
    focusAfterMove.current = null;
    boardRef.current?.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(playerId)}"] .roster-chip-menu button`)?.focus();
  }, [positions]);

  const onDrop = (lane: Lane) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropLane(null);
    const playerId = event.dataTransfer.getData(DRAG_TYPE);
    if (playerId) move(playerId, lane);
  };

  const playerHref = (playerId: string) => buildPreservedContextUrl(`/players/${playerId}`, new URLSearchParams({
    ...(scope.releaseId ? { releaseId: scope.releaseId } : {}),
    ...(scope.season ? { season: scope.season } : {}),
    ...(scope.phase ? { phase: scope.phase } : {}),
    ...(scope.beforeDate ? { beforeDate: scope.beforeDate } : {})
  }));

  const chip = (row: Allocation) => {
    const minutesInvalid = !isValidMinutes(row.allocation_minutes);
    return (
      <li key={row.player_id} className={`roster-chip ${mode === "projected" ? "is-projected" : ""}`} data-player-id={row.player_id} draggable
        onDragStart={(event) => { event.dataTransfer.setData(DRAG_TYPE, row.player_id); event.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => setDropLane(null)}>
        <PlayerPortrait playerId={row.player_id} name={row.player_name} size="sm" />
        <span className="roster-chip-text">
          <span className="roster-chip-name" title={row.player_name}>{row.player_name}</span>
          <span className="roster-chip-meta">{mode === "projected" && row.games_played > 0 && row.total_minutes !== null
            ? `${tenthMinutes(row.total_minutes / row.games_played)} obs/g`
            : `${wholeMinutes(row.total_minutes)} min · ${row.games_played} GP`}</span>
        </span>
        {mode === "projected" ? (
          <Input inputSize="sm" type="number" min="0" step="0.1" inputMode="decimal" className="roster-chip-input" wrapperClassName="roster-chip-input-wrap"
            aria-label={`Projected minutes for ${row.player_name}`} placeholder="—" error={minutesInvalid} aria-invalid={minutesInvalid}
            value={projected[row.player_id] ?? ""} onChange={(event) => setProjected((current) => ({ ...current, [row.player_id]: event.target.value }))} />
        ) : null}
        <Menu align="right" className="roster-chip-menu" renderTrigger={props => <IconButton {...props} size="xs" variant="ghost" icon="more" label={`Move ${row.player_name}`} />}>
          {LANES.filter((lane) => lane !== row.allocation_position).map((lane) => (
            <MenuItem key={lane} label={lane === "Unassigned" ? "Move to Unassigned" : `Move to ${lane} · ${LANE_LABELS[lane]}`} onClick={() => { focusAfterMove.current = row.player_id; move(row.player_id, lane); }} />
          ))}
        </Menu>
      </li>
    );
  };

  const lane = (name: Lane) => {
    const totals = summary.lanes[name];
    const members = byLane[name];
    return (
      <section key={name} className={`roster-lane roster-lane-${name === "Unassigned" ? "pool" : "position"} ${dropLane === name ? "is-drop-target" : ""}`}
        aria-label={`${name} lane`} data-lane={name}
        onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); setDropLane(name); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropLane(null); }}
        onDrop={onDrop(name)}>
        <header className="roster-lane-head">
          <h3 className="roster-lane-name" title={LANE_LABELS[name]}>{name}<span>{totals.players}</span></h3>
          <span className="roster-lane-total">{fmt(totals.minutes)} {unit} · <strong>{percent(totals.share)}</strong></span>
          <span className="roster-share" role="meter" aria-label={`${name} minute share`} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={totals.share === null ? 0 : Math.round(totals.share * 1000) / 10}
            style={{ "--share": `${(totals.share ?? 0) * 100}%` } as CSSProperties} />
        </header>
        {members.length ? <ul className="roster-lane-chips">{members.map(chip)}</ul>
          : <p className="roster-lane-empty">{name === "Unassigned" ? "Everyone is placed." : "Drop players here"}</p>}
      </section>
    );
  };

  const gauge = () => {
    const status = gaugeStatus(summary.total);
    const gap = Math.abs(summary.total - REGULATION_TEAM_MINUTES);
    const label = status === "full" ? "Full 240" : `${tenthMinutes(gap)} ${status}`;
    return (
      <div className={`roster-gauge is-${status}`}>
        <span className="roster-gauge-value"><strong>{tenthMinutes(summary.total)}</strong> / {REGULATION_TEAM_MINUTES} min per game</span>
        <span className="roster-gauge-bar" role="meter" aria-label="Projected team minutes per game" aria-valuemin={0}
          aria-valuemax={REGULATION_TEAM_MINUTES} aria-valuenow={Math.round(summary.total * 10) / 10} aria-valuetext={`${tenthMinutes(summary.total)} of 240, ${label}`}
          style={{ "--fill": `${Math.min(summary.total / REGULATION_TEAM_MINUTES, 1) * 100}%` } as CSSProperties} />
        <span className="roster-gauge-status">{label}{summary.unknown ? ` · ${summary.unknown} blank` : ""}</span>
      </div>
    );
  };

  const caveats = (
    <>
      <p>Positions are your diagram labels. CourtLens has no positional source, so every player starts Unassigned and unassigned players stay unassigned.</p>
      <p>Observed total minutes are team-stint minutes within the selected scope, including traded participants. These rows do not establish a current roster, lineup or positional assignment. Observed shares use the sum of returned nonnegative player minutes.</p>
      <p>Projected inputs start unknown. A regulation team rotation normally allocates 240 player-minutes per game; overtime and incomplete projections may differ.</p>
      <p>Minute share describes an allocation; shape fit does not measure causal team compatibility.</p>
      <p>Missing participation is not a confirmed zero or roster exclusion.</p>
      <p>Impact sizing requires admitted registered coefficients. Financial sizing requires admitted contract amounts and a value model. Defensive load, current-roster association and observed positional minutes remain unavailable without their own input evidence.</p>
    </>
  );

  const exportDisabled = !data || !rows.length || summary.invalid;

  const actions = teamId ? <>
    <Button size="sm" variant="secondary" icon="swap" onClick={() => setPickerOpen(true)}>Change team</Button>
    <Button size="sm" variant="primary" icon="download" disabled={exportDisabled}
      onClick={() => data && downloadResearch(ALLOCATION_EXPORT_FILENAME, allocationExport(data, mode, allocations))}>Export JSON</Button>
  </> : undefined;
  const content = (
    <>
      {embedded ? <div className="roster-embedded-actions">
        <p className="roster-embedded-intro">Place players into a depth chart and see how {scope.season ?? "observed"} minutes split by position.</p>
        <Segmented<AllocationMode> size="sm" label="roster-basis" value={mode} onChange={setMode}
          options={[{ value: "observed", label: "Observed" }, { value: "projected", label: "Projected" }]} />
        <Button size="sm" variant="primary" icon="download" disabled={exportDisabled}
          onClick={() => data && downloadResearch(ALLOCATION_EXPORT_FILENAME, allocationExport(data, mode, allocations))}>Export JSON</Button>
      </div> : <PageHeader
        title="Roster Shapes"
        subtitle="Place a team's players into a depth chart and see how minutes split by position."
        actions={actions}
      />}

      {/* Embedded, the host page owns the scope controls. */}
      {!embedded && <ContextBar
        catalog={catalog ?? undefined}
        sampleNoun="players"
        initialReleaseId={scope.releaseId}
        initialSeason={scope.season}
        initialPhase={scope.phase}
        initialBeforeDate={scope.beforeDate}
        sampleSize={data ? rows.length : undefined}
        showWindow={false}
        modes={<Segmented<AllocationMode> size="lg" label="roster-basis" value={mode} onChange={setMode}
          options={[{ value: "observed", label: "Observed" }, { value: "projected", label: "Projected" }]} />}
        detailRows={data ? [
          { label: "Roster source", value: "Team player-game boxes (team detail)" },
          { label: "Roster route", value: `/api/workbench/teams/${data.team.id}`, mono: true },
          // Source warnings can state code-like boundary rules, so they live here, not behind Why? (D5).
          ...(data.warnings ?? []).map((warning, index) => ({ label: `Source warning ${index + 1}`, value: warning })),
          { label: "Resolved context", value: <pre className="roster-context">{JSON.stringify(data.context, null, 2)}</pre> }
        ] : []}
      />}

      {!teamId ? (
        <section className="roster-picker" aria-label="Choose a team">
          <h2 className="roster-picker-title">Choose a team</h2>
          <TeamGrid onSelect={selectTeam} />
        </section>
      ) : (
        <>
          <div className="roster-team" style={accent ? ({ "--team-color": accent } as CSSProperties) : undefined}>
            <TeamIdentity team={data?.team.id ?? teamId} name={teamName} size="lg"
              subtitle={data ? [data.record.wins != null && data.record.losses != null ? `${data.record.wins}–${data.record.losses}` : null, `${rows.length} players`].filter(Boolean).join(" · ") : "Loading minutes…"} />
            {data && rows.length > 0 && (mode === "projected" ? gauge() : (
              <div className="roster-gauge is-observed">
                <span className="roster-gauge-value"><strong>{wholeMinutes(summary.total)}</strong> observed minutes</span>
                <span className="roster-gauge-status">{data.record.games_played} team games</span>
              </div>
            ))}
          </div>

          {load.status === "error" ? (
            <GatedNote tone="warning" action={<Button size="xs" variant="secondary" icon="refresh" onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}
              why={<p>{load.message}</p>}>Couldn’t load {teamName} minutes.</GatedNote>
          ) : load.status !== "ready" ? (
            <BoardLayout className="roster-board" main={<div className="roster-skeleton" role="status" aria-busy="true" aria-label="Loading minutes">
              <Skeleton height={168} />
              <div className="roster-lanes">{POSITION_LANES.map((name) => <Skeleton key={name} height={200} />)}</div>
            </div>} />
          ) : !rows.length ? (
            <GatedNote why={caveats} action={<Button size="xs" variant="secondary" icon="swap" onClick={() => setPickerOpen(true)}>Change team</Button>}>
              No minutes for {teamName} in this scope.
            </GatedNote>
          ) : (
            <>
              <GatedNote why={caveats}>Positions are your assignments. Drag players into a lane, or use each player’s menu.</GatedNote>
              {summary.invalid && <p className="roster-alert" role="alert">Minutes must be finite and nonnegative. Export is unavailable until corrected.</p>}
              <section className="roster-chart" aria-label="Roster allocations" ref={boardRef}>
                <BoardLayout className="roster-board" main={<>
                  {lane("Unassigned")}
                  <div className="roster-lanes">{POSITION_LANES.map(lane)}</div>
                </>} />
              </section>
              <AccordionItem title={`All Players (${rows.length})`} className="roster-table">
                <Table density="compact" aria-label="Player allocation inputs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead align="right">Games</TableHead>
                      <TableHead align="right">Observed min</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead align="right">Projected min/g</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((row) => (
                      <TableRow key={row.player_id}>
                        <TableCell><Link href={playerHref(row.player_id)}>{row.player_name}</Link></TableCell>
                        <TableCell numeric>{row.games_played}</TableCell>
                        <TableCell numeric>{tenthMinutes(row.total_minutes)}</TableCell>
                        <TableCell>
                          <Select aria-label={`Position for ${row.player_name}`} value={row.allocation_position}
                            onChange={(event) => move(row.player_id, event.target.value as Lane)}>
                            {LANES.map((name) => <option key={name} value={name}>{name}</option>)}
                          </Select>
                        </TableCell>
                        <TableCell numeric>{projected[row.player_id]?.trim() ? projected[row.player_id] : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionItem>
            </>
          )}
        </>
      )}

      {!embedded && <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose a team" className="roster-picker-modal">
        <TeamGrid selected={data?.team.id ?? teamId} onSelect={selectTeam} />
      </Modal>}
    </>
  );
  return embedded
    ? <div className="roster-page roster-embedded">{content}</div>
    : <PageShell template="board" className="roster-page">{content}</PageShell>;
}
