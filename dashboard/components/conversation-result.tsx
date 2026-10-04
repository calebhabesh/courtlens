"use client";

import Link from "next/link";
import { displayValue, tableRow, type Result } from "@/lib/conversation";

export function ConversationResult({ result }: {result: Result}) {
  const metric = typeof result.arguments.metric === "string" ? result.arguments.metric : null;
  const title = result.operation.replaceAll("_", " ") + (metric ? ` · ${metric.replaceAll("_", " ")}` : "");
  const unit = result.evidence.find(cell => cell.metric === metric && cell.unit !== "observations")?.unit;
  const args = result.arguments;
  const scope = result.operation === "workload_shifts" ? `Last ${args.period_n} versus previous ${args.period_n} appearances; at least ${args.min_minutes} minutes across both windows.`
    : result.operation === "distribution" ? `Last ${args.window_n} appearances; ${args.from_date ?? "season start"} through ${args.to_date ?? "the exclusive cutoff"}.`
    : result.operation === "similarity" ? `${args.window} profile; at least ${args.min_appearances} appearances and ${args.min_minutes} minutes. Dimensions: ${Array.isArray(args.dimensions) ? args.dimensions.join(", ") : "registered defaults"}.`
    : result.operation === "compare_periods" ? args.mode === "appearances" ? `${args.period_a_n} recent versus ${args.period_b_n} prior disjoint appearances.` : `${args.period_a_from}–${args.period_a_to} versus ${args.period_b_from}–${args.period_b_to}.`
    : result.operation === "splits" ? `${args.split_type} splits; ${args.from_date ?? "season start"} through ${args.to_date ?? "the exclusive cutoff"}.`
    : null;
  const hasSummary = result.operation === "distribution" && result.data.summary != null && typeof result.data.summary === "object";
  const hasTarget = result.operation === "similarity" && result.data.target != null && typeof result.data.target === "object";
  const summary = hasSummary ? result.data.summary as Record<string, unknown> : null;
  const target = hasTarget ? result.data.target as Record<string, unknown> : null;
  const rows = (hasSummary || hasTarget ? result.rows.slice(1) : result.rows).map(row => tableRow(row));
  const priorities = result.operation === "workload_shifts" ? ["player name","delta minutes","delta points","recent · minutes","prior · minutes","recent · points","prior · points","recent · n","prior · n"]
    : result.operation === "distribution" ? ["game date","value","minutes","team tricode","opponent tricode","is home","game id"]
    : result.operation === "similarity" ? ["player name","distance","overlapping dimensions count","games played","total minutes","player id"] : [];
  const allColumns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const columns = [...priorities.filter(key => allColumns.includes(key)), ...allColumns.filter(key => !priorities.includes(key))];
  const tableValue = (value: unknown) => typeof value === "number" ? value.toLocaleString("en-US", {maximumFractionDigits: 4}) : displayValue(value);
  const samples = result.operation === "distribution" && Array.isArray(result.data.samples) ? result.data.samples as Record<string, unknown>[] : [];
  const valid = samples.flatMap((row, index) => typeof row.value === "number" && Number.isFinite(row.value) ? [{value: row.value, index}] : []);
  const min = Math.min(0, ...valid.map(p => p.value));
  const max = Math.max(1, ...valid.map(p => p.value));
  const safeUrl = result.open_url?.startsWith("/") && !result.open_url.startsWith("//") && !result.open_url.includes("\\") ? result.open_url : null;
  return <section className="conversation-result" aria-label={`${result.operation} result`}>
    <div className="conversation-row"><h3>{title}</h3><span>{rows.length} data rows{result.eligible_count != null ? ` · ${result.eligible_count} eligible` : ""}</span></div>
    {scope && <p className="text-muted">{scope}</p>}
    {summary && <><p>{String(result.data.player_name)} · {String(result.data.metric_display_name)} ({String(result.data.metric_unit)})</p>{summary.reason != null && <p>{displayValue(summary.reason)}</p>}<dl className="conversation-summary">{Object.entries(summary).filter(([key])=>!["summary_available","reason"].includes(key)).map(([key,value])=><div key={key}><dt>{key.replaceAll("_"," ")}</dt><dd title={displayValue(value)}>{tableValue(value)}</dd></div>)}</dl></>}
    {target && <><p>Target: {String(target.player_name)} · {String(target.games_played)} appearances · {String(target.total_minutes)} minutes</p><details><summary>Target profile and cohort definitions</summary><pre>{JSON.stringify({target,cohort:result.data.cohort},null,2)}</pre></details></>}
    {valid.length > 0 && <figure><svg viewBox="0 0 600 120" role="img" aria-label="Observed distribution values; exact samples in the table below" className="conversation-plot"><text x="0" y="12" fill="currentColor" fontSize="12">{max}</text><text x="0" y="119" fill="currentColor" fontSize="12">{min}</text>{valid.map(p => <circle key={p.index} cx={12 + p.index / Math.max(1, samples.length - 1) * 576} cy={108 - (p.value-min)/(max-min)*96} r="3" fill="var(--accent)" />)}</svg><figcaption>Historical {metric ?? "metric"} samples{unit ? ` (${unit})` : ""} in returned order. Missing values are omitted from the plot and remain unknown in the table.</figcaption></figure>}
    <div role="region" aria-label={`${result.operation} data table${metric ? ` · ${metric}` : ""}`} tabIndex={0} className="conversation-table"><table className="data-table"><caption>Server-computed {title} results{unit ? ` (${unit})` : ""}</caption><thead><tr>{columns.map(key => <th scope="col" key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map(key => <td key={key} title={displayValue(row[key])}>{row[key] === undefined ? "—" : tableValue(row[key])}</td>)}</tr>)}</tbody></table></div>
    <p className="text-muted text-xs">Table decimals display up to four places; hover or open exact evidence for returned precision.</p>
    {result.limitations.length > 0 && <ul>{result.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>}
    <div className="conversation-row">{safeUrl && <Link className="button button-small" href={safeUrl}>{safeUrl.startsWith("/research/") ? "Open in Research" : safeUrl.startsWith("/stats") ? "Open in Stats" : "Open equivalent view"}</Link>}<span className="text-muted">Result {result.result_hash.slice(0, 12)}</span></div>
    <details><summary>Definitions, inputs and exact evidence ({result.evidence.length} cells)</summary><p>Operation version: {result.operation_version}</p><pre>{JSON.stringify(result.arguments, null, 2)}</pre><div className="conversation-table" role="region" aria-label={`${result.operation} evidence table`} tabIndex={0}><table className="data-table"><thead><tr>{["Entity / path", "Metric / unit", "Value", "Sample / inputs", "Evidence ID"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{result.evidence.map(cell => <tr key={cell.evidence_id}><td>{cell.entity_id}<br />{cell.path}</td><td>{cell.metric} · {cell.unit}<br />{cell.metric_version}</td><td>{displayValue(cell.value)}{cell.null_reason && <p>{cell.null_reason}</p>}</td><td>{JSON.stringify(cell.sample)}<details><summary>Retained inputs</summary><pre>{JSON.stringify(cell.input_identity, null, 2)}</pre></details></td><td><code>{cell.evidence_id}</code></td></tr>)}</tbody></table></div></details>
  </section>;
}
