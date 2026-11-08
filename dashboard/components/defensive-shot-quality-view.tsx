"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { FeedFailure, FeedSkeleton, useFeed, useUrlState } from "./stats-feed-ui";
import { SqPanel, Tiles, Toned } from "./shot-quality-figures";
import { TeamLogo } from "./team-logo";
import { GatedNote } from "./ui/gated-note";
import { CountChip } from "./ui/filter-bar";
import { PlayerAvatar } from "./ui/identity";
import { Button, ButtonLink, Segmented, Select } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { Glossary, MethodBlock, ResearchCard, ResearchCards, ResearchDisclosure, ResearchSection, ToneLegend } from "./research/research-page";
import { GridPlayer, GridSearch, GridValue, StatsGrid } from "./research/stats-grid";
import { TeamPicker } from "./research/team-picker";
import { seasonEra } from "@/lib/portrait-source";
import { teamAccent } from "@/lib/team-colors";
import {
  getDefensiveCards, getDefensiveSummary, type DefenseBoard, type DefenseCard, type DefenseSort, type DefenseSummary, type KeyMatchup, type ShotKind, type UnknownSeason
} from "@/lib/shot-decomposition";
import { formatFixed, formatInterval, formatShare, formatSigned, formatWhole } from "@/lib/shot-quality";

/*
 * Research → Defensive Shot Quality (R06 analysis; RD05 design after Databallr's D-ShotQuality page). Databallr's centred hero,
 * a toolbar panel (search, season, rank by, team picker, global shot type), then its ranked player cards three across: photo,
 * name, a RAPM chip and a #N badge over a team-colour tint (round 2: no logo watermark), the card's own All / 2PT / 3PT, value tiles with ranks
 * and a Key Matchups table. Databallr's 2nd Defender tiles are left out: the free matchup data has no help defender. Below the
 * cards, CourtLens's own reading guide, glossary, signal checks and collapsed Caveats & Methodology. Green/red only where a
 * served interval excludes zero (D-SQ 95%, RAPM 80%). Every number is the frozen courtlens-defensive-shot-quality-v1 results'
 * (the RAPM chip is courtlens-shot-decomposition-v1's dSQ); exact values sit on `data-*`.
 */
const LATEST = "2025-26";
const PAGE = 6;
const KINDS: readonly ShotKind[] = ["all", "2pt", "3pt"];
const KIND_LABELS: Record<ShotKind, string> = { all: "All", "2pt": "2PT", "3pt": "3PT" };
const KIND_OPTIONS = KINDS.map(value => ({ value, label: KIND_LABELS[value] }));
const SORTS: { value: DefenseSort; label: string }[] = [
  { value: "dsq", label: "D-SQ" }, { value: "rapm", label: "D-SQ RAPM" }, { value: "fga", label: "Matchup shots" },
  { value: "xpps", label: "Expected PPS (lowest)" }, { value: "pps", label: "Actual PPS (lowest)" },
];
/** Player Matchups (NBA tracking's season matchups): everyone a defender guarded, or one head-to-head (round 3). */
export const matchupsHref = (season: string, defender: string, shooter?: string) =>
  `/matchups?${new URLSearchParams({ season, side: "defense", playerId: defender, ...(shooter ? { opponentId: shooter } : {}) })}`;
const known = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
/** A served definition without its leading "Term: " (the card or glossary entry names it). */
const definition = (text: string | undefined) => { const body = (text ?? "").replace(/^[^:]{1,24}: /, ""); return body.charAt(0).toUpperCase() + body.slice(1); };

interface Boards { status: "available"; season: string; kind: ShotKind; board: DefenseBoard; byKind: Record<ShotKind, Map<string, DefenseCard>> }

/** The three shot-type boards of one season, sort and team, so each card switches type without a request. Order is the global type's. */
async function getBoards(season: string, kind: ShotKind, sort: DefenseSort, team: string | null, signal: AbortSignal): Promise<Boards | UnknownSeason> {
  const answers = await Promise.all(KINDS.map(k => getDefensiveCards(season, k, sort, team, signal)));
  const own = answers[KINDS.indexOf(kind)];
  if (own.status !== "available") return own;
  const byKind = Object.fromEntries(KINDS.map((k, i) => {
    const answer = answers[i];
    return [k, new Map(answer.status === "available" ? answer.rows.map(r => [r.player_id, r]) : [])];
  })) as Record<ShotKind, Map<string, DefenseCard>>;
  return { status: "available", season, kind, board: own, byKind };
}

