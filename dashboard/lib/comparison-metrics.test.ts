import { describe, expect, it } from "vitest";
import { comparisonRows, customMetricKeys, formatComparisonValue } from "./comparison-metrics";
import type { MetricDefinition, PlayerComparisonResponse } from "./types";
const catalog = [{key:"pts",display_name:"Total Points",unit:"points",good_direction:"high"},{key:"pts_per_game",display_name:"Points Per Game",unit:"points",good_direction:"high"},{key:"ts_pct",display_name:"True Shooting",unit:"percentage",good_direction:"high"}] as MetricDefinition[];
const comparison = {player_a:{id:"a",games_played:2},player_b:{id:"b",games_played:3},aligned_metrics:[{metric:"pts_per_game",value_a:0,value_b:null,n_a:2,n_b:0,unit:"points"},{metric:"pts",value_a:12,value_b:18,n_a:2,n_b:3,unit:"points"}]} as PlayerComparisonResponse;
describe("PC04 comparison units and persisted custom metrics",()=>{
  it("keeps confirmed zero, missing and field-valid counts distinct",()=>{expect(comparisonRows(["pts"],"per_game",comparison,catalog)[0]).toMatchObject({value_a:0,value_b:null,diff:null,n_a:2,n_b:0});});
  it("uses actual registered totals instead of multiplying per-game values",()=>{expect(comparisonRows(["pts"],"raw",comparison,catalog)[0]).toMatchObject({value_a:12,value_b:18,diff:-6});});
  it("does not label a per-game value as a possession rate",()=>{expect(comparisonRows(["pts"],"per_75",comparison,catalog)[0]).toMatchObject({value_a:null,value_b:null,diff:null});});
  it("keeps an explicitly selected rate independent of the counting toggle",()=>{expect(comparisonRows(["pts_per_game"],"raw",comparison,catalog)[0].value_a).toBe(0);});
  it("deduplicates and bounds custom picks, removes unregistered keys and preserves empty selections",()=>{expect(customMetricKeys("pts,unknown,pts,ts_pct",catalog)).toEqual(["pts","ts_pct"]);expect(customMetricKeys("",catalog)).toEqual([]);expect(customMetricKeys(Array.from({length:30},(_,i)=>`m${i}`).join(","),Array.from({length:30},(_,i)=>({key:`m${i}`} as MetricDefinition)))).toHaveLength(25);});
  it("formats ratios from their registered fractional unit, even above 100%",()=>{expect(formatComparisonValue(1.2,"ratio")).toBe("120.0%");expect(formatComparisonValue(null,"percentage")).toBe("—");});
});
