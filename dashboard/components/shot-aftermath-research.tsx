"use client";

import { Fragment, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { FilterBar } from "./ui/filter-bar";
import { Field } from "./ui/field";
import {
  Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchIntro, ResearchSection, type GlossaryGroup,
} from "./research/research-page";
import { GridValue, StatsGrid, type GridColumn } from "./research/stats-grid";
import { TeamPicker } from "./research/team-picker";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { Button, ButtonSummary, Segmented } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { formatDate } from "@/lib/format-date";
import { downloadCsv, toCsv } from "@/lib/research-values";
import {
  answerOf, band, chanceLine, costAxis, CSV_HEADER, csvRows, fixed, getScope, getSummary, getTeams, gridTone, LATEST_SEASON, nb, pct, pctBand,
  pointsAxis, POSITION_LABEL, POSITIONS, SHOT_ZONES, signed, sortTeams, ticks, unknowns, VIEW_COST, VIEW_LABEL, VIEW_UNIT, viewCharts, whole,
  ZONE_LABEL, ZONE_SENTENCE, ZONES, type Cell, type ChartSpec, type CostKey, type Position, type Scope, type Summary, type TeamBoard, type TeamSort,
  type ValueKey, type View, type Zone,
} from "@/lib/shot-aftermath";

/**
 * Research → Shooting → Shot Aftermath (R17 data, RD18 design), after Databallr's Shot Aftermath page: what a first-chance shot scores, what a
 * miss wins back, and what the opponent scores on its next possession against the league average. Every number is the frozen
 * courtlens-shot-aftermath-v1 run's; exact values sit on `data-*` for the real-data check. Green and red only on an opponent cost whose 95%
 * interval excludes zero, on a cell that isn't thin.
 */

type CssVars = Record<`--${string}`, string>;
const cssVars = (props: CssVars) => props as CSSProperties;
const PHONE = "(max-width: 767px)";
function usePhone() {
  return useSyncExternalStore(
    notify => { const query = window.matchMedia(PHONE); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const VIEWS: readonly View[] = ["all", "miss", "dreb"];

// ---- Frame -----------------------------------------------------------------------------------------------------------------

/** RD18 Q1, RD17 (4): its own centred hero over the page, with no tab bar (the Shooting tabs were merged into Shot Quality and zTS). */
function AftermathFrame({ intro, children }: { intro: ReactNode; children: ReactNode }) {
  return <PageShell template="research">
    <div className="rs-column sa-page">
      <PageHeader className="sq-hero research-hero" icon="target" title="What happens after the shot?" subtitle="What each shot scores, what a miss wins back, and what the opponent does next." />
      {intro}
      {children}
    </div>
  </PageShell>;
}

function MetaLine({ items }: { items: readonly ReactNode[] }) {
  return <span data-field="hero-meta">{items.map((item, i) => <Fragment key={i}>{i > 0 ? " · " : ""}<span className="sa-meta-item">{item}</span></Fragment>)}</span>;
}

// ---- Charts ------------------------------------------------------------------------------------------------------------------

/** Four zones as bars from zero with their 95% whiskers. Points charts share one axis from zero; cost has its own, centred on zero (RD18 Q2). */
function ZoneChart({ spec, rows, top, league }: { spec: ChartSpec; rows: readonly Cell[]; top: number; league?: number }) {
  const cost = spec.kind === "cost";
  const at = (v: number) => `${Math.max(0, Math.min(1, cost ? (v + top) / (2 * top) : v / top)) * 100}%`;
  const zero = at(0);
  const marks = ticks(top, spec.kind);
  // RD12/RD16: a value kept to scale that is too small to see carries one line.
  const tiny = !cost ? rows.filter(r => { const e = r.values[spec.key]; return e && e.value !== 0 && Math.abs(e.value) / top < 0.03; }) : [];
  return <figure className="sa-chart" data-chart={spec.key} data-kind={spec.kind} data-top={top}>
    <figcaption className="sa-chart-head">
      <span className="sa-chart-title">{spec.title}</span>
      <span className="sa-chart-sub">{spec.sub}</span>
    </figcaption>
    <div className="sa-plot">
      <div className="sa-axis" aria-hidden="true">{marks.map(t => <span key={t} style={cssVars({ "--sa-at": at(t) })}>{cost ? signed(t, 2) : fixed(t, 2)}</span>)}</div>
      <div className="sa-bars">
        <span className="sa-gridline" data-zero="true" style={cssVars({ "--sa-at": zero })} aria-hidden="true" />
        {league != null && <span className="sa-gridline" data-league="true" style={cssVars({ "--sa-at": at(league) })} aria-hidden="true" />}
        {rows.map(r => {
          const e = r.values[spec.key];
          const tone = cost ? gridTone(r.tones[spec.key as CostKey]) : undefined;
          return <div key={r.zone} className="sa-col" data-zone={r.zone} data-status={r.status} data-value={e?.value ?? ""} data-low={e?.low ?? ""} data-high={e?.high ?? ""} data-tone={tone ?? ""}
            title={e ? `${ZONE_LABEL[r.zone]}: ${cost ? signed(e.value) : fixed(e.value)} (95% interval ${band(e, cost)})` : `${ZONE_LABEL[r.zone]}: unknown`}>
            {e && <>
              <span className="sa-bar" data-tone={tone} style={cssVars({ "--sa-from": e.value >= 0 ? zero : at(e.value), "--sa-to": e.value >= 0 ? at(e.value) : zero })} />
              <span className="sa-whisker" style={cssVars({ "--sa-from": at(e.low), "--sa-to": at(e.high) })} />
            </>}
          </div>;
        })}
      </div>
      <span aria-hidden="true" />
      <div className="sa-labels">{rows.map(r => {
        const e = r.values[spec.key];
        return <div key={r.zone} className="sa-label" data-zone={r.zone}>
          <span className="sa-label-zone">{ZONE_LABEL[r.zone]}</span>
          <strong className="sa-label-value" data-field="chart-value" data-tone={cost ? gridTone(r.tones[spec.key as CostKey]) ?? "" : ""}>{e ? (cost ? signed(e.value) : fixed(e.value)) : "—"}</strong>
          {e && <small className="sa-label-band">{band(e, cost)}</small>}
          {r.status === "thin" && <small className="sa-label-band" data-field="thin">Thin sample</small>}
        </div>;
      })}</div>
    </div>
    {tiny.length > 0 && <p className="sa-note sa-figure-note" data-field="scale-note">Drawn to the same scale as the other points charts; {tiny.map(r => ZONE_LABEL[r.zone].toLowerCase()).join(" and ")} {tiny.length > 1 ? "are" : "is"} too small to see.</p>}
  </figure>;
}

function ChartsSection({ scope, view, setView }: { scope: Scope; view: View; setView: (v: View) => void }) {
  const zones = SHOT_ZONES.map(z => scope.rows.find(r => r.zone === z)!).filter(Boolean);
  const specs = viewCharts(view);
  const pointKeys = specs.filter(s => s.kind === "points").map(s => s.key);
  const league = scope.league.ppp.value;
  const top = pointsAxis(zones, pointKeys, view === "dreb" ? league : undefined);
  const costKey = VIEW_COST[view];
  const costTop = costAxis(zones, costKey);
  const anyTone = zones.some(r => r.tones[costKey]);
  return <ResearchSection id="outcomes" icon="chart-column" title="What do you gain and give back?">
    <div className="sa-view">
      <Segmented size="sm" label="View" value={view} onChange={setView} options={VIEWS.map(v => ({ value: v, label: VIEW_LABEL[v] }))} />
    </div>
    <p className="sa-lead" data-field="view-unit" data-view={view}>Values are {VIEW_UNIT[view]}, by where the shot was taken. The bars run from zero; the thin line on each is its 95% interval.</p>
    <div className="sa-charts" data-count={specs.length}>
      {specs.map(spec => <ZoneChart key={spec.key} spec={spec} rows={zones} top={spec.kind === "cost" ? costTop : top} league={spec.key === "ppp_dreb" ? league : undefined} />)}
    </div>
    <ul className="sa-key">
      <li><span className="sa-key-mark" data-mark="bar" aria-hidden="true" />Estimate</li>
      <li><span className="sa-key-mark" data-mark="whisker" aria-hidden="true" />95% interval</li>
      {view === "dreb" && <li><span className="sa-key-mark" data-mark="league" aria-hidden="true" />League average, {fixed(league)} points per possession</li>}
      <li><span className="sa-key-mark" data-mark="good" aria-hidden="true" />Below the league average, interval clear of zero</li>
      <li><span className="sa-key-mark" data-mark="bad" aria-hidden="true" />Above it</li>
    </ul>
    <p className="sa-note sa-figure-note" data-field="charts-note">
      Points charts share one scale from zero, so second chances read as a part of own scoring. Opponent cost is drawn on its own scale, centred on zero, because it is a few hundredths of a point{anyTone ? "" : "; no cost here has an interval clear of zero, so none is coloured"}. Rim rows include blocked shots. Cost counts only the opponent&apos;s next possession, not the one after an offensive rebound, so scoring minus cost is partial accounting, not a net rating.
    </p>
  </ResearchSection>;
}

// ---- Answer ------------------------------------------------------------------------------------------------------------------

function AnswerSection({ scope }: { scope: Scope }) {
  const answer = answerOf(scope.rows);
  const overall = scope.rows.find(r => r.zone === "all");
  const league = scope.league.ppp;
  if (!answer || !overall || overall.status === "unknown") return <ResearchSection id="answer" icon="target" title="What a shot is worth">
    <p className="sa-lead" data-field="answer-empty">Too few attempts in this scope to compare zones.</p>
  </ResearchSection>;
  const { best, worst, bestClear, reboundEffect } = answer;
  const o = overall.values;
  const others = SHOT_ZONES.filter(z => z !== reboundEffect?.zone);
  return <ResearchSection id="answer" icon="target" title="What a shot is worth">
    <div className="sa-answer" data-field="answer" data-best={best.zone} data-worst={worst.zone} data-best-clear={bestClear}>
      <p className="sa-headline" data-field="headline">
        {capital(ZONE_SENTENCE[best.zone])} return the most, <strong data-value={best.values.net!.value}>{fixed(best.values.net!.value, 2)}</strong> points per first-chance attempt once second chances and the opponent&apos;s reply are counted; {ZONE_SENTENCE[worst.zone]} the least, <strong data-value={worst.values.net!.value}>{fixed(worst.values.net!.value, 2)}</strong>.
      </p>
      {answer.thin.length > 0 && <p className="sa-note" data-field="answer-thin-zones" data-zones={answer.thin.map(z => z.zone).join(",")}>{capital(answer.thin.map(z => `${ZONE_SENTENCE[z.zone]} (${whole(z.counts.attempts)} attempts)`).join(" and "))} are too thin to rank and are left out of this sentence.</p>}
      {!bestClear && <p className="sa-note" data-field="answer-overlap">The top zone&apos;s 95% interval overlaps another zone&apos;s, so the order at the top isn&apos;t settled here.</p>}
      {o.cost && o.ppp_make && <p className="sa-lead" data-field="answer-cost" data-value={o.cost.value} data-low={o.cost.low} data-high={o.cost.high} data-tone={overall.tones.cost ?? ""}>
        The opponent&apos;s next possession changes that by <strong>{signed(o.cost.value)}</strong> points per attempt overall (95% interval {band(o.cost, true)}){overall.tones.cost
          ? <>: after a make, opponents score <strong>{fixed(o.ppp_make.value)}</strong> points per possession, against a league average of <strong>{fixed(league.value)}</strong>.</>
          : <>, which can&apos;t be told from zero.</>}
      </p>}
      {reboundEffect?.values.dreb_cost && reboundEffect.values.ppp_dreb ? <p className="sa-lead" data-field="answer-rebound" data-zone={reboundEffect.zone} data-value={reboundEffect.values.dreb_cost.value}>
        The clearest aftermath: after {nb(`a ${ZONE_LABEL[reboundEffect.zone].toLowerCase()}`)} miss the defence rebounds, the opponent scores <strong>{fixed(reboundEffect.values.ppp_dreb.value)}</strong> points per possession, <strong>{signed(reboundEffect.values.dreb_cost.value)}</strong> {reboundEffect.values.dreb_cost.value > 0 ? "above" : "below"} the league average (95% interval {band(reboundEffect.values.dreb_cost, true)}).
        {answer.reboundAll === "some" && others.every(z => !scope.rows.find(r => r.zone === z)?.tones.dreb_cost) ? " After other misses the interval includes zero." : ""}
      </p> : <p className="sa-lead" data-field="answer-rebound" data-zone="">After a miss the defence rebounds, no zone&apos;s opponent scoring is clearly above or below the league average here.</p>}
      {overall.status === "thin" && <p className="sa-note" data-field="answer-thin">This scope is thin (under {whole(100)} attempts or 50 opponent possessions), so its intervals are wide and nothing is coloured.</p>}
    </div>
  </ResearchSection>;
}

// ---- Tables ------------------------------------------------------------------------------------------------------------------

function ZoneLead({ cell }: { cell: Cell }) {
  return <>
    <span className="sa-name">{ZONE_LABEL[cell.zone]}</span>
    {cell.status !== "ok" && <span className="sa-name-sub" data-field="status">{cell.status === "thin" ? "Thin sample" : "No attempts"}</span>}
  </>;
}

interface TableSpec { key: string; title: string; lead: string; views: { value: string; label: string; columns: GridColumn<Cell>[] }[]; note?: ReactNode }

function ZoneTable({ spec, rows }: { spec: TableSpec; rows: readonly Cell[] }) {
  const phone = usePhone();
  const [view, setView] = useState(spec.views[0].value);
  const columns = phone ? spec.views.find(v => v.value === view)!.columns : spec.views.flatMap(v => v.columns);
  return <div className="sa-table" data-table-block={spec.key}>
    <h3 className="sa-table-title">{spec.title}</h3>
    {spec.note}
    {phone && <Segmented size="sm" label={`${spec.title} columns`} value={view} onChange={setView} options={spec.views.map(v => ({ value: v.value, label: v.label }))} />}
    <StatsGrid<Cell> label={spec.title} name={spec.key} density="compact" height="auto" leadWidth="md" className={phone ? "sa-grid sa-phone" : "sa-grid"} rows={rows} rowKey={r => r.zone}
      rowData={r => ({ zone: r.zone, status: r.status })} lead={{ label: spec.lead, cell: r => <ZoneLead cell={r} /> }} columns={columns} />
  </div>;
}

const est = (key: ValueKey, label: string, group: string, opts: { cost?: boolean; percent?: boolean; title?: string } = {}): GridColumn<Cell> => ({
  key, label, group, title: opts.title, width: "md",
  data: r => { const e = r.values[key]; return { field: key, value: e?.value ?? "", low: e?.low ?? "", high: e?.high ?? "", tone: opts.cost ? r.tones[key as CostKey] ?? "" : "" }; },
  cell: r => {
    const e = r.values[key];
    if (!e) return <GridValue text={null} />;
    if (opts.percent) return <GridValue text={pct(e.value)} sub={pctBand(e)} />;
    return <GridValue text={opts.cost ? signed(e.value) : fixed(e.value)} sub={band(e, opts.cost)} tone={opts.cost ? gridTone(r.tones[key as CostKey]) : undefined} />;
  },
});
const count = (key: keyof Cell["counts"], label: string, group: string, title?: string): GridColumn<Cell> => ({
  key, label, group, title, width: "sm", data: r => ({ field: key, value: r.counts[key] }), cell: r => <GridValue text={whole(r.counts[key])} />,
});

function TablesSection({ scope }: { scope: Scope }) {
  const rows = ZONES.map(z => scope.rows.find(r => r.zone === z)!).filter(Boolean);
  const league = scope.league.ppp;
  const specs: TableSpec[] = [
    { key: "rates", title: "Make rates and opponent scoring", lead: "Shot", views: [
      { value: "shots", label: "Shots", columns: [count("attempts", "Attempts", "Shots", "First-chance field-goal attempts"), est("fg_pct", "FG%", "Shots", { percent: true })] },
      { value: "points", label: "Points", columns: [est("made", "Made", "Per attempt", { title: "Made-field-goal points per attempt; and-one free throws not included" }), est("cost", "Opponent cost", "Per attempt", { cost: true, title: "Opponent's next possession against the league average, per attempt" })] },
    ] },
    { key: "net", title: "Net value across all attempts", lead: "Shot", views: [
      { value: "scoring", label: "Scoring", columns: [est("made", "Made", "Points per attempt"), est("second", "Second chances", "Points per attempt")] },
      { value: "net", label: "Net", columns: [est("cost", "Opponent cost", "Points per attempt", { cost: true }), est("net", "Net", "Points per attempt", { title: "Made points plus second chances minus opponent cost" })] },
    ], note: <p className="sa-note">Made points plus second chances minus opponent cost. An estimate, not complete possession accounting: the opponent possession after an offensive rebound isn&apos;t counted.</p> },
    { key: "opponent", title: "Opponent scoring after each shot result", lead: "Shot", views: [
      { value: "make", label: "After a make", columns: [est("ppp_make", "Points per possession", "After a make"), count("make_possessions", "Possessions", "After a make")] },
      { value: "dreb", label: "After a rebound", columns: [est("ppp_dreb", "Points per possession", "After a defensive rebound"), count("dreb_possessions", "Possessions", "After a defensive rebound")] },
    ], note: <p className="sa-note" data-field="league-line" data-value={league.value}>The opponent&apos;s whole next possession, its own offensive rebounds included. League average: <strong>{fixed(league.value)}</strong> points per possession (95% interval {band(league)}), from {whole(scope.league.possessions)} possessions.</p> },
  ];
  return <ResearchSection id="tables" icon="table" title="By shot zone">
    <p className="sa-lead">Each value with its 95% interval underneath. Only opponent cost can be green or red.</p>
    {specs.map(spec => <ZoneTable key={spec.key} spec={spec} rows={rows} />)}
  </ResearchSection>;
}

// ---- All 30 teams --------------------------------------------------------------------------------------------------------------

function TeamsSection({ board, selected, zone, setZone, season }: { board: TeamBoard; selected: string | null; zone: Zone; setZone: (z: Zone) => void; season: string }) {
  const phone = usePhone();
  const [view, setView] = useState<"shots" | "scoring" | "cost">("shots");
  const [sort, setSort] = useState<{ key: TeamSort; direction: "asc" | "desc" }>({ key: "team", direction: "asc" });
  const rows = sortTeams(board.rows, sort.key, sort.direction);
  const onSort = (key: string) => setSort(s => s.key !== key ? { key: key as TeamSort, direction: "desc" } : s.direction === "desc" ? { key: s.key, direction: "asc" } : { key: "team", direction: "asc" });
  const chance = chanceLine(board.rows, "cost");
  const reboundChance = chanceLine(board.rows, "dreb_cost");
  const showShots = !phone || view === "shots", showScoring = !phone || view === "scoring", showCost = !phone || view === "cost";
  const columns: GridColumn<Cell>[] = [
    ...(showShots ? [
      { ...count("attempts", "Attempts", "Shots"), sort: (r: Cell) => r.counts.attempts },
      { ...est("fg_pct", "FG%", "Shots", { percent: true }), sort: (r: Cell) => r.values.fg_pct?.value ?? null },
    ] : []),
    ...(showScoring ? [
      { ...est("own", "Own scoring", "Per attempt"), sort: (r: Cell) => r.values.own?.value ?? null },
      { ...est("net", "Net", "Per attempt"), sort: (r: Cell) => r.values.net?.value ?? null },
    ] : []),
    ...(showCost ? [
      { ...est("cost", "Opponent cost", "Per attempt", { cost: true }), sort: (r: Cell) => r.values.cost?.value ?? null },
      { ...est("dreb_cost", "Rebound cost", "Per miss", { cost: true, title: "Opponent's possession after a defensive rebound, against the league average" }) },
    ] : []),
  ];
  const all = board.all_teams;
  return <ResearchSection id="teams" icon="users" title="All 30 teams">
    <div className="sa-view">
      <Segmented size="sm" label="Zone" value={zone} onChange={setZone} options={ZONES.map(z => ({ value: z, label: ZONE_LABEL[z] }))} />
    </div>
    <p className="sa-lead" data-field="teams-line">
      Every team&apos;s {zone === "all" ? "first-chance attempts" : ZONE_SENTENCE[zone]}, {board.position === "all" ? "every position" : `${POSITION_LABEL[board.position].toLowerCase()} only`}, in team order; sorting is a view, not a ranking. All teams together: own scoring <strong>{fixed(all.values.own?.value)}</strong>, opponent cost <strong>{signed(all.values.cost?.value)}</strong>, net <strong>{fixed(all.values.net?.value)}</strong> points per attempt.
    </p>
    <p className="sa-note" data-field="chance-line" data-coloured={chance.coloured + reboundChance.coloured} data-eligible={chance.eligible + reboundChance.eligible}>
      With 95% intervals, about 1 cost in 20 is coloured by chance alone. Here {chance.coloured + reboundChance.coloured} of {chance.eligible + reboundChance.eligible} team costs are, so read any one team&apos;s colour with care. Thin rows are dimmed and never coloured.
    </p>
    {phone && <Segmented size="sm" label="Team columns" value={view} onChange={setView} options={[{ value: "shots", label: "Shots" }, { value: "scoring", label: "Scoring" }, { value: "cost", label: "Cost" }]} />}
    <StatsGrid<Cell> label={`Teams, ${ZONE_LABEL[zone].toLowerCase()}`} name="teams" density="compact" height="auto" leadWidth="sm" className={phone ? "sa-grid sa-teams sa-phone" : "sa-grid sa-teams"}
      rows={rows} rowKey={r => r.team} sort={{ key: sort.key, direction: sort.direction, onSort }}
      rowData={r => ({ team: r.team_code ?? r.team, status: r.status, selected: r.team_code === selected || undefined })}
      lead={{ label: "Team", cell: r => <span className="sa-team" data-team={r.team_code ?? ""}><TeamLogo team={r.team_code ?? r.team} season={season} size={20} /><span className="sa-name">{r.team_code}</span>{r.status !== "ok" && <span className="sa-name-sub">{r.status === "thin" ? "Thin" : "No attempts"}</span>}</span> }}
      columns={columns} />
  </ResearchSection>;
}

// ---- Honesty, reading, About --------------------------------------------------------------------------------------------------

function CompareSection({ summary, season }: { summary: Summary; season: string }) {
  const p = summary.position_accuracy;
  const withComparison = summary.seasons.find(s => s.databallr_comparison);
  const rows = withComparison ? ZONES.map(z => ({ zone: z, ...withComparison.databallr_comparison![z] })) : [];
  return <ResearchSection id="compare" icon="info" title="Read these with care">
    <p className="sa-lead" data-field="position-line" data-correct={p.group_correct} data-samples={p.samples}>
      Positions are estimates from listed position, size and box-score rates, not roster listings. Tested against Draft Combine positions, <strong>{whole(p.group_correct)}</strong> of <strong>{whole(p.samples)}</strong> players ({pct(p.group_correct / p.samples)}) landed in the right group. Centres are the weakest: {whole(p.centres_estimated_c)} of {whole(p.centres)} came out as centres and {whole(p.centres_estimated_pf)} as power forwards, so Bigs is undercounted.
    </p>
    <p className="sa-lead" data-field="databallr-line">
      These are CourtLens&apos;s numbers from its own possessions, not Databallr&apos;s. Shooting percentages, made points and the opponent&apos;s scoring after makes and misses come close to Databallr&apos;s page; second chances come out lower, by a definition its page doesn&apos;t show.
    </p>
    {withComparison && <details className="sa-details" id="counts">
      <ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Compare the attempt counts for {withComparison.season}</ButtonSummary>
      <div className="sa-details-body">
        <p className="sa-note">First-chance attempts by zone. CourtLens has more in every zone but long mid-range, though 18 games are missing from its possessions{season === withComparison.season ? "" : ` (Databallr's counts are for ${withComparison.season} only)`}.</p>
        <StatsGrid<(typeof rows)[number]> label="Attempt counts against Databallr" name="counts" density="compact" height="auto" leadWidth="md" className="sa-grid sa-counts" rows={rows} rowKey={r => r.zone}
          lead={{ label: "Shot", cell: r => <span className="sa-name">{ZONE_LABEL[r.zone]}</span> }}
          columns={[
            { key: "courtlens", label: "CourtLens", width: "sm", data: r => ({ field: "courtlens", value: r.courtlens }), cell: r => <GridValue text={whole(r.courtlens)} /> },
            { key: "databallr", label: "Databallr", width: "sm", data: r => ({ field: "databallr", value: r.databallr }), cell: r => <GridValue text={whole(r.databallr)} /> },
            { key: "difference", label: "Difference", width: "sm", data: r => ({ field: "difference", value: r.difference }), cell: r => <GridValue text={signed(r.difference, 0)} /> },
          ]} />
      </div>
    </details>}
  </ResearchSection>;
}

function glossary(summary: Summary): GlossaryGroup[] {
  const d = summary.definitions;
  const pick = (keys: [string, string][]) => keys.filter(([k]) => d[k]).map(([k, term]) => ({ term, text: d[k] }));
  return [
    { label: "Values", icon: "target", items: pick([["first_chance", "First chance"], ["made", "Made points"], ["second", "Second chances"], ["own", "Own scoring"], ["cost", "Opponent cost"], ["net", "Scoring minus cost"], ["ppp", "Opponent points per possession"], ["league", "League average"]]) },
    { label: "Reading", icon: "book", items: pick([["views", "Views"], ["zones", "Zones"], ["positions", "Positions"], ["interval", "95% interval"], ["thin", "Thin"], ["colour", "Colour"]]) },
  ];
}

function Reading({ summary }: { summary: Summary }) {
  return <>
    <ResearchSection id="reading" icon="book" title="How to read">
      <ResearchCards columns={3}>
        <ResearchCard kicker="Per attempt"><p className="sa-card-text">Everything is in points per first-chance attempt unless a view says per miss. Own scoring is made shots plus what a miss wins back in the same possession.</p></ResearchCard>
        <ResearchCard kicker="Opponent cost"><p className="sa-card-text">How the opponent&apos;s very next possession compares with an average one. Below zero helps the shooting team; it is a few hundredths of a point either way.</p></ResearchCard>
        <ResearchCard kicker="Colour"><p className="sa-card-text">Green or red only on a cost whose 95% interval is clear of zero. Thin samples and every other value stay neutral.</p></ResearchCard>
      </ResearchCards>
    </ResearchSection>
    <ResearchDisclosure id="glossary" icon="list-ordered" title="Terms, defined"><Glossary groups={glossary(summary)} /></ResearchDisclosure>
  </>;
}

function About({ summary, scope }: { summary: Summary; scope: Scope }) {
  const season = summary.seasons.find(s => s.season === scope.season);
  const c = season?.data_check;
  const missing = c ? c.counts["unjoined:game_not_admitted"] ?? 0 : 0;
  const flag = c?.first_chance_vs_shot_table_after_oreb ?? {};
  const u = unknowns(scope.rows.find(r => r.zone === "all"));
  return <ResearchDisclosure id="about" icon="info" title="About this page">
    <MethodBlock title="Method">
      <dl className="sa-defs">
        <dt>Sample</dt><dd>Every first-chance field-goal attempt of the {scope.season} regular season, joined to CourtLens&apos;s sealed play-by-play possessions. Shots after an offensive rebound are second chances, counted in the miss that started them, not as attempts of their own.</dd>
        <dt>Cost</dt><dd>Made shots and misses the defence rebounds are paired with the opponent&apos;s next possession in the same period. Cost weights the two by how often each happens, against the season&apos;s league points per possession.</dd>
        {c && <><dt>Matching</dt><dd data-field="about-matching" data-shots={c.shots} data-joined={c.joined}>{whole(c.shots)} shots; {whole(c.joined)} joined a possession. {whole(missing)} sit in the {missing ? "games" : "no games"} the possessions excluded and are unknown, never zero. The possessions and the shot table agree on first chance for {whole(flag.agree)} shots; {whole(flag.possessions_first_chance)} more are first chance by the possessions, which decide.</dd></>}
        {u && <><dt>Unknown here</dt><dd data-field="about-unknowns">In this scope, {whole(u.periodEnd)} shots ended a period before the opponent had the ball, {whole(u.sameTeam)} were followed by the shooting team again, {whole(u.makeFollowed)} makes were followed by another attempt and {whole(u.missNoRebound)} misses had no rebound recorded. Each is left out of the averages it can&apos;t inform.</dd></>}
        <dt>Intervals</dt><dd>{whole(summary.thresholds.replicates)} resamples of whole games within the season, {Math.round(summary.thresholds.interval * 100)}%. They cover game-to-game sampling, not position or matching error. Thin: under {whole(summary.thresholds.attempts)} attempts or {whole(summary.thresholds.possessions)} opponent possessions.</dd>
        <dt>Limits</dt><dd>{summary.limitations.map(l => <span key={l} className="sa-limit">{l} </span>)}</dd>
        <dt>Credit</dt><dd>{summary.credit}</dd>
        <dt>Fixed in advance</dt><dd>Method registered on {formatDate(summary.registration.registered_on)}, before any point or rate was computed; one run, nothing chosen afterwards.</dd>
        <dt>Identifiers</dt><dd><code data-field="registration-id">{summary.registration.identity}</code> · registration <code data-field="registration-hash">{summary.registration.content_sha256}</code> · results <code data-field="results-hash">{summary.results_sha256}</code></dd>
      </dl>
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Page --------------------------------------------------------------------------------------------------------------------------

export function ShotAftermathResearch() {
  const { get, set } = useUrlState();
  const summaryFeed = useFeed([], signal => getSummary(signal));
  const summary = summaryFeed.data;
  const seasons = summary?.seasons.map(s => s.season) ?? [LATEST_SEASON];
  const season = seasons.includes(get("season") ?? "") ? get("season")! : LATEST_SEASON;
  const team = get("team")?.toUpperCase() || null;
  const position = (POSITIONS as readonly string[]).includes(get("position") ?? "") ? get("position") as Position : "all";
  const view = (VIEWS as readonly string[]).includes(get("view") ?? "") ? get("view") as View : "all";
  const zone = (ZONES as readonly string[]).includes(get("zone") ?? "") ? get("zone") as Zone : "all";
  const scopeFeed = useFeed([season, team, position], signal => getScope(season, team, position, signal));
  const teamsFeed = useFeed([season, position, zone], signal => getTeams(season, position, zone, signal));
  const scope = scopeFeed.data ?? scopeFeed.stale;
  const board = teamsFeed.data ?? teamsFeed.stale;
  const overall = scope?.rows.find(r => r.zone === "all");
  const exportCsv = () => scope && downloadCsv(`courtlens-shot-aftermath-${scope.season}-${scope.team_code ?? "nba"}-${scope.position}.csv`, toCsv(CSV_HEADER, csvRows(scope)));
  const meta = scope && overall ? [scope.season, scope.team_code ? <span className="sa-meta-team"><TeamLogo team={scope.team_code} season={scope.season} size={16} />{scope.team_code}</span> : "NBA",
    POSITION_LABEL[scope.position] + (scope.position === "all" ? "" : " (estimated)"), `${whole(overall.counts.attempts)} first-chance attempts`, "Regular season"] : null;
  return <AftermathFrame intro={<ResearchIntro tagline={meta ? <MetaLine items={meta} /> : null} />}>
    <FilterBar label="Shot Aftermath filters" summary={`${season} · ${team ?? "NBA"} · ${POSITION_LABEL[position]}`}
      scope={<>
        <Field label="Season" layout="inline"><Segmented size="sm" label="Season" value={season} onChange={next => set({ season: next === LATEST_SEASON ? null : next })} options={seasons.map(s => ({ value: s, label: s }))} /></Field>
        <Field label="Shooting team" layout="inline"><TeamPicker size="sm" value={team} season={season} onChange={code => set({ team: code })} /></Field>
        <Field label="Position, estimated" layout="inline"><Segmented size="sm" label="Position, estimated" value={position} onChange={next => set({ position: next === "all" ? null : next })}
          options={POSITIONS.map(p => ({ value: p, label: p === "all" ? "All" : POSITION_LABEL[p] }))} /></Field>
      </>}
      count={<Button size="sm" icon="download" onClick={exportCsv} disabled={!scope}>Export CSV</Button>} />
    {(summaryFeed.error || scopeFeed.error) && <FeedFailure error={summaryFeed.error || scopeFeed.error} retry={() => { summaryFeed.retry(); scopeFeed.retry(); }} what="Shot Aftermath" />}
    {!scope && !scopeFeed.error && <FeedSkeleton label="Loading Shot Aftermath" />}
    {scope && overall?.status === "unknown" && <GatedNote>No first-chance attempts in this scope.</GatedNote>}
    {scope && <div className="sa-body" data-loading={scopeFeed.loading || undefined} data-season={scope.season} data-team={scope.team} data-position={scope.position}>
      <AnswerSection scope={scope} />
      <ChartsSection scope={scope} view={view} setView={next => set({ view: next === "all" ? null : next })} />
      <TablesSection scope={scope} />
      {teamsFeed.error && <FeedFailure error={teamsFeed.error} retry={teamsFeed.retry} what="The team table" />}
      {board && <TeamsSection board={board} selected={team} zone={zone} season={season} setZone={next => set({ zone: next === "all" ? null : next })} />}
      {summary && <CompareSection summary={summary} season={scope.season} />}
      {summary && <Reading summary={summary} />}
      {summary && <About summary={summary} scope={scope} />}
    </div>}
  </AftermathFrame>;
}
