import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/finance-import/route";
import { dollarsToCents, financeParams, formatCents, readFinanceParams, financeSizeGroups, filterFinanceContracts, type FinanceContract } from "./finance";
import { buildPreservedContextUrl } from "./query-url";

afterEach(() => vi.unstubAllGlobals());
it("finance import accepts the normalized browser Host and rejects forwarded-host forgery", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: "tracked-job" }));
  vi.stubGlobal("fetch", fetch);
  const request = (origin: string) => new NextRequest("http://localhost:3137/api/finance-import", {
    method: "POST", headers: { host: "127.0.0.1:3137", origin, "x-forwarded-host": "attacker.test" },
    body: JSON.stringify({ bundle_hash: "a".repeat(64) }),
  });
  expect((await POST(request("http://127.0.0.1:3137"))).status).toBe(200);
  expect((await POST(request("http://attacker.test"))).status).toBe(403);
  expect(fetch).toHaveBeenCalledTimes(1);
});
describe("financial context and exact money", () => {
  it("preserves cents beyond JS safe integer and distinguishes null from zero", () => {
    expect(formatCents("900719925474099301")).toBe("$9,007,199,254,740,993.01");
    expect(formatCents(null)).toBe("Unknown"); expect(formatCents("0")).toBe("$0.00");
    expect(dollarsToCents("12000000.01")).toBe(1200000001);
    for (const input of ["", "1e7", "-1", "1.001", "999999999999.99x", "1000000000000"]) expect(() => dollarsToCents(input)).toThrow();
  });
  it("round trips financial context independently of basketball and across navigation", () => {
    const params=new URLSearchParams({season:"2024-25",releaseId:"basketball",finance_book_id:"book",finance_financial_season:"2025-26",finance_known_at:"2026-10-03T10:00:00Z",finance_effective_on:"2025-02-12",finance_amount_kind:"cash",finance_scenario:"include-unexercised-options-v1",finance_statuses:"signed,two_way",finance_player_ids:"1,2"});
    const query=readFinanceParams(params);expect(query.financial_season).toBe("2025-26");expect(query.amount_kind).toBe("cash");
    const encoded=financeParams(query,params);expect(readFinanceParams(encoded)).toEqual(query);expect(encoded.get("season")).toBe("2024-25");
    const link=new URL(buildPreservedContextUrl("/contracts/books",encoded),"http://local");expect(readFinanceParams(link.searchParams)).toEqual(query);
    expect(readFinanceParams(encoded,"1610612761").team_id).toBe("1610612761");
  });
  it("sorts big exact amounts and keeps unknown separate", () => {
    const rows=[{player_id:"1",contract_id:"a",known_amount_cents:null,size_group:"unknown",status:"unknown_review",team_id:null,observations:[]},{player_id:"2",contract_id:"b",known_amount_cents:"900719925474099301",size_group:"big",status:"signed",team_id:"1610612761",observations:[]},{player_id:"3",contract_id:"c",known_amount_cents:"900719925474099302",size_group:"big",status:"signed",team_id:null,observations:[]}].map(row => ({...row,team_status:"unknown",status_scope:"source_book_contract_observation" as const,scenario_amount_cents:null,amount_status:"unknown",derived_aav_usd:null,aav_definition:"reported total / documented years"})) as FinanceContract[];
    expect(filterFinanceContracts(rows,{},"","all","all","amount").map(r=>r.player_id)).toEqual(["3","2","1"]);
    expect(filterFinanceContracts(rows,{},"Toronto","all","all","name").map(r=>r.player_id)).toEqual(["2"]);
    expect(rows).toHaveLength(3);
    expect(financeSizeGroups(rows)).toEqual([{group:"small",contracts:0,known_contracts:0,known_cents:null},{group:"big",contracts:2,known_contracts:2,known_cents:"1801439850948198603"},{group:"unknown",contracts:1,known_contracts:0,known_cents:null}]);
  });
});
describe("operator staged finance import", () => {
  it("rejects cross-origin and arbitrary arguments without forwarding credentials",async () => {
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    for(const [origin,body,status] of [["http://other",{bundle_hash:"a".repeat(64)},403],["http://localhost:3000",{bundle_hash:"../file"},422],["http://localhost:3000",{bundle_hash:"a".repeat(64),jobType:"refresh"},422]] as const) {
      const response=await POST(new NextRequest("http://localhost:3000/api/finance-import",{method:"POST",headers:{origin},body:JSON.stringify(body)}));expect(response.status).toBe(status);
    }expect(fetch).not.toHaveBeenCalled();
  });
  it("returns a tracked job and only the finance allowlisted body",async () => {
    const fetch=vi.fn().mockResolvedValue(Response.json({job_id:"job",status:"queued"},{status:202}));vi.stubGlobal("fetch",fetch);
    const response=await POST(new NextRequest("http://localhost:3000/api/finance-import",{method:"POST",headers:{origin:"http://localhost:3000"},body:JSON.stringify({bundle_hash:"a".repeat(64)})}));
    expect(response.status).toBe(202);expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({jobType:"finance_import",arguments:{bundle_hash:"a".repeat(64)}});expect(await response.text()).not.toContain(fetch.mock.calls[0][1].headers["X-Operator-Token"]);
  });
});
