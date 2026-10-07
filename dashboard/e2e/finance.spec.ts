import { expect, test, type Page } from "@playwright/test";
import { waitForStreamedPage } from "./workbench-navigation";
import fs from "node:fs";
import path from "node:path";

const evidence=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"../docs/evidence/b29-finance-query.json"),"utf8"));
const retained=evidence.cases.corrected.result;
const bookId=retained.context.book_id;
const known=retained.context.known_at;
const initial=`/contracts?finance_book_id=${bookId}&finance_financial_season=2025-26&finance_known_at=${encodeURIComponent(known)}&finance_effective_on=2025-02-12&finance_team_id=1610612761&season=2024-25`;
async function mock(page:Page, variant="retained") {
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

test("retained historical terms stay unknown, drawer sources and financial context survive navigation",async({page}) => {
  await mock(page);await page.goto(initial);await waitForStreamedPage(page);
  const result=page.getByRole("region",{name:"Financial query result"});await expect(result).toContainText("USD 40000000");await expect(result).toContainText("Historical reconstruction");
  await expect(result).toContainText("cap / tax / apron status pending");await expect(result).toContainText("Unknown");
  await page.getByRole("button",{name:"Brandon Ingram",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("reported total / documented years");
  await expect(page.getByRole("dialog").getByRole("link").first()).toHaveAttribute("href",/^https:/);
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.getByRole("button",{name:"Brandon Ingram",exact:true})).toBeFocused();
  await page.getByRole("navigation",{name:"Finance views"}).getByRole("link",{name:"Free agency",exact:true}).click();
  await expect(page.getByRole("heading",{level:1})).toContainText("source-book tracker");expect(new URL(page.url()).searchParams.get("season")).toBe("2024-25");
  await expect(page.getByLabel("Financial season",{exact:true})).toHaveValue("2025-26");await expect(page.getByRole("region",{name:"Financial query result"})).toContainText("40000000");
  await page.reload();await expect(page.getByRole("region",{name:"Financial query result"})).toContainText("40000000");
});

test("filters, as-of emptiness and changed context hide stale totals",async({page}) => {
  await mock(page);await page.goto(initial);await waitForStreamedPage(page);const result=page.getByRole("region",{name:"Financial query result"});await expect(result).toBeVisible();
  await page.getByLabel("Search player, team, or source note").fill("no match");await expect(result).toContainText("No represented contracts match");await page.getByLabel("Search player, team, or source note").fill("Ingram");await expect(result.getByRole("button",{name:"Brandon Ingram"})).toBeVisible();
  await page.getByLabel("Status scope").selectOption("unsigned");await expect(result).toHaveCount(0);await page.getByRole("button",{name:"Run financial query"}).click();await expect(result).toContainText("0 filtered");
  await page.getByLabel("Known at (UTC / explicit offset)").fill("2025-02-12T00:00:00Z");await expect(result).toHaveCount(0);await page.getByRole("button",{name:"Run financial query"}).click();await expect(result).toContainText("does not establish unsigned status");
});

test("option scenario stays separate from reported money and groups",async({page}) => {
  await mock(page,"scenario");await page.goto(initial);await waitForStreamedPage(page);await expect(page.getByRole("region",{name:"Financial query result"})).toBeVisible();
  await page.getByLabel("Option scenario",{exact:true}).selectOption("include-unexercised-options-v1");await page.getByRole("button",{name:"Run financial query"}).click();
  await expect(page.getByRole("complementary",{name:"Hypothetical option scenario"})).toContainText("$12,000,000.01");
  await expect(page.getByRole("group",{name:"Reported amount coverage"})).toContainText("Unknown");await expect(page.getByRole("region",{name:"Contracts and status table"})).toContainText("unknown");
});

test("query rejection has retry, and book chooser never silently chooses newest",async({page}) => {
  await mock(page);await page.goto("/contracts");await expect(page.getByLabel("Explicit book UUID")).toHaveValue("");await expect(page.getByRole("region",{name:"Financial query result"})).toHaveCount(0);
  await page.route("**/api/workbench/operations/finance",r=>r.fulfill({status:503,json:{detail:"Book integrity unavailable"}}));await page.goto(initial);await waitForStreamedPage(page);
  await expect(page.getByRole("alert").filter({hasText:"Finance unavailable"})).toContainText("Book integrity unavailable");
  await page.unroute("**/api/workbench/operations/finance");await mock(page);await page.getByRole("button",{name:"Retry query"}).click();await expect(page.getByRole("region",{name:"Financial query result"})).toContainText("40000000");
});

test("mobile and landscape table/drawer preserve keyboard access without body overflow",async({page}) => {
  await mock(page);await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:"reduce"});await page.goto(initial);await waitForStreamedPage(page);await expect(page.getByRole("region",{name:"Financial query result"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Brandon Ingram",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath("finance-mobile.png"),fullPage:true});await page.keyboard.press("Escape");await page.setViewportSize({width:812,height:375});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("Refresh staged import returns a tracked job and exposes failed worker state",async({page}) => {
  await mock(page);await page.route("**/api/finance-import",r => {expect(r.request().postDataJSON()).toEqual({bundle_hash:"a".repeat(64)});return r.fulfill({status:202,json:{job_id:"job-finance",status:"queued",stage:"queued",output_refs:{}}});});
  await page.route("**/api/jobs/job-finance",r=>r.fulfill({json:{job_id:"job-finance",status:"failed",stage:"finance_import",error_summary:"Staged bundle not found",output_refs:{}}}));
  await page.goto("/free-agency");await page.getByText("Refresh / import / correction workflow",{exact:true}).click();await page.getByLabel("Operator-staged bundle SHA-256").fill("a".repeat(64));await page.getByRole("button",{name:"Refresh staged import"}).click();
  await expect(page.getByRole("status").filter({hasText:"job-finance"})).toContainText("queued");await page.getByRole("button",{name:"Check import job"}).click();await expect(page.getByRole("status").filter({hasText:"job-finance"})).toContainText("Staged bundle not found");
});

test("embedded Stats uses a separate basketball season and retains its resolved release",async({page}) => {
  await mock(page);
  await page.route("**/api/workbench/players/1627742?*",r => {
    const params=new URL(r.request().url()).searchParams;expect(params.get("season")).toBe("2024-25");expect(params.get("beforeDate")).toBe("2025-04-15");
    return r.fulfill({json:{context:{release_id:"basketball-release",season:"2024-25",phase:"regular_season",before_date:"2025-04-15",},summaries:{season:{gp:12,points:18,minutes:null}},warnings:[]}});
  });
  await page.goto(initial);await waitForStreamedPage(page);await page.getByRole("button",{name:"Brandon Ingram",exact:true}).click();
  const dialog=page.getByRole("dialog");await dialog.getByLabel("Basketball exclusive cutoff").fill("2025-04-15");await dialog.getByRole("button",{name:"Load player Stats"}).click();
  await expect(dialog.getByRole("region",{name:"Embedded player Stats"})).toContainText("Basketball season 2024-25");await expect(dialog.getByRole("region",{name:"Embedded player Stats"})).toContainText("basketball-release");await expect(dialog).toContainText("Financial season 2025-26");
  await dialog.getByLabel("Basketball season",{exact:true}).fill("2023-24");await expect(dialog.getByRole("region",{name:"Embedded player Stats"})).toHaveCount(0);
});

test("a delayed old financial response cannot replace a newer financial context",async({page}) => {
  await mock(page);let releaseOld:()=>void=()=>{};
  await page.route("**/api/workbench/operations/finance",async r => {
    const query=r.request().postDataJSON();const data=structuredClone(retained);data.context=query;
    if(query.financial_season==="2025-26") await new Promise<void>(resolve=>{releaseOld=resolve;});
    await r.fulfill({json:data}).catch(()=>{});
  });
  await page.goto(initial);await waitForStreamedPage(page);await page.getByLabel("Financial season",{exact:true}).fill("2024-25");await page.getByRole("button",{name:"Run financial query"}).click();
  await expect(page.getByRole("region",{name:"Financial query result"})).toContainText("financial 2024-25");releaseOld();
  await expect(page.getByRole("region",{name:"Financial query result"})).toContainText("financial 2024-25");
});
