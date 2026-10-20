"use client";

import Link from "next/link";
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { arc, pie } from "d3-shape";
import { sankey, sankeyLinkHorizontal, sankeyLeft, type SankeyLink, type SankeyNode } from "d3-sankey";
import branding from "@/lib/team-branding.json";
import { formatDate } from "@/lib/format-date";
import { portraitSource, seasonEra, type PortraitEra } from "@/lib/portrait-source";
import {
  HIGH_EARNER_DOLLARS, POSITION_LABELS, UNKNOWN_REASONS, bookYears, getTeamContracts, groupTotals, knownPayroll, lineStatus, money,
  nextOption, payrollSlices, resolveRefresh, salaryIn, shortName, smallVsBig, thresholdLines, timelineMarks, yearRoster,
  type ContractPlayer, type PayrollSlice, type PositionGroup, type RefreshContext, type TeamContracts, type ValueGroup, type ValueRow,
} from "@/lib/contracts";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamGrid } from "./team-grid";
import { TeamLogo } from "./team-logo";
import { Modal } from "./ui/modal";
import { PageHeader } from "./ui/panel";
import { DataDetailsButton, type DataDetailRow } from "./ui/data-details";
import { PlayerAvatar, teamStyle } from "./ui/identity";
import { Icon, type IconName } from "./ui/icon";
import { Button, Segmented, Select } from "./ui/kit";

