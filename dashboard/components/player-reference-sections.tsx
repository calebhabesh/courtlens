import { ButtonSummary } from "./ui/kit";
import { Icon } from "./ui/icon";
import { TeamLogo } from "./team-logo";
import teamCatalog from "@/lib/team-branding.client.json";
import { formatDate } from "@/lib/format-date";
import type { PlayerBio, PlayerContractLengthSource, PlayerContractSpan, PlayerGuarantee, PlayerReferenceEvent, PlayerSalary, PlayerUnplacedSigning } from "@/lib/types";

type Reference = NonNullable<PlayerBio["reference"]>;
const TEAM_ARTWORK = new Set(teamCatalog.teams.map(team => team.tricode));
const BREF_ARTWORK: Record<string, string> = { BRK: "BKN", CHO: "CHA", PHO: "PHX" };
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
function money(value: string | null | undefined) { return value == null ? "—" : dollars.format(Number(value)); }

function Credit({ reference, anchor }: { reference: Reference; anchor: string }) {
  return <p className="player-reference-credit"><a href={`${reference.url}#${anchor}`} target="_blank" rel="noreferrer">{reference.source}</a> · As of {formatDate(reference.as_of)} · Career to date</p>;
}

function Guarantee({ value }: { value: PlayerGuarantee | null | undefined }) {
  if (!value) return <>—</>;
  return <a href={value.source_url} target="_blank" rel="noreferrer" title={`Finance report as of ${formatDate(value.as_of)}`}>{value.amount != null ? money(value.amount) : value.status === "full" ? "Full" : value.status === "partial" ? "Partial" : value.status === "none" ? "None" : "—"}</a>;
}

function SalaryTeam({ row }: { row: PlayerSalary }) {
  return <span className="player-reference-team">{row.team_code && (TEAM_ARTWORK.has(row.team_code) || row.team_code in BREF_ARTWORK) && <TeamLogo team={BREF_ARTWORK[row.team_code] ?? row.team_code} size={18} />}<span title={row.team ?? undefined}>{row.team_code ?? row.team ?? "—"}</span></span>;
}

function Salary({ row }: { row: PlayerSalary }) {
  return <span title={row.salary_note ?? undefined}>{money(row.salary)}{row.salary_note && <small>{row.salary_note.includes("(TW)") ? "Two-way" : row.salary_note}</small>}</span>;
}

function CapShare({ row }: { row: PlayerSalary }) {
  if (row.share_of_cap == null) return <>—</>;
  const share = `${(row.share_of_cap * 100).toFixed(1)}%`;
  const title = row.cap_source === "basketball_reference"
    ? `Salary cap from Basketball-Reference's cap history · retrieved ${formatDate(row.cap_as_of)}`
    : `Official cap threshold · retained ${formatDate(row.cap_as_of)}`;
  return row.cap_source_url ? <a href={row.cap_source_url} target="_blank" rel="noreferrer" title={title}>{share}</a> : <>{share}</>;
}