// ---- Cards -----------------------------------------------------------------------------------------

function RapmChip({ card }: { card: DefenseCard }) {
  const r = card.rapm;
  return <div className="dq-chip-block">
    <span className="dq-chip" title={r.interval ? `80% interval ${formatInterval(r.interval, x => formatSigned(x, 2))}` : r.reason ?? undefined}>
      <span>D-SQ RAPM</span>
      {known(r.value) ? <Toned text={formatSigned(r.value, 2)} value={r.value} low={r.interval?.[0]} high={r.interval?.[1]} level={80} field="rapm" />
        : <span className="dq-chip-unknown" data-field="rapm" data-value="">unknown</span>}
    </span>
    <span className="dq-chip-sub">{r.interval ? `80% ${formatInterval(r.interval, x => formatSigned(x, 2))}` : r.reason ?? ""}</span>
  </div>;
}

function Stat({ field, label, text, rank, sub, wide }: { field: string; label: string; text: ReactNode; rank?: number; sub?: ReactNode; wide?: boolean }) {
  return <div className="dq-stat" data-stat={field} data-wide={wide || undefined}>
    <span className="dq-stat-label">{label}</span>
    <span className="dq-stat-row">
      <span className="dq-stat-value">{text}</span>
      <span className="dq-stat-rank" data-field={`${field}-rank`} data-value={rank ?? ""}>{rank ? `#${rank}` : "—"}</span>
    </span>
    {sub && <span className="dq-stat-sub">{sub}</span>}
  </div>;
}

function Matchups({ rows, season, name, defender }: { rows: readonly KeyMatchup[]; season: string; name: string; defender: string }) {
  return <div className="dq-matchups-block">
    <div className="dq-matchups-head">
      <h4 className="dq-subhead">Key Matchups</h4>
      <ButtonLink size="md" variant="text" iconAfter="right" href={matchupsHref(season, defender)} data-link="all-matchups"
        aria-label={`All matchups: everyone ${name} guarded in ${season}, on Player Matchups`} title={`Everyone ${name} guarded in ${season}, searchable, on Player Matchups`}>All matchups</ButtonLink>
    </div>
    <StatsGrid<KeyMatchup> label={`${name} key matchups`} name="key-matchups" className="dq-matchups" density="compact" height="auto" leadWidth="sm"
      rows={rows} rowKey={m => m.player_id} rowData={m => ({ matchup: m.player_id })} empty="No matchup with enough shots."
      lead={{ label: "Shooter", cell: m => <GridPlayer playerId={m.player_id} name={m.player_name} team={m.tricode} season={season} era={seasonEra(season, m.tricode)}
        subtitle={m.tricode ?? undefined} href={matchupsHref(season, defender, m.player_id)} /> }}
      columns={[
        { key: "fga", label: "FGA", title: "Matchup field-goal attempts, all shots", width: "xs", data: m => ({ field: "fga", value: m.fga }), cell: m => <GridValue text={formatWhole(m.fga)} /> },
        { key: "xpps", label: "xPPS", title: "Expected points per shot from the shooter's own season", width: "xs", keepCase: true, data: m => ({ field: "xpps", value: m.xpps }), cell: m => <GridValue text={formatFixed(m.xpps, 2)} /> },
        { key: "pps", label: "PPS", title: "Actual points per shot", width: "xs", data: m => ({ field: "pps", value: m.pps }), cell: m => <GridValue text={formatFixed(m.pps, 2)} /> },
      ]} />
  </div>;
}