const TEAMS = branding.teams;
type Tab = "overview" | "small-big";
const TABS: { value: Tab; label: string }[] = [{ value: "overview", label: "Overview" }, { value: "small-big", label: "Small vs Big" }];
const DEFAULT_SPLIT = 12;
const SOURCE = "Basketball-Reference contracts · NBA player index · NBA salary cap release";
const vars = (values: Record<`--${string}`, string | number>) => values as CSSProperties;
const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
const signedMoney = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
const signedPct = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : "−"}${Math.round(Math.abs(value) * 100)}%`;

function contextRows(context: RefreshContext): DataDetailRow[] {
  const t = context.thresholds;
  return [
    { label: "Scope", value: context.label },
    { label: "Refresh observed", value: formatDate(context.observed_at) },
    { label: "Last checked", value: context.checked_at ? formatDate(context.checked_at) : "Not yet checked by the daily refresh" },
    { label: "Stored refresh state", value: context.state === "partial" ? "Partial coverage" : "Verification blocked at admission (verified later; admitted records are immutable)" },
    { label: "Refresh UUID", value: context.refresh_id, mono: true },
    { label: "Book UUID", value: context.book_id ?? "No book", mono: true },
    { label: "Player index dataset", value: context.roster_dataset_id, mono: true },
    { label: "Thresholds", value: t ? `${t.season} official release · effective ${formatDate(t.effective_date)}` : "Not pinned" },
    { label: "Threshold source", value: t?.source_url ?? "—" },
  ];
}

/** A glass panel with Design Language's title-case heading (alignment patterns: Sections). */
function Panel({ icon, title, aside, className = "", children }: { icon: IconName; title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`ctr-panel player-glass ${className}`} aria-label={title}>
    <header className="ctr-panel-head"><h2><Icon name={icon} size={20} />{title}</h2>{aside && <span className="ctr-panel-aside">{aside}</span>}</header>
    {children}
  </section>;
}

function TotalPayroll({ data, year, players }: { data: TeamContracts; year: string; players: ContractPlayer[] }) {
  const current = data.seasons[0];
  const known = knownPayroll(players, year, current);
  const unknown = year === current ? players.filter(p => p.current_salary_cents === null).length : 0;
  const lines = year === current ? thresholdLines(data.context.thresholds).filter(line => line.key === "first_apron" || line.key === "second_apron") : [];
  return <Panel icon="dollar" title="Total Payroll" className="ctr-total">
    <p className="ctr-total-value">{money(known)}</p>
    {lines.length > 0 && <ul className="ctr-apron">{lines.map(line => { const status = lineStatus(known, line);
      return <li key={line.key} data-below={status.below || undefined}><Icon name={status.below ? "down" : "up"} size={14} /><strong>{status.label}</strong><span>{status.below ? "Below" : "Over"} by {money(status.by)}</span></li>; })}</ul>}
    <p className="ctr-note">{year === current
      ? unknown ? `Known salaries only: ${unknown} blank on the source page, not counted as $0` : "Every roster salary is reported"
      : `Projected from the ${current} book: salaries listed for ${year}`}</p>
  </Panel>;
}

function CapUtilization({ data, year, players }: { data: TeamContracts; year: string; players: ContractPlayer[] }) {
  const current = data.seasons[0];
  const known = knownPayroll(players, year, current);
  const lines = year === current ? thresholdLines(data.context.thresholds) : [];
  if (!lines.length) return <Panel icon="scale" title="Cap Utilization" aside={money(known)}>
    <p className="ctr-note">The league publishes cap, tax and apron figures one season at a time; {year} has none yet.</p>
  </Panel>;
  // Databallr's focused range: $20M under the cap to just past the 2nd apron (or the payroll).
  const low = Math.floor((lines[0].value - 20e6) / 1e6) * 1e6;
  const high = Math.ceil((Math.max(known, lines[3].value) + 4e6) / 1e6) * 1e6;
  const at = (value: number) => Math.min(1, Math.max(0, (value - low) / (high - low)));
  const cap = lines[0].value;
  return <Panel icon="scale" title="Cap Utilization" aside={money(known)}>
    <p className="ctr-note">Focused range: {money(low)} to {money(high)}</p>
    <div className="ctr-cap" role="img" aria-label={`Known payroll ${money(known)}; ${lines.map(l => `${l.label} ${money(l.value)}`).join(", ")}`}>
      <div className="ctr-cap-track">
        <span className="ctr-cap-fill is-under" style={vars({ "--to": pct(at(Math.min(known, cap))) })} />
        {known > cap && <span className="ctr-cap-fill is-over" style={vars({ "--from": pct(at(cap)), "--to": pct(at(known)) })} />}
        {lines.slice(1).map(line => <span key={line.key} className="ctr-cap-tick" style={vars({ "--at": pct(at(line.value)) })} />)}
      </div>
      <ol className="ctr-cap-labels">{lines.map(line => <li key={line.key} data-line={line.key} style={vars({ "--at": pct(at(line.value)) })}><strong>{line.label}</strong><span>{money(line.value)}</span></li>)}</ol>
    </div>
  </Panel>;
}

// Photos sit between the player nodes and their names (follow-up 11).
const FLOW_WIDTH = 640, FLOW_FACE = 30, FLOW_FACE_OFFSET = 28, FLOW_LABEL_GAP = 52;
type FlowNode = { id: string; label: string; detail: string; group: PositionGroup | "total" };
type FlowLink = { source: string; target: string; value: number; group: PositionGroup };

/** Total → position group → every player with a known salary (Databallr's Payroll Flow). */
function PayrollFlow({ slices, era }: { slices: PayrollSlice[]; era: (player: ContractPlayer) => PortraitEra | null }) {
  const clip = useId().replace(/:/g, "");
  // Initials only where a photo fails: transparent headshots would show them through.
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const groups = groupTotals(slices);
  const total = groups.reduce((t, g) => t + g.value, 0);
  // Room for a 30px photo beside every player: at least 54 units a player, 38 between nodes.
  const height = Math.max(440, slices.length * 54);
  const graph = (() => {
    if (!total) return null;
    const nodes: FlowNode[] = [{ id: "total", label: "Total Payroll", detail: money(total), group: "total" },
      ...groups.map(g => ({ id: g.group, label: POSITION_LABELS[g.group], detail: money(g.value), group: g.group })),
      ...slices.map(s => ({ id: s.player.player_id, label: s.player.name, detail: money(s.value), group: s.group }))];
    const links: FlowLink[] = [...groups.map(g => ({ source: "total", target: g.group, value: g.value, group: g.group })),
      ...slices.map(s => ({ source: s.group, target: s.player.player_id, value: s.value, group: s.group }))];
    // Zero-salary links still draw a hairline; d3 lays out by value, so give them a sliver.
    return sankey<FlowNode, FlowLink>().nodeId(n => n.id).nodeAlign(sankeyLeft).nodeSort(null).nodeWidth(12).nodePadding(38)
      .extent([[100, 16], [320, height - 16]])({ nodes: nodes.map(n => ({ ...n })), links: links.map(l => ({ ...l, value: Math.max(l.value, total / 2000) })) });
  })();
  if (!graph) return <p className="ctr-note">No known salary to draw.</p>;
  const path = sankeyLinkHorizontal<FlowNode, FlowLink>();
  const players = new Map(slices.map(s => [s.player.player_id, s.player]));
  // Photos are drawn in the SVG (clipped images), so the whole chart scales to its panel (follow-up 12).
  return <div className="ctr-flow-figure" role="region" aria-label="Payroll flow chart">
    <svg className="ctr-flow" viewBox={`0 0 ${FLOW_WIDTH} ${height}`} role="img" aria-label={`Total payroll ${money(total)} by position group and player`}>
      <defs>{graph.nodes.filter(node => node.depth === 2).map(node => <clipPath key={node.id} id={`${clip}-${node.id}`}>
        <circle cx={(node.x1 ?? 0) + FLOW_FACE_OFFSET} cy={((node.y0 ?? 0) + (node.y1 ?? 0)) / 2} r={FLOW_FACE / 2} /></clipPath>)}</defs>
      {graph.links.map((link: SankeyLink<FlowNode, FlowLink>, index) => <path key={index} className="ctr-flow-link" data-group={link.group} d={path(link) ?? ""} strokeWidth={Math.max(1, link.width ?? 1)}>
        <title>{`${(link.source as FlowNode).label} to ${(link.target as FlowNode).label}: ${money(link.value)}`}</title></path>)}
      {graph.nodes.map((node: SankeyNode<FlowNode, FlowLink>) => {
        const y = ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2;
        const player = node.depth === 2;
        return <g key={node.id} className="ctr-flow-node" data-group={node.group}>
          <rect x={node.x0} y={node.y0} width={(node.x1 ?? 0) - (node.x0 ?? 0)} height={Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0))} rx="3" />
          {player
            ? <text x={(node.x1 ?? 0) + FLOW_LABEL_GAP} y={y} dominantBaseline="middle"><tspan className="ctr-flow-name">{node.label}</tspan><tspan className="ctr-flow-detail" dx="6">{node.detail}</tspan></text>
            : <text x={(node.x0 ?? 0) - 8} y={y} textAnchor="end"><tspan className="ctr-flow-name" x={(node.x0 ?? 0) - 8} dy="-0.2em">{node.label}</tspan><tspan className="ctr-flow-detail" x={(node.x0 ?? 0) - 8} dy="1.3em">{node.detail}</tspan></text>}
          <title>{`${node.label}: ${node.detail}`}</title>
        </g>;
      })}
      {graph.nodes.filter(node => node.depth === 2).map(node => {
        const player = players.get(node.id)!, cx = (node.x1 ?? 0) + FLOW_FACE_OFFSET, cy = ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2;
        const src = portraitSource(null, player.player_id, 64, era(player))?.src;
        const initials = player.name.split(/\s+/).map(word => word[0]).slice(0, 2).join("");
        return <g key={node.id} className="ctr-flow-face" aria-hidden="true">
          <circle className="ctr-flow-face-bg" cx={cx} cy={cy} r={FLOW_FACE / 2} />
          {(!src || missing.has(node.id)) && <text className="ctr-flow-face-initials" x={cx} y={cy} textAnchor="middle" dominantBaseline="central">{initials}</text>}
          {src && !missing.has(node.id) && <image onError={() => setMissing(ids => new Set(ids).add(node.id))} href={src} x={cx - FLOW_FACE / 2} y={cy - FLOW_FACE / 2} width={FLOW_FACE} height={FLOW_FACE} preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clip}-${node.id})`} />}
          <circle className="ctr-flow-face-ring" cx={cx} cy={cy} r={FLOW_FACE / 2} />
        </g>;
      })}
    </svg>
  </div>;
}