/** The NBA season (July to June) a dated event falls in, matching the salary rows' labels. */
function eventSeason(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 7 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

const DERIVED_GUARANTEE: Record<NonNullable<PlayerGuarantee["basis"]>, string> = {
  total_equals_salaries: "The remaining guaranteed total equals every remaining salary, so each season is fully guaranteed",
  total_equals_non_option_salaries: "The remaining guaranteed total equals every salary outside an option year (the source leaves option years out), so this season is fully guaranteed",
};

/**
 * A current-contract season's terms under its salary: the reported option, and the guarantee,
 * reported or settled by the total. Nothing when neither is known (the footnote says so).
 */
function Terms({ row }: { row: PlayerSalary }) {
  if (!row.option && !row.guarantee) return null;
  const guarantee = row.guarantee;
  return <span className="player-contract-terms">
    {row.option && <span className={`player-contract-option is-${row.option}`}>{row.option === "player" ? "Player Option" : "Team Option"}</span>}
    {row.option && guarantee && <span className="player-contract-terms-dot" aria-hidden="true">·</span>}
    {guarantee?.basis ? <a className="player-contract-guaranteed" href={guarantee.source_url} target="_blank" rel="noreferrer"
      title={`${DERIVED_GUARANTEE[guarantee.basis]} · finance report as of ${formatDate(guarantee.as_of)}`}>Fully Guaranteed</a>
      : guarantee && <span>Guaranteed <Guarantee value={guarantee} /></span>}
  </span>;
}

const SPAN_END: Record<string, string> = {
  stated_length: "Ends after its stated length",
  next_contract: "Ends where the next contract begins",
  current_contract: "Runs through the current contract's last season",
  last_reported_season: "Ends with the last reported salary",
};

const SPAN_START: Record<string, string> = {
  previous_contract: "Starts after the contract it extends",
  salary_rise: "Starts where the salary rises more than one contract allows",
  current_contract: "Counted back from the current contract's last season",
};

const LENGTH_SOURCE: Record<PlayerContractLengthSource, string> = {
  stated: "Length stated by Basketball-Reference",
  rookie_scale: "A rookie scale contract is four seasons by the CBA",
  ten_day: "A 10-day contract falls within one season",
  exhibit_10: "An Exhibit 10 contract is one season by the CBA",
  wikipedia: "Length stated in the player's Wikipedia article",
};

const ARTICLE_TITLE = "Stated in the player's Wikipedia article (CC BY-SA 4.0); Basketball-Reference gives no length";
const ADDED_TITLE = "Basketball-Reference does not list this signing; it is stated in the player's Wikipedia article (CC BY-SA 4.0)";
const EXTENSION_TITLE = "Basketball-Reference lists a signing; the player's Wikipedia article (CC BY-SA 4.0) states it was an extension";

function yearsLabel(years: number) { return `${years} ${years === 1 ? "year" : "years"}`; }

/** Wikipedia's terms for a signing whose length Basketball-Reference left out, linked to the article. */
function ArticleTerms({ terms, url }: { terms: string; url: string | null | undefined }) {
  return url ? <a href={url} target="_blank" rel="noreferrer" title={ARTICLE_TITLE}>{terms}</a> : <>{terms}</>;
}

/** A signing's label: its source wording, the article's terms where they filled the length. */
function SigningName({ signing, current = false }: { signing: Pick<PlayerContractSpan, "kind" | "description" | "terms" | "source_url">; current?: boolean }) {
  return <span className="player-contract-span-name">
    {current && <strong>Current · </strong>}
    {signing.kind === "extension" && !/extension/i.test(signing.description) ? `Extension: ${signing.description}` : signing.description}
    {signing.terms && <> · <ArticleTerms terms={signing.terms} url={signing.source_url} /></>}
  </span>;
}

/** A signing Basketball-Reference does not list carries a link to the article it came from. */
function AddedFrom({ signing }: { signing: Pick<PlayerContractSpan, "source" | "source_url"> }) {
  if (signing.source !== "wikipedia") return null;
  return <> · {signing.source_url ? <a href={signing.source_url} target="_blank" rel="noreferrer" title={ADDED_TITLE}>from Wikipedia</a> : "from Wikipedia"}</>;
}

/** The contract covering a salary row: same season, and the signing team when two share it. */
function spanFor(spans: PlayerContractSpan[], salary: PlayerSalary): number {
  const covering = spans.map((span, i) => ({ span, i })).filter(({ span }) => span.start_season <= salary.season && salary.season <= span.end_season);
  const team = covering.find(({ span }) => span.team_code && span.team_code === salary.team_code);
  return (team ?? covering[covering.length - 1])?.i ?? -1;
}

type UnplacedSigning = PlayerUnplacedSigning;

/**
 * Which part of an unbracketed signing is missing. A length the label does not already show (one
 * the CBA fixes) is spelled out; a stated or article length is already in the label.
 */
function missingPart(signing: UnplacedSigning): string {
  const shown = signing.length_source === "stated" || Boolean(signing.terms) || signing.source === "wikipedia";
  const length = signing.years && !shown ? `${yearsLabel(signing.years)} · ` : "";
  if (signing.kind === "extension") return signing.years ? `${length}first season not reported` : "Length and first season not reported";
  return signing.years ? `${length}seasons not grouped` : "Length not reported";
}

/** A signing with no bracket: what is known, and which end is missing. */
function UnplacedNote({ signing }: { signing: UnplacedSigning }) {
  const missing = missingPart(signing);
  return <span className="player-contract-unplaced" title={`${signing.description} · signed ${formatDate(signing.signed_date)} · ${missing}, so its seasons are not grouped`}>
    <SigningName signing={signing} />
    <small>Signed {formatDate(signing.signed_date)} · {missing}<AddedFrom signing={signing} /></small>
  </span>;
}

/** One row's piece of a contract's bracket; the newest row of each contract carries its label. */
function SpanCell({ span, edge, tone, unplaced }: {
  span: PlayerContractSpan | undefined; edge: "top" | "middle" | "bottom" | "single" | null; tone: string | undefined; unplaced: UnplacedSigning[];
}) {
  const notes = unplaced.map(signing => <UnplacedNote key={signing.signed_date} signing={signing} />);
  if (!span || !edge) return <td className="player-contract-span">{notes}</td>;
  const label = edge === "top" || edge === "single";
  const basis = [
    SPAN_START[span.start_basis ?? ""], SPAN_END[span.end_basis ?? ""],
    span.length_source ? LENGTH_SOURCE[span.length_source] : undefined, span.source === "wikipedia" ? ADDED_TITLE : undefined,
    span.extension_source === "wikipedia" ? EXTENSION_TITLE : undefined,
  ].filter(Boolean).join(" · ");
  return <td className="player-contract-span" data-tone={tone}>
    {label && <span className="player-contract-span-label" title={`${span.description} · signed ${formatDate(span.signed_date)}${basis ? ` · ${basis}` : ""}`}>
      <SigningName signing={span} current={span.current} />
      <small>{span.start_season === span.end_season ? span.start_season : `${span.start_season} to ${span.end_season}`} · signed {formatDate(span.signed_date)}<AddedFrom signing={span} /></small>
    </span>}
    {notes}
  </td>;
}

/**
 * Every contract fact in one table, styled like the Stats table: every reported season newest
 * first, each in the bracket of the contract it belongs to (where both ends of that contract are
 * known, contract_spans.py), with that season's dated contract events, and gold total rows for the
 * remaining guarantee and reported career earnings. Current-contract seasons carry their option
 * or guarantee under the salary. A column with no reported value (cap share for ABA-only careers)
 * is left out rather than drawn as a column of dashes.
 */
function ContractTable({ reference, contract, history, events }: {
  reference: Reference; contract: PlayerSalary[]; history: PlayerSalary[]; events: PlayerReferenceEvent[];
}) {
  const spans = reference.contract_spans ?? [];
  const contractKeys = new Set(contract.map(row => `${row.season}:${row.team_code}`));
  const past = history.filter(row => !contractKeys.has(`${row.season}:${row.team_code}`));
  const rows = [...contract.map(salary => ({ salary, current: true })), ...past.map(salary => ({ salary, current: false }))]
    .sort((a, b) => b.salary.season.localeCompare(a.salary.season));
  const seasons = new Set(rows.map(({ salary }) => salary.season));
  // Signings show in the Deal column (as a bracket's label, or a note when no bracket could be
  // placed), so they are not repeated among the season's events.
  const unplacedSignings = reference.unplaced_signings ?? [];
  const spanDates = new Set([...spans.map(span => span.signed_date), ...unplacedSignings.map(signing => signing.signed_date)]);
  const bySeason = new Map<string, PlayerReferenceEvent[]>();
  const unplaced: PlayerReferenceEvent[] = [];
  for (const event of [...events].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    if (event.date && spanDates.has(event.date) && (event.type === "signed" || event.type === "extended" || /^(signed|agreed to)\b/i.test(event.description))) continue;
    const season = event.date ? eventSeason(event.date) : null;
    if (season && seasons.has(season)) bySeason.set(season, [...(bySeason.get(season) ?? []), event]);
    else unplaced.push(event);
  }
  const owners = rows.map(({ salary }) => spanFor(spans, salary));
  const edgeOf = (i: number) => {
    if (owners[i] < 0) return null;
    const top = owners[i - 1] !== owners[i], bottom = owners[i + 1] !== owners[i];
    return top && bottom ? "single" : top ? "top" : bottom ? "bottom" : "middle";
  };
  // Each contract has its own color: the current one gold, earlier ones cycling three series
  // colors newest first, so neighbouring contracts never share a color.
  const tones = new Map<number, string>();
  for (const owner of owners) {
    if (owner < 0 || tones.has(owner)) continue;
    tones.set(owner, spans[owner].current ? "current" : String(([...tones.values()].filter(t => t !== "current").length % 3) + 1));
  }
  const showCap = rows.some(({ salary }) => salary.share_of_cap != null);
  const salaryColumns = showCap ? 3 : 2;
  const columns = 2 + salaryColumns + 1;
  // Empty cells after a total, keeping each column group's left edge.
  const afterSalary = <>{showCap && <td />}<td className="group-start" /></>;
  // A season's events show once, on its first row (a split season has one row per team).
  const shown = new Set<string>();
  return <div className="player-ref-grid-frame">
    <div className="player-ref-grid-scroll" role="region" aria-label="Contract table scroll area" tabIndex={0}>
      <table className="player-ref-grid player-contract-grid" aria-label="Contract and salary history by season">
        {/* Fixed, equal data columns: each group label centers over its columns (row 2, 66). */}
        <colgroup>
          <col className="player-ref-grid-lead-column" />
          <col className="player-contract-span-column" />
          {Array.from({ length: columns - 3 }, (_, i) => <col key={i} />)}
          <col className="player-contract-events-column" />
        </colgroup>
        <thead>
          <tr className="player-ref-grid-tier-1">
            <th scope="colgroup" className="player-ref-grid-lead">Season</th>
            <th scope="colgroup" className="group-start">Contract</th>
            <th scope="colgroup" colSpan={salaryColumns} className="group-start">Salary</th>
            <th scope="colgroup" className="group-start">Events</th>
          </tr>
          <tr className="player-ref-grid-tier-2">
            <td className="player-ref-grid-lead" />
            <th scope="col" className="group-start" title="Seasons grouped by the contract they belong to, where its start and end are known">Deal</th>
            <th scope="col" className="group-start player-contract-team">Team</th>
            <th scope="col" title="Current-contract seasons show their option or guarantee under the salary">Salary</th>
            {showCap && <th scope="col" title="Salary against that season's NBA salary cap">% of Cap</th>}
            <th scope="col" className="group-start player-contract-events-cell">Contract Events</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns} className="player-contract-empty">No salaries listed in the retained report.</td></tr>}
          {rows.map(({ salary, current }, i) => {
            const firstOfSeason = !shown.has(salary.season);
            const seasonEvents = firstOfSeason ? bySeason.get(salary.season) ?? [] : [];
            shown.add(salary.season);
            return <tr key={`${current ? "c" : "h"}:${salary.season}:${salary.team_code}:${i}`}>
              <th scope="row" className="player-ref-grid-lead player-contract-season"
                data-edge={edgeOf(i) ?? undefined} data-tone={tones.get(owners[i])}>{salary.season}</th>
              <SpanCell span={spans[owners[i]]} edge={edgeOf(i)} tone={tones.get(owners[i])} unplaced={firstOfSeason ? unplacedSignings.filter(signing => signing.season === salary.season) : []} />
              <td className="group-start player-contract-team"><SalaryTeam row={salary} /></td>
              {/* Terms sit under the current contract's salaries: the salary history never reports
                  them, and a played season's terms no longer apply. */}
              <td><Salary row={salary} />{current && <Terms row={salary} />}</td>
              {showCap && <td><CapShare row={salary} /></td>}
              <td className="group-start player-contract-events-cell">{seasonEvents.length ? <EventList events={seasonEvents} /> : "—"}</td>
            </tr>;
          })}
        </tbody>
        {unplaced.length > 0 && <tbody>
          <tr className="player-contract-section"><th scope="rowgroup" className="player-ref-grid-lead">Other Contract Events</th><td colSpan={columns - 1} /></tr>
          <tr><th scope="row" className="player-ref-grid-lead">—</th><td colSpan={columns - 2} className="group-start" /><td className="group-start player-contract-events-cell"><EventList events={unplaced} /></td></tr>
        </tbody>}
        {(reference.remaining_guaranteed || reference.career_earnings) && <tfoot>
          {/* Both totals sit under Salary: they are dollar sums of the salary column's kind. */}
          {reference.remaining_guaranteed && <tr className="player-contract-total">
            <th scope="row" className="player-ref-grid-lead">Remaining Guaranteed</th>
            <td className="group-start" /><td className="group-start" /><td><strong><Guarantee value={reference.remaining_guaranteed} /></strong></td>
            {afterSalary}
          </tr>}
          {reference.career_earnings && <tr className="player-contract-total">
            <th scope="row" className="player-ref-grid-lead">Career Earnings</th>
            <td className="group-start" /><td className="group-start" /><td><strong title="Reported salaries, not verified cash earned">{money(reference.career_earnings)}</strong></td>
            {afterSalary}
          </tr>}
        </tfoot>}
      </table>
    </div>
  </div>;
}

