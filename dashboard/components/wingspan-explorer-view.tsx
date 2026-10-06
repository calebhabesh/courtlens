"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMeasurements } from "@/lib/workbench-api";
import { downloadResearch } from "@/lib/advanced-research";
import type { MeasurementsQueryResponse } from "@/lib/types";

export function WingspanExplorerView() {
  const [type, setType] = useState("all"); const [draft, setDraft] = useState("");
  const [minimum, setMinimum] = useState(""); const [maximum, setMaximum] = useState("");
  const [search, setSearch] = useState(""); const [units, setUnits] = useState("in");
  const [response, setResponse] = useState<MeasurementsQueryResponse | null>(null);
  const [error, setError] = useState(""); const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getMeasurements({measurementType:type === "all" ? undefined : type,draftYear:draft ? Number(draft) : undefined,minWingspan:minimum ? Number(minimum) : undefined,maxWingspan:maximum ? Number(maximum) : undefined,limit:100})
      .then(value => { if (!cancelled) setResponse(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => {cancelled = true;};
  }, [type,draft,minimum,maximum]);
  const items = useMemo(() => (response?.items ?? []).filter(row => row.display_name.toLowerCase().includes(search.toLowerCase()) || row.player_id.includes(search)), [response,search]);
  const key = (row: MeasurementsQueryResponse["items"][number]) => `${row.player_id}-${row.measurement_type}-${row.source_name}`;
  const length = (value: number | null) => value == null ? "—" : `${(value*(units === "cm" ? 2.54 : 1)).toFixed(2)} ${units}`;
  const points = items.filter(row => row.height_no_shoes_inches != null && row.wingspan_inches != null);
  const heights = points.map(row => row.height_no_shoes_inches!); const spans = points.map(row => row.wingspan_inches!);
  const xMin = Math.min(...heights)-1, xMax = Math.max(...heights)+1, yMin = Math.min(...spans)-1,yMax = Math.max(...spans)+1;
  return <div className="advanced-research"><h1>Measurements &amp; wingspan explorer</h1><p>Combine and listed observations remain distinct. Missing measurements stay unknown.</p>
    <div className="panel research-links"><label>Measurement source<select value={type} onChange={e => {setResponse(null);setError("");setSelected([]);setType(e.target.value);}}><option value="all">All measurements</option><option value="combine">Combine only</option><option value="listed">Listed roster only</option></select></label>
      <label>Draft year<input type="number" min="1947" max="2100" value={draft} onChange={e => {setResponse(null);setError("");setSelected([]);setDraft(e.target.value);}} /></label>
      <label>Minimum wingspan (inches)<input type="number" min="0" step="0.1" value={minimum} onChange={e => {setResponse(null);setError("");setSelected([]);setMinimum(e.target.value);}} /></label>
      <label>Maximum wingspan (inches)<input type="number" min="0" step="0.1" value={maximum} onChange={e => {setResponse(null);setError("");setSelected([]);setMaximum(e.target.value);}} /></label>
      <label>Search returned records<input value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Length units<select value={units} onChange={e => setUnits(e.target.value)}><option value="in">Inches</option><option value="cm">Centimeters</option></select></label>
    </div>
    <p className="notice">At most 100 returned records, ordered by wingspan. Summary, comparison and scatter describe this bounded sample, not the NBA population. Position and active-status filters are unavailable: this response has no verified positional or current-active evidence. Source labels alone do not establish full external-source admission.</p>
    {error && <p role="alert">Measurements unavailable: {error}</p>}{!response && !error && <p role="status">Loading measurements…</p>}
    {!error && response && <><p>{items.length} returned measurement records · {new Set(items.map(row => row.player_id)).size} distinct players. {response.disclaimer}</p>
      <section className="panel" aria-label="Measurement scatter"><h2>Wingspan versus barefoot height</h2><p>Only paired nonmissing observations are plotted ({points.length} records). Exact values and sources are in the table.</p>
        {points.length > 0 ? <svg viewBox="0 0 600 300" role="img" aria-label={`Wingspan versus barefoot height scatter, ${points.length} records`} style={{width:"100%",maxWidth:700}}><line x1="50" y1="250" x2="580" y2="250" stroke="currentColor"/><line x1="50" y1="20" x2="50" y2="250" stroke="currentColor"/>{points.map(row => <circle key={key(row)} cx={50+530*(row.height_no_shoes_inches!-xMin)/(xMax-xMin)} cy={250-230*(row.wingspan_inches!-yMin)/(yMax-yMin)} r="5" fill="var(--accent)"><title>{row.display_name} · {row.source_name} · height {length(row.height_no_shoes_inches)} · wingspan {length(row.wingspan_inches)}</title></circle>)}<text x="55" y="280" fill="currentColor" fontSize="12">Barefoot height: {length(xMin)} to {length(xMax)}</text><text x="55" y="15" fill="currentColor" fontSize="12">Wingspan: {length(yMin)} to {length(yMax)}</text></svg> : <p>No paired measurements in this returned sample.</p>}
      </section>
      <section className="panel"><h2>Measurement records</h2><p>Select up to two observations for a source-aware comparison.</p><div className="table-wrapper" tabIndex={0} role="region" aria-label="Measurement records"><table className="data-table"><thead><tr><th>Compare</th><th>Player</th><th>Source / type</th><th>Draft / pick</th><th>Wingspan</th><th>Barefoot height</th><th>Shoed height</th><th>Reach</th><th>Weight</th><th>Reported ratio</th></tr></thead><tbody>{items.map(row => <tr key={key(row)}><td><input type="checkbox" aria-label={`Compare ${row.display_name} ${row.measurement_type}`} checked={selected.includes(key(row))} disabled={!selected.includes(key(row)) && selected.length >= 2} onChange={e => setSelected(e.target.checked ? [...selected,key(row)] : selected.filter(k => k !== key(row)))} /></td><th><Link href={`/players/${row.player_id}`}>{row.display_name}</Link></th><td>{row.source_name} / {row.measurement_type}</td><td>{row.draft_year ?? "—"} / {row.pick_overall == null ? "Unknown pick" : `#${row.pick_overall}`}</td><td>{length(row.wingspan_inches)}</td><td>{length(row.height_no_shoes_inches)}</td><td>{length(row.height_shoes_inches)}</td><td>{length(row.standing_reach_inches)}</td><td>{row.weight_lbs == null ? "—" : `${row.weight_lbs} lb`}</td><td>{row.wingspan_to_height_ratio ?? "—"}</td></tr>)}</tbody></table></div>{!items.length && <p>No measurement records in this scope.</p>}
        <button className="button" disabled={!items.length} onClick={() => downloadResearch("courtlens-measurement-sample.json", {schema:"measurement-sample-v1",scope:{type,draft_year:draft || null,min_wingspan_inches:minimum || null,max_wingspan_inches:maximum || null,search,limit:100},canonical_length_units:"inches",display_length_units:units,weight_units:"pounds",items,disclaimer:response.disclaimer})}>Export source-labelled sample JSON</button>
      </section>
      <section className="panel" aria-label="Measurement comparison"><h2>Selected observations</h2>{items.filter(row => selected.includes(key(row))).map(row => <p key={key(row)}>{row.display_name} · {row.source_name} / {row.measurement_type} · wingspan {length(row.wingspan_inches)} · barefoot height {length(row.height_no_shoes_inches)} · shoed height {length(row.height_shoes_inches)}</p>)}<p>Comparison uses recorded lengths, not an athleticism or player-quality score. Selections outside the current sample are cleared when filters change.</p></section>
    </>}
  </div>;
}