function Card({ card, position, data, global }: { card: DefenseCard; position: number; data: Boards; global: ShotKind }) {
  const [kind, setKind] = useState<ShotKind>(global);
  const season = data.season;
  const shown = data.byKind[kind].get(card.player_id);
  const v = shown?.value;
  const rank = shown?.rank;
  const matchups = (data.byKind.all.get(card.player_id) ?? card).key_matchups;
  const tint = teamAccent(card.tricode, season);
  const reason = shown ? shown.reason : `No ${KIND_LABELS[kind]} value for this defender.`;
  return <article className="dq-card" data-card={card.player_id} data-kind={kind} aria-label={`#${position} ${card.player_name}`}
    style={tint ? ({ "--dq-team": tint } as CSSProperties) : undefined}>
    <header className="dq-card-head">
      <PlayerAvatar playerId={card.player_id} name={card.player_name} team={card.tricode} size="lg" era={seasonEra(season, card.tricode)} className="dq-avatar" />
      <div className="dq-card-titles">
        <Link className="dq-card-name" href={`/players/${card.player_id}?season=${season}`}>{card.player_name}</Link>
        <span className="dq-card-team">{card.tricode && <TeamLogo team={card.tricode} season={season} size={16} />}{card.tricode ?? "—"}</span>
        <RapmChip card={card} />
      </div>
      <span className="dq-badge" data-field="position" data-value={position}>#{position}</span>
    </header>
    <Segmented label={`${card.player_name} shot type`} size="sm" stretch value={kind} onChange={setKind} options={KIND_OPTIONS} className="dq-card-kinds" />
    <div className="dq-stats">
      <Stat wide field="dsq" label={`D-SQ per 100 (${KIND_LABELS[kind]})`} rank={rank?.dsq}
        text={known(v?.dsq) ? <Toned text={formatSigned(v.dsq)} value={v.dsq} low={v.interval?.[0]} high={v.interval?.[1]} level={95} field="dsq" /> : <span className="dq-unknown" data-field="dsq" data-value="">—</span>}
        sub={known(v?.dsq) && v.interval ? `95% ${formatInterval(v.interval, x => formatSigned(x))}` : reason ?? undefined} />
      <Stat field="fga" label={`Matchup shots (${KIND_LABELS[kind]})`} rank={rank?.fga} text={<span data-field="fga" data-value={v?.fga ?? ""}>{formatWhole(v?.fga)}</span>} />
      <Stat field="xpps" label="Expected PPS" rank={rank?.xpps} text={<span data-field="xpps" data-value={v?.xpps ?? ""}>{formatFixed(v?.xpps, 2)}</span>} />
      <Stat field="pps" label="Actual PPS" rank={rank?.pps} text={<span data-field="pps" data-value={v?.pps ?? ""}>{formatFixed(v?.pps, 2)}</span>} />
    </div>
    <Matchups rows={matchups} season={season} name={card.player_name} defender={card.player_id} />
  </article>;
}

function Board({ data, query, kind }: { data: Boards; query: string; kind: ShotKind }) {
  const [shown, setShown] = useState(PAGE);
  const needle = query.trim().toLocaleLowerCase("en-US");
  const ranked = data.board.rows.map((card, i) => ({ card, position: i + 1 }));
  const rows = needle ? ranked.filter(r => r.card.player_name.toLocaleLowerCase("en-US").includes(needle)) : ranked;
  const b = data.board;
  return <>
    {rows.length === 0 ? <p className="dq-empty">No defender matches “{query.trim()}”.</p>
      : <div className="dq-grid" data-grid="defenders" data-count={rows.length}>
        {rows.slice(0, shown).map(r => <Card key={`${r.card.player_id}:${kind}`} card={r.card} position={r.position} data={data} global={kind} />)}
      </div>}
    {shown < rows.length && <div className="dq-more"><Button size="md" onClick={() => setShown(s => s + PAGE)}>Show next {Math.min(PAGE, rows.length - shown)} players ({shown}/{rows.length} shown)</Button></div>}
    <p className="dq-note">{formatWhole(b.defenders_served)} defenders with at least 300 matchup attempts in {b.season}; {formatWhole(b.unknown_count)} with fewer have no value.
      No 2nd Defender values: the free matchup data credits no help defender. Key matchups count all shots, whichever type is shown.
      A shooter&apos;s name opens that head-to-head and All matchups opens everyone the defender guarded, on Player Matchups: NBA tracking&apos;s
      season matchups, a different source with no expected PPS, so its numbers differ from the cards&apos;.</p>
  </>;
}

// ---- Sections under the cards ------------------------------------------------------------------------