const MARK_LABELS = { guaranteed: "Salary", "player-option": "Player option", "team-option": "Team option", "free-agent": "Free agent", none: "" } as const;

function ContractTimeline({ data, year, players, era }: { data: TeamContracts; year: string; players: ContractPlayer[]; era: (player: ContractPlayer) => PortraitEra | null }) {
  const current = data.seasons[0];
  const years = data.seasons.slice(data.seasons.indexOf(year), data.seasons.indexOf(year) + 5);
  const rows = players.filter(p => salaryIn(p, year, current) !== null).sort((a, b) => (salaryIn(b, year, current) ?? 0) - (salaryIn(a, year, current) ?? 0));
  const top = Math.max(1, ...rows.flatMap(p => years.map(y => salaryIn(p, y, current) ?? 0)));
  return <>
    <div className="ctr-timeline-scroll" role="region" aria-label="Contract timeline seasons" tabIndex={0}><div className="ctr-timeline" role="table" aria-label="Contract timeline" style={vars({ "--years": years.length })}>
      <div role="row" className="ctr-timeline-head"><span role="columnheader">Player</span><span role="columnheader" title="DARKO Daily Plus-Minus, latest board">DPM</span>
        {years.map(y => <span role="columnheader" key={y} data-current={y === year || undefined}>{y}</span>)}</div>
      {rows.map(player => <div role="row" key={player.player_id} className="ctr-timeline-row">
        <span role="rowheader" className="ctr-timeline-name"><PlayerAvatar playerId={player.player_id} name={player.name} team={data.team_id} size="sm" era={era(player)} /><Link href={`/players/${player.player_id}`} title={player.name}>{shortName(player.name)}</Link>
          <span className="ctr-timeline-info" title={[player.name, ...years.map(y => `${y}: ${money(salaryIn(player, y, current))}`), nextOption(player) ?? ""].filter(Boolean).join("\n")}><Icon name="info" size={14} /></span></span>
        <span role="cell" className="ctr-timeline-dpm">{player.darko_dpm === null || player.darko_dpm === undefined ? "—" : `${player.darko_dpm > 0 ? "+" : ""}${player.darko_dpm.toFixed(1)}`}</span>
        {timelineMarks(player, years, current).map(cell => <span role="cell" key={cell.year} className="ctr-timeline-cell" data-mark={cell.mark}
          style={vars({ "--level": (0.55 + 0.45 * (cell.value ?? 0) / top).toFixed(3) })} title={cell.mark === "none" ? undefined : `${cell.year}: ${MARK_LABELS[cell.mark]}${cell.value !== null ? ` · ${money(cell.value)}` : ""}`}>
          {cell.mark === "free-agent" ? "FA" : cell.mark !== "none" ? money(cell.value) : ""}
        </span>)}
      </div>)}
    </div></div>
    <ul className="ctr-legend" aria-label="Timeline key">
      <li><span className="ctr-key" data-mark="guaranteed" />Salary</li><li><span className="ctr-key" data-mark="player-option" />Player option</li>
      <li><span className="ctr-key" data-mark="team-option" />Team option</li><li><span className="ctr-key-text">FA</span>Free agent</li><li><span className="ctr-key-text">DPM</span>DARKO</li>
    </ul>
  </>;
}

