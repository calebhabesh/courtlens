import type { TableCohort } from "@/lib/types";

export function TablePercentileLegend({ cohort, teams = false }: { cohort?: TableCohort | null; teams?: boolean }) {
  return <div className="table-percentile-legend">
    <div className="table-percentile-key" role="group" aria-label="Percentile shading from low to high">
      <span>Percentile</span>
      {["0–19", "20–39", "40–59", "60–79", "80–100"].map((range, index) => <span key={range} className={`table-percentile-band table-percentile-band-${index + 1}`}>{range}</span>)}
    </div>
    <span>{teams ? "League teams" : `${cohort?.qualified_players ?? "Unknown number of"} league players · ${cohort?.min_season_minutes ?? 500}+ season minutes`} · Source: published box scores</span>
    <details className="ui-why"><summary className="ui-why-summary">Rules</summary><div className="ui-why-body">Stronger blue means higher oriented percentile. Lower is better for turnovers, fouls and opponent allowance; other ranks describe higher values. Muted means small sample or unknown. {teams ? "All league teams in this season and phase with a known value; group and search filters do not change ranks." : "Same season, phase and selected window. Season minutes through the cutoff qualify; search, team and sample filters, favorites and paging do not change the league reference."}</div></details>
  </div>;
}