function Reading({ data }: { data: Boards | null }) {
  const top = data?.board.rows.find(r => known(r.value.dsq));
  return <ResearchSection icon="book" title="How to Read the Cards">
    <ResearchCards columns={3}>
      <ResearchCard kicker="D-SQ per 100" tone="a"><p className="sq-text">Above zero: the shooters this defender guarded scored less than their own shooting predicts. Green or red only when the 95% interval excludes zero.</p></ResearchCard>
      <ResearchCard kicker="Expected PPS"><p className="sq-text">Who was guarded: high means good shooters or many threes. It describes the assignment, so it is never coloured.</p></ResearchCard>
      <ResearchCard kicker="Actual PPS"><p className="sq-text">What those shooters scored per shot. Set beside Expected PPS, the gap is what D-SQ measures, per 100 attempts.</p></ResearchCard>
    </ResearchCards>
    {top && known(top.value.dsq) && <p className="sq-text dq-example">Example: {top.player_name} heads {data?.board.season} at <strong>{formatSigned(top.value.dsq)}</strong> per 100 matchup
      attempts{top.value.interval ? <>, 95% interval {formatInterval(top.value.interval, x => formatSigned(x))}</> : null}: the shooters in those matchups scored {formatFixed(top.value.pps, 2)} points
      per shot against {formatFixed(top.value.xpps, 2)} expected from their own shooting.</p>}
    <p className="sq-note">Ranks run from the best D-SQ and from the lowest expected and actual PPS. A low expected PPS says who was guarded, not how well. Overlapping intervals do not rank two defenders.</p>
  </ResearchSection>;
}

function CardGlossary({ summary }: { summary: DefenseSummary }) {
  const d = summary.definitions;
  return <ResearchSection icon="help" title="Glossary">
    <Glossary groups={[
      { label: "On each card", icon: "shield", items: [
        { term: "D-SQ per 100", text: definition(d.dsq) },
        { term: "D-SQ RAPM", text: definition(d.rapm) },
        { term: "Matchup shots", text: definition(d.fga) },
        { term: "Expected PPS (xPPS)", text: definition(d.xpps) },
        { term: "Actual PPS", text: definition(d.pps) },
      ] },
      { label: "Reading the values", icon: "layers", items: [
        { term: "Interval", text: definition(d.interval) },
        { term: "Hindsight", text: definition(d.hindsight) },
        { term: "Key Matchups", text: "The five shooters this defender faced most often in the season, all shots, with their expected and actual points per shot. Small samples. A name opens the head-to-head on Player Matchups." },
        { term: "All matchups", text: "Everyone the defender guarded that season, searchable, on Player Matchups. That page is NBA tracking's season matchups (minutes, partial possessions, points, FG%): a different source from these cards, with no expected PPS." },
      ] },
    ]} />
  </ResearchSection>;
}

type Check = { key: string; label: string; r: number; low: number; high: number; pairs: number };

