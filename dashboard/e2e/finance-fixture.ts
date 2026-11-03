import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const evidence=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"../docs/evidence/b29-finance-query.json"),"utf8"));
export const retained=evidence.cases.corrected.result;
export const bookId=retained.context.book_id;
export const known=retained.context.known_at;
export const initial=`/contracts/books?finance_book_id=${bookId}&finance_financial_season=2025-26&finance_known_at=${encodeURIComponent(known)}&finance_effective_on=2025-02-12&finance_team_id=1610612761&season=2024-25&beforeDate=2025-04-15`;
export async function mockFinance(page:Page, variant="retained") {
  await page.route("**/api/workbench/operations/finance/books",r => r.fulfill({json:[{book_id:bookId,book_sha256:retained.book_sha256,parent_book_id:"original",created_at:known,coverage_note:retained.coverage_note}]}));
  await page.route(`**/api/workbench/operations/finance/books/${bookId}`,r => r.fulfill({json:{book_id:bookId,book_sha256:retained.book_sha256,parent_book_id:"original",created_at:known,coverage_note:retained.coverage_note,financial_seasons:["2025-26"],latest_observed_at:known,player_labels:{"1627742":"Brandon Ingram"},label_scope:"Identity display labels only"}}));
  await page.route("**/api/workbench/operations/finance",async r => {
    const query=r.request().postDataJSON(); const data=structuredClone(retained); data.context=query;
    if(query.known_at.startsWith("2025")) {data.contracts=[];data.timeline=[];data.filtered_contract_count=0;data.subtotal.expected_book_contracts=0;data.subtotal.unknown_contracts=0;}
    if(query.statuses.includes("unsigned")){data.contracts=[];data.timeline=[];data.filtered_contract_count=0;data.subtotal.expected_book_contracts=0;data.subtotal.unknown_contracts=0;data.status_groups_filtered=Object.fromEntries(Object.keys(data.status_groups_filtered).map(s=>[s,0]));}
    if(variant==="scenario" && query.scenario!=="reported-v1") {data.subtotal.scenario_subtotal_cents="1200000001";data.subtotal.scenario_contracts=1;data.contracts[0].scenario_amount_cents="1200000001";}
    await r.fulfill({json:data});
  });
}

// Contracts (alignment row 14): real responses captured from the local API on 2026-10-19 (DEN, TOR).
const contracts=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"e2e/fixtures/contracts-v2.json"),"utf8"));
export const contractsRefresh=contracts.refreshes[0].refresh_id as string;
export async function mockContracts(page:Page) {
  await page.route("**/api/workbench/operations/finance/refreshes?*",r => r.fulfill({json:contracts.refreshes}));
  await page.route(`**/api/workbench/operations/finance/refreshes/${contractsRefresh}/teams/*`,r => {
    const team=new URL(r.request().url()).pathname.split("/").at(-1)!;
    return contracts.teams[team] ? r.fulfill({json:contracts.teams[team]}) : r.fulfill({status:422,json:{detail:"unknown NBA team"}});
  });
}

// Free Agency (row 14): the sealed NBA.com tracker as the local API served it on 2026-10-19.
const freeAgency=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"e2e/fixtures/free-agency-v1.json"),"utf8"));
export async function mockFreeAgency(page:Page, configured=true) {
  // The roster and Wikipedia lines turn stale a day after their runs; pin "now" to two hours after the later one.
  const newest = Math.max(Date.parse(freeAgency.roster_index.observed_at), Date.parse(freeAgency.moves.observed_at));
  await page.clock.setFixedTime(new Date(newest + 2 * 3600 * 1000));
  await page.route("**/api/workbench/operations/free-agency",r => r.fulfill({json:configured ? freeAgency : {status:"not_configured",source:freeAgency.source,limitations:freeAgency.limitations}}));
}

// Roster Shapes v2 (alignment row 12): the real responses captured from the local API, by season.
const shapes=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"e2e/fixtures/roster-shapes-v2.json"),"utf8"));
const shapeHistory=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"e2e/fixtures/roster-shapes-history.json"),"utf8"));
export async function mockRosterShapes(page:Page) {
  await page.route("**/api/workbench/roster-shapes/history*",r => r.fulfill({json:shapeHistory}));
  await page.route("**/api/workbench/roster-shapes*",r => r.fulfill({json:shapes[new URL(r.request().url()).searchParams.get("season") ?? "2026-27"]}));
}
