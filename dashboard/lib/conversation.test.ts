import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayValue, pinnedContext, readResearchDestination, researchDestination, statusLabels, tableRow } from "./conversation";
const context = {release_id:"retained",season:"2024-25",phase:"playoffs",before_date:"2025-04-15",window:"last_10"};
describe("exact research operation navigation", () => {
  it.each(["distribution","similarity","compare_periods","splits","workload_shifts"])("preserves all %s arguments and independent context", operation=>{
    const args = {dimensions:["pts_per_36","ts_pct"],top_k:7,min_minutes:300,from_date:null,mode:"date_range",period_a_from:"2025-01-01",period_b_to:"2025-04-14",metric:"min_per_game"};
    const url = researchDestination({step_id:"a",operation,arguments:args},context);
    const decoded = readResearchDestination(new URL(url,"http://local").searchParams);
    expect(decoded.context).toEqual(context);expect(decoded.step.arguments).toEqual(args);expect(decoded.step.operation).toBe(operation);
    expect(researchDestination(decoded.step,decoded.context)).toBe(url);
  });
  it.each(["operation=shell&arguments={}", "operation=distribution&arguments=[]", "operation=distribution&arguments={}", "operation=distribution&arguments=bad"])("rejects invalid links %s", query=>expect(()=>readResearchDestination(new URLSearchParams(query))).toThrow());
  it("only copies actual context inputs",()=>expect(pinnedContext({...context,dataset_id:"sealed",api_key:"never",accounting:5})).toEqual(context));
  it("preserves null, zero and exact financial precision",()=>{expect(displayValue(null)).toBe("Unknown");expect(displayValue(0)).toBe("0");expect(displayValue("10000000001")).toBe("10000000001");});
});

const schema = JSON.parse(readFileSync(new URL("../../docs/design/conversational-analytics-v1.schema.json", import.meta.url), "utf8"));
it("offers every typed server status from the frozen schema", () => {
  expect(Object.keys(statusLabels).sort()).toEqual(schema.response.properties.status.enum.toSorted());
});
it("renders nested server quantities with their field labels without losing nulls or precision", () => {
  expect(tableRow({player_name:"Observed",recent:{points:0,minutes:null},salary:"10000000001"})).toEqual({"player name":"Observed","recent · points":0,"recent · minutes":null,salary:"10000000001"});
});