function Signal({ summary }: { summary: DefenseSummary }) {
  const p = summary.persistence, a = summary.agreement_with_rapm;
  const checks: Check[] = [
    { key: "persistence-dsq", label: "D-SQ, season to next season", r: p.correlations.dsq.r, low: p.correlations.dsq.interval[0], high: p.correlations.dsq.interval[1], pairs: p.pairs },
    { key: "persistence-pps", label: "Actual PPS, season to next season", r: p.correlations.pps.r, low: p.correlations.pps.interval[0], high: p.correlations.pps.interval[1], pairs: p.pairs },
    { key: "persistence-xpps", label: "Expected PPS, season to next season (who they guard)", r: p.correlations.xpps.r, low: p.correlations.xpps.interval[0], high: p.correlations.xpps.interval[1], pairs: p.pairs },
    { key: "agreement-make", label: "D-SQ against dContest, same season", r: a.correlations.make.r, low: a.correlations.make.interval[0], high: a.correlations.make.interval[1], pairs: a.pairs },
    { key: "agreement-sq", label: "D-SQ against dSQ, same season", r: a.correlations.sq.r, low: a.correlations.sq.interval[0], high: a.correlations.sq.interval[1], pairs: a.pairs },
    { key: "agreement-ts", label: "D-SQ against dTS, same season", r: a.correlations.ts.r, low: a.correlations.ts.interval[0], high: a.correlations.ts.interval[1], pairs: a.pairs },
  ];
  const s = summary.signal;
  return <ResearchSection icon="chart-line" title="Is It Signal?">
    <p className="sq-text dq-lead">Checks registered before any defender value was computed; reported, with no gate.</p>
    <Tiles label="Signal checks" tiles={[
      { key: "share", label: "Interval excludes zero", value: <span data-field="share" data-value={s.share}>{formatShare(s.share)}</span>,
        foot: `${formatWhole(s.interval_excludes_zero)} of ${formatWhole(s.defender_seasons)} defender-seasons; ${formatShare(s.share_expected_if_no_signal, 0)} if no defender differed` },
      { key: "persistence", label: "D-SQ, next season", value: <span data-field="persistence" data-value={p.correlations.dsq.r}>r {formatFixed(p.correlations.dsq.r, 2)}</span>,
        foot: `${formatInterval(p.correlations.dsq.interval, x => formatFixed(x, 2))}, ${formatWhole(p.pairs)} pairs` },
      { key: "agreement", label: "D-SQ and dContest", value: <span data-field="agreement" data-value={a.correlations.make.r}>r {formatFixed(a.correlations.make.r, 2)}</span>,
        foot: `${formatInterval(a.correlations.make.interval, x => formatFixed(x, 2))}, ${formatWhole(a.pairs)} player-seasons` },
    ]} />
    <StatsGrid<Check> label="Reported checks" name="checks" density="compact" height="auto" leadWidth="xl" minWidth="narrow" rows={checks} rowKey={c => c.key}
      lead={{ label: "Check", cell: c => <span className="sq-cell-text">{c.label}</span> }}
      columns={[
        { key: "r", label: "r", width: "sm", keepCase: true, data: c => ({ value: c.r }), cell: c => <GridValue text={formatFixed(c.r)} /> },
        { key: "interval", label: "95% interval", width: "lg", data: c => ({ value: c.low, high: c.high }), cell: c => <GridValue text={`${formatFixed(c.low)} to ${formatFixed(c.high)}`} /> },
        { key: "pairs", label: "Pairs", width: "sm", data: c => ({ value: c.pairs }), cell: c => <GridValue text={formatWhole(c.pairs)} /> },
      ]} />
  </ResearchSection>;
}

type SeasonRow = { season: string } & DefenseSummary["seasons"][string];

function Methodology({ summary }: { summary: DefenseSummary }) {
  const seasons: SeasonRow[] = Object.keys(summary.seasons).sort().map(season => ({ season, ...summary.seasons[season] }));
  return <ResearchDisclosure id="methodology" icon="layers" title="Caveats & Methodology">
    <MethodBlock title="In hindsight"><p className="sq-text">{definition(summary.definitions.hindsight)} {definition(summary.definitions.interval)}</p></MethodBlock>
    <MethodBlock title="Seasons">
      <p className="sq-text">A defender is served with at least 300 matchup attempts in the season; below that there is no value. Matchup data starts in 2017-18.</p>
      <StatsGrid<SeasonRow> label="By season" name="seasons" density="compact" height="auto" leadWidth="sm" rows={seasons} rowKey={r => r.season} rowData={r => ({ season: r.season })}
        lead={{ label: "Season", cell: r => <span className="sq-cell-strong">{r.season}</span> }}
        columns={[
          { key: "games", label: "Games", width: "sm", data: r => ({ value: r.games }), cell: r => <GridValue text={formatWhole(r.games)} /> },
          { key: "served", label: "Served", width: "sm", data: r => ({ value: r.defenders_served }), cell: r => <GridValue text={formatWhole(r.defenders_served)} /> },
          { key: "excludes", label: "Excludes 0", width: "sm", data: r => ({ value: r.interval_excludes_zero }), cell: r => <GridValue text={formatWhole(r.interval_excludes_zero)} /> },
          { key: "share", label: "Share", width: "sm", data: r => ({ value: r.interval_excludes_zero_share }), cell: r => <GridValue text={formatShare(r.interval_excludes_zero_share)} /> },
          { key: "width", label: "Median width", width: "md", data: r => ({ value: r.median_interval_width }), cell: r => <GridValue text={formatFixed(r.median_interval_width, 1)} /> },
          { key: "pps", label: "League PPS", width: "md", data: r => ({ value: r.league.all.pps }), cell: r => <GridValue text={formatFixed(r.league.all.pps)} /> },
          { key: "xpps", label: "Expected PPS", width: "md", data: r => ({ value: r.league.all.xpps }), cell: r => <GridValue text={formatFixed(r.league.all.xpps)} /> },
        ]} />
    </MethodBlock>
    <MethodBlock title="Tracking">
      <p className="sq-text">NBA tracking&apos;s closest-defender season numbers and hustle stats are on the <Link href="/research/defensive-matchups/tracking">Tracking page</Link>.
        Every card links to <Link href="/matchups">Player Matchups</Link>, NBA tracking&apos;s season matchups (who guarded whom, every season these cards cover): the
        All matchups link lists everyone the defender guarded, and a Key Matchups name opens that head-to-head. Its counts come from tracking, not from the
        matchup rows behind D-SQ, and it has no expected PPS, so the two pages&apos; numbers differ.</p>
    </MethodBlock>
    <MethodBlock title="Data & credits">
      <p className="sq-text">{summary.credit}</p>
      <p className="sq-text">{summary.reference_note}</p>
      <p className="sq-note">Registration <code>{summary.registration.content_sha256.slice(0, 16)}</code> · results <code>{summary.results_sha256.slice(0, 16)}</code>. Two runs from the seed give the same hash.</p>
    </MethodBlock>
  </ResearchDisclosure>;
}

