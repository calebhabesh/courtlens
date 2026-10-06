import { expect, test, type Page } from "@playwright/test";
import type { DurableThreadHeader, DurableTurnRecord, HybridTurnRequest, HybridTurnResponse } from "../lib/assistant-v2.generated";

const hash = "a".repeat(64);
const threadId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const path = "/research/ask";
const scope = (season = "2024-25") => ({ as_of: "2026-10-06", calendar_version: "fixture", calendar_sha256: hash, selections: { season, phase: "regular_season" as const, window: "season" as const, release_id: "retained-release", before_date: "2025-04-15" }, label: `${season} · Regular season · Season to date` });
function answer(request: HybridTurnRequest, overrides: Partial<HybridTurnResponse> = {}): HybridTurnResponse {
  return { request_id: request.request_id, thread_id: request.thread_id!, turn_id: request.request_id, status: "answered", intent: "explanation", blocks: [{kind:"text",origin:"knowledge",text:"A pick and roll pairs a screen with a cut toward the basket."}], sources: [], actions: [], ...overrides };
}
async function mock(page: Page, options: { response?: (request: HybridTurnRequest) => Partial<HybridTurnResponse>; deferred?: boolean; lost?: boolean; paginated?: boolean } = {}) {
  const requests: HybridTurnRequest[] = [];
  const headers: DurableThreadHeader[] = [];
  const records = new Map<string, DurableTurnRecord[]>();
  let release = () => {};
  let firstLost = !!options.lost;
  await page.route("**/api/assistant-v2/**", async route => {
    const request = route.request(); const url = new URL(request.url()); const parts = url.pathname.replace("/api/assistant-v2/", "").split("/");
    const method = request.method();
    if (parts[0] === "threads" && parts.length === 1) {
      if (method === "POST") { const header = { thread_id: threadId(headers.length + 1), title: "New conversation", created_at: "2026-10-06T12:00:00Z", updated_at: "2026-10-06T12:00:00Z" }; headers.push(header); records.set(header.thread_id, []); return route.fulfill({json:header}); }
      if (method === "DELETE") { headers.length = 0; records.clear(); return route.fulfill({json:{cleared:true}}); }
      return route.fulfill({json:{threads:headers,next_cursor:null}});
    }
    if (parts[0] === "threads") {
      const tid = parts[1];
      if (method === "DELETE") { records.delete(tid); headers.splice(headers.findIndex(row => row.thread_id === tid), 1); return route.fulfill({json:{cleared:true}}); }
      if (parts[4] === "cancel") {
        const row = records.get(tid)!.find(row => row.turn_id === parts[3])!;
        row.state = "cancelled"; row.response = answer(row.request, {status:"cancelled",blocks:[{kind:"inability",reason:"cancelled",text:"Stopped this question.",next_action:"You can retry when ready."}]});
        return route.fulfill({json:row});
      }
      const rows = records.get(tid) ?? [];
      const start = Number(url.searchParams.get("cursor") ?? 0);
      const size = options.paginated ? 1 : 100;
      return route.fulfill({json:{thread:headers.find(row => row.thread_id === tid),turns:rows.slice(start,start+size),next_cursor:start+size<rows.length?String(start+size):null}});
    }
    const body = request.postDataJSON() as HybridTurnRequest; requests.push(body);
    let row = records.get(body.thread_id!)!.find(row => row.request.request_id === body.request_id);
    if (!row) {
      row = {thread_id:body.thread_id!,turn_id:body.request_id,request:body,request_sha256:hash,accepted_at:"2026-10-06T12:00:00Z",state:options.deferred?"running":"completed",response:options.deferred?null:answer(body,options.response?.(body))}; records.get(body.thread_id!)!.push(row);
      headers.find(header => header.thread_id === body.thread_id)!.title = body.message;
    }
    if (firstLost) { firstLost = false; return route.fulfill({status:502,json:{detail:"Response lost; check or replay the retained request."}}); }
    if (options.deferred) {
      await new Promise<void>(resolve => { release = resolve; });
      if (row.state !== "cancelled") { row.state = "completed"; row.response = answer(body,options.response?.(body)); }
    }
    return route.fulfill({json:row.response});
  });
  return {requests,headers,records,release:()=>release()};
}
async function send(page: Page, message: string) {
  await page.getByLabel("Your question",{exact:true}).fill(message);
  await page.getByRole("button",{name:"Send question",exact:true}).click();
}

