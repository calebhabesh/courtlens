import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const evidence=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"../docs/evidence/b29-finance-query.json"),"utf8"));
export const retained=evidence.cases.corrected.result;
export const bookId=retained.context.book_id;
export const known=retained.context.known_at;
export const initial=`/contracts?finance_book_id=${bookId}&finance_financial_season=2025-26&finance_known_at=${encodeURIComponent(known)}&finance_effective_on=2025-02-12&finance_team_id=1610612761&season=2024-25&beforeDate=2025-04-15`;
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
