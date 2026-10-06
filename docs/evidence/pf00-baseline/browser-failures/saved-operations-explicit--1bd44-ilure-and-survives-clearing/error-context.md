# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: saved-operations.spec.ts >> explicit save excludes question by default, reuses identity after failure and survives clearing
- Location: e2e/saved-operations.spec.ts:29:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Save investigation', exact: true })
    - locator resolved to <button class="button button-primary">Save investigation</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
      - waiting 100ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - element is outside of the viewport
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
  - element was detached from the DOM, retrying
    2 × waiting for "http://localhost:3151/research/ask" navigation to finish...
      - navigated to "http://localhost:3151/research/ask"

```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - link "Skip to content" [ref=f5e2] [cursor=pointer]:
    - /url: "#content"
  - generic [ref=f5e3]:
    - banner [ref=f5e4]:
      - generic [ref=f5e5]:
        - generic [ref=f5e6]:
          - link "CourtLoad Research Workbench home" [ref=f5e7] [cursor=pointer]:
            - /url: /
            - generic [ref=f5e14]:
              - generic [ref=f5e15]: COURTLOAD
              - generic [ref=f5e16]: Replica Workbench
          - navigation "Primary Quick Switch" [ref=f5e17]:
            - link "Stats" [ref=f5e18] [cursor=pointer]:
              - /url: /stats
            - generic [aria-hidden] [ref=f5e19]: ·
            - link "Games" [ref=f5e20] [cursor=pointer]:
              - /url: /live
        - generic [ref=f5e21]:
          - search [ref=f5e22]:
            - generic [ref=f5e23]:
              - generic [aria-hidden]: 🔍
              - combobox "Search players, teams and pages" [ref=f5e24]
              - generic [aria-hidden]: /
          - status [ref=f5e25]
        - generic [ref=f5e26]:
          - button "Ask" [ref=f5e27]
          - link "Data status" [ref=f5e28] [cursor=pointer]:
            - /url: /data-status
          - link "Settings" [ref=f5e29] [cursor=pointer]:
            - /url: /settings
      - navigation "Workspace Navigation" [ref=f5e30]:
        - generic [ref=f5e31]:
          - link "Stats" [ref=f5e32] [cursor=pointer]:
            - /url: /stats
          - link "WOWY" [ref=f5e33] [cursor=pointer]:
            - /url: /wowy
          - button "Live" [ref=f5e35] [cursor=pointer]:
            - generic [aria-hidden] [ref=f5e37]: ▼
          - button "Players" [ref=f5e39] [cursor=pointer]:
            - generic [aria-hidden] [ref=f5e41]: ▼
          - button "Teams" [ref=f5e43] [cursor=pointer]:
            - generic [aria-hidden] [ref=f5e45]: ▼
          - button "Compare" [ref=f5e47] [cursor=pointer]:
            - generic [aria-hidden] [ref=f5e49]: ▼
          - button "Research" [ref=f5e51] [cursor=pointer]:
            - generic [aria-hidden] [ref=f5e53]: ▼
        - button "Help" [ref=f5e56] [cursor=pointer]:
          - generic [aria-hidden] [ref=f5e58]: ▼
    - main [ref=f5e59]:
      - generic [ref=f5e60]:
        - generic [ref=f5e62]:
          - heading "Ask CourtLoad" [level=1] [ref=f5e63]
          - paragraph [ref=f5e64]: Ask follow-up questions or run manual research against a pinned release, with exact results and evidence.
        - generic [ref=f5e65]:
          - generic [ref=f5e66]:
            - heading "Ask CourtLoad" [level=2] [ref=f5e67]
            - button "Clear conversation" [ref=f5e68] [cursor=pointer]
          - status [ref=f5e69]: AI disabled · manual research available
          - paragraph [ref=f5e70]: With AI enabled, your question, pinned context and bounded analytical definitions are sent to Google. Working conversation state stays local and expires after 30 minutes. Clearing it does not erase provider records. No web search or paid fallback is enabled.
          - group [ref=f5e71]:
            - generic "Configure optional AI" [ref=f5e72] [cursor=pointer]
          - group "Analytical context" [ref=f5e73]:
            - generic [ref=f5e75]:
              - text: Release
              - textbox "Release" [ref=f5e76]:
                - /placeholder: Resolve current release once
            - generic [ref=f5e77]:
              - text: Season
              - textbox "Season" [ref=f5e78]: 2025-26
            - generic [ref=f5e79]:
              - text: Phase
              - combobox "Phase" [ref=f5e80]:
                - option "regular_season" [selected]
                - option "playoffs"
                - option "preseason"
                - option "play_in"
                - option "cup_final"
                - option "summer_league"
            - generic [ref=f5e81]:
              - text: Before date (exclusive)
              - textbox "Before date (exclusive)" [ref=f5e82]: 2026-06-30
            - generic [ref=f5e83]:
              - text: Window
              - combobox "Window" [ref=f5e84]:
                - option "season" [selected]
                - option "last_10"
                - option "last_5"
          - generic [ref=f5e85]:
            - generic [ref=f5e86]:
              - checkbox "Run manually without AI" [checked] [ref=f5e87]
              - text: Run manually without AI
            - link "Saved investigations" [ref=f5e88] [cursor=pointer]:
              - /url: /investigations
          - generic [ref=f5e89]:
            - generic [ref=f5e90]: Research operation
            - combobox "Research operation" [ref=f5e91]:
              - option "workload shifts" [selected]
              - option "similarity"
              - option "distribution"
              - option "compare periods"
              - option "splits"
              - option "definition"
              - option "query"
              - option "profile"
              - option "compare"
              - option "team"
              - option "forecast"
              - option "finance"
            - paragraph
            - generic [ref=f5e92]: Operation arguments (JSON)
            - textbox "Operation arguments (JSON)" [ref=f5e93]: "{ \"period_n\": 10, \"min_minutes\": 0, \"limit\": 20 }"
            - group [ref=f5e94]:
              - generic "Accepted arguments and definitions" [ref=f5e95] [cursor=pointer]
          - generic [ref=f5e96]:
            - generic [ref=f5e97]: Research question (optional label)
            - textbox "Research question (optional label)" [ref=f5e98]
            - generic [ref=f5e99]:
              - generic [ref=f5e100]: 0 / 2000
              - button "Run manual operation" [ref=f5e101] [cursor=pointer]
          - status [ref=f5e102]: Ready for research
          - generic "Conversation history"
          - paragraph [ref=f5e103]: Active conversations are temporary. Retaining conversational plans and evidence is scheduled for the saved-investigation block; opening a view does not save this conversation.
  - button "Open Next.js Dev Tools" [ref=f5e109] [cursor=pointer]
  - alert [ref=f5e113]
```