const GROUP_TONE: Record<PositionGroup, string> = { G: "guard", F: "forward", C: "center", unlisted: "unlisted" };
type Arc = { startAngle: number; endAngle: number; padAngle?: number };

/** Databallr's two-ring pie: positions inside, every player outside, largest names labelled. */
function PayrollPie({ slices }: { slices: PayrollSlice[] }) {
  const groups = groupTotals(slices);
  const total = groups.reduce((t, g) => t + g.value, 0);
  const layout = pie<{ value: number }>().value(d => d.value).sort(null).padAngle(0.006);
  const inner = layout(groups), outer = layout(slices);
  const ringIn = arc<Arc>().innerRadius(70).outerRadius(124).cornerRadius(2);
  const ringOut = arc<Arc>().innerRadius(132).outerRadius(164).cornerRadius(2);
  const label = arc<Arc>().innerRadius(180).outerRadius(180);
  return <div className="ctr-pie">
    <svg viewBox="-230 -190 460 380" role="img" aria-label={`Payroll ${money(total)} by position and player`}>
      {inner.map((d, i) => <path key={groups[i].group} className="ctr-pie-slice" data-tone={GROUP_TONE[groups[i].group]} d={ringIn(d) ?? ""}><title>{`${POSITION_LABELS[groups[i].group]}: ${money(groups[i].value)}`}</title></path>)}
      {outer.map((d, i) => <path key={slices[i].player.player_id} className="ctr-pie-slice is-outer" data-tone={GROUP_TONE[slices[i].group]} data-shade={slices.filter((s, j) => j < i && s.group === slices[i].group).length % 2 ? "light" : undefined} d={ringOut(d) ?? ""}><title>{`${slices[i].player.name}: ${money(slices[i].value)}`}</title></path>)}
      {outer.map((d, i) => { if (slices[i].value / total < 0.06) return null; const [x, y] = label.centroid(d);
        return <text key={`l${i}`} className="ctr-pie-label" x={x} y={y} textAnchor={x > 0 ? "start" : "end"} dominantBaseline="middle">{slices[i].player.name}</text>; })}
      <text className="ctr-pie-center-label" y="-18" textAnchor="middle">Total Payroll</text>
      <text className="ctr-pie-center-value" y="10" textAnchor="middle">{money(total)}</text>
      <text className="ctr-pie-center-label" y="30" textAnchor="middle">{groups.length} position groups</text>
    </svg>
    <div className="ctr-pie-legend"><h3>Position Share</h3><ul>{groups.map(g => <li key={g.group}><span className="ctr-key" data-tone={GROUP_TONE[g.group]} />{POSITION_LABELS[g.group]}<strong>{(g.value / total * 100).toFixed(1)}%</strong></li>)}</ul></div>
  </div>;
}

