"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getMeasurements } from "@/lib/workbench-api";
import { downloadResearch } from "@/lib/advanced-research";
import type { MeasurementsQueryResponse } from "@/lib/types";
import { CountChip, FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { Field } from "./ui/field";
import { GatedNote } from "./ui/gated-note";
import { PlayerIdentity } from "./ui/identity";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { SegmentedControl } from "./ui/segmented-control";
import { Select } from "./ui/select";
import { StatTile } from "./ui/stat-tile";
import { ResearchBodySkeleton } from "./research-investigation";

type Row = MeasurementsQueryResponse["items"][number] & { position: number };
// The source can repeat identical observations, so a row's identity includes its position.
const key = (row: Row) => `${row.player_id}-${row.measurement_type}-${row.source_name}-${row.position}`;
function withoutPosition(row: Row): MeasurementsQueryResponse["items"][number] {
  const copy: Partial<Row> = { ...row };
  delete copy.position;
  return copy as MeasurementsQueryResponse["items"][number];
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Combine & Wingspan on the Research template. Filters live in the URL; missing lengths stay unknown. */
export function WingspanExplorerView() {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const type = params.get("type") || "all", draft = params.get("draftYear") || "", minimum = params.get("minWingspan") || "", maximum = params.get("maxWingspan") || "";
  const search = params.get("q") || "", units = params.get("units") === "cm" ? "cm" : "in";
  const set = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [name, value] of Object.entries(updates)) { if (value) next.set(name, value); else next.delete(name); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const requestKey = JSON.stringify([type, draft, minimum, maximum]);
  const [loaded, setLoaded] = useState<{ key: string; response?: MeasurementsQueryResponse; error?: string } | null>(null);
  const [selected, setSelected] = useState<{ key: string; rows: string[] }>({ key: requestKey, rows: [] });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getMeasurements({ measurementType: type === "all" ? undefined : type, draftYear: draft ? Number(draft) : undefined, minWingspan: minimum ? Number(minimum) : undefined, maxWingspan: maximum ? Number(maximum) : undefined, limit: 100 })
      .then(response => { if (!cancelled) setLoaded({ key: requestKey, response }); }).catch(e => { if (!cancelled) setLoaded({ key: requestKey, error: e.message }); });
    return () => { cancelled = true; };
    // requestKey covers every request input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retry]);
  const current = loaded?.key === requestKey ? loaded : null;
  const response = current?.response;
  // Selections outside the current sample are cleared when filters change.
  const picks = selected.key === requestKey ? selected.rows : [];
  const items = useMemo(() => (response?.items ?? []).map((row, position) => ({ ...row, position })).filter(row => row.display_name.toLowerCase().includes(search.toLowerCase()) || row.player_id.includes(search)), [response, search]);
  const length = (value: number | null) => value == null ? "—" : `${(value * (units === "cm" ? 2.54 : 1)).toFixed(2)} ${units}`;
  const points = items.filter(row => row.height_no_shoes_inches != null && row.wingspan_inches != null);
  const heights = points.map(row => row.height_no_shoes_inches!), spans = points.map(row => row.wingspan_inches!);
  const xMin = Math.min(...heights) - 1, xMax = Math.max(...heights) + 1, yMin = Math.min(...spans) - 1, yMax = Math.max(...spans) + 1;
  const spanValues = items.flatMap(row => row.wingspan_inches == null ? [] : [row.wingspan_inches]);
  const ratios = points.map(row => row.wingspan_inches! - row.height_no_shoes_inches!);
  const chosen = items.filter(row => picks.includes(key(row)));
  const filters = <>
    <Field label="Source" layout="inline"><Select aria-label="Measurement source" value={type} onChange={e => set({ type: e.target.value === "all" ? "" : e.target.value })}><option value="all">All measurements</option><option value="combine">Combine only</option><option value="listed">Listed roster only</option></Select></Field>
    <Field label="Draft year" layout="inline"><input aria-label="Draft year" type="number" min="1947" max="2100" value={draft} onChange={e => set({ draftYear: e.target.value })} /></Field>
    <Field label="Wingspan from" layout="inline"><input aria-label="Minimum wingspan (inches)" type="number" min="0" step="0.1" value={minimum} onChange={e => set({ minWingspan: e.target.value })} placeholder="in" /></Field>
    <Field label="to" layout="inline"><input aria-label="Maximum wingspan (inches)" type="number" min="0" step="0.1" value={maximum} onChange={e => set({ maxWingspan: e.target.value })} placeholder="in" /></Field>
    <Field label="Find" layout="inline"><input aria-label="Search returned records" value={search} onChange={e => set({ q: e.target.value })} placeholder="Player name" /></Field>
  </>;
  return <PageShell template="research" className="research-view wingspan-view">
    <PageHeader title="Combine & Wingspan" subtitle="Combine and listed measurements, kept distinct; missing measurements stay unknown." actions={response && <button className="button" disabled={!items.length} onClick={() => downloadResearch("courtlens-measurement-sample.json", { schema: "measurement-sample-v1", scope: { type, draft_year: draft || null, min_wingspan_inches: minimum || null, max_wingspan_inches: maximum || null, search, limit: 100 }, canonical_length_units: "inches", display_length_units: units, weight_units: "pounds", items: items.map(withoutPosition), disclaimer: response.disclaimer })}>Export source-labelled sample JSON</button>} />
    <FilterBar label="Measurement filters" summary={type === "all" ? "All measurements" : type} scope={filters}
      modes={<SegmentedControl name="Length units" value={units} onChange={value => set({ units: value === "cm" ? "cm" : "" })} options={[{ value: "in", label: "Inches" }, { value: "cm", label: "Centimeters" }]} />}
      count={response ? <CountChip>{items.length} records</CountChip> : undefined}
      details={<DataDetailsButton rows={response ? [{ label: "Disclaimer", value: response.disclaimer }, { label: "Bound", value: "At most 100 returned records, ordered by wingspan" }, { label: "Sources", value: [...new Set(items.map(row => row.source_name))].join(", ") || "—", mono: true }] : []} />} />
    {!current && <ResearchBodySkeleton />}
    {current?.error && <div role="alert"><GatedNote tone="warning" action={<button className="button" onClick={() => setRetry(v => v + 1)}>Retry</button>}>Measurements unavailable: {current.error}</GatedNote></div>}
    {response && <ResearchLayout findings={<>
      <StatTile label="Records" value={items.length} footnote={`${new Set(items.map(row => row.player_id)).size} distinct players`} />
      <StatTile label="Median Wingspan" value={length(median(spanValues))} footnote={`${spanValues.length} known wingspans`} />
      <StatTile label="Median Span Over Height" value={ratios.length ? length(median(ratios)) : null} footnote={`${points.length} paired records`} />
    </>}>
      <GatedNote why={<p>At most 100 returned records, ordered by wingspan. Summary, comparison and scatter describe this bounded sample, not the NBA population. Position and active-status filters are unavailable: this response has no verified positional or current-active evidence. Source labels alone do not establish full external-source admission. {response.disclaimer}</p>}>A bounded sample of up to 100 records, not the whole league.</GatedNote>
      <section className="panel research-section" aria-label="Measurement scatter">
        <h2>Wingspan Versus Barefoot Height</h2>
        {points.length > 0 ? <svg className="wingspan-scatter-svg" viewBox="0 0 600 300" role="img" aria-label={`Wingspan versus barefoot height scatter, ${points.length} records`}><line x1="50" y1="250" x2="580" y2="250" stroke="currentColor" /><line x1="50" y1="20" x2="50" y2="250" stroke="currentColor" />{points.map(row => <circle key={key(row)} cx={50 + 530 * (row.height_no_shoes_inches! - xMin) / (xMax - xMin)} cy={250 - 230 * (row.wingspan_inches! - yMin) / (yMax - yMin)} r="5" fill="var(--color-accent)"><title>{row.display_name} · {row.source_name} · height {length(row.height_no_shoes_inches)} · wingspan {length(row.wingspan_inches)}</title></circle>)}<text x="55" y="280" fill="currentColor" fontSize="12">Barefoot height: {length(xMin)} to {length(xMax)}</text><text x="55" y="15" fill="currentColor" fontSize="12">Wingspan: {length(yMin)} to {length(yMax)}</text></svg> : <GatedNote>No paired measurements in this returned sample.</GatedNote>}
        <p className="research-caption">Only paired nonmissing observations are plotted ({points.length} records). Exact values and sources are in the table.</p>
      </section>
      <section className="research-section" aria-label="Measurement records">
        <h2>Measurement Records</h2>
        {items.length ? <div className="table-wrapper research-table" tabIndex={0} role="region" aria-label="Observation table"><table className="data-table"><caption>Select up to two observations to compare</caption><thead><tr><th>Compare</th><th>Player</th><th>Source / Type</th><th>Draft / Pick</th><th className="num">Wingspan</th><th className="num">Barefoot Height</th><th className="num">Shoed Height</th><th className="num">Reach</th><th className="num">Weight</th><th className="num">Reported Ratio</th></tr></thead><tbody>{items.map(row => <tr key={key(row)}><td><input type="checkbox" aria-label={`Compare ${row.display_name} ${row.measurement_type}`} checked={picks.includes(key(row))} disabled={!picks.includes(key(row)) && picks.length >= 2} onChange={e => setSelected({ key: requestKey, rows: e.target.checked ? [...picks, key(row)] : picks.filter(k => k !== key(row)) })} /></td><th scope="row"><Link href={`/players/${row.player_id}`}>{row.display_name}</Link></th><td>{row.source_name} / {row.measurement_type}</td><td>{row.draft_year ?? "—"} / {row.pick_overall == null ? "Unknown pick" : `#${row.pick_overall}`}</td><td className="num">{length(row.wingspan_inches)}</td><td className="num">{length(row.height_no_shoes_inches)}</td><td className="num">{length(row.height_shoes_inches)}</td><td className="num">{length(row.standing_reach_inches)}</td><td className="num">{row.weight_lbs == null ? "—" : `${row.weight_lbs} lb`}</td><td className="num">{row.wingspan_to_height_ratio ?? "—"}</td></tr>)}</tbody></table></div> : <GatedNote>No measurement records in this scope.</GatedNote>}
      </section>
      <section className="panel research-section" aria-label="Measurement comparison">
        <h2>Selected Observations</h2>
        {chosen.length ? <div className="research-compare-picks">{chosen.map(row => <div key={key(row)} className="research-compare-pick">
          <PlayerIdentity playerId={row.player_id} name={row.display_name} subtitle={`${row.source_name} / ${row.measurement_type}`} href={`/players/${row.player_id}`} />
          <dl className="research-facts"><dt>Wingspan</dt><dd>{length(row.wingspan_inches)}</dd><dt>Barefoot height</dt><dd>{length(row.height_no_shoes_inches)}</dd><dt>Shoed height</dt><dd>{length(row.height_shoes_inches)}</dd></dl>
        </div>)}</div> : <p className="research-caption">Select up to two rows in the table.</p>}
        <p className="research-caption">Comparison uses recorded lengths, not an athleticism or player-quality score.</p>
      </section>
    </ResearchLayout>}
  </PageShell>;
}
