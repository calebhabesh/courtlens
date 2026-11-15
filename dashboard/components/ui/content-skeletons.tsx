"use client";

import { StatsGrid, type GridColumn } from "../research/stats-grid";
import { Skeleton } from "./skeleton";

/*
 * Content-shaped skeleton parts (DL Loading: skeletons in the final layout's shape, no layout shift).
 * Each part reuses the class of the content it stands in for, so gaps, padding and frame come from the
 * same CSS as the loaded page; only the text and figures are replaced with placeholder bars. Text bars
 * sit inside a box of the real line height, sized to the font's cap height, so stacked lines keep the
 * spacing of real copy instead of touching or floating apart.
 */

export type SkelSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
type Width = number | string;

/** One line of text at a type-scale size. */
export function SkelText({ size = "md", width = "100%", className = "" }: { size?: SkelSize; width?: Width; className?: string }) {
  return <div className={`ui-skel-line ${className}`} data-size={size} aria-hidden="true"><Skeleton variant="text" width={width} /></div>;
}

const PARAGRAPH = ["100%", "97%", "99%", "94%", "98%", "96%"];

/** A paragraph: full lines with a natural ragged edge and a short last line. */
export function SkelLines({ lines = 3, size = "md", last = "58%", className = "" }: { lines?: number; size?: SkelSize; last?: Width; className?: string }) {
  return <div className={`ui-skel-lines ${className}`} aria-hidden="true">
    {Array.from({ length: lines }, (_, index) => <SkelText key={index} size={size} width={index === lines - 1 && lines > 1 ? last : PARAGRAPH[index % PARAGRAPH.length]} />)}
  </div>;
}

/** A control kit control: xs 28 px, sm 32 px, md 36 px, lg 40 px tall. `label` adds the field label before it. */
export function SkelControl({ width, size = "sm", label }: { width: Width; size?: "xs" | "sm" | "md" | "lg"; label?: number }) {
  const control = <Skeleton className="ui-skel-control" data-size={size} width={width} />;
  if (label === undefined) return control;
  return <span className="ui-skel-labeled"><SkelText size="xs" width={label} />{control}</span>;
}

/** A segmented group: one framed track holding its options. */
export function SkelSegmented({ options, size = "sm", stretch = false, className = "" }: { options: readonly number[]; size?: "xs" | "sm" | "md"; stretch?: boolean; className?: string }) {
  return <span className={`ui-skel-segmented ${className}`} data-size={size} data-stretch={stretch || undefined} aria-hidden="true">
    {options.map((width, index) => <Skeleton key={index} className="ui-skel-segment" width={width} />)}
  </span>;
}

export type SkelControlSpec = number | { label?: number; width: number } | { segmented: readonly number[] } | "gap";

/** A row of controls laid out like the page's filter row. `"gap"` pushes the rest to the right. */
export function SkelControls({ items, size = "sm", align = "start", className = "" }: { items: readonly SkelControlSpec[]; size?: "xs" | "sm" | "md"; align?: "start" | "center"; className?: string }) {
  return <div className={`ui-skel-controls ${className}`} data-align={align} aria-hidden="true">
    {items.map((item, index) => item === "gap" ? <span key={index} className="ui-skel-push" />
      : typeof item === "number" ? <SkelControl key={index} width={item} size={size} />
        : "segmented" in item ? <SkelSegmented key={index} options={item.segmented} size={size} />
          : <SkelControl key={index} width={item.width} size={size} label={item.label} />)}
  </div>;
}

/**
 * The page header (`PageHeader`): left-aligned; centred with the larger title the reference pages use;
 * or the Research hero (`sq-hero`), centred under its 44 px icon tile. Widths are of the title and subtitle text.
 */