const SERIES = 8;

function HighEarners({ slices }: { slices: PayrollSlice[] }) {
  const earners = slices.filter(s => s.value >= HIGH_EARNER_DOLLARS).sort((a, b) => b.value - a.value);
  const total = earners.reduce((t, s) => t + s.value, 0);
  if (!earners.length) return <p className="ctr-note">No salary of $8M or more.</p>;
  // Eight series colours in salary order; a ninth earner and beyond fold into Other (never a cycled hue).
  type Earner = { id: string; label: string; value: number; series: string; player: ContractPlayer | null };
  const shown: Earner[] = earners.slice(0, SERIES).map((s, i) => ({ id: s.player.player_id, label: s.player.name, value: s.value, series: String(i + 1), player: s.player }));
  const rest = earners.slice(SERIES);
  if (rest.length) shown.push({ id: "other", label: `Other ${rest.length} at $8M+`, value: rest.reduce((t, s) => t + s.value, 0), series: "other", player: null });
  const arcs = pie<Earner>().value(d => d.value).sort(null).padAngle(0.01)(shown);
  const ring = arc<Arc>().innerRadius(92).outerRadius(150).cornerRadius(2);
  const faces = arc<Arc>().innerRadius(178).outerRadius(178);
  return <div className="ctr-pie">
    <div className="ctr-pie-figure">
      <svg viewBox="-210 -210 420 420" role="img" aria-label={`${earners.length} players at $8M or more: ${money(total)}`}>
        {arcs.map(d => <path key={d.data.id} className="ctr-pie-slice" data-series={d.data.series} d={ring(d) ?? ""}><title>{`${d.data.label}: ${money(d.data.value)}`}</title></path>)}
        <text className="ctr-pie-center-label" y="-22" textAnchor="middle">High Earners</text>
        <text className="ctr-pie-center-value" y="8" textAnchor="middle">{money(total)}</text>
        <text className="ctr-pie-center-label" y="30" textAnchor="middle">{earners.length} players at $8M+</text>
      </svg>
      {arcs.map(d => { if (!d.data.player) return null; const [x, y] = faces.centroid(d);
        return <span key={d.data.id} className="ctr-pie-face" data-series={d.data.series} style={vars({ "--x": pct((x + 210) / 420), "--y": pct((y + 210) / 420) })}>
          <PlayerAvatar playerId={d.data.player.player_id} name={d.data.player.name} size="sm" /></span>; })}
    </div>
    <div className="ctr-pie-legend"><h3>Players ({money(total)} Total)</h3><ul>{shown.map(s => <li key={s.id}><span className="ctr-key" data-series={s.series} />{s.label}<strong>{money(s.value)}</strong></li>)}</ul></div>
  </div>;
}