test("standalone defaults, reload, new chat, history and deletion keep durable questions",async({page})=>{
  const state = await mock(page); await page.goto(path); await send(page,"Explain pick and roll");
  await expect(page.getByLabel("Messages")).toContainText("pairs a screen"); expect(state.requests[0].context).toBeUndefined();
  await page.reload(); await expect(page.getByLabel("Messages")).toContainText("Explain pick and roll");
  await page.getByRole("button",{name:"New chat",exact:true}).click(); await expect(page.getByLabel("Messages")).toBeEmpty();
  await send(page,"Explain assists"); await page.getByText("History (2)",{exact:true}).click();
  await page.getByRole("navigation",{name:"Conversation history"}).getByRole("button",{name:/Explain pick and roll/}).click();
  await expect(page.getByLabel("Messages")).toContainText("Explain pick and roll");
  await page.getByRole("button",{name:"Delete chat",exact:true}).click(); await expect(page.getByRole("region",{name:"CourtLens assistant"}).getByRole("alert")).toContainText("Saved findings remain");
  await page.getByRole("button",{name:"Confirm deletion"}).click(); expect(state.records.size).toBe(1);
  await page.getByRole("button",{name:"Clear history",exact:true}).click(); await page.getByRole("button",{name:"Confirm deletion"}).click(); expect(state.records.size).toBe(0);
});

test("scope changes retain old answers and unedited follow-ups inherit on server",async({page})=>{
  await page.route("**/api/workbench/catalog**", route => route.fulfill({json:{default_season:"2025-26",default_phase:"regular_season",seasons:["2024-25","2025-26"],phases:["regular_season"],stats_scopes:[{season:"2025-26",phase:"regular_season",default_before_date:"2026-07-01"}]}}));
  const state = await mock(page,{response:req=>({scope:scope(req.context?.season ?? "2024-25")})});
  await page.goto(`${path}?season=2024-25&releaseId=retained-release`); await send(page,"Show the first period");
  await expect(page.getByLabel("Messages")).toContainText("2024-25");
  await page.getByText("Edit scope for the next question",{exact:false}).click(); await page.getByLabel("Season",{exact:true}).selectOption("2025-26");
  await send(page,"Use this period"); await expect(page.getByLabel("Messages")).toContainText("2025-26");
  expect(state.requests[1].context?.season).toBe("2025-26"); expect(state.requests[1].thread_id).toBe(state.requests[0].thread_id);
  await send(page,"Explain that"); await expect.poll(()=>state.requests.length).toBe(3); expect(state.requests[2].context).toBeUndefined();
  expect(state.records.get(state.requests[0].thread_id!)![0].response?.scope?.selections.season).toBe("2024-25");
});

test("transport replay preserves request identity; intentional retry links a new turn",async({page})=>{
  const state = await mock(page,{lost:true,response:()=>({status:"unable",blocks:[{kind:"inability",reason:"provider_quota",text:"The provider quota is exhausted.",next_action:"Wait before retrying, or open Stats."}]})});
  await page.goto(path); await send(page,"Show observations"); await expect(page.getByRole("region",{name:"CourtLens assistant"}).getByRole("alert")).toContainText("Response lost");
  await expect(page.getByLabel("Your question",{exact:true})).toHaveValue("Show observations");
  await page.getByRole("button",{name:"Check or replay request"}).click(); await expect(page.getByRole("region",{name:"CourtLens assistant"}).getByRole("alert")).toHaveCount(0);
  expect(state.requests[1]).toEqual(state.requests[0]); expect(state.records.get(state.requests[0].thread_id!)!).toHaveLength(1);
  await page.getByRole("button",{name:"Retry question"}).click(); await expect.poll(()=>state.requests.length).toBe(3);
  expect(state.requests[2].request_id).not.toBe(state.requests[0].request_id); expect(state.requests[2].retry_of).toBe(state.requests[0].request_id);
});

test("Stop is durable, releases controls and fences a late response",async({page})=>{
  const state = await mock(page,{deferred:true}); await page.goto(path); await send(page,"Question to stop");
  await expect(page.getByRole("button",{name:"Stop",exact:true})).toBeEnabled(); await page.getByRole("button",{name:"Stop",exact:true}).click();
  await expect(page.getByLabel("Messages")).toContainText("Stopped this question"); await expect(page.getByRole("button",{name:"New chat",exact:true})).toBeEnabled();
  state.release(); await page.reload(); await expect(page.getByLabel("Messages")).toContainText("Stopped this question");
  await expect(page.getByLabel("Messages")).not.toContainText("pairs a screen");
});