// ---- Page ------------------------------------------------------------------------------------------

export function DefensiveShotQualityView() {
  const { get, set } = useUrlState();
  const season = get("season") ?? LATEST;
  const kind = (KINDS.find(k => k === get("kind")) ?? "all") as ShotKind;
  const sort = (SORTS.find(s => s.value === get("sort"))?.value ?? "dsq") as DefenseSort;
  const team = get("team");
  const [query, setQuery] = useState("");
  const summary = useFeed([], signal => getDefensiveSummary(signal));
  const { data, error, loading, retry } = useFeed([season, kind, sort, team], signal => getBoards(season, kind, sort, team, signal));
  const served = data?.status === "available" ? data.board.seasons : data?.seasons ?? (summary.data ? Object.keys(summary.data.seasons).sort() : []);
  const list = served.length ? served : [LATEST];
  const available = data?.status === "available" ? data : null;
  return <PageShell template="research" className="dq-shell">
    <div className="rs-column dq-page">
      <PageHeader className="sq-hero dq-hero research-hero" icon="shield" title="Defensive Shot Quality"
        subtitle="What shooters scored against each defender, against what their own shooting predicts, from free NBA matchup data since 2017-18." />
      <section className="dq-board-section" aria-label="Defenders">
        <SqPanel className="dq-toolbar" label="Card filters">
          <div className="dq-toolbar-row">
            <div className="dq-search"><GridSearch value={query} onChange={setQuery} label="Search defenders" placeholder="Search players…" /></div>
            <div className="dq-controls">
              <Select size="md" aria-label="Season" value={season} onChange={event => set({ season: event.target.value === LATEST ? null : event.target.value, team: null })}>
                {(list.includes(season) ? list : [...list, season]).slice().reverse().map(s => <option key={s} value={s}>{s}</option>)}</Select>
              <Select size="md" aria-label="Rank by" value={sort} onChange={event => set({ sort: event.target.value === "dsq" ? null : event.target.value })}>
                {SORTS.map(o => <option key={o.value} value={o.value}>Rank by {o.label}</option>)}</Select>
              <TeamPicker value={team} onChange={code => set({ team: code })} season={season} />
              <Segmented label="Shot type" size="md" value={kind} onChange={next => set({ kind: next === "all" ? null : next })} options={KIND_OPTIONS} />
            </div>
          </div>
          {available && <div className="dq-toolbar-foot"><ToneLegend level={95} className="dq-legend" /><CountChip>{formatWhole(available.board.rows.length)} defenders</CountChip></div>}
        </SqPanel>
        {error && <FeedFailure error={error} retry={retry} what="The defender cards" />}
        {loading && <FeedSkeleton label="Loading the defender cards" />}
        {data?.status === "unknown" && <GatedNote>{data.reason}</GatedNote>}
        {available && <Board key={`${season}:${kind}:${sort}:${team}`} data={available} query={query} kind={kind} />}
      </section>
      {summary.error && <FeedFailure error={summary.error} retry={summary.retry} what="Defensive Shot Quality" />}
      {summary.data && <>
        <Reading data={available} />
        <CardGlossary summary={summary.data} />
        <Signal summary={summary.data} />
        <Methodology summary={summary.data} />
      </>}
    </div>
  </PageShell>;
}
