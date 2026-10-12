import Link from "next/link";
import { scaleLinear } from "d3-scale";
import { ChartData, ChartFrame, type ChartMeta } from "./charts";
import { TeamLogo } from "./team-logo";
import { dollars, money, type TeamPayroll, type Thresholds } from "@/lib/contracts";

export type ThresholdLine = { key: string; label: string; value: number; dash: string };

export function thresholdLines(thresholds: Thresholds | null): ThresholdLine[] {
  if (!thresholds) return [];
  return [
    { key: "cap", label: "Salary cap", value: dollars(thresholds.cap_cents)!, dash: "" },
    { key: "tax", label: "Luxury tax", value: dollars(thresholds.tax_cents)!, dash: "6 3" },
    { key: "first", label: "First apron", value: dollars(thresholds.first_apron_cents)!, dash: "2 2" },
    { key: "second", label: "Second apron", value: dollars(thresholds.second_apron_cents)!, dash: "1 3" },
  ];
}

/** All 30 teams on one shared scale: known reported salary against the official markers. */
export function PayrollBoard({ teams, thresholds, query, ...meta }: ChartMeta & { teams: TeamPayroll[]; thresholds: Thresholds | null; query: string }) {
  const lines = thresholdLines(thresholds);
  const ordered = [...teams].sort((a, b) => (dollars(b.source_page_known_cents) ?? 0) - (dollars(a.source_page_known_cents) ?? 0));
  const maximum = Math.max(...lines.map(l => l.value * 1.08), ...ordered.map(t => dollars(t.source_page_known_cents) ?? 0), 1);
  const x = scaleLinear().domain([0, maximum]).range([0, 400]).clamp(true);
  return <ChartFrame {...meta} state={meta.state ?? (teams.length ? "ready" : "empty")}>
    <ChartData fingerprint={JSON.stringify([teams, lines])}>
      <ul className="chart-legend chart-legend-inline contracts-board-legend">
        <li><span className="chart-key contracts-key-reported" aria-hidden="true" />Known reported salary</li>
        {lines.map(line => <li key={line.key}><svg className="contracts-line-key" viewBox="0 0 24 8" aria-hidden="true"><line x1="0" x2="24" y1="4" y2="4" strokeDasharray={line.dash} /></svg>{line.label} {money(line.value)}</li>)}
      </ul>
      <ol className="contracts-board" aria-label="Known reported salary by team, highest first">
        {ordered.map(team => {
          const value = dollars(team.source_page_known_cents) ?? 0;
          return <li key={team.team_id}>
            <Link className="contracts-board-team" href={`/contracts/${team.team_tricode}${query}`}><TeamLogo team={team.team_id} size={20} /><span>{team.team_tricode}</span></Link>
            <svg className="contracts-board-bar" viewBox="0 0 400 16" preserveAspectRatio="none" role="img" aria-label={`${team.team_name}: ${money(value)} known, ${team.roster_known_players} of ${team.roster_players} roster salaries`}>
              <rect x="0" y="2" width="400" height="12" rx="2" className="contracts-board-track" />
              <rect x="0" y="2" width={x(value)} height="12" rx="2" className="contracts-board-value" />
              {lines.map(line => <line key={line.key} x1={x(line.value)} x2={x(line.value)} y1="0" y2="16" strokeDasharray={line.dash} vectorEffect="non-scaling-stroke" className="contracts-board-marker" />)}
            </svg>
            <span className="contracts-board-amount"><strong>{money(value)}</strong><small>{team.roster_known_players}/{team.roster_players} known</small></span>
          </li>;
        })}
      </ol>
      <p className="chart-note">Bars show only salaries the source reports; unknown salaries are excluded, so every bar is a lower bound. Lines are official markers, not cap, tax or apron status.</p>
    </ChartData>
  </ChartFrame>;
}