test("closing drawer retains pending history and full-page link preserves scope",async({page})=>{
  const state = await mock(page,{deferred:true}); await page.goto(path); await page.getByRole("button",{name:"Ask",exact:true}).click(); const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Your question",{exact:true}).fill("Retain me"); await dialog.getByRole("button",{name:"Send question",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Stop",exact:true})).toBeEnabled(); await expect(dialog.getByRole("link",{name:"Open full research page"})).toHaveAttribute("href","/research/ask");
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); state.release(); await page.reload();
  await expect(page.getByLabel("Messages")).toContainText("Retain me"); await expect(page.getByLabel("Messages")).toContainText("pairs a screen");
});

test("clarifications, external citations and hostile text render safely",async({page})=>{
  const state = await mock(page,{response:req=> req.message==="Which season?"?{status:"clarification_required",blocks:[{kind:"clarification",text:"Choose a season.",choices:["2024-25","2025-26"]}]}:{intent:"external",blocks:[{kind:"external_claim",text:"<script>window.bad=true</script> Source says the season ended.",source_id:"source",locator:"finals",entity:"NBA",metric:"completion",value:"June",unit:"date",period:"2025-26",qualifier:"Source reported",supporting_excerpt:"Finals ended",parser_version:"fixture"}],sources:[{source_id:"source",origin:"external",title:"NBA source",publisher:"NBA",url:"https://www.nba.com/news/finals",updated_on:"2026-06-23",retrieved_at:"2026-10-06T12:00:00Z",period:"2025-26",content_sha256:hash,locator:"finals",excerpt:"Source support",verification:"verified"}],actions:[{kind:"source",label:"Unsafe link",url:"javascript:alert(1)"},{kind:"source",label:"Open source",url:"https://www.nba.com/news/finals"}]}});
  await page.goto(path); await send(page,"Which season?"); await page.getByRole("button",{name:"2025-26",exact:true}).click(); await expect(page.getByLabel("Messages")).toContainText("Source says"); expect(state.requests[1].message).toBe("2025-26");
  await page.getByText("Sources (1)",{exact:true}).click(); await expect(page.getByRole("link",{name:"NBA source",exact:true})).toHaveAttribute("href","https://www.nba.com/news/finals");
  await expect(page.getByLabel("Messages")).toContainText("updated 2026-06-23"); await expect(page.getByRole("link",{name:"Unsafe link"})).toHaveCount(0); expect(await page.evaluate(()=>"bad" in window)).toBe(false);
});

test("paginated turns are loaded without losing earlier questions",async({page})=>{
  const state = await mock(page,{paginated:true}); await page.goto(path); await send(page,"First question"); await expect(page.getByLabel("Messages")).toContainText("First question");
  await send(page,"Second question"); await expect(page.getByLabel("Messages")).toContainText("Second question"); await page.reload(); await expect(page.getByRole("button",{name:"Load newer turns"})).toBeVisible(); await expect(page.getByRole("button",{name:"Send question",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Load newer turns"}).click(); await expect(page.getByLabel("Messages")).toContainText("Second question"); expect(state.records.size).toBe(1);
});

for (const [name,width,height,zoom] of [["wide",2560,1440,1],["desktop",1440,900,1],["mobile",375,812,1],["zoom-equivalent",1440,900,2]] as const) {
  test(`threaded ${name} layout, keyboard dialog and screenshot`,async({page})=>{
    await mock(page); await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:"reduce"}); await page.goto(path);
    if (zoom===2) await page.setViewportSize({width:width/2,height:height/2});
    await send(page,"Explain pick and roll"); await expect(page.getByLabel("Messages")).toContainText("pairs a screen"); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`threaded-${name}.png`),fullPage:true});
    await page.getByRole("button",{name:"Ask",exact:true}).click(); await expect(page.getByRole("dialog").getByLabel("Messages")).toContainText("pairs a screen");
    await page.keyboard.press("Escape"); await expect(page.getByRole("button",{name:"Ask",exact:true})).toBeFocused();
  });
}

test("typing a next question during execution preserves the new draft", async ({page}) => {
  const state = await mock(page,{deferred:true}); await page.goto(path); await send(page,"First question");
  await expect(page.getByRole("button",{name:"Stop",exact:true})).toBeEnabled();
  await page.getByLabel("Your question",{exact:true}).fill("Next question draft"); state.release();
  await expect(page.getByRole("button",{name:"Send question",exact:true})).toBeEnabled();
  await expect(page.getByLabel("Your question",{exact:true})).toHaveValue("Next question draft");
});

