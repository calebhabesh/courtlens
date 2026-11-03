import Link from "next/link";
import "./impact.css";
import type { ImpactDisclosureData } from "@/lib/types";

export function ImpactDisclosure({ data }: { data: ImpactDisclosureData }) {
  const windows = [...new Map(data.artifacts.map(artifact => [
    `${artifact.years}-${artifact.phase}`, artifact
  ])).values()];
  return <section className="impact-disclosure" aria-label="Impact methodology and coverage">
    <div className="impact-heading"><span className="badge badge-accent">CourtLens model</span>
      {data.provisional && <span className="badge">Provisional</span>}
      <Link href={data.methodology_url}>Methodology and definitions</Link></div>
    {data.status !== "available" ? <p role="status">{data.reason || "No sealed impact fit for this scope."}</p> : <>
      <p>Descriptive model estimates under lineup confounding.</p>
      {data.provisional && <p>{data.provisional.note} Games through {data.provisional.last_included_date}.</p>}
      <p>{windows.map(artifact => `${artifact.years}Y: ${artifact.seasons.join(" / ")} · games through ${artifact.last_included_date} · exclusive fit cutoff ${artifact.cutoff}`).join("; ")}</p>
      {data.coverage.map(coverage => <p key={`${coverage.season}-${coverage.phase}`}>
        {coverage.season} {coverage.phase.replaceAll("_", " ")}: {coverage.admitted_games.toLocaleString()} / {coverage.scheduled_games.toLocaleString()} games admitted · {coverage.clean_games} clean · {coverage.patched_games.toLocaleString()} patched ({(coverage.patch_rate * 100).toFixed(2)}% of admitted) · {coverage.excluded_games} excluded.
      </p>)}
    </>}
    <details><summary>Samples, reconstruction limits and unavailable columns</summary>
      <p>Box appearances and model samples differ. Rating cells require 20 games and 1,000 relevant opportunities on both sides. Extras keep descriptive values; their percentiles require 500 reconstructed minutes and 200 denominator units for rates. Select a player for metric-specific samples.</p>
      <ul>{data.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul>
      <p>Unavailable metrics remain gated:</p>
      <ul>{Object.entries(data.unavailable_columns).map(([key, reason]) => <li key={key}>{key.replaceAll("_", " ")}: {reason}.</li>)}</ul>
      <p>NBA public data via the admitted shufinskiy archive and SportsDataverse{data.provisional ? "; the in-season fit reads hoopR's daily play-by-play" : ""}. BPR is a CourtLens analogue. No third-party model values.</p>
    </details>
  </section>;
}