function EventList({ events }: { events: PlayerReferenceEvent[] }) {
  return <ul className="player-contract-events">{events.map((event, i) => <li key={`${event.date}:${i}`}>
    {event.date ? <time dateTime={event.date}>{formatDate(event.date)}</time> : <span className="player-event-undated">Undated</span>}
    <span title={event.description}>{eventDescription(event)}</span>
  </li>)}</ul>;
}

function eventDescription(event: PlayerReferenceEvent): string {
  const text = event.description.replace(/\s+([.,;:])/g, "$1");
  if (!event.date) return text;
  const sourceDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${event.date}T00:00:00Z`));
  const weekday = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";
  return text.replace(new RegExp(`\\s+(?:on\\s+)?(?:(?:${weekday}),?\\s+)?${sourceDate}\\.?$`), ".");
}

function Events({ events }: { events: PlayerReferenceEvent[] }) {
  const sorted = [...events].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return <ol className="player-reference-events">{sorted.map((event, i) => <li key={`${event.date}:${i}`}>
    {event.date ? <time dateTime={event.date}>{formatDate(event.date)}</time> : <span className="player-event-undated">Undated note</span>}
    <p title={event.description}>{eventDescription(event)}</p>
  </li>)}</ol>;
}

/** Career highs grouped like the career table's columns (row 2, 67). */
const HIGH_GROUPS: Array<{ label: string; columns: Array<[string, string]> }> = [
  { label: "Scoring", columns: [["pts", "PTS"], ["fg", "FGM"], ["fg3", "3PM"], ["ft", "FTM"]] },
  { label: "Counting", columns: [["trb", "REB"], ["ast", "AST"], ["stl", "STL"], ["blk", "BLK"]] },
  { label: "Other", columns: [["time_on_court", "MIN"], ["game_score", "GmSc"]] },
];

export function PlayerReferenceSections({ reference }: { reference: Reference }) {
  const contract = reference.current_contract ?? [];
  const history = reference.salary_history ?? [];
  const events = reference.contract_events ?? [];
  const transactions = reference.transactions ?? [];
  const highs = (reference.game_highs ?? []).filter(row => row.scope === "career");
  return <>
    {(contract.length > 0 || history.length > 0 || events.length > 0) && <section className="player-open-section player-reference player-glass" aria-label="Contracts">
      <header className="player-open-heading"><h2><Icon name="banknote" size={20} />Contracts</h2><span>Reported salaries · USD</span></header>
      <ContractTable reference={reference} contract={contract} history={history} events={events} />
      <p className="player-reference-note">Seasons are bracketed by contract where its start and end are known: from Basketball-Reference&apos;s signing events, the CBA&apos;s fixed lengths (rookie scale, 10-day, Exhibit 10), and lengths, extensions or signings the player&apos;s Wikipedia article states where Basketball-Reference gives none. Where counting forward would run past the current contract (an extension that replaced an option year), the extensions are counted back from its last season, never so far that one contract holds a raise the CBA does not allow; a salary rising more than that marks where a contract began. A signing whose start or end is still unknown is noted without a bracket, saying which is missing. Options are reported terms. &ldquo;Fully Guaranteed&rdquo; means the reported remaining guaranteed total equals those seasons&apos; salaries; otherwise a dash means unknown, and a salary without an option is not confirmed guaranteed. Cap shares use each season&apos;s official NBA salary cap release where retained, otherwise Basketball-Reference&apos;s salary cap history. Career earnings total reported salaries and may be incomplete; they are not verified cash earned. Events sit in the NBA season (July to June) of their date.</p>
      <Credit reference={reference} anchor="all_contract" />
      {reference.contract_terms_source && <p className="player-reference-credit">
        <a href={reference.contract_terms_source.url} target="_blank" rel="noreferrer">Wikipedia: {reference.contract_terms_source.title}</a> (CC BY-SA 4.0) · Contract terms Basketball-Reference does not state · As of {formatDate(reference.contract_terms_source.as_of)}
      </p>}
    </section>}
    {transactions.length > 0 && <section className="player-open-section player-reference player-glass" aria-label="Transaction News">
      <header className="player-open-heading"><h2><Icon name="swap" size={20} />Transaction News</h2><span>{transactions.length} dated reports and notes</span></header>
      <Events events={[...transactions].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 6)} />
      {transactions.length > 6 && <details><ButtonSummary size="sm" variant="text" iconAfter="chevron-down">Earlier Transactions · {transactions.length - 6}</ButtonSummary><Events events={[...transactions].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(6)} /></details>}
      <Credit reference={reference} anchor="all_transactions" />
    </section>}
    {highs.length > 0 && <section className="player-open-section player-reference player-glass" aria-label="Career highs">
      <header className="player-open-heading"><h2><Icon name="trophy" size={20} />Career Highs</h2><span>Highest known single-game values</span></header>
      <div className="player-ref-grid-frame">
        <div className="player-ref-grid-scroll" role="region" aria-label="Career highs table" tabIndex={0}>
          <table className="player-ref-grid player-highs-grid" aria-label="Career highs by phase">
            <colgroup>
              <col className="player-ref-grid-lead-column" />
              {HIGH_GROUPS.flatMap(group => group.columns).map(([key]) => <col key={key} />)}
            </colgroup>
            <thead>
              <tr className="player-ref-grid-tier-1">
                <th scope="colgroup" className="player-ref-grid-lead">Phase</th>
                {HIGH_GROUPS.map(group => <th key={group.label} scope="colgroup" colSpan={group.columns.length} className="group-start">{group.label}</th>)}
              </tr>
              <tr className="player-ref-grid-tier-2">
                <td className="player-ref-grid-lead" />
                {HIGH_GROUPS.flatMap(group => group.columns.map(([key, label], index) =>
                  <th key={key} scope="col" className={index === 0 ? "group-start" : undefined}>{label}</th>))}
              </tr>
            </thead>
            <tbody>{highs.map(row => <tr key={row.phase}>
              <th scope="row" className="player-ref-grid-lead">{row.phase === "regular_season" ? "Regular Season" : "Playoffs"}</th>
              {HIGH_GROUPS.flatMap(group => group.columns.map(([key, label], index) => {
                const high = row.values[key];
                return <td key={key} className={index === 0 ? "group-start" : undefined}>{high?.value == null ? "—" : high.url ? <a href={high.url} target="_blank" rel="noreferrer" title={`${label}${high.date ? ` · ${formatDate(high.date)}` : " · Source game list"}`}>{high.value}</a> : high.value}</td>;
              }))}
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      <p className="player-reference-note">Each column can describe a different game. Missing values stay unknown; source game links are provided where available.</p>
      <Credit reference={reference} anchor="all_highs" />
    </section>}
  </>;
}