export function SkelHeader({ align = "left", icon = true, title = 240, subtitle = 360, actions = [], className = "" }: {
  align?: "left" | "center" | "hero"; icon?: boolean; title?: Width; subtitle?: Width | null; actions?: readonly number[]; className?: string;
}) {
  const variant = align === "hero" ? "sq-hero research-hero" : align === "center" ? "pvp-header research-hero" : "";
  const centered = align !== "left";
  return <header className={`ui-page-header ${variant} ui-skel-header ${className}`} aria-hidden="true">
    <div className="ui-page-header-title-row">
      {icon && <span className="ui-page-header-icon">{align !== "hero" && <Skeleton className="ui-skel-icon" width={20} height={20} />}</span>}
      <SkelText size={centered ? "3xl" : "2xl"} width={title} className="ui-skel-title" />
      {actions.length > 0 && <div className="ui-page-header-actions">{actions.map((width, index) => <SkelControl key={index} width={width} size="sm" />)}</div>}
    </div>
    {subtitle !== null && <SkelText size={centered ? "md" : "sm"} width={subtitle} className="ui-skel-subtitle" />}
  </header>;
}

/**
 * The filter bar (`FilterBar`) with its real frame: labelled fields on the left, count chip and Data
 * details on the right. A field is `[label width, control width]`; a bare number is a control alone.
 */
export function SkelFilterBar({ fields, page = [], modes = [], meta = [88, 108], className = "" }: { fields: readonly ([number, number] | number)[]; page?: readonly number[]; modes?: readonly number[][]; meta?: readonly number[]; className?: string }) {
  return <div className={`ui-filter-bar ${modes.length ? "has-modes" : ""} ${className}`} aria-hidden="true">
    <div className="ui-filter-bar-controls">
      <div className="ui-filter-bar-scope">{fields.map((field, index) => typeof field === "number"
        ? <SkelControl key={index} width={field} size="sm" />
        : <div key={index} className="ui-field ui-field-inline"><SkelText size="xs" width={field[0]} /><SkelControl width={field[1]} size="sm" /></div>)}</div>
      {page.length > 0 && <div className="ui-filter-bar-page">{page.map((width, index) => <SkelControl key={index} width={width} size="sm" />)}</div>}
      {modes.length > 0 && <div className="ui-filter-bar-modes">{modes.map((options, index) => <SkelSegmented key={index} options={options} size="sm" />)}</div>}
    </div>
    {meta.length > 0 && <div className="ui-filter-bar-meta">{meta.map((width, index) => <SkelControl key={index} width={width} size="xs" />)}</div>}
  </div>;
}

/** The centred Research intro (`ResearchIntro`): tagline over its text links. */
export function SkelIntro({ tagline = 520, links = [160, 120] }: { tagline?: number; links?: readonly number[] }) {
  return <div className="rs-intro" aria-hidden="true">
    <SkelText size="md" width={tagline} className="ui-skel-center" />
    {links.length > 0 && <div className="rs-intro-links">{links.map((width, index) => <SkelControl key={index} width={width} size="sm" />)}</div>}
  </div>;
}

/** One stat tile (`StatTile`): label, value and an optional footnote or percentile bar. */
export function SkelTile({ index = 0, footnote = true, bar = false }: { index?: number; footnote?: boolean; bar?: boolean }) {
  return <div className="ui-stat-tile" aria-hidden="true">
    <SkelText size="xs" width={56 + (index % 3) * 12} />
    <SkelText size="xl" width={64 + (index % 2) * 16} />
    {bar && <Skeleton className="ui-skel-bar" height={4} />}
    {footnote && <SkelText size="xs" width={84 + (index % 2) * 20} />}
  </div>;
}

/** Stat tiles (`StatTile`): label, value and an optional footnote or percentile bar. */
export function SkelTiles({ count, footnote = true, bar = false, className = "" }: { count: number; footnote?: boolean; bar?: boolean; className?: string }) {
  return <div className={`ui-skel-tiles ${className}`} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <SkelTile key={index} index={index} footnote={footnote} bar={bar} />)}
  </div>;
}

