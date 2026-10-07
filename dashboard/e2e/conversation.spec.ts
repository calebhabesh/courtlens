import { expect, test, type Page } from "@playwright/test";
import { waitForStreamedPage } from "./workbench-navigation";
import { researchDestination, type Result, type Turn, type TurnRequest } from "../lib/conversation";
async function openPage(page: Page, url: string) { await page.goto(url); await waitForStreamedPage(page); }
const context={release_id:"retained-release",season:"2024-25",phase:"regular_season",before_date:"2025-04-15",window:"last_10"};
const hash="a".repeat(64);
function result(operation="distribution",args:Record<string,unknown>={player_id:"1630567",metric:"pts",window_n:20}):Result {
  return {step_id:"manual",operation,operation_version:"v1",arguments:args,operation_hash:hash,result_hash:hash,data:{samples:[{value:0},{value:null},{value:28}]},rows:[{player_name:"Scottie Barnes",value:0,n:20},{player_name:"Unknown sample",value:null,n:0}],evidence:[{evidence_id:hash,result_hash:hash,operation_hash:hash,operation_version:"v1",context_fingerprint:hash,entity_id:"1630567",row_identity:"/samples/0",path:"/samples/0/value",metric:"pts",metric_version:"basketball-v2",unit:"points",value:0,sample:{n:20},input_identity:context,null_reason:null}],open_url:researchDestination({step_id:"a",operation,arguments:args},context),eligible_count:2,limitations:["Descriptive observations; no injury inference"]};
}
function answer(request:TurnRequest,overrides:Partial<Turn>={}):Turn {return {schema_version:"courtload-conversation-v1",status:"answered",conversation_id:"11111111-1111-4111-8111-111111111111",turn_id:request.request_id,context,context_fingerprint:hash,interpretation:"Executed the pinned operation",plan:request.plan??{steps:[{step_id:"a",operation:"distribution",arguments:{player_id:"1630567",metric:"pts"}}]},results:[result()],choices:[],limitations:[],manifest:{result_hash:hash},accounting:{provider_calls:0},...overrides};}
async function mock(page:Page,configured=false,handler?:(req:TurnRequest)=>Partial<Turn>) {
  const requests:TurnRequest[]=[];const cleared:string[]=[];
  await page.route("**/api/workbench/assistant/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith("/status")) return route.fulfill({json:{configured,model:"fixture",privacy_notice:"Provider-held records are independent",setup_instructions:"Set a server-side key"}});
    if(path.endsWith("/operations")) return route.fulfill({json:[{name:"distribution",description:"Empirical observations with valid samples",parameters:{type:"object"}}]});
    if(route.request().method()==="DELETE") {cleared.push(path);return route.fulfill({json:{cleared:true}});}
    const req=route.request().postDataJSON() as TurnRequest;requests.push(req);return route.fulfill({json:answer(req,handler?.(req))});
  });
  return {requests,cleared};
}
const ask="/research/ask?experience=manual&releaseId=retained-release&season=2024-25&beforeDate=2025-04-15&window=last_10";
const panelPage = ask.replace("/research/ask", "/players/23");
test("AI disabled manual paired distributions preserve zero, unknown and exact evidence",async({page})=>{
  const calls=await mock(page);await openPage(page,ask);await expect(page.getByText("AI disabled · manual research available")).toBeVisible();
  await page.getByLabel("Research operation",{exact:true}).selectOption("distribution");await page.getByLabel("Include a minutes distribution with the same window").check();await page.getByRole("button",{name:"Run manual operation"}).click();
  await expect(page.getByRole("region",{name:"distribution data table"})).toContainText("Unknown");expect(calls.requests[0].plan?.steps).toHaveLength(2);expect(calls.requests[0].context).toEqual(context);
  await page.getByText("Definitions, inputs and exact evidence (1 cells)").click();await expect(page.getByRole("region",{name:"distribution evidence table"})).toContainText("1630567");await expect(page.getByRole("region",{name:"distribution evidence table"})).toContainText("points");
  await page.getByRole("button",{name:"Clear conversation"}).click();await expect.poll(()=>calls.cleared.length).toBe(1);await expect(page.getByLabel("Release",{exact:true})).toBeEnabled();
});
test("natural follow-ups and canonical identity choices retain conversation fingerprints",async({page})=>{
  const calls=await mock(page,true,req=> req.message==="Which Williams?" && !req.clarification_choice ? {status:"clarification_required",results:[],choices:[{value:"canonical-1",label:"Williams · NBA identity 1"},{value:"canonical-2",label:"Williams · NBA identity 2"}]}:{});
  await openPage(page,ask);await expect(page.getByText("AI configured · fixture")).toBeVisible();await page.getByLabel("Research question",{exact:true}).fill("Which Williams?");await page.getByRole("button",{name:"Ask CourtLens",exact:true}).click();await page.getByRole("button",{name:"Williams · NBA identity 2"}).click();
  expect(calls.requests[1].clarification_choice).toBe("canonical-2");expect(calls.requests[1].context_fingerprint).toBe(hash);expect(calls.requests[1].conversation_id).toBe(calls.requests[0].conversation_id??"11111111-1111-4111-8111-111111111111");
  await page.getByLabel("Follow-up question",{exact:true}).fill("Use at least 300 minutes");await page.getByRole("button",{name:"Ask CourtLens",exact:true}).click();await expect(page.getByText("You:", {exact:false})).toHaveCount(3);expect(calls.requests[2].context).toEqual(context);expect(calls.requests[2].plan).toBeUndefined();await expect(page.getByLabel("Release",{exact:true})).toBeDisabled();
});
test("quota, unsupported and empty states preserve question and manual execution",async({page})=>{
  await mock(page,true,req=>req.plan ? {status:"no_data",results:[],interpretation:"No outcomes admitted"}:{status:"quota_exceeded",results:[],interpretation:"Wait for quota cooldown",limitations:["Retry after 60 seconds"]});await openPage(page,ask);await expect(page.getByText("AI configured · fixture")).toBeVisible();await page.getByLabel("Research question",{exact:true}).fill("Show observations");await page.getByRole("button",{name:"Ask CourtLens",exact:true}).click();await expect(page.getByText("AI quota reached",{exact:false}).first()).toBeVisible();await expect(page.getByLabel("Follow-up question",{exact:true})).toHaveValue("Show observations");await page.getByLabel("Run manually without AI").check();await page.getByRole("button",{name:"Run manual operation"}).click();await expect(page.getByText("No outcomes admitted",{exact:false})).toBeVisible();
});
test("network retry reuses the request identity",async({page})=>{
  const calls=await mock(page);let first=true;let failed:TurnRequest|undefined;
  await page.route("**/assistant/turn",async route=>{const req=route.request().postDataJSON() as TurnRequest;if(first){first=false;failed=req;return route.fulfill({status:503,json:{detail:"Temporarily unavailable"}});}calls.requests.push(req);return route.fulfill({json:answer(req)});});
  await openPage(page,ask);await expect(page.getByText("AI disabled · manual research available")).toBeVisible();await page.getByRole("button",{name:"Run manual operation"}).click();await expect(page.getByRole("alert").filter({hasText:"Temporarily unavailable"})).toContainText("Temporarily unavailable");await page.getByRole("button",{name:"Retry this request"}).click();await expect(page.getByRole("region",{name:"distribution data table"})).toBeVisible();expect(calls.requests[0]).toEqual(failed);
});
test("exact Research destination retains a saveable turn and clears on client navigation",async({page})=>{
  const calls=await mock(page);const args={player_id:"1630567",metric:"min_per_game",window_n:17,from_date:"2025-01-01",release_id:context.release_id,phase:"regular_season",before_date:context.before_date,season:context.season};
  await openPage(page,researchDestination({step_id:"a",operation:"distribution",arguments:args},context));await expect(page.getByRole("region",{name:"distribution data table"})).toBeVisible();expect(calls.requests[0].plan?.steps[0].arguments).toEqual(args);expect(calls.requests[0].context).toEqual(context);expect(calls.cleared).toHaveLength(0);await page.reload();await expect(page.getByRole("region",{name:"distribution data table"})).toBeVisible();await page.getByRole("link",{name:"Stats",exact:true}).first().click();await expect.poll(()=>calls.cleared.length).toBeGreaterThanOrEqual(1);
});
test("drawer traps keyboard focus, escapes, and supports narrow reduced-motion layout",async({page})=>{
  await mock(page);await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:"reduce"});await openPage(page,panelPage);await page.getByRole("button",{name:"Ask",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Research conversation"});await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Close research conversation"})).toBeFocused();await page.keyboard.press("Shift+Tab");expect(await page.evaluate(()=>!!document.activeElement?.closest("dialog"))).toBe(true);await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(page.getByRole("button",{name:"Ask",exact:true})).toBeFocused();
  await openPage(page,ask);await page.getByRole("button",{name:"Run manual operation"}).click();await expect(page.getByRole("region",{name:"distribution data table"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole("region",{name:"distribution data table"}).focus();await expect(page.getByRole("region",{name:"distribution data table"})).toBeFocused();await page.screenshot({path:test.info().outputPath("conversation-mobile.png"),fullPage:true});await page.setViewportSize({width:812,height:375});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("unmounted pending answer is discarded and its local state is cleared",async({page})=>{
  const calls=await mock(page);let release=()=>{};await page.route("**/assistant/turn",async route=>{await new Promise<void>(resolve=>{release=resolve;});return route.fulfill({json:answer(route.request().postDataJSON() as TurnRequest)});});await openPage(page,panelPage);await page.getByRole("button",{name:"Ask",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Run manual operation"}).click();await expect(dialog.getByRole("button",{name:"Investigating…"})).toBeVisible();await dialog.getByRole("button",{name:"Close research conversation"}).click();release();await expect.poll(()=>calls.cleared.length).toBe(1);await expect(page.getByRole("region",{name:"distribution data table"})).toHaveCount(0);
});

for (const [status,label] of [["unsupported","Capability unavailable"],["insufficient_sample","Too few observations"],["timeout","Investigation timed out"],["provider_error","AI temporarily unavailable"],["busy","Another investigation is running"]] as const) {
  test(`${status} preserves manual alternatives and entered question`,async({page})=>{
    await mock(page,true,()=>({status,results:[],interpretation:"Selected capability cannot answer this turn"}));await openPage(page,ask);await expect(page.getByText("AI configured · fixture")).toBeVisible();await page.getByLabel("Research question",{exact:true}).fill("Investigate this capability");await page.getByRole("button",{name:"Ask CourtLens",exact:true}).click();await expect(page.getByRole("status").filter({hasText:label})).toBeVisible();await expect(page.getByLabel("Follow-up question",{exact:true})).toHaveValue("Investigate this capability");await expect(page.getByLabel("Run manually without AI")).toBeEnabled();
  });
}
test("proposed context needs an explicit new conversation",async({page})=>{
  const calls=await mock(page,true,()=>({status:"clarification_required",results:[],plan:{status:"clarification_required",steps:[],context_changes:{season:"2023-24",before_date:"2024-04-15"}},interpretation:"Confirm the requested context"}));await openPage(page,ask);await expect(page.getByText("AI configured · fixture")).toBeVisible();await page.getByLabel("Research question",{exact:true}).fill("Use the prior season");await page.getByRole("button",{name:"Ask CourtLens",exact:true}).click();await expect(page.getByLabel("Season",{exact:true})).toHaveValue("2024-25");await page.getByRole("button",{name:"Use proposed context in a new conversation"}).click();await expect(page.getByLabel("Season",{exact:true})).toHaveValue("2023-24");await expect(page.getByLabel("Season",{exact:true})).toBeEnabled();await expect(page.getByLabel("Release",{exact:true})).toHaveValue("");expect(calls.requests).toHaveLength(1);expect(calls.cleared).toHaveLength(1);
});
