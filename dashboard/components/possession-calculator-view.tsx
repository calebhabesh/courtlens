"use client";
import { useState } from "react";
import { downloadResearch, flowDefaults, flowLabels, flowSensitivities, flowVersion, possessionFlow, type FlowInputs } from "@/lib/advanced-research";
import { FilterBar } from "./ui/filter-bar";
import { DataDetailsButton } from "./ui/data-details";
import { GatedNote } from "./ui/gated-note";
import { PageShell, ResearchLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { Button } from "./ui/kit";

const defaults = () => Object.fromEntries(Object.entries(flowDefaults).map(([key, v]) => [key, String(v)])) as Record<keyof FlowInputs, string>;
const CATEGORY = { two: "2P", three: "3P", ft: "FT" } as const;

/** Hypothetical Calculator on the Research template: user assumptions in, an accounting scenario out. */
export function PossessionCalculatorView() {
  const [inputs, setInputs] = useState(defaults);
  const values = Object.fromEntries(Object.entries(inputs).map(([key, v]) => [key, v.trim() ? Number(v) : NaN])) as FlowInputs;
  let result: ReturnType<typeof possessionFlow> | null = null;
  let error = "";
  try { result = possessionFlow(values); } catch (e) { error = (e as Error).message; }
  const scenario = result;
  return <PageShell template="research" className="research-view calculator-view">
    <PageHeader title="Hypothetical Calculator" subtitle="Offensive rating from your own possession assumptions; nothing here is observed data." actions={<>
      <Button size="lg" onClick={() => setInputs(defaults())}>Reset Hypothetical Defaults</Button>
      {scenario && <Button size="lg" variant="primary" onClick={() => downloadResearch("courtlens-hypothetical-flow.json", { model: flowVersion, classification: "hypothetical_design_model", source: "user_assumptions", inputs: values, result: scenario, sensitivities: flowSensitivities(values) })}>Export Scenario JSON</Button>}
    </>} />
    <FilterBar collapsible={false} label="Calculator model" summary="Hypothetical model" scope={<span className="research-scope-label">Independent repeated-chance design model · user assumptions</span>}
      details={<DataDetailsButton rows={[{ label: "Model", value: flowVersion, mono: true }, { label: "Classification", value: "Hypothetical design model" }, { label: "Source", value: "User assumptions" }]}>
        <section className="ui-data-details-section"><h3 className="ui-data-details-heading">Flow definition</h3><pre className="research-document">s = (1−t) × (2×p2×m2 + 3×p3×m3 + 2×pft×mft){"\n"}q = (1−t) × r × (p2×(1−m2) + p3×(1−m3) + pft×(1−mft)){"\n"}PPP = s / (1−q); ORTG = 100 × PPP</pre></section>
      </DataDetailsButton>} />
    <ResearchLayout findings={<>
      <StatTile label="Offensive Rating" value={scenario ? scenario.ortg.toFixed(2) : null} footnote="Points per 100 possessions" />
      <StatTile label="Points per Possession" value={scenario ? scenario.ppp.toFixed(4) : null} />
      <StatTile label="Score per Chance (s)" value={scenario ? scenario.s.toFixed(4) : null} />
      <StatTile label="Recovery Continuation (q)" value={scenario ? scenario.q.toFixed(4) : null} />
    </>}>
      <div className="research-grid">
        <section className="panel research-section" aria-label="Probability assumptions">
          <h2>Probability Assumptions</h2>
          {(Object.keys(flowLabels) as Array<keyof FlowInputs>).map(key => <label className="research-input" key={key}>{flowLabels[key]} <input type="number" min="0" max="1" step="0.01" value={inputs[key]} onChange={e => setInputs({ ...inputs, [key]: e.target.value })} /></label>)}
        </section>
        <section className="panel research-section" aria-label="Scenario output">
          <h2>Scenario Output</h2>
          {error && <div role="alert"><GatedNote tone="warning">{error}</GatedNote></div>}
          {scenario && <>
            <p className="research-caption">{scenario.ortg.toFixed(2)} ORTG · {scenario.ppp.toFixed(4)} expected points per possession.</p>
            <h3>Scoring Contributions per 100 Possessions</h3>
            {Object.entries(scenario.components).map(([key, value]) => <div className="allocation-row" key={key}><span>{CATEGORY[key as keyof typeof CATEGORY]}</span><meter min="0" max={scenario.s || 1} value={value}>{value}</meter><strong className="num">{(100 * value / (1 - scenario.q)).toFixed(2)}</strong></div>)}
            <h3>Finite-difference sensitivities</h3>
            <div className="table-wrapper research-table" role="region" aria-label="Sensitivities" tabIndex={0}><table className="data-table"><caption>ORTG change for +1 percentage point, other inputs fixed</caption><thead><tr><th>Input increased</th><th>Category decreased</th><th className="num">ORTG change</th></tr></thead><tbody>{flowSensitivities(values).map(row => <tr key={row.key}><th scope="row">{flowLabels[row.key]}</th><td>{row.offset ? flowLabels[row.offset] : "None"}</td><td className="num">{row.delta == null ? "—" : row.delta.toFixed(3)}</td></tr>)}</tbody></table></div>
          </>}
        </section>
      </div>
      <GatedNote why={<>
        <p>After a per-chance turnover, select a 2P attempt, 3P attempt or two-FT trip. Category probabilities sum to one. A missed terminal attempt continues with the common recovery probability r. For free throws, recovery refers to the final attempt. Category changes exchange probability with the indicated category. Invalid boundary changes stay unavailable.</p>
        <p>Turnover and recovery probabilities use this model’s chance denominators. They cannot be filled directly with box-score TOV%, FTR or ORB%. Event-specific FT/2P/3P recoveries, and-one trips, technical free throws, lineup impact and opponent adjustments are unavailable in this version.</p>
        <p>The scenario is an accounting exercise under independent repeated chances; it is not a validated prediction or causal estimate.</p>
      </>}>An accounting scenario under your assumptions, not a prediction.</GatedNote>
    </ResearchLayout>
  </PageShell>;
}