/** A player's hero card: large photo beside the name, team line and a short fact line. */
export function SkelProfileCard({ photo = 72, className = "" }: { photo?: number; className?: string }) {
  return <div className={`ui-skel-profile-card ${className}`} aria-hidden="true">
    <Skeleton variant="circle" width={photo} height={photo} />
    <div className="ui-skel-identity">
      <SkelText size="xl" width={200} />
      <SkelText size="sm" width={140} />
      <SkelText size="xs" width={240} />
    </div>
  </div>;
}

/** A player card in a table's lead cell: team logo, 40 px photo, name over a subtitle. */
export function SkelPlayerCell({ index = 0, logo = true, photo = true, sub = true }: { index?: number; logo?: boolean; photo?: boolean; sub?: boolean }) {
  return <span className="player-cell ui-skel-player-cell" aria-hidden="true">
    {logo && <Skeleton variant="circle" width={20} height={20} />}
    {photo && <Skeleton variant="circle" className="stats-primary-portrait ui-skel-portrait" />}
    <span className="ui-skel-identity">
      <SkelText size="sm" width={`${62 + (index * 17) % 30}%`} />
      {sub && <SkelText size="2xs" width={`${36 + (index * 11) % 20}%`} />}
    </span>
  </span>;
}

interface SkelRow { id: string; index: number }

/**
 * The site's table (`StatsGrid`) with placeholder rows: the real frame, header tiers and row height.
 * Pass the page's real column and group labels when they are fixed, so only the body is a placeholder.
 */
export function SkelGrid({ label = "Loading table", rows = 10, columns = 8, labels, groups, groupSizes, lead = "player", leadLabel = "", leadGroup, search = false, density = "default", height = "auto", leadWidth = "lg", className = "" }: {
  label?: string; rows?: number; columns?: number;
  /** Column labels; their count overrides `columns`. */
  labels?: readonly string[];
  /** Group label per column (same label on consecutive columns forms one group). */
  groups?: readonly string[];
  /** Columns per group, drawn as placeholder group labels when the real labels depend on the view. */
  groupSizes?: readonly number[];
  lead?: "player" | "team" | "text";
  leadLabel?: string;
  leadGroup?: string;
  search?: boolean;
  density?: "default" | "compact";
  height?: "auto" | "scroll";
  leadWidth?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  // Placeholder groups: distinct zero-width labels, so the header keeps its tiers and group rules.
  const sized = groupSizes?.flatMap((size, group) => Array.from({ length: size }, () => "\u200b".repeat(group + 1)));
  const columnGroups = groups ?? sized;
  const count = labels?.length ?? sized?.length ?? columns;
  const data: SkelRow[] = Array.from({ length: rows }, (_, index) => ({ id: String(index), index }));
  const cols: GridColumn<SkelRow>[] = Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    label: labels?.[index] ?? "",
    group: columnGroups?.[index],
    cell: row => <Skeleton variant="text" className="ui-skel-cell" width={(row.index + index) % 3 === 0 ? 28 : 34} />,
  }));
  const leadCell = (row: SkelRow) => lead === "player" ? <SkelPlayerCell index={row.index} />
    : lead === "team" ? <SkelPlayerCell index={row.index} logo={false} sub={false} />
      : <SkelText size="sm" width={`${50 + (row.index * 13) % 35}%`} />;
  const leadHeader = search
    ? <div className="stats-header-search rs-grid-search"><Skeleton className="ui-skel-search" height={28} /></div>
    : leadLabel;
  return <div className="ui-skel-grid" data-group-bars={sized && !groups ? true : undefined} aria-hidden="true">
    <StatsGrid label={label} rows={data} rowKey={row => row.id} lead={{ label: leadHeader, cell: leadCell, span: search, group: leadGroup ?? (sized && !groups ? "\u200b" : undefined) }} columns={cols}
      density={density} height={height} leadWidth={leadWidth} className={className} />
  </div>;
}

