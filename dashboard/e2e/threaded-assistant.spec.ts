import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DurableThreadHeader, DurableTurnRecord, HybridTurnRequest, HybridTurnResponse } from "../lib/assistant-v2.generated";

import { waitForStreamedPage } from "./workbench-navigation";

async function openPage(page: Page, url: string) {
  await page.goto(url);
  await waitForStreamedPage(page);
}
async function reloadPage(page: Page) {
  await page.reload();
  await waitForStreamedPage(page);
}

const hash = "a".repeat(64);
const threadId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const path = "/research/ask";
const playerPage = "/players/23?season=2025-26";
const scope = (season = "2024-25") => ({ as_of: "2026-10-06", calendar_version: "fixture", calendar_sha256: hash, selections: { season, phase: "regular_season" as const, window: "season" as const, release_id: "retained-release", before_date: "2025-04-15" }, label: `${season} · Regular season · Season to date` });
function answer(request: HybridTurnRequest, overrides: Partial<HybridTurnResponse> = {}): HybridTurnResponse {
  return { request_id: request.request_id, thread_id: request.thread_id!, turn_id: request.request_id, status: "answered", intent: "explanation", blocks: [{kind:"text",origin:"knowledge",text:"A pick and roll pairs a screen with a cut toward the basket."}], sources: [], actions: [], ...overrides };
}
// Must match e2e/mock-api.mjs, which serves the paced AR05 event stream through the real proxy.
const streamedNarrative = "Fixture Guard led the 2025-26 regular season with 9.1 assists per game.";
async function mock(page: Page, options: { response?: (request: HybridTurnRequest) => Partial<HybridTurnResponse>; deferred?: boolean; lost?: boolean; paginated?: boolean; stream?: boolean } = {}) {
  const requests: HybridTurnRequest[] = [];
  const streams: HybridTurnRequest[] = [];
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
    if (parts[0] === "turn" && parts[1] === "stream") {
      const body = request.postDataJSON() as HybridTurnRequest; streams.push(body);
      // Without the stream option the route is unavailable and the client must fall back.
      if (!options.stream) return route.fulfill({status:404,json:{detail:"Unknown assistant route"}});
      const row: DurableTurnRecord = {thread_id:body.thread_id!,turn_id:body.request_id,request:body,request_sha256:hash,accepted_at:"2026-10-06T12:00:00Z",state:"running",response:null};
      records.get(body.thread_id!)!.push(row); headers.find(header => header.thread_id === body.thread_id)!.title = body.message;
      // The backend publishes before sending final. Chromium reports an intercepted stream the
      // page stopped reading after final as aborted, so either outcome marks the row retained.
      const retain = (ended: typeof request) => { if (ended === request) { row.state = "completed"; row.response = answer(body,{intent:"local_analysis",blocks:[{kind:"narrative",checker:"narrative-check-v1",text:streamedNarrative,operation_hashes:[hash]}]}); } };
      page.on("requestfinished", retain); page.on("requestfailed", retain);
      return route.continue();
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
  return {requests,streams,headers,records,release:()=>release()};
}
// React temporarily stages streamed HTML outside <main> before reveal. Scope chat interactions
// to the active page; the whole-document count below verifies that staging also settles.
const live = (scope: Page | Locator) => "goto" in scope ? scope.locator("#content") : scope;
const messages = (scope: Page | Locator) => live(scope).getByLabel("Messages");
const composer = (scope: Page | Locator) => live(scope).getByLabel("Your question", { exact: true });
const openScope = (page: Page) => live(page).locator("summary",{hasText:"Edit scope for the next question"}).click();
async function send(page: Page, message: string) {
  await composer(page).fill(message);
  await page.getByRole("button",{name:"Send question",exact:true}).click();
}

test("standalone defaults, reload, new chat, history and deletion keep durable questions",async({page})=>{
  const state = await mock(page); await openPage(page, path); await send(page,"Explain pick and roll");
  await expect(messages(page)).toContainText("pairs a screen"); expect(state.requests[0].context).toBeUndefined();
  await reloadPage(page); await expect(messages(page)).toContainText("Explain pick and roll");
  await expect(page.getByLabel("Messages",{exact:true})).toHaveCount(1);
  await page.getByRole("button",{name:"New chat",exact:true}).click(); await expect(messages(page)).toBeEmpty();
  await send(page,"Explain assists");
  await page.getByRole("navigation",{name:"Conversation history"}).getByRole("button",{name:/Explain pick and roll/}).click();
  await expect(messages(page)).toContainText("Explain pick and roll");
  await page.getByRole("button",{name:"Delete chat",exact:true}).click(); await expect(page.getByRole("region",{name:"CourtLens assistant"}).getByRole("alert")).toContainText("Saved findings remain");
  await page.getByRole("button",{name:"Confirm deletion"}).click(); await expect.poll(()=>state.records.size).toBe(1);
  // AR06 moved clearing all history and the privacy notice to Settings.
  await expect(page.getByRole("button",{name:"Clear history"})).toHaveCount(0);
  await page.getByRole("link",{name:"History and privacy settings"}).click(); const settings = page.getByRole("region",{name:"Assistant history and privacy"});
  await expect(settings).toContainText("History stays in this local installation");
  await settings.getByRole("button",{name:"Clear history",exact:true}).click(); await settings.getByRole("button",{name:"Confirm deletion"}).click();
  await expect(settings.getByRole("status")).toContainText("deleted"); expect(state.records.size).toBe(0);
});

test("scope changes retain old answers and unedited follow-ups inherit on server",async({page})=>{
  await page.route("**/api/workbench/catalog**", route => route.fulfill({json:{default_season:"2025-26",default_phase:"regular_season",seasons:["2024-25","2025-26"],phases:["regular_season"],stats_scopes:[{season:"2025-26",phase:"regular_season",default_before_date:"2026-07-01"}]}}));
  const state = await mock(page,{response:req=>({scope:scope(req.context?.season ?? "2024-25")})});
  await openPage(page, `${path}?season=2024-25&releaseId=retained-release`); await send(page,"Show the first period");
  await expect(messages(page)).toContainText("2024-25");
  await openScope(page); await page.getByLabel("Season",{exact:true}).selectOption("2025-26");
  await send(page,"Use this period"); await expect(messages(page)).toContainText("2025-26");
  expect(state.requests[1].context?.season).toBe("2025-26"); expect(state.requests[1].thread_id).toBe(state.requests[0].thread_id);
  await send(page,"Explain that"); await expect.poll(()=>state.requests.length).toBe(3); expect(state.requests[2].context).toBeUndefined();
  expect(state.records.get(state.requests[0].thread_id!)![0].response?.scope?.selections.season).toBe("2024-25");
});

test("transport replay preserves request identity; intentional retry links a new turn",async({page})=>{
  const state = await mock(page,{lost:true,response:()=>({status:"unable",blocks:[{kind:"inability",reason:"provider_quota",text:"The provider quota is exhausted.",next_action:"Wait before retrying, or open Stats."}]})});
  await openPage(page, path); await send(page,"Show observations"); await expect(page.getByRole("region",{name:"CourtLens assistant"}).getByRole("alert")).toContainText("Response lost");
  await expect(composer(page)).toHaveValue("Show observations");
  await page.getByRole("button",{name:"Check or replay request"}).click(); await expect(page.getByRole("region",{name:"CourtLens assistant"}).getByRole("alert")).toHaveCount(0);
  await expect.poll(()=>state.requests.length).toBe(2); expect(state.requests[1]).toEqual(state.requests[0]); expect(state.records.get(state.requests[0].thread_id!)!).toHaveLength(1);
  await page.getByRole("button",{name:"Retry question"}).click(); await expect.poll(()=>state.requests.length).toBe(3);
  expect(state.requests[2].request_id).not.toBe(state.requests[0].request_id); expect(state.requests[2].retry_of).toBe(state.requests[0].request_id);
});

test("Stop is durable, releases controls and fences a late response",async({page})=>{
  const state = await mock(page,{deferred:true}); await openPage(page, path); await send(page,"Question to stop");
  await expect(page.getByRole("button",{name:"Stop",exact:true})).toBeEnabled(); await page.getByRole("button",{name:"Stop",exact:true}).click();
  await expect(messages(page)).toContainText("Stopped this question"); await expect(page.getByRole("button",{name:"New chat",exact:true})).toBeEnabled();
  state.release(); await reloadPage(page); await expect(messages(page)).toContainText("Stopped this question");
  await expect(messages(page)).not.toContainText("pairs a screen");
});

test("closing drawer retains pending history and full-page link preserves scope",async({page})=>{
  const state = await mock(page,{deferred:true}); await openPage(page, playerPage); await page.getByRole("button",{name:"Ask",exact:true}).click(); const dialog = page.getByRole("dialog");
  await composer(dialog).fill("Retain me"); await dialog.getByRole("button",{name:"Send question",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Stop",exact:true})).toBeEnabled(); await expect(dialog.getByRole("link",{name:"Open full research page"})).toHaveAttribute("href",/\/research\/ask\?.*season=2025-26/);
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); state.release(); await openPage(page, path);
  await expect(messages(page)).toContainText("Retain me"); await expect(messages(page)).toContainText("pairs a screen");
});

test("clarifications, external citations and hostile text render safely",async({page})=>{
  const state = await mock(page,{response:req=> req.message==="Which season?"?{status:"clarification_required",blocks:[{kind:"clarification",text:"Choose a season.",choices:["2024-25","2025-26"]}]}:{intent:"external",blocks:[{kind:"external_claim",text:"<script>window.bad=true</script> Source says the season ended.",source_id:"source",locator:"finals",entity:"NBA",metric:"completion",value:"June",unit:"date",period:"2025-26",qualifier:"Source reported",supporting_excerpt:"Finals ended",parser_version:"fixture"}],sources:[{source_id:"source",origin:"external",title:"NBA source",publisher:"NBA",url:"https://www.nba.com/news/finals",updated_on:"2026-06-23",retrieved_at:"2026-10-06T12:00:00Z",period:"2025-26",content_sha256:hash,locator:"finals",excerpt:"Source support",verification:"verified"}],actions:[{kind:"source",label:"Unsafe link",url:"javascript:alert(1)"},{kind:"source",label:"Open source",url:"https://www.nba.com/news/finals"}]}});
  await openPage(page, path); await send(page,"Which season?"); await page.getByRole("button",{name:"2025-26",exact:true}).click(); await expect(messages(page)).toContainText("Source says"); expect(state.requests[1].message).toBe("2025-26");
  await page.getByText("Sources (1)",{exact:true}).click(); await expect(page.getByRole("link",{name:"NBA source",exact:true})).toHaveAttribute("href","https://www.nba.com/news/finals");
  await expect(messages(page)).toContainText("updated 2026-06-23"); await expect(page.getByRole("link",{name:"Unsafe link"})).toHaveCount(0); expect(await page.evaluate(()=>"bad" in window)).toBe(false);
});

test("paginated turns are loaded without losing earlier questions",async({page})=>{
  const state = await mock(page,{paginated:true}); await openPage(page, path); await send(page,"First question"); await expect(messages(page)).toContainText("First question");
  await send(page,"Second question"); await expect(messages(page)).toContainText("Second question"); await reloadPage(page); await expect(page.getByRole("button",{name:"Load newer turns"})).toBeVisible(); await expect(page.getByRole("button",{name:"Send question",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Load newer turns"}).click(); await expect(messages(page)).toContainText("Second question"); expect(state.records.size).toBe(1);
});

const leaders = Array.from({length:12},(_,i)=>({player_id:String(i),player_name:i===0?"Nikola Jokić":`Fixture Guard ${i}`,team_tricode:"DEN",ast_per_game:Number((10.7-i*0.4).toFixed(1)),games_played:65-i}));
const rich = (): Partial<HybridTurnResponse> => ({ intent:"local_analysis", scope:scope("2025-26"), saveable:true, blocks:[
  {kind:"narrative",checker:"narrative-check-v1",text:"Nikola Jokić led the 2025-26 regular season with 10.7 assists per game across 65 games.",operation_hashes:[hash]},
  {kind:"result",result:{step_id:"s1",operation:"query",operation_version:"fixture",arguments:{metric_selectors:[{key:"ast_per_game"}]},operation_hash:hash,result_hash:hash,data:{},rows:leaders,evidence:[],open_url:"/stats?season=2025-26",eligible_count:12,limitations:[]}}],
  actions:[{kind:"executed_operation",label:"Open in Stats",url:"/stats?season=2025-26",operation_hash:hash}] });

for (const [name,width,height,zoom] of [["wide",2560,1440,1],["desktop",1440,900,1],["mobile",375,812,1],["zoom-equivalent",1440,900,2]] as const) {
  test(`threaded ${name} layout, keyboard dialog and screenshot`,async({page})=>{
    await mock(page,{response:req=>req.message==="Explain pick and roll"?{}:rich()}); await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:"reduce"}); await openPage(page, path);
    if (zoom===2) await page.setViewportSize({width:width/2,height:height/2});
    await expect(page.getByRole("heading",{name:"What do you want to know?"})).toBeVisible();
    await page.screenshot({path:test.info().outputPath(`ask-${name}-empty.png`)});
    await send(page,"Explain pick and roll"); await expect(messages(page)).toContainText("pairs a screen");
    await send(page,"Who led the league in assists per game last season?"); await expect(page.getByRole("region",{name:"query results"})).toContainText("Nikola Jokić");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    // Full-height chat: the page itself does not scroll; the transcript does, with the composer in view.
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
    await expect(composer(page)).toBeInViewport();
    const column = await live(page).locator(".ask-column").boundingBox(); expect(column!.width).toBeLessThanOrEqual(760);
    await page.screenshot({path:test.info().outputPath(`ask-${name}-answer.png`)});
    await openPage(page, playerPage);
    await page.getByRole("button",{name:"Ask",exact:true}).click(); await expect(messages(page.getByRole("dialog"))).toContainText("pairs a screen");
    await page.screenshot({path:test.info().outputPath(`ask-${name}-panel.png`)});
    await page.keyboard.press("Escape"); await expect(page.getByRole("button",{name:"Ask",exact:true})).toBeFocused();
  });
}

test("typing a next question during execution preserves the new draft", async ({page}) => {
  const state = await mock(page,{deferred:true}); await openPage(page, path); await send(page,"First question");
  await expect(page.getByRole("button",{name:"Stop",exact:true})).toBeEnabled();
  await composer(page).fill("Next question draft"); state.release();
  await expect(page.getByRole("button",{name:"Send question",exact:true})).toBeEnabled();
  await expect(composer(page)).toHaveValue("Next question draft");
});

test("verified local results preserve zero, unknown, scope and equivalent actions",async({page})=>{
  await mock(page,{response:()=>({intent:"local_analysis",scope:scope(),saveable:true,blocks:[{kind:"local_summary",operation_hash:hash,text:"The selected observations are shown below with their sample and scope."},{kind:"result",result:{step_id:"manual",operation:"query",operation_version:"fixture",arguments:{},operation_hash:hash,result_hash:hash,data:{},rows:[{player_name:"Scottie Barnes",points:0},{player_name:"Unknown sample",points:null}],evidence:[],open_url:"/stats?season=2024-25",eligible_count:2,limitations:["Available cohort only"]}}],actions:[{kind:"executed_operation",label:"Open in Stats",url:"/stats?season=2024-25",operation_hash:hash}]})});
  await openPage(page, path); await send(page,"Show local observations");
  // The compact table is visible in the answer; the full result is behind "How I got this".
  const table=page.getByRole("region",{name:"query results",exact:true}); await expect(table).toContainText("Unknown"); await expect(table).toContainText("0");
  // Limitations/approximations sit beside the answer, before any disclosure is opened.
  await expect(page.locator(".ask-limitation").first()).toHaveText("Available cohort only"); await expect(page.locator(".ask-limitation").first()).toBeVisible();
  await page.getByText("How I got this",{exact:true}).click(); await expect(page.getByRole("region",{name:"query data table",exact:true})).toContainText("Unknown");
  await expect(page.getByRole("link",{name:"Open in Stats"}).first()).toHaveAttribute("href","/stats?season=2024-25");
  await expect(messages(page)).toContainText("Chat history is retained separately"); await expect(messages(page)).toContainText("2024-25");
});

test("default assistant and manual entry are available without preview selection",async({page})=>{
  await mock(page); await openPage(page, '/research/ask'); await send(page,'Explain pick and roll');
  await expect(messages(page)).toContainText('pairs a screen');
  await page.getByRole('link',{name:'Open manual research',exact:true}).click();
  await expect(page.getByLabel('Run manually without AI')).toBeVisible();
});

test("page and panel share retained updates and deletion across navigation",async({page})=>{
  await mock(page); await openPage(page, path); await send(page,'First question');
  await expect(messages(page)).toContainText('First question');
  await openPage(page, playerPage);
  await page.getByRole('button',{name:'Ask',exact:true}).click(); const dialog=page.getByRole('dialog');
  await expect(messages(dialog)).toContainText('First question');
  await composer(dialog).fill('Drawer question');
  await dialog.getByRole('button',{name:'Send question',exact:true}).click();
  await expect(messages(dialog)).toContainText('Drawer question');
  await page.keyboard.press('Escape'); await openPage(page, path);
  await expect(messages(page)).toContainText('Drawer question');
  await openPage(page, playerPage); await page.getByRole('button',{name:'Ask',exact:true}).click();
  await dialog.getByRole('button',{name:'Delete chat',exact:true}).click();
  await dialog.getByRole('button',{name:'Confirm deletion'}).click();
  await expect(messages(dialog)).toBeEmpty();
  await page.keyboard.press('Escape'); await openPage(page, path);
  await expect(messages(page)).toBeEmpty();
});

for (const [reason,text] of [['provider_disabled','The language planner is disabled.'],['provider_quota','The provider quota is exhausted.'],['provider_busy','The provider is busy.'],['provider_timeout','The provider timed out.'],['malformed_output','The provider returned an invalid plan.'],['external_unavailable','The source could not be reached.'],['external_stale','A current claim could not be verified.'],['backend_failure','The analytical backend could not complete this query.']] as const) {
  test(`${reason} retains history and retry creates a linked attempt`,async({page})=>{
    const state=await mock(page,{response:()=>({status:'unable',blocks:[{kind:'inability',reason,text,next_action:'Retry later, or use manual research.'}]})});
    await openPage(page, path); await send(page,'Preserve my question');
    await expect(messages(page)).toContainText(text); await reloadPage(page);
    await expect(messages(page)).toContainText('Preserve my question');
    await page.getByRole('button',{name:'Retry question'}).click();
    await expect.poll(()=>state.requests.length).toBe(2);
    expect(state.requests[1].retry_of).toBe(state.requests[0].request_id);
  });
}

test("browser history scope changes update only the next request",async({page})=>{
  const state=await mock(page,{response:req=>({scope:scope(req.context?.season ?? '2024-25')})});
  await openPage(page, `${path}?season=2024-25`); await send(page,'Original season');
  await expect(messages(page)).toContainText('2024-25');
  await page.evaluate(()=>{ history.pushState(null,'','/research/ask?season=2025-26&phase=regular_season'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await openScope(page);
  await expect(page.getByLabel('Season',{exact:true})).toHaveValue('2025-26');
  await send(page,'Updated selection');await expect.poll(()=>state.requests.length).toBe(2);
  expect(state.requests[1].context?.season).toBe('2025-26');
  expect(state.records.get(state.requests[0].thread_id!)![0].response?.scope?.selections.season).toBe('2024-25');
});

for (const width of [1440, 375]) {
  test(`general knowledge label stays visible after reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mock(page, { response: () => ({
      blocks: [{ kind: "text", origin: "general_knowledge", text: "General knowledge, not from CourtLens data\nSpacing creates space for drives, passes and shots." }],
      scope: null, saveable: false,
    }) });
    await openPage(page, path);
    await send(page, "Explain spacing on offense.");
    // The label is a badge inside the same paragraph as the prose.
    const prose = messages(page).locator("p", { hasText: "General knowledge, not from CourtLens data" });
    await expect(prose).toBeVisible();
    await expect(prose).toContainText("Spacing creates space");
    await expect(page.getByRole("link", { name: /Review and save/ })).toHaveCount(0);
    await reloadPage(page);
    await expect(prose).toBeVisible();
  });
}

test("checked narrative renders above its supporting result and survives reload", async ({ page }) => {
  await mock(page, { response: () => ({
    intent: "local_analysis", scope: scope("2025-26"), saveable: true,
    blocks: [
      { kind: "narrative", checker: "narrative-check-v1", text: "Nikola Jokić led the 2025-26 regular season with 10.7 assists per game.", operation_hashes: [hash] },
      { kind: "result", result: { step_id: "s1", operation: "query", operation_version: "fixture", arguments: {}, operation_hash: hash, result_hash: hash, data: {}, rows: [{ player_name: "Nikola Jokić", ast_per_game: 10.7 }], evidence: [], open_url: null, eligible_count: 1, limitations: [] } },
    ],
  }) });
  await openPage(page, path);
  await send(page, "Who led the league in assists per game last season?");
  const prose = messages(page).locator(".hybrid-narrative");
  await expect(prose).toHaveText("Nikola Jokić led the 2025-26 regular season with 10.7 assists per game.");
  await expect(page.getByRole("region", { name: "query results", exact: true })).toContainText("10.7");
  await expect(page.getByText("How I got this", { exact: true })).toBeVisible();
  await reloadPage(page);
  await expect(prose).toBeVisible();
});

test("streamed turn shows each phase, the checked narrative, then the retained answer", async ({ page }) => {
  const state = await mock(page, { stream: true }); await openPage(page, path);
  await send(page, "Who led the league in assists per game last season?");
  const transcript = messages(page); const live = transcript.locator(".thread-live");
  for (const label of ["Understanding the question…", "Querying CourtLens data…", "Writing the answer…"]) await expect(live.getByRole("status")).toHaveText(label);
  await expect(live.locator(".hybrid-narrative")).toContainText("Fixture Guard led");
  await expect(live).toHaveCount(0);
  await expect(transcript.locator(".hybrid-narrative")).toHaveText(streamedNarrative);
  // Streamed end to end through the Next proxy: no request/response fallback was needed.
  expect(state.streams).toHaveLength(1); expect(state.requests).toHaveLength(0);
  await reloadPage(page); await expect(transcript.locator(".hybrid-narrative")).toHaveText(streamedNarrative);
});

test("unavailable stream falls back to request/response with the same request identity", async ({ page }) => {
  const state = await mock(page); await openPage(page, path); await send(page, "Explain pick and roll");
  await expect(messages(page)).toContainText("pairs a screen");
  expect(state.streams).toHaveLength(1); expect(state.requests).toEqual(state.streams);
});

test("Enter sends, Shift+Enter adds a line and an example prompt sends directly", async ({ page }) => {
  const state = await mock(page); await openPage(page, path);
  const box = composer(page);
  await box.fill("First line"); await box.press("Shift+Enter"); await box.pressSequentially("second line");
  await expect(box).toHaveValue("First line\nsecond line"); expect(state.streams).toHaveLength(0);
  await box.press("Enter"); await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].message).toBe("First line\nsecond line");
  await expect(messages(page).locator(".ask-bubble")).toContainText("second line");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.getByRole("button", { name: /Show the registered points forecast/ }).click();
  await expect.poll(() => state.requests.length).toBe(2); expect(state.requests[1].message).toBe("Show the registered points forecast for Nikola Jokić.");
});

test("user message is a right-aligned bubble and assistant prose has no bubble", async ({ page }) => {
  await mock(page, { response: rich }); await page.setViewportSize({ width: 1440, height: 900 }); await openPage(page, path);
  await send(page, "Who led the league in assists per game last season?");
  const bubble = live(page).locator(".ask-bubble"); const prose = live(page).locator(".hybrid-narrative");
  await expect(prose).toBeVisible();
  const [b, c] = await Promise.all([bubble.boundingBox(), live(page).locator(".ask-column").boundingBox()]);
  expect(c!.x + c!.width - (b!.x + b!.width)).toBeLessThan(24); expect(b!.x - c!.x).toBeGreaterThan(100);
  expect(await prose.evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // Action chips, a scope chip and the collapsed explanation.
  await expect(page.getByRole("link", { name: "Open in Stats" })).toHaveClass(/ask-chip/);
  await expect(live(page).locator(".ask-scope-tag")).toHaveText("2025-26 · Regular season · Season to date");
  await expect(live(page).locator(".ask-how")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("region", { name: "query results" })).toContainText("Top 10 of 12 rows");
});

test("an old thread without narrative renders its template answer in the new layout", async ({ page }) => {
  await page.route("**/api/assistant-v2/**", async route => {
    const url = new URL(route.request().url()); const tid = threadId(9);
    const header = { thread_id: tid, title: "Assist leaders", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z" };
    if (url.pathname.endsWith("/threads")) return route.fulfill({ json: { threads: [header], next_cursor: null } });
    const request: HybridTurnRequest = { request_id: tid, thread_id: tid, message: "Who led in assists in 2024-25?" };
    const old = answer(request, { intent: "local_analysis", scope: scope(), blocks: [{ kind: "local_summary", operation_hash: hash, text: "The selected observations are shown below with their sample and scope." }, { kind: "result", result: { step_id: "s1", operation: "query", operation_version: "fixture", arguments: {}, operation_hash: hash, result_hash: hash, data: {}, rows: leaders.slice(0, 3), evidence: [], open_url: null, eligible_count: 3, limitations: [] } }] });
    return route.fulfill({ json: { thread: header, turns: [{ thread_id: tid, turn_id: tid, request, request_sha256: hash, accepted_at: header.created_at, state: "completed", response: old }], next_cursor: null } });
  });
  await page.setViewportSize({ width: 1440, height: 900 }); await openPage(page, path);
  const history = page.getByRole("navigation", { name: "Conversation history" });
  await expect(history.getByRole("heading", { name: "Older" })).toBeVisible();
  await history.getByRole("button", { name: "Assist leaders" }).click();
  await expect(messages(page)).toContainText("The selected observations are shown below with their sample and scope.");
  await expect(page.getByRole("region", { name: "query results" })).toContainText("Nikola Jokić");
  await expect(live(page).locator(".ask-title")).toHaveText("Assist leaders");
});

test("mobile conversations open as a drawer and close after choosing a thread", async ({ page }) => {
  await mock(page); await page.setViewportSize({ width: 375, height: 812 }); await openPage(page, path);
  await send(page, "Explain pick and roll"); await page.getByRole("button", { name: "New chat", exact: true }).click();
  const history = page.getByRole("navigation", { name: "Conversation history" });
  await expect(history).toBeHidden();
  const toggle = page.getByRole("button", { name: "Conversations", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false"); await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(history).toBeVisible(); await page.screenshot({ path: test.info().outputPath("ask-mobile-drawer.png") });
  await history.getByRole("button", { name: /Explain pick and roll/ }).click();
  await expect(history).toBeHidden(); await expect(messages(page)).toContainText("pairs a screen");
});

test("desktop sidebar collapses and stays collapsed after reload", async ({ page }) => {
  await mock(page); await page.setViewportSize({ width: 1440, height: 900 }); await openPage(page, path);
  const history = page.getByRole("navigation", { name: "Conversation history" }); await expect(history).toBeVisible();
  await page.getByRole("button", { name: "Conversations", exact: true }).click(); await expect(history).toBeHidden();
  await reloadPage(page); await expect(page.getByRole("heading", { name: "What do you want to know?" })).toBeVisible(); await expect(history).toBeHidden();
  await page.getByRole("button", { name: "Conversations", exact: true }).click(); await expect(history).toBeVisible();
});

test("clearing history in Settings empties an open chat in another tab", async ({ page, context }) => {
  const state = await mock(page); await openPage(page, path); await send(page, "Explain pick and roll");
  await expect(messages(page)).toContainText("pairs a screen");
  const settings = await context.newPage(); await settings.route("**/api/assistant-v2/**", route => route.fulfill({ json: { cleared: true } }));
  await openPage(settings, "/settings"); const panel = settings.getByRole("region", { name: "Assistant history and privacy" });
  await panel.getByRole("button", { name: "Clear history", exact: true }).click();
  // The other tab re-reads history as soon as the change is announced; the server is already empty.
  state.headers.length = 0; state.records.clear();
  await panel.getByRole("button", { name: "Confirm deletion" }).click(); await expect(panel.getByRole("status")).toContainText("deleted");
  await expect(messages(page)).toBeEmpty(); await expect(page.getByRole("heading", { name: "What do you want to know?" })).toBeVisible();
});

test("/ask opens the assistant", async ({ page }) => {
  await mock(page); await openPage(page, "/ask?season=2025-26");
  await expect(page).toHaveURL(/\/research\/ask\?season=2025-26$/); await expect(page.getByRole("heading", { name: "What do you want to know?" })).toBeVisible();
});

for (const width of [1440, 375]) {
  for (const [route, message, entityKey, entity] of [
    [playerPage, "Show his profile", "player_ids", "23"],
    ["/teams/1610612761?season=2025-26", "Show this team", "team_ids", "1610612761"],
  ] as const) {
    test(`AR07 ${width}px ${entityKey} panel attaches and removes resolved page context`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      const state = await mock(page); await openPage(page, route);
      await page.getByRole("button", {name:"Ask", exact:true}).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByLabel("Attached page context")).toContainText(entityKey === "player_ids" ? "Fixture Star" : "Toronto Raptors");
      await composer(dialog).fill(message); await dialog.getByRole("button",{name:"Send question",exact:true}).click();
      await expect.poll(() => state.requests.length).toBe(1);
      expect(state.requests[0].page_context?.[entityKey]).toEqual([entity]);
      expect(state.requests[0].page_context?.selections.season).toBe("2025-26");
      expect(state.requests[0].context?.season).toBe("2025-26");
      await expect(messages(dialog)).toContainText("pairs a screen");
      await page.screenshot({path:test.info().outputPath(`ar07-${entityKey}-${width}.png`)});
      await dialog.getByRole("button",{name:"Remove page context"}).click();
      await expect(dialog.getByLabel("Attached page context")).toHaveCount(0);
      await composer(dialog).fill("Explain pick and roll"); await dialog.getByRole("button",{name:"Send question",exact:true}).click();
      await expect.poll(() => state.requests.length).toBe(2);
      expect(state.requests[1].page_context).toBeUndefined();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button",{name:"Ask",exact:true})).toBeFocused();
    });
  }
}

test("AR07 compare attaches both players, and the full Ask page uses the standalone entry", async ({page}) => {
  const state = await mock(page);
  await openPage(page, "/compare?playerA=23&playerB=24&season=2025-26");
  await page.getByRole("button",{name:"Ask",exact:true}).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Attached page context")).toContainText("Fixture Star / Fixture Guard");
  await composer(dialog).fill("Compare these players"); await dialog.getByRole("button",{name:"Send question",exact:true}).click();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0].page_context?.player_ids).toEqual(["23", "24"]);
  await page.keyboard.press("Escape"); await openPage(page, path);
  await page.getByRole("button",{name:"Ask",exact:true}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(composer(page)).toBeVisible();
});