function ValueTable({ title, label, rows }: { title: ReactNode; label: string; rows: ValueRow[] }) {
  return <section className="ctr-sv-list player-glass" aria-label={label}>
    <h3>{title}</h3>
    <table className="ctr-sv-table"><thead><tr><th scope="col">Player</th><th scope="col" className="num">Salary</th><th scope="col" className="num" title="DARKO market value minus salary">Surplus</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.player.player_id}>
        <th scope="row"><Link href={`/players/${row.player.player_id}`}>{row.player.name}</Link></th>
        <td className="num">{money(row.salary)}</td>
        <td className="num ctr-surplus" data-sign={row.surplus === null ? undefined : row.surplus >= 0 ? "up" : "down"} title={row.value === null ? "No DARKO value for this player" : `DARKO value ${money(row.value)}`}>{signedMoney(row.surplus)}</td>
      </tr>)}{!rows.length && <tr><td colSpan={3} className="ctr-sv-empty">No contracts on this side</td></tr>}</tbody></table>
  </section>;
}

function ValueSummary({ title, detail, group, team }: { title: string; detail: string; group: ValueGroup; team: string }) {
  return <section className="ctr-sv-card player-glass" aria-label={title}>
    <h3><TeamLogo team={team} size={24} />{title}</h3><p className="ctr-sv-detail">{detail}</p>
    <dl><div><dt>Salary Paid</dt><dd>{money(group.salary)}</dd></div><div><dt>Mapped Value</dt><dd>{money(group.value)}</dd></div>
      <div><dt>Mapped Surplus</dt><dd className="ctr-surplus" data-sign={group.surplus >= 0 ? "up" : "down"}>{signedMoney(group.mapped ? group.surplus : null)}</dd></div></dl>
    <div className="ctr-sv-roi"><span>Mapped ROI</span><strong>{signedPct(group.roi)}</strong></div>
  </section>;
}

function SmallVsBig({ data, split, onSplit }: { data: TeamContracts; split: number; onSplit: (value: number) => void }) {
  const current = data.seasons[0];
  const roster = data.players.filter(p => p.on_index_roster);
  const { small, big, all } = smallVsBig(roster, split * 1e6);
  const darko = data.darko;
  const name = TEAMS.find(t => t.team_id === data.team_id)?.artwork_name ?? data.team_name;
  return <div className="ctr-sv">
    <p className="ctr-sv-source"><span>DARKO market values via <a href="https://www.darko.app" target="_blank" rel="noreferrer">darko.app</a> by Kostya Medvedovsky{darko ? ` · board ${formatDate(darko.data_date)}` : ""}</span>
      <span>{all.mapped} of {all.rows.length} contracts have a DARKO value; value, surplus and ROI use those rows only</span></p>
    <section className="ctr-sv-hero player-glass" aria-label={`${name} contracts summary`}>
      <h2><TeamLogo team={data.team_id} size={40} />{name} Contracts</h2>
      <dl><div><dt>Season</dt><dd>{current}</dd></div><div><dt>Salary</dt><dd>{money(all.salary)}</dd></div><div><dt>Mapped Value</dt><dd>{money(all.value)}</dd></div>
        <div><dt>Mapped Surplus</dt><dd className="ctr-surplus" data-sign={all.surplus >= 0 ? "up" : "down"}>{signedMoney(all.surplus)}</dd></div>
        <div><dt>Mapped ROI</dt><dd className="ctr-surplus" data-sign={(all.roi ?? 0) >= 0 ? "up" : "down"}>{signedPct(all.roi)}</dd></div></dl>
    </section>
    <div className="ctr-sv-grid">
      <ValueTable title={<><TeamLogo team={data.team_id} size={20} />Small Contracts <span>&lt; ${split}M</span></>} label="Small contract list" rows={small.rows} />
      <div className="ctr-sv-middle">
        <section className="ctr-sv-threshold player-glass" aria-label="Contract threshold">
          <h3>Contract Threshold</h3>
          <p className="ctr-sv-split"><span>Small</span> &lt; <strong>${split}M</strong> / <span>Big</span> ≥ <strong>${split}M</strong></p>
          <input type="range" className="ctr-range" min={1} max={40} step={0.5} value={split} aria-label="Contract threshold in millions"
            style={vars({ "--fill": pct((split - 1) / 39) })} onChange={event => onSplit(Number(event.target.value))} />
          <p className="ctr-sv-range"><span>$1M</span><span>$40M</span></p>
        </section>
        <div className="ctr-sv-cards">
          <ValueSummary title="Small Contracts" detail={`${small.rows.length} players < $${split}M · ${small.mapped} mapped`} group={small} team={data.team_id} />
          <ValueSummary title="Big Contracts" detail={`${big.rows.length} players ≥ $${split}M · ${big.mapped} mapped`} group={big} team={data.team_id} />
        </div>
      </div>
      <ValueTable title={<><TeamLogo team={data.team_id} size={20} />Big Contracts <span>≥ ${split}M</span></>} label="Big contract list" rows={big.rows} />
    </div>
    <p className="ctr-note">Value is DARKO&apos;s market value for each player from its latest published board, not a CourtLens estimate. Surplus is value minus the {current} reported salary; ROI is surplus over the salary of the mapped players.</p>
  </div>;
}

function RosterBanner({ data, players }: { data: TeamContracts; players: ContractPlayer[] }) {
  const unknown = players.filter(p => p.current_salary_cents === null);
  const other = data.players.filter(p => !p.on_index_roster);
  return <div className="ctr-banner" role="note">
    <strong>Roster-aware salary data</strong>
    <p>{unknown.length
      ? `${players.length - unknown.length} of ${players.length} players on the NBA roster have a reported ${data.seasons[0]} salary. Blank on the source page (two-way or camp deals), left out and never counted as $0: ${unknown.map(p => p.name).join(", ")}.`
      : `All ${players.length} players on the NBA roster are matched to their team salary rows.`}
      {other.length > 0 && ` Also on the source page but on another roster: ${other.map(p => `${p.name} (${money(salaryIn(p, data.seasons[0], data.seasons[0]))})`).join(", ")}.`}</p>
  </div>;
}

const tricodeOf = (team: string) => TEAMS.find(t => t.team_id === team || t.tricode === team)?.tricode ?? team;

/** Contracts (alignment row 14): Databallr's Select Team flow, Overview and Small vs Big. */
export function ContractsView({ statsTable }: { statsTable?: ReactNode }) {
  const { get, set } = useUrlState();
  const team = get("team")?.toUpperCase() ?? null;
  const tab: Tab = get("tab") === "small-big" ? "small-big" : "overview";
  const split = Math.min(40, Math.max(1, Number(get("split")) || DEFAULT_SPLIT));
  const [picker, setPicker] = useState(() => !get("team"));
  const refreshPinned = get("refresh");
  const refresh = useFeed([refreshPinned], signal => resolveRefresh(refreshPinned, signal));
  const refreshId = refresh.data ?? null;
  useEffect(() => { if (refreshId && !refreshPinned) set({ refresh: refreshId }); }, [refreshId, refreshPinned]); // eslint-disable-line react-hooks/exhaustive-deps
  const feed = useFeed([refreshId, team], signal => refreshId && team ? getTeamContracts(refreshId, team, null, signal) : Promise.resolve(null));
  const data = feed.data;
  const years = data ? bookYears(data).slice(0, 5) : ["2026-27"];
  const year = years.includes(get("year") ?? "") ? get("year")! : years[0];
  const players = data ? yearRoster(data, year) : [];
  // The book's season photo where the NBA has one (Design Language, Identity), else the current one.
  const photoEra = () => data ? seasonEra(data.seasons[0], data.team_id) : null;
  const slices = data ? payrollSlices(players, year, data.seasons[0]) : [];
  const teamName = team ? TEAMS.find(t => t.tricode === team)?.artwork_name ?? data?.team_name ?? team : null;
  const query = refreshId ? `?refresh=${encodeURIComponent(refreshId)}` : "";
  const failure = refresh.error || (refresh.data === null && !refresh.loading ? "No finance refresh has been admitted for 2026-27." : "") || feed.error;
  return <div className="ctr-page" role="region" aria-label="Contracts">
    {team
      ? <PageHeader className="ctr-header" title={<><TeamLogo team={team} size={40} />{teamName} Contracts</>} subtitle={`${year} Salary Cap Analysis`} />
      : <PageHeader className="pvp-header" icon="dollar" title="Contracts" subtitle="NBA Salary Cap Analysis" />}
    <div className="ctr-console">
      <Button size="lg" iconAfter="chevron-down" aria-haspopup="dialog" aria-label={team ? `Team, ${teamName}` : "Select Team"} onClick={() => setPicker(true)}>
        {team ? <><TeamLogo team={team} size={20} />{teamName}</> : <><Icon name="dollar" size={16} />Select Team</>}
      </Button>
      <Select size="lg" aria-label="Contract season" value={year} onChange={event => set({ year: event.target.value === years[0] ? null : event.target.value })}>
        {years.map((y, i) => <option key={y} value={y}>{i ? `${y} · Projected` : y}</option>)}
      </Select>
      {data && <DataDetailsButton rows={[...contextRows(data.context),
        { label: "DARKO board", value: data.darko ? `${data.darko.season} · data ${formatDate(data.darko.data_date)} · sealed ${data.darko.as_of}` : "Not configured" }]}>
        <ul className="ctr-method">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        <p className="ctr-note">Source: {SOURCE}; DARKO (darko.app, Kostya Medvedovsky) for value and DPM.</p>
        <p><Link href={`/contracts/books${query}`}>Retained source books (advanced)</Link></p>
      </DataDetailsButton>}
    </div>
    <Segmented<Tab> size="lg" label="Contracts view" value={tab} onChange={next => set({ tab: next === "overview" ? null : next })} options={TABS} className="ctr-tabs" />
    <Modal isOpen={picker} onClose={() => setPicker(false)} title="Select Team" description="30 NBA teams" className="ctr-team-modal">
      <TeamGrid variant="compact" selected={team ? TEAMS.find(t => t.tricode === team)?.team_id : null}
        onSelect={next => { const code = tricodeOf(next); set({ team: code === team ? null : code, year: null }); setPicker(false); }} />
      {team && <Button size="md" stretch className="ctr-team-clear" onClick={() => { set({ team: null, year: null }); setPicker(false); }}>Clear Team</Button>}
    </Modal>
    {failure && <FeedFailure error={failure} retry={refresh.error ? refresh.retry : feed.retry} what="Contracts" />}
    {!team && !failure && <div className="ctr-empty">
      <span className="ctr-empty-icon"><Icon name="dollar" size={20} /></span>
      <h2>Select a Team</h2>
      <p>Choose an NBA team to view their salary cap breakdown, contract details, and multi-year commitments.</p>
      <Button size="md" variant="primary" onClick={() => setPicker(true)}>Choose Team</Button>
    </div>}
    {team && !failure && !data && <FeedSkeleton label="Loading contracts" />}
    {data && <>
      <RosterBanner data={data} players={data.players.filter(p => p.on_index_roster)} />
      {tab === "overview" && <>
        {/* The flow's SVG photos take the team ring from here, like the timeline's avatars (follow-up 14). */}
        <div className="ctr-grid" style={teamStyle(data.team_id)}>
          <TotalPayroll data={data} year={year} players={players} />
          <CapUtilization data={data} year={year} players={players} />
          <Panel icon="split" title="Payroll Flow" aside={<>Total<Icon name="right" size={14} />Position Group<Icon name="right" size={14} />Player</>}><PayrollFlow slices={slices} era={photoEra} /></Panel>
          <Panel icon="calendar" title="Contract Timeline"><ContractTimeline data={data} year={year} players={players} era={photoEra} /></Panel>
        </div>
        {statsTable && <section className="ctr-stats" aria-label="Roster stats">{statsTable}</section>}
        <h2 className="ctr-section-title">Payroll Pies</h2>
        <div className="ctr-grid">
          <Panel icon="pie" title="Payroll Breakdown" aside={`${money(slices.reduce((t, s) => t + s.value, 0))} total`}><PayrollPie slices={slices} /></Panel>
          <Panel icon="pie" title="High Earners" aside="$8M+ only"><HighEarners slices={slices} /></Panel>
        </div>
      </>}
      {tab === "small-big" && <>
        {year !== data.seasons[0] && <p className="ctr-note">Small vs Big reads the {data.seasons[0]} salaries: DARKO values are for the current season.</p>}
        <SmallVsBig data={data} split={split} onSplit={value => set({ split: value === DEFAULT_SPLIT ? null : String(value) })} />
      </>}
      <p className="ctr-provenance">Source: {SOURCE}. {UNKNOWN_REASONS.salary_blank_in_source}: unknown, never $0. Options are reported markers; exercise and guarantee state are unknown.</p>
    </>}
  </div>;
}