test("verified local results preserve zero, unknown, scope and equivalent actions",async({page})=>{
  await mock(page,{response:()=>({intent:"local_analysis",scope:scope(),saveable:true,blocks:[{kind:"local_summary",operation_hash:hash,text:"The selected observations are shown below with their sample and scope."},{kind:"result",result:{step_id:"manual",operation:"query",operation_version:"fixture",arguments:{},operation_hash:hash,result_hash:hash,data:{},rows:[{player_name:"Scottie Barnes",points:0},{player_name:"Unknown sample",points:null}],evidence:[],open_url:"/stats?season=2024-25",eligible_count:2,limitations:["Available cohort only"]}}],actions:[{kind:"executed_operation",label:"Open in Stats",url:"/stats?season=2024-25",operation_hash:hash}]})});
  await page.goto(path); await send(page,"Show local observations"); await page.getByText("View supporting results",{exact:true}).click();
  const table=page.getByRole("region",{name:"query data table",exact:true}); await expect(table).toContainText("Unknown"); await expect(table).toContainText("0");
  await expect(page.getByRole("link",{name:"Open in Stats"}).first()).toHaveAttribute("href","/stats?season=2024-25");
  await expect(page.getByLabel("Messages")).toContainText("Chat history is retained separately"); await expect(page.getByLabel("Messages")).toContainText("2024-25");
});

test("default assistant and manual entry are available without preview selection",async({page})=>{
  await mock(page); await page.goto('/research/ask'); await send(page,'Explain pick and roll');
  await expect(page.getByLabel('Messages')).toContainText('pairs a screen');
  await page.getByRole('link',{name:'Open manual research',exact:true}).click();
  await expect(page.getByLabel('Run manually without AI')).toBeVisible();
});

test("page and drawer share updates, preserve independent drafts and clear together",async({page})=>{
  await mock(page); await page.goto(path); await send(page,'First question');
  await page.getByLabel('Your question',{exact:true}).fill('Page draft');
  await page.getByRole('button',{name:'Ask',exact:true}).click(); const dialog=page.getByRole('dialog'); const main=page.locator('.workbench-content');
  await dialog.getByLabel('Your question',{exact:true}).fill('Drawer question');
  await dialog.getByRole('button',{name:'Send question',exact:true}).click();
  await expect(dialog.getByLabel('Messages')).toContainText('Drawer question');
  await page.keyboard.press('Escape'); await expect(main.getByLabel('Messages')).toContainText('Drawer question');
  await expect(main.getByLabel('Your question',{exact:true})).toHaveValue('Page draft');
  await page.getByRole('button',{name:'Ask',exact:true}).click();
  await dialog.getByRole('button',{name:'Clear history',exact:true}).click();
  await dialog.getByRole('button',{name:'Confirm deletion'}).click();
  await expect(dialog.getByLabel('Messages')).toBeEmpty();
  await page.keyboard.press('Escape'); await expect(main.getByLabel('Messages')).toBeEmpty();
  await expect(main.getByLabel('Your question',{exact:true})).toHaveValue('Page draft');
});

for (const [reason,text] of [['provider_disabled','The language planner is disabled.'],['provider_quota','The provider quota is exhausted.'],['provider_busy','The provider is busy.'],['provider_timeout','The provider timed out.'],['malformed_output','The provider returned an invalid plan.'],['external_unavailable','The source could not be reached.'],['external_stale','A current claim could not be verified.'],['backend_failure','The analytical backend could not complete this query.']] as const) {
  test(`${reason} retains history and retry creates a linked attempt`,async({page})=>{
    const state=await mock(page,{response:()=>({status:'unable',blocks:[{kind:'inability',reason,text,next_action:'Retry later, or use manual research.'}]})});
    await page.goto(path); await send(page,'Preserve my question');
    await expect(page.getByLabel('Messages')).toContainText(text); await page.reload();
    await expect(page.getByLabel('Messages')).toContainText('Preserve my question');
    await page.getByRole('button',{name:'Retry question'}).click();
    await expect.poll(()=>state.requests.length).toBe(2);
    expect(state.requests[1].retry_of).toBe(state.requests[0].request_id);
  });
}

test("browser history scope changes update only the next request",async({page})=>{
  const state=await mock(page,{response:req=>({scope:scope(req.context?.season ?? '2024-25')})});
  await page.goto(`${path}?season=2024-25`); await send(page,'Original season');
  await expect(page.getByLabel('Messages')).toContainText('2024-25');
  await page.evaluate(()=>{ history.pushState(null,'','/research/ask?season=2025-26&phase=regular_season'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('Edit scope for the next question',{exact:false}).click();
  await expect(page.getByLabel('Season',{exact:true})).toHaveValue('2025-26');
  await send(page,'Updated selection');await expect.poll(()=>state.requests.length).toBe(2);
  expect(state.requests[1].context?.season).toBe('2025-26');
  expect(state.records.get(state.requests[0].thread_id!)![0].response?.scope?.selections.season).toBe('2024-25');
});
