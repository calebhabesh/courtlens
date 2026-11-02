"use client";

import Link from "next/link";
import { formatRecord } from "@/lib/live";
import { useLiveRead } from "@/lib/use-live-read";
import { franchiseOf } from "@/lib/team-era";
import { FIRST_STANDINGS_SEASON, gamesBehind, bySeed, type StandingsData } from "@/lib/standings";
import { TeamLogo } from "./team-logo";
import { Icon } from "./ui/icon";

const COLUMNS = [["W", "wins"], ["L", "losses"], ["PCT", "pct"], ["GB", "gb"], ["HOME", "home"], ["AWAY", "away"], ["STRK", "streak"], ["L10", "l10"]] as const;

/**
 * Row 4 follow-up 13: the team's division in ESPN's official standings (row 23), the team
 * highlighted, linking to the full Standings page. Seasons before 1984-85 have none.
 */
export function TeamDivisionStandings({ tricode, season }: { tricode: string; season: string }) {
  const covered = season >= FIRST_STANDINGS_SEASON;
  const { read } = useLiveRead<StandingsData>(covered ? `/standings?season=${season}` : null);
  if (!covered) return null;
  const own = franchiseOf(tricode) ?? tricode;
  const division = read?.data?.standings?.find(d => d.entries.some(e => e.tricode && (franchiseOf(e.tricode) ?? e.tricode) === own));
  if (!division) return null;
  const rows = [...division.entries].sort(bySeed);
  return <section className="player-open-section player-glass team-profile-section team-division" aria-label="Division standings">
    <header className="player-open-heading"><h2><Icon name="list-ordered" size={20} />{division.division} Division</h2>
      <Link className="team-division-link" href={`/standings?season=${season}&group=division`}>Full standings <Icon name="right" size={14} /></Link></header>
    <div className="team-division-scroll" role="region" aria-label={`${division.division} division standings`} tabIndex={0}>
      <table className="team-division-table">
        <thead><tr><th scope="col">{division.conference}</th>{COLUMNS.map(([label]) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.team_source_id} data-current={(row.tricode && (franchiseOf(row.tricode) ?? row.tricode) === own) || undefined}>
          <th scope="row"><span className="team-division-team">{row.tricode && <TeamLogo team={row.tricode} season={season} size={20} />}
            {row.tricode ? <Link href={`/teams/${row.tricode}?season=${season}`}>{row.name}</Link> : row.name}</span></th>
          {COLUMNS.map(([label, key]) => <td key={label}>{key === "gb" ? gamesBehind(row, division.entries) : formatRecord((row as unknown as Record<string, string | null | undefined>)[key]) ?? "—"}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="player-reference-note">ESPN&apos;s official standings (NBA tiebreakers); GB is games behind the division leader.</p>
  </section>;
}
