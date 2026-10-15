import { ButtonSummary } from "./ui/kit";
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

function SalaryTable({ rows, current }: { rows: PlayerSalary[]; current?: boolean }) {
  return <div className="player-reference-table" role="region" aria-label={current ? "Current contract by season" : "Salary history"} tabIndex={0}>
    <table aria-label={current ? "Current contract salaries" : "Reported salary history"}>
      <thead><tr><th scope="col">Season</th><th scope="col">Team</th><th scope="col">Salary</th><th scope="col">% of cap</th>{current && <><th scope="col">Option</th><th scope="col" title="Annual guarantee only when explicitly reported; remaining totals appear separately">Guaranteed</th></>}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={`${row.season}:${row.team_code}:${i}`}>
        <th scope="row">{row.season}</th>
        <td><span className="player-reference-team">{row.team_code && (TEAM_ARTWORK.has(row.team_code) || row.team_code in BREF_ARTWORK) && <TeamLogo team={BREF_ARTWORK[row.team_code] ?? row.team_code} size={18} />}<span title={row.team ?? undefined}>{row.team_code ?? row.team ?? "—"}</span></span></td>
        <td title={row.salary_note ?? undefined}>{money(row.salary)}{row.salary_note && <small>{row.salary_note.includes("(TW)") ? "Two-way" : row.salary_note}</small>}</td>
        <td>{row.share_of_cap == null ? "—" : row.cap_source_url ? <a href={row.cap_source_url} target="_blank" rel="noreferrer" title={`Official cap threshold · retained ${formatDate(row.cap_as_of)}`}>{(row.share_of_cap * 100).toFixed(1)}%</a> : `${(row.share_of_cap * 100).toFixed(1)}%`}</td>
        {current && <><td>{row.option ? <span className={`player-contract-option is-${row.option}`}>{row.option === "player" ? "Player option" : "Team option"}</span> : "—"}</td><td><Guarantee value={row.guarantee} /></td></>}
      </tr>)}</tbody>
    </table>
  </div>;
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

const HIGH_COLUMNS = [
  ["pts", "PTS"], ["trb", "REB"], ["ast", "AST"], ["stl", "STL"], ["blk", "BLK"],
  ["fg3", "3PM"], ["fg", "FGM"], ["ft", "FTM"], ["time_on_court", "MIN"], ["game_score", "GmSc"],
];

export function PlayerReferenceSections({ reference }: { reference: Reference }) {
  const contract = reference.current_contract ?? [];
  const history = reference.salary_history ?? [];
  const events = reference.contract_events ?? [];
  const transactions = reference.transactions ?? [];
  const highs = (reference.game_highs ?? []).filter(row => row.scope === "career");
  return <>
    {(contract.length > 0 || history.length > 0 || events.length > 0) && <section className="player-open-section player-reference player-glass" aria-label="Contract">
      <header className="player-open-heading"><h2>Contract</h2><span>Reported salaries · USD</span></header>
      <div className="player-contract-layout">
        <div className="player-contract-current"><h3>Current Contract</h3>
          {contract.length > 0 ? <SalaryTable rows={contract} current /> : <p className="player-open-empty">No current contract listed in the retained report.</p>}
          {reference.remaining_guaranteed && <p className="player-contract-guaranteed">Remaining guaranteed total <strong><Guarantee value={reference.remaining_guaranteed} /></strong></p>}
          <p className="player-reference-note">Options are reported terms. A dash means unknown; a salary without an option is not confirmed guaranteed. Cap shares use each season&apos;s retained official NBA threshold.</p>
        </div>
        {events.length > 0 && <div className="player-contract-notes"><h3>Contract Events</h3><Events events={events} /></div>}
      </div>
      {history.length > 0 && <div className="player-salary-history">
        <div className="player-earnings"><span>Reported Career Earnings</span><strong>{money(reference.career_earnings)}</strong><small>Source total may be incomplete; reported salaries, not verified cash earned.</small></div>
        <details><ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Salary History · {history.length} {history.length === 1 ? "entry" : "entries"}</ButtonSummary><SalaryTable rows={[...history].sort((a, b) => b.season.localeCompare(a.season))} /></details>
      </div>}
      <Credit reference={reference} anchor="all_contract" />
    </section>}
    {transactions.length > 0 && <section className="player-open-section player-reference player-glass" aria-label="Transactions">
      <header className="player-open-heading"><h2>Transactions</h2><span>{transactions.length} dated reports and notes</span></header>
      <Events events={[...transactions].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 6)} />
      {transactions.length > 6 && <details><ButtonSummary size="sm" variant="ghost" iconAfter="chevron-down">Earlier Transactions · {transactions.length - 6}</ButtonSummary><Events events={[...transactions].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(6)} /></details>}
      <Credit reference={reference} anchor="all_transactions" />
    </section>}
    {highs.length > 0 && <section className="player-open-section player-reference player-glass" aria-label="Career highs">
      <header className="player-open-heading"><h2>Career Highs</h2><span>Highest known single-game values</span></header>
      <div className="player-reference-table" role="region" aria-label="Career highs table" tabIndex={0}><table>
        <thead><tr><th scope="col">Phase</th>{HIGH_COLUMNS.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
        <tbody>{highs.map(row => <tr key={row.phase}><th scope="row">{row.phase === "regular_season" ? "Regular season" : "Playoffs"}</th>{HIGH_COLUMNS.map(([key, label]) => {
          const high = row.values[key];
          return <td key={key}>{high?.value == null ? "—" : high.url ? <a href={high.url} target="_blank" rel="noreferrer" title={`${label}${high.date ? ` · ${formatDate(high.date)}` : " · Source game list"}`}>{high.value}</a> : high.value}</td>;
        })}</tr>)}</tbody>
      </table></div>
      <p className="player-reference-note">Each column can describe a different game. Missing values stay unknown; source game links are provided where available.</p>
      <Credit reference={reference} anchor="all_highs" />
    </section>}
  </>;
}
