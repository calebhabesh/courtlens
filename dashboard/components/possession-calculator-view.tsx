"use client";
import { useState } from "react";
import { downloadResearch, flowDefaults, flowLabels, flowSensitivities, flowVersion, possessionFlow, type FlowInputs } from "@/lib/advanced-research";

export function PossessionCalculatorView() {
  const [inputs, setInputs] = useState<Record<keyof FlowInputs, string>>(() => Object.fromEntries(Object.entries(flowDefaults).map(([key,v]) => [key, String(v)])) as Record<keyof FlowInputs, string>);
  const values = Object.fromEntries(Object.entries(inputs).map(([key,v]) => [key, v.trim() ? Number(v) : NaN])) as FlowInputs;
  let result: ReturnType<typeof possessionFlow> | null = null;
  let error = "";
  try { result = possessionFlow(values); } catch (e) { error = (e as Error).message; }
  return <div className="advanced-research"><h1>Hypothetical offensive rating calculator</h1>
    <p><code>{flowVersion}</code> · independent repeated-chance design model. All defaults and edits are hypothetical user assumptions.</p>
    <div className="research-grid"><section className="panel"><h2>Probability assumptions</h2>
      {(Object.keys(flowLabels) as Array<keyof FlowInputs>).map(key => <label className="research-input" key={key}>{flowLabels[key]} <input type="number" min="0" max="1" step="0.01" value={inputs[key]} onChange={e => setInputs({...inputs, [key]: e.target.value})} /></label>)}
      <button className="button" onClick={() => setInputs(Object.fromEntries(Object.entries(flowDefaults).map(([key,v]) => [key,String(v)])) as Record<keyof FlowInputs,string>)}>Reset hypothetical defaults</button>
    </section><section className="panel" aria-label="Scenario output"><h2>Scenario output</h2>
      {error && <p role="alert">{error}</p>}
      {result && <><p className="stat-value">{result.ortg.toFixed(2)} ORTG</p><p>Expected points per possession: {result.ppp.toFixed(4)}. Score per chance s: {result.s.toFixed(4)}. Recovery continuation q: {result.q.toFixed(4)}.</p>
        <h3>Scoring contributions per 100 possessions</h3>{Object.entries(result.components).map(([key,value]) => <div className="allocation-row" key={key}><span>{key === "two" ? "2P" : key === "three" ? "3P" : "FT"}</span><meter min="0" max={result!.s || 1} value={value}>{value}</meter><strong>{(100*value/(1-result!.q)).toFixed(2)}</strong></div>)}
        <h3>Finite-difference sensitivities</h3><p>ORTG change for +1 percentage point, holding other inputs fixed. Category changes exchange probability with the indicated category. Invalid boundary changes stay unavailable.</p>
        <div className="table-wrapper"><table className="data-table"><thead><tr><th>Input increased</th><th>Category decreased</th><th>ORTG change</th></tr></thead><tbody>{flowSensitivities(values).map(row => <tr key={row.key}><th>{flowLabels[row.key]}</th><td>{row.offset ? flowLabels[row.offset] : "None"}</td><td>{row.delta == null ? "—" : row.delta.toFixed(3)}</td></tr>)}</tbody></table></div>
        <button className="button" onClick={() => downloadResearch("courtlens-hypothetical-flow.json", {model: flowVersion, classification: "hypothetical_design_model", source: "user_assumptions", inputs: values, result, sensitivities: flowSensitivities(values)})}>Export scenario JSON</button>
      </>}
    </section></div>
    <section className="panel"><h2>Flow definition and limits</h2><p>After a per-chance turnover, select a 2P attempt, 3P attempt or two-FT trip. Category probabilities sum to one. A missed terminal attempt continues with the common recovery probability r. For free throws, recovery refers to the final attempt.</p>
      <pre className="research-document">s = (1−t) × (2×p2×m2 + 3×p3×m3 + 2×pft×mft){"\n"}q = (1−t) × r × (p2×(1−m2) + p3×(1−m3) + pft×(1−mft)){"\n"}PPP = s / (1−q); ORTG = 100 × PPP</pre>
      <p>Turnover and recovery probabilities use this model’s chance denominators. They cannot be filled directly with box-score TOV%, FTR or ORB%. Event-specific FT/2P/3P recoveries, and-one trips, technical free throws, lineup impact and opponent adjustments are unavailable in this version. The scenario is an accounting exercise under independent repeated chances; it is not a validated prediction or causal estimate.</p>
    </section>
  </div>;
}