/** A panel of horizontal bars (the Research bar charts): label column, track, value. */
export function SkelBars({ rows = 4, title = true, card = true, className = "" }: { rows?: number; title?: boolean; card?: boolean; className?: string }) {
  return <div className={`${card ? "ui-skel-chart-card" : "ui-skel-chart-bare"} ${className}`} aria-hidden="true">
    {title && <SkelText size="sm" width="44%" />}
    <div className="ui-skel-bars">
      {Array.from({ length: rows }, (_, index) => <div key={index} className="ui-skel-bar-row">
        <span className="ui-skel-identity"><SkelText size="sm" width="70%" /><SkelText size="2xs" width="88%" /></span>
        <Skeleton className="ui-skel-track" width={`${92 - (index * 9) % 30}%`} />
        <SkelText size="sm" width={36} />
      </div>)}
    </div>
  </div>;
}

/** A chart in a panel: title line and a plot area of the chart's real height. */
export function SkelChart({ height = 320, title = true, className = "" }: { height?: number; title?: boolean; className?: string }) {
  return <div className={`ui-skel-chart-card ${className}`} aria-hidden="true">
    {title && <SkelText size="sm" width="38%" />}
    <Skeleton className="ui-skel-plot" height={height} />
  </div>;
}

/**
 * A Research section (`ResearchSection`): icon and 24 px heading, the bold answer, explanatory
 * copy, then the section's figure.
 */
export function SkelResearchSection({ answer = 2, prose = 2, figure = "bars", rows = 4, first = false }: {
  answer?: number; prose?: number; figure?: "bars" | "grid" | "chart" | "cards" | "none"; rows?: number; first?: boolean;
}) {
  return <section className={`rs-section ui-skel-section ${first ? "ui-skel-section-first" : ""}`} aria-hidden="true">
    <div className="rs-section-head"><span className="rs-heading"><Skeleton className="ui-skel-icon" width={20} height={20} /><SkelText size="2xl" width={340} /></span></div>
    {answer > 0 && <SkelLines lines={answer} size="lg" last="46%" className="ui-skel-measure" />}
    {prose > 0 && <SkelLines lines={prose} size="sm" last="72%" className="ui-skel-measure" />}
    {figure === "bars" && <SkelBars rows={rows} />}
    {figure === "grid" && <SkelGrid rows={rows} columns={7} density="compact" />}
    {figure === "chart" && <SkelChart />}
    {figure === "cards" && <div className="rs-cards" data-columns={3}>{[0, 1, 2].map(index => <div key={index} className="rs-card"><SkelText size="lg" width="70%" /><SkelLines lines={3} size="sm" /></div>)}</div>}
  </section>;
}

/** The body of a Research explainer page under its hero: the answer section, then a second section. */
export function SkelResearchArticle({ sections = 2, figure = "bars" as const, second = "grid" as const }: { sections?: number; figure?: "bars" | "grid" | "chart" | "cards"; second?: "bars" | "grid" | "chart" | "cards" }) {
  return <div className="ui-skel-article" aria-hidden="true">
    <SkelResearchSection first figure={figure} />
    {sections > 1 && <SkelResearchSection answer={0} prose={2} figure={second} rows={6} />}
  </div>;
}

/**
 * A whole Research explainer page while its route loads: the centred hero, the intro's scope line and
 * links, then the answer section and a second section.
 */
export function SkelResearchPage({ label, title = 280, subtitle = 560, column = "", figure = "bars", second = "grid" }: {
  label: string; title?: number; subtitle?: number; column?: string; figure?: "bars" | "grid" | "chart" | "cards"; second?: "bars" | "grid" | "chart" | "cards";
}) {
  return <div className="ui-page ui-page-research" role="status" aria-busy="true" aria-label={label}>
    <div className={`rs-column ${column}`}>
      <SkelHeader align="hero" title={title} subtitle={subtitle} />
      <div className="rs-intro" aria-hidden="true"><SkelText size="sm" width={340} className="ui-skel-center" /><div className="rs-intro-links"><SkelControl width={110} /><SkelControl width={120} /><SkelControl width={80} /></div></div>
      <SkelResearchArticle figure={figure} second={second} />
    </div>
  </div>;
}
