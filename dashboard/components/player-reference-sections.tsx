import { ButtonSummary } from "./ui/kit";
import { Icon } from "./ui/icon";
import { TeamLogo } from "./team-logo";
import teamCatalog from "@/lib/team-branding.json";
import { formatDate } from "@/lib/format-date";
import type { PlayerBio, PlayerGuarantee, PlayerReferenceEvent, PlayerSalary } from "@/lib/types";

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
  return row.cap_source_url ? <a href={row.cap_source_url} target="_blank" rel="noreferrer" title={`Official cap threshold · retained ${formatDate(row.cap_as_of)}`}>{share}</a> : <>{share}</>;
}

/** The NBA season (July to June) a dated event falls in, matching the salary rows' labels. */
function eventSeason(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 7 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/**
 * Every contract fact in one table, styled like the Stats table: the current contract's seasons,
 * then reported salary history (newest first), each with that season's dated contract events,
 * and gold total rows for the remaining guarantee and reported career earnings.
 */
function ContractTable({ reference, contract, history, events }: {
  reference: Reference; contract: PlayerSalary[]; history: PlayerSalary[]; events: PlayerReferenceEvent[];
}) {
  const contractKeys = new Set(contract.map(row => `${row.season}:${row.team_code}`));
  const past = history.filter(row => !contractKeys.has(`${row.season}:${row.team_code}`)).sort((a, b) => b.season.localeCompare(a.season));
  const seasons = new Set([...contract, ...past].map(row => row.season));
  const bySeason = new Map<string, PlayerReferenceEvent[]>();
  const unplaced: PlayerReferenceEvent[] = [];
  for (const event of [...events].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    const season = event.date ? eventSeason(event.date) : null;
    if (season && seasons.has(season)) bySeason.set(season, [...(bySeason.get(season) ?? []), event]);
    else unplaced.push(event);
  }
  // A season's events show once, on its first row (a split season has one row per team).
  const shown = new Set<string>();
  const row = (salary: PlayerSalary, i: number, current: boolean) => {
    const seasonEvents = shown.has(salary.season) ? [] : bySeason.get(salary.season) ?? [];
    shown.add(salary.season);
    return <tr key={`${current ? "c" : "h"}:${salary.season}:${salary.team_code}:${i}`}>
      <th scope="row" className="player-ref-grid-lead">{salary.season}</th>
      <td className="group-start player-contract-team"><SalaryTeam row={salary} /></td>
      <td><Salary row={salary} /></td>
      <td><CapShare row={salary} /></td>
      <td className="group-start">{salary.option ? <span className={`player-contract-option is-${salary.option}`}>{salary.option === "player" ? "Player option" : "Team option"}</span> : "—"}</td>
      <td><Guarantee value={salary.guarantee} /></td>
      <td className="group-start player-contract-events-cell">{seasonEvents.length ? <EventList events={seasonEvents} /> : "—"}</td>
    </tr>;
  };
  return <div className="player-ref-grid-frame">
    <div className="player-ref-grid-scroll" role="region" aria-label="Contract table scroll area" tabIndex={0}>
      <table className="player-ref-grid" aria-label="Contract and salary history by season">
        {/* Fixed, equal data columns: each group label centers over its columns (row 2, 66). */}
        <colgroup>
          <col className="player-ref-grid-lead-column" />
          {[0, 1, 2, 3, 4].map(i => <col key={i} />)}
          <col className="player-contract-events-column" />
        </colgroup>
        <thead>
          <tr className="player-ref-grid-tier-1">
            <th scope="colgroup" className="player-ref-grid-lead">Season</th>
            <th scope="colgroup" colSpan={3} className="group-start">Salary</th>
            <th scope="colgroup" colSpan={2} className="group-start">Terms</th>
            <th scope="colgroup" className="group-start">Events</th>
          </tr>
          <tr className="player-ref-grid-tier-2">
            {/* The first section's label shares the column-label row (row 2, 66). */}
            <th scope="rowgroup" className="player-ref-grid-lead">Current Contract</th>
            <th scope="col" className="group-start player-contract-team">Team</th>
            <th scope="col">Salary</th>
            <th scope="col">% of Cap</th>
            <th scope="col" className="group-start">Option</th>
            <th scope="col" title="Annual guarantee only when explicitly reported; the remaining total appears below">Guaranteed</th>
            <th scope="col" className="group-start player-contract-events-cell">Contract Events</th>
          </tr>
        </thead>
        <tbody>
          {contract.length > 0 ? contract.map((salary, i) => row(salary, i, true))
            : <tr><td colSpan={7} className="player-contract-empty">No current contract listed in the retained report.</td></tr>}
        </tbody>
        {past.length > 0 && <tbody>
          <tr className="player-contract-section"><th scope="rowgroup" className="player-ref-grid-lead" title={`${past.length} reported ${past.length === 1 ? "season" : "seasons"}`}>Salary History</th><td colSpan={6} /></tr>
          {past.map((salary, i) => row(salary, i, false))}
        </tbody>}
        {unplaced.length > 0 && <tbody>
          <tr className="player-contract-section"><th scope="rowgroup" className="player-ref-grid-lead">Other Contract Events</th><td colSpan={6} /></tr>
          <tr><th scope="row" className="player-ref-grid-lead">—</th><td colSpan={5} className="group-start" /><td className="group-start player-contract-events-cell"><EventList events={unplaced} /></td></tr>
        </tbody>}
        {(reference.remaining_guaranteed || reference.career_earnings) && <tfoot>
          {reference.remaining_guaranteed && <tr className="player-contract-total">
            <th scope="row" className="player-ref-grid-lead">Remaining Guaranteed</th>
            <td colSpan={3} className="group-start" />
            <td className="group-start" /><td><strong><Guarantee value={reference.remaining_guaranteed} /></strong></td>
            <td className="group-start" />
          </tr>}
          {reference.career_earnings && <tr className="player-contract-total">
            <th scope="row" className="player-ref-grid-lead">Career Earnings</th>
            <td className="group-start" /><td><strong title="Reported salaries, not verified cash earned">{money(reference.career_earnings)}</strong></td><td />
            <td colSpan={2} className="group-start" />
            <td className="group-start" />
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
    {(contract.length > 0 || history.length > 0 || events.length > 0) && <section className="player-open-section player-reference player-glass" aria-label="Contract">
      <header className="player-open-heading"><h2><Icon name="banknote" size={20} />Contract</h2><span>Reported salaries · USD</span></header>
      <ContractTable reference={reference} contract={contract} history={history} events={events} />
      <p className="player-reference-note">Options are reported terms. A dash means unknown; a salary without an option is not confirmed guaranteed. Cap shares use each season&apos;s retained official NBA threshold. Career earnings total reported salaries and may be incomplete; they are not verified cash earned. Events sit in the NBA season (July to June) of their date.</p>
      <Credit reference={reference} anchor="all_contract" />
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
