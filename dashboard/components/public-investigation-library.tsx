import Link from "next/link";
import { publicInvestigation } from "@/lib/public-investigations";
import type { SavedDetail } from "@/lib/saved-operations";
import { throughLabel } from "@/lib/format-date";
import { humanLabel } from "@/lib/route-availability";
import { PlayerIdentity } from "./ui/identity";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { GatedNote } from "./ui/gated-note";
import { DataDetailsButton } from "./ui/data-details";
import { ButtonLink } from "./ui/kit";

export function PublicInvestigationLibrary({ details }: { details: (SavedDetail | null)[] }) {
  const available = details.filter((detail): detail is SavedDetail => detail !== null);
  return <>
    <FilterBar collapsible={false} label="Public investigations" summary="Retained examples" scope={<span className="research-scope-label">Historical examples · original inputs and exact exports</span>} count={<CountChip>{available.length} retained findings</CountChip>} />
    <section className="pc12-public-findings" aria-label="Public investigation examples">
      {available.map(detail => {
        const entry = publicInvestigation(detail)!;
        const context = detail.manifest.context;
        return <article key={detail.id} className="panel pc12-public-finding">
          <PlayerIdentity playerId="1630567" name="Scottie Barnes" team="TOR" size="sm" />
          <h2><Link href={`/investigations/saved/${detail.id}`}>{entry.title}</Link></h2>
          <p>{entry.description}</p>
          <p className="research-caption">{String(context.season)} · {humanLabel(String(context.phase))} · {throughLabel(typeof context.before_date === "string" ? context.before_date : null)}</p>
          <p className="research-caption">Source: retained CourtLens operation · {detail.manifest.results.reduce((n, result) => n + result.rows.length, 0)} returned rows</p>
          <div className="research-row-actions"><ButtonLink size="lg" href={`/investigations/saved/${detail.id}`}>Open Finding</ButtonLink><DataDetailsButton rows={[{ label: "Original title", value: detail.title }, { label: "Manifest SHA-256", value: detail.manifest_sha256, mono: true }, { label: "Retained ID", value: detail.id, mono: true }]} /></div>
        </article>;
      })}
    </section>
    {available.length < details.length && <GatedNote action={<ButtonLink size="lg" href="/research/case-studies">Case Studies</ButtonLink>} why={<p>Only findings whose retained manifest matches the curated record are shown. Missing or changed records are never replaced by fabricated results.</p>}>{details.length - available.length} retained examples unavailable.</GatedNote>}
  </>;
}