# Test source

```ts
  1  | import { expect, test, type Page } from "@playwright/test";
  2  | import type { SavedDetail, SaveRequest } from "../lib/saved-operations";
  3  | import type { Result } from "../lib/conversation";
  4  | const hash="a".repeat(64), savedId="22222222-2222-4222-8222-222222222222";
  5  | const context={release_id:"retained-release",season:"2024-25",phase:"regular_season",before_date:"2025-04-15",window:"season"};
  6  | const operations=["query","definition","profile","compare","team","forecast","distribution","compare_periods","splits","similarity","workload_shifts","finance"];
  7  | const results:Result[]=operations.map((operation,index)=>({step_id:`step-${index}`,operation,operation_version:"retained-v1",arguments:{metric:"pts"},operation_hash:hash,result_hash:hash,data:{},rows:[{value:0},{value:null}],evidence:[{evidence_id:`cell-${index}`,result_hash:hash,operation_hash:hash,operation_version:"retained-v1",context_fingerprint:hash,entity_id:"1630567",row_identity:"/rows/0",path:"/rows/0/value",metric:"pts",metric_version:"basketball-v2",unit:"points",value:0,sample:{n:20},input_identity:context,null_reason:null}],open_url:`/stats?releaseId=${context.release_id}&season=${context.season}&beforeDate=${context.before_date}`,eligible_count:2,limitations:["Descriptive; retained bounds"]}));
  8  | // A detail uses at most eight steps. Separate records cover all twelve operation types.
  9  | function detail(operation="distribution"):SavedDetail{return {id:savedId,title:"Retained scoring",created_at:"2026-10-04T12:00:00Z",manifest_sha256:hash,metadata:{question_saved:false,question:null},manifest:{schema_version:"courtload-saved-operation-v1",context,context_fingerprint:hash,plan:{steps:[]},origin_plan:{steps:[]},origin_manifest_sha256:hash,metric_version:"basketball-v2",result_scope:"complete_stats_cohort_and_declared_operation_bounds",results:results.filter(result=>result.operation===operation),limitations:["Upstream aggregate rounding remains explicit"]}};}
  10 | async function mock(page:Page,{failure=false,mismatch=false,operation="distribution"}={}){
  11 |   const saves:SaveRequest[]=[];const reads:string[]=[];let first=failure;let reproductions=0;
  12 |   await page.route("**/api/workbench/assistant/**",async route=>{
  13 |     const path=new URL(route.request().url()).pathname;reads.push(path);
  14 |     if(path.endsWith("/status"))return route.fulfill({json:{configured:false,model:"fixture"}});
  15 |     if(path.endsWith("/operations"))return route.fulfill({json:[]});
  16 |     if(path.endsWith("/turn")){const req=route.request().postDataJSON();return route.fulfill({json:{schema_version:"courtload-conversation-v1",status:"answered",conversation_id:"11111111-1111-4111-8111-111111111111",turn_id:req.request_id,context,context_fingerprint:hash,interpretation:"Executed without AI",plan:req.plan,results:detail().manifest.results,choices:[],limitations:[],manifest:{hash},accounting:{provider_calls:0}}});}
  17 |     if(route.request().method()==="DELETE")return route.fulfill({json:{cleared:true}});
  18 |     if(path.endsWith("/investigations")&&route.request().method()==="POST"){
  19 |       const req=route.request().postDataJSON() as SaveRequest;saves.push(req);
  20 |       if(first){first=false;return route.fulfill({status:503,json:{detail:"Transient save failure"}});}
  21 |       return route.fulfill({json:{...detail(),title:req.title,metadata:{question_saved:req.include_question,question:req.include_question?"Selected server question":null}}});
  22 |     }
  23 |     if(path.endsWith("/investigations")){const value=detail();return route.fulfill({json:[{...value,context,operations:[operation],question_saved:false}]});}
  24 |     if(path.endsWith("/reproduce")){reproductions++;return route.fulfill({json:{id:savedId,manifest_sha256:hash,match:!mismatch,reason:mismatch?"Unsupported retained version":null,provider_calls:0,operations:[{step_id:"step",operation,match:!mismatch,saved_result_sha256:hash,recomputed_result_sha256:mismatch?"b".repeat(64):hash}]}});}
  25 |     if(path.endsWith("/export"))return route.fulfill({body:"retained bytes",headers:{"Content-Disposition":"attachment; filename=retained.json","Cache-Control":"no-store"}});
  26 |     return route.fulfill({json:detail(operation)});
  27 |   });return {saves,reads,get reproductions(){return reproductions;}};
  28 | }
  29 | test("explicit save excludes question by default, reuses identity after failure and survives clearing",async({page})=>{
  30 |   const calls=await mock(page,{failure:true});await page.goto("/research/ask");await expect(page.getByText("AI disabled · manual research available",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Run manual operation"}).click();
  31 |   const opt=page.getByLabel("Retain my selected question as durable metadata");await expect(opt).not.toBeChecked();
> 32 |   await page.getByLabel("Investigation title").fill("Pinned scoring");await page.getByRole("button",{name:"Save investigation",exact:true}).click();
     |                                                                                                                                             ^ Error: locator.click: Test timeout of 30000ms exceeded.
  33 |   await expect(page.getByRole("alert").filter({hasText:"Transient save failure"})).toContainText("Transient save failure");await expect(page.getByRole("alert").filter({hasText:"Transient save failure"})).toBeFocused();await page.getByRole("button",{name:"Retry saving investigation"}).click();
  34 |   await expect(page.getByRole("link",{name:"Pinned scoring"})).toBeVisible();expect(calls.saves).toHaveLength(2);expect(calls.saves[0]).toEqual(calls.saves[1]);expect(calls.saves[0].include_question).toBe(false);expect(Object.keys(calls.saves[0]).sort()).toEqual(["request_id","conversation_id","turn_id","context_fingerprint","title","include_question"].sort());
  35 |   await page.getByRole("button",{name:"Clear conversation"}).click();await page.goto(`/investigations/saved/${savedId}`);await expect(page.getByText("The question was not retained.",{exact:false})).toBeVisible();await page.reload();await expect(page.getByRole("heading",{name:"Retained scoring"})).toBeVisible();
  36 | });
  37 | test("question opt-in is independent from execution and title",async({page})=>{
  38 |   const calls=await mock(page);await page.goto("/research/ask");await expect(page.getByText("AI disabled · manual research available",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Run manual operation"}).click();await page.getByLabel("Investigation title").fill("Chosen title");await page.getByLabel("Retain my selected question as durable metadata").check();await page.getByRole("button",{name:"Save investigation",exact:true}).click();await expect(page.getByRole("link",{name:"Chosen title"})).toBeVisible();expect(calls.saves[0].include_question).toBe(true);
  39 | });
  40 | test("combined library keeps legacy section and opens exact retained namespace",async({page})=>{
  41 |   await mock(page);await page.goto("/investigations");await expect(page.getByRole("region",{name:"Legacy saved investigations"})).toBeVisible();await page.getByRole("link",{name:"Retained scoring"}).click();await expect(page).toHaveURL(new RegExp(`/investigations/saved/${savedId}`));await expect(page.getByRole("heading",{name:"Retained scoring"})).toBeVisible();
  42 | });
  43 | for(const operation of operations)test(`${operation} retained result exposes evidence, pinned reopening, exports and reproduction`,async({page})=>{
  44 |   const calls=await mock(page,{operation});await page.goto(`/investigations/saved/${savedId}`);await expect(page.getByRole("region",{name:`${operation} data table · pts`})).toContainText("Unknown");
  45 |   await page.getByText("Definitions, inputs and exact evidence (1 cells)").click();await expect(page.getByRole("region",{name:`${operation} evidence table`})).toContainText("points");await expect(page.getByRole("link",{name:"Open in Stats"})).toHaveAttribute("href",new RegExp("releaseId=retained-release.*beforeDate=2025-04-15"));
  46 |   await expect(page.getByRole("link",{name:"Export JSON",exact:true})).toHaveAttribute("href",new RegExp(`${savedId}/export\\?format=json`));const download=page.waitForEvent("download");await page.getByRole("link",{name:"Export JSON",exact:true}).click();await download;
  47 |   await page.getByRole("button",{name:"Verify reproduction without AI"}).click();await expect(page.getByRole("status").filter({hasText:"Provider calls"})).toContainText("PASS");expect(calls.reproductions).toBe(1);expect(calls.reads.some(path=>path.endsWith("/turn"))).toBe(false);
  48 | });
  49 | test("reproduction mismatch keeps exports and retained evidence usable on narrow screens",async({page})=>{
  50 |   await mock(page,{mismatch:true});await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:"reduce"});await page.goto(`/investigations/saved/${savedId}`);await page.getByRole("button",{name:"Verify reproduction without AI"}).click();await expect(page.getByRole("status").filter({hasText:"Provider calls"})).toContainText("MISMATCH · Unsupported retained version");await expect(page.getByRole("link",{name:"Export CSV"})).toBeVisible();await page.getByRole("region",{name:"distribution data table · pts"}).focus();await expect(page.getByRole("region",{name:"distribution data table · pts"})).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath("saved-mobile.png"),fullPage:true});await page.setViewportSize({width:812,height:375});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  51 | });
  52 | test("original content, live catalog version and installation metadata are local and truthful",async({page,request})=>{
  53 |   await page.goto("/blog");await expect(page.getByRole("heading",{name:"Evidence before narrative"})).toBeVisible();await page.goto("/patch-notes");await expect(page.getByRole("heading",{name:"Patch notes: retained analytical operations"})).toBeVisible();await page.goto("/learning");await expect(page.getByRole("status").filter({hasText:"local catalog is unavailable"})).toBeVisible();
  54 |   await page.goto("/methodology");await expect(page.getByText(/Canonical Metric Catalog/)).toContainText("(v1)");await expect(page.getByText("0 Metrics",{exact:true}).filter({visible:true})).toBeVisible();await page.goto("/settings");await expect(page.getByRole("heading",{name:"Install CourtLoad"})).toBeVisible();
  55 |   const manifestResponse=await request.get("/manifest.webmanifest");expect(manifestResponse.ok()).toBe(true);const manifest=await manifestResponse.json();expect(manifest.start_url).toBe("/stats");expect(manifest.display).toBe("standalone");
  56 |   for(const icon of manifest.icons){const response=await request.get(icon.src);expect(response.ok()).toBe(true);expect(response.headers()["content-type"]).toContain("image/png");const bytes=await response.body();const n=Number(icon.sizes.split("x")[0]);expect(bytes.readUInt32BE(16)).toBe(n);expect(bytes.readUInt32BE(20)).toBe(n);}
  57 |   expect(await page.evaluate(async()=>({workers:(await navigator.serviceWorker.getRegistrations()).length,caches:await caches.keys()}))).toEqual({workers:0,caches:[]});
  58 |   await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href","/manifest.webmanifest");
  59 | });
  60 | test("saved-operation pagination preserves boundaries and failed pages stay explicit",async({page})=>{
  61 |   await mock(page);let fail=true;
  62 |   await page.route("**/assistant/investigations?**",async route=>{
  63 |     const offset=Number(new URL(route.request().url()).searchParams.get("offset"));
  64 |     if(offset===50&&fail){fail=false;return route.fulfill({status:503,json:{detail:"Saved library unavailable"}});}
  65 |     return route.fulfill({json:Array.from({length:offset===0?50:1},(_,i)=>({id:`record-${offset+i}`,title:`Saved row ${offset+i}`,created_at:"2026-10-04",manifest_sha256:hash,context,operations:["query"],question_saved:false}))});
  66 |   });
  67 |   await page.goto("/investigations");await expect(page.getByRole("link",{name:"Saved row 49",exact:true})).toBeVisible();await page.getByRole("button",{name:"Next saved operations"}).click();await expect(page.getByRole("alert").filter({hasText:"Saved library unavailable"})).toBeVisible();await expect(page.getByRole("link",{name:"Saved row 49",exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Retry library"}).click();await expect(page.getByRole("link",{name:"Saved row 50",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Next saved operations"})).toBeDisabled();await page.getByRole("button",{name:"Previous saved operations"}).click();await expect(page.getByRole("link",{name:"Saved row 0",exact:true})).toBeVisible();
  68 | });
  69 | test("install prompt accepts a browser event and exposes installed state",async({page})=>{
  70 |   await page.goto("/settings");await page.getByRole("heading",{name:"Install CourtLoad"}).waitFor();await page.waitForLoadState("networkidle");
  71 |   await page.evaluate(()=>{const event=new Event("beforeinstallprompt",{cancelable:true});Object.assign(event,{prompt:async()=>{},userChoice:Promise.resolve({outcome:"accepted"})});window.dispatchEvent(event);});
  72 |   await page.getByRole("button",{name:"Install local app"}).click();await expect(page.getByRole("status").filter({hasText:"Installation accepted"})).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event("appinstalled")));await expect(page.getByRole("status").filter({hasText:"Running as a standalone app"})).toBeVisible();await expect(page.getByRole("button",{name:"Install local app"})).toHaveCount(0);
  73 | });
  74 | 
```