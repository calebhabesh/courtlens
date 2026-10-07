import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

async function choose(page: import("@playwright/test").Page, label: string, name: string) {
  const input = page.getByRole("combobox",{name:label,exact:true});
  await input.fill(name);
  const option = page.getByRole("option").filter({hasText:name});
  await expect(option).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
}

test("two mounted pickers have distinct active descendants; ambiguous Enter never commits",async({page})=>{
  await openWorkbench(page,"/compare");
  const a = page.getByRole("combobox",{name:"Player A",exact:true}), b = page.getByRole("combobox",{name:"Player B",exact:true});
  await a.fill("Fixture"); await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();
  await a.press("Enter"); await expect(page.locator('input[name="playerA"]')).toHaveValue("");
  await a.press("ArrowDown"); const aid = await a.getAttribute("aria-activedescendant");
  expect(await page.locator(`[id=${JSON.stringify(aid)}]`).count()).toBe(1);
  await a.press("Enter"); await expect(page.locator('input[name="playerA"]')).not.toHaveValue("");
  await b.fill("Fixture"); await expect(page.getByRole("option").first()).toBeVisible();await b.press("ArrowDown");
  const bid=await b.getAttribute("aria-activedescendant");expect(bid).not.toBe(aid);
  await b.press("Escape");await expect(b).toHaveAttribute("aria-expanded","false");
});

test("editing and clear invalidate committed single ID; form never submits draft text",async({page})=>{
  await openWorkbench(page,"/compare");await choose(page,"Player A","Fixture Star");await choose(page,"Player B","Fixture Guard");
  await expect(page.getByRole("button",{name:"Compare players"})).toBeEnabled();
  await page.getByRole("combobox",{name:"Player A",exact:true}).fill("uncommitted");
  await expect(page.locator('input[name="playerA"]')).toHaveValue("");await expect(page.getByRole("button",{name:"Compare players"})).toBeDisabled();
  await page.getByRole("button",{name:"Clear Player A",exact:true}).click();await expect(page.getByRole("combobox",{name:"Player A",exact:true})).toHaveValue("");
});

test("debounce and cache-hit paths reject delayed responses; empty input clears stale options",async({page})=>{
  await openWorkbench(page,"/compare");const input=page.getByRole("combobox",{name:"Player A",exact:true});
  await input.fill("Fixture Star");await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();
  let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
  await page.route("**/api/workbench/lookup?**",async route=>{const q=new URL(route.request().url()).searchParams.get("q");if(q === "slow") {await pending;await route.fulfill({json:{items:[{id:"slow",canonical_id:"slow",kind:"player",display_name:"Obsolete"}]}}).catch(()=>{});} else await route.continue();});
  await input.fill("slow");await page.waitForRequest(r=>new URL(r.url()).searchParams.get("q")==="slow");
  await input.fill("Fixture Star");await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();release();await page.waitForTimeout(200);await expect(page.getByRole("option").filter({hasText:"Obsolete"})).toHaveCount(0);
  await input.fill("");await input.press("Enter");await expect(page.locator('input[name="playerA"]')).toHaveValue("");
});

test("IME composition suppresses lookup and Enter; Tab closes and keeps natural focus",async({page})=>{
  await openWorkbench(page,"/compare");const input=page.getByRole("combobox",{name:"Player A",exact:true});
  await input.dispatchEvent("compositionstart");await input.fill("Fixture Star");await input.press("Enter");await page.waitForTimeout(180);await expect(page.locator('[role="option"]')).toHaveCount(0);await expect(page.locator('input[name="playerA"]')).toHaveValue("");
  await input.dispatchEvent("compositionend");await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();await input.press("Tab");await expect(input).not.toBeFocused();await expect(input).toHaveAttribute("aria-expanded","false");
});

test("API failure preserves text; retry and no-match states are distinct",async({page})=>{
  await openWorkbench(page,"/compare");await page.route("**/api/workbench/lookup?**",route=>route.fulfill({status:503,json:{detail:"fixture failure"}}));
  const input=page.getByRole("combobox",{name:"Player A",exact:true});await input.fill("retry question");await expect(page.getByText("Search is unavailable.",{exact:false}).first()).toBeVisible();await expect(input).toHaveValue("retry question");
  await page.unroute("**/api/workbench/lookup?**");await page.getByRole("button",{name:"Retry search"}).click();await expect(page.getByText("No matches for",{exact:false})).toBeVisible();
});

test("WOWY chips remove by name, prevent duplicates and enforce unit maximum without IDs",async({page})=>{
  await openWorkbench(page,"/wowy");await page.getByRole("combobox",{name:"View",exact:true}).selectOption("unit");
  for(let n=1;n<=5;n++) await choose(page,"Exact unit",`Fixture Player ${n}`);
  await expect(page.getByRole("combobox",{name:"Exact unit",exact:true})).toBeDisabled();await expect(page.getByRole("list",{name:"Selected Exact unit"}).getByRole("listitem")).toHaveCount(5);
  await page.getByRole("button",{name:"Remove Fixture Player 3 from Exact unit"}).click();await expect(page.getByRole("combobox",{name:"Exact unit",exact:true})).toBeEnabled();await choose(page,"Exact unit","Fixture Player 3");
  await expect(page.locator("form form")).toHaveCount(0);
});

test("touch selection and removal work at 375px",async({browser})=>{
  const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true});const page=await context.newPage();await openWorkbench(page,"/wowy");
  await page.getByRole("combobox",{name:"Together players",exact:true}).fill("Fixture Star");await page.getByRole("option").filter({hasText:"Fixture Star"}).tap();await expect(page.getByRole("button",{name:"Remove Fixture Star from Together players"})).toBeVisible();await page.getByRole("button",{name:"Remove Fixture Star from Together players"}).tap();await expect(page.getByRole("list",{name:"Selected Together players"})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);await context.close();
});

test("changing lookup scope discards an obsolete response for the same text",async({page})=>{
  await page.route("**/api/workbench/catalog**",async route=>{ const response=await route.fetch();const catalog=await response.json();await route.fulfill({json:{...catalog,seasons:["2023-24","2025-26"],stats_scopes:[...catalog.stats_scopes,{season:"2023-24",phase:"regular_season",default_before_date:"2024-06-30"}]}}); });
  await openWorkbench(page,"/wowy");
  let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
  await page.route("**/api/workbench/lookup?**",async route=>{
    const url=new URL(route.request().url());if(url.searchParams.get("q") !== "scope") return route.continue();
    const season=url.searchParams.get("season");if(season === "2023-24") await pending;
    await route.fulfill({json:{items:[{id:"scope",canonical_id:"scope",kind:"player",display_name:`Scope ${season}`,subtitle:"Explicit scope race fixture"}]}}).catch(()=>{});
  });
  const season = page.getByLabel("Season",{exact:true});
  // React can still have a hidden streamed copy pending reveal after shell hydration.
  await expect(season).toHaveCount(1);
  await season.selectOption("2023-24");const firstRequest=page.waitForRequest(request=>new URL(request.url()).searchParams.get("q") === "scope");const input=page.getByRole("combobox",{name:"Together players",exact:true});await input.fill("scope");await firstRequest;
    await page.getByLabel("Season",{exact:true}).selectOption("2025-26");await input.focus();await expect(page.getByRole("option").filter({hasText:"Scope 2025-26"})).toBeVisible();release();await page.waitForTimeout(150);await expect(page.getByRole("option").filter({hasText:"Scope 2023-24"})).toHaveCount(0);
});

for(const route of ["trends","distributions","similarity"]) {
  test(`${route} selection preserves release, phase, cutoff and window context`,async({page})=>{
    const requests: Record<string, unknown>[]=[];
    page.on("request",request=>{if(request.method() === "POST" && request.url().includes("/operations/")) requests.push(request.postDataJSON());});
    await openWorkbench(page,`/research/${route}?releaseId=fixture-release&season=2024-25&phase=playoffs&beforeDate=2025-06-01&window=last_10`);
    await choose(page,"Target player","Fixture Star");await expect(page).toHaveURL(/playerId=23/);
    const url=new URL(page.url());expect(url.searchParams.get("releaseId")).toBe("fixture-release");expect(url.searchParams.get("phase")).toBe("playoffs");expect(url.searchParams.get("beforeDate")).toBe("2025-06-01");expect(url.searchParams.get("window")).toBe("last_10");
    await expect.poll(()=>requests.some(request=>request.player_id === "23" || request.target_player_id === "23")).toBe(true);
    expect(requests.at(-1)).toMatchObject({release_id:"fixture-release",phase:"playoffs",before_date:"2025-06-01"});
  });
}

for(const [route,label] of [["rankings","Add player to board"],["tierlist","Add player to tier"]]) {
  test(`${route} picker adds canonical named selection to its explicit personal target`,async({page})=>{
    const workspace={workspace_id:"default",name:"Fixture",version:1,views:[],favorites:[],compare_tray:[],ranking_boards:[{id:"board",title:"Fixture board",board_type:"overall",entries:[]}],tier_lists:[{id:"tiers",title:"Fixture tiers",tiers:[{tier_id:"a",label:"First tier",player_ids:[]},{tier_id:"b",label:"Second tier",player_ids:[]}]}],preferences:{density:"standard",identity_mode:"photos",counting_mode:"per_game",default_view_id:"overview",table_expanded:false,theme:"dark"},created_at:"2026-10-05",updated_at:"2026-10-05"};
    const saves: Record<string,unknown>[]=[];
    await page.route("**/api/workspace**",async request=>{
      if(request.request().method() !== "GET") {const body=request.request().postDataJSON();saves.push(body);workspace.version++;if(route === "rankings") workspace.ranking_boards[0]={...workspace.ranking_boards[0],...body};else workspace.tier_lists[0]={...workspace.tier_lists[0],...body};}
      await request.fulfill({json:workspace});
    });
    await openWorkbench(page,`/${route}`);
    if(route === "tierlist") {await page.getByRole("tab",{name:/Fixture tiers/}).click();await page.getByRole("combobox",{name:"Assign to tier",exact:true}).selectOption("b");}
    const input=page.getByRole("combobox",{name:label,exact:true});await input.fill("Fixture Star");await page.getByRole("option").filter({hasText:"Fixture Star"}).click();
    await expect.poll(()=>saves.length).toBe(1);
    if(route === "rankings") expect(saves[0]).toMatchObject({entries:[{player_id:"23",player_name:"Fixture Star"}]});
    else expect(saves[0]).toMatchObject({tiers:[{tier_id:"a",player_ids:[]},{tier_id:"b",player_ids:["23"]}]});
    if(route === "rankings") await expect(page.getByRole("button",{name:"Remove Fixture Star from board",exact:true})).toBeVisible();
    else await expect(page.getByText("1 total assigned player(s)",{exact:false})).toBeVisible();
    await input.fill("Fixture Star");await expect(page.getByText("No matches for",{exact:false})).toBeVisible();
  });
}

test("planner selections stay within roster/watchlist and never query the public catalog",async({page})=>{
  let lookups=0;page.on("request",request=>{if(request.url().includes("/lookup?")) lookups++;});
  const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
  await page.route("**/api/auth/token",request=>request.fulfill({headers:cors,json:{access_token:"fixture"}}));
  await page.route("**/api/data-status",request=>request.fulfill({headers:cors,json:{classification:"fixture"}}));
  await page.route("**/api/fantasy/**",request=>{
    if(request.request().method() === "OPTIONS") return request.fulfill({status:204,headers:cors});
    const path=new URL(request.request().url()).pathname;
    const league={id:"fixture",name:"Fixture league",timezone:"UTC",lineup_slots:{UTIL:1},acquisition_limit:4,scoring_rules_version:"fixture",roster_version:1};
    if(path.endsWith("/roster")) return request.fulfill({headers:cors,json:[{player_id:1,name:"Private Jokić",team:"DEN"}]});
    if(path.endsWith("/watchlist")) return request.fulfill({headers:cors,json:[{player_id:2,name:"Private Dončić",team:"LAL"}]});
    if(path.endsWith("/planner")) return request.fulfill({headers:cors,json:{league,week_start:"2026-10-05",week_end:"2026-10-11",week_state:{acquisitions_used:0,acquisitions_remaining:4},dates:[],players:[],days:[],summary:{scheduled_player_games:0,startable_player_games:0,lineup_conflicts:0,light_slate_threshold:5},data_snapshot:{classification:"fixture",id:"fixture"},caveats:[]}});
    return request.fulfill({headers:cors,json:[league]});
  });
  await page.goto("/planner");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email",{exact:true}).fill("fixture@courtlens.local");await page.getByLabel("Password",{exact:true}).fill("fixture-only");await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.getByLabel("Week starts").fill("2026-10-05");
  const drop=page.getByRole("combobox",{name:"Drop",exact:true});await drop.waitFor();await drop.fill("Jokic");await page.getByRole("option").filter({hasText:"Private Jokić"}).click();
  const add=page.getByRole("combobox",{name:"Add candidate",exact:true});await add.fill("Doncic");await page.getByRole("option").filter({hasText:"Private Dončić"}).click();await expect(page.getByRole("button",{name:"Remove Private Dončić from Add candidate",exact:true})).toBeVisible();expect(lookups).toBe(0);
  await page.setViewportSize({width:375,height:812});
  const assignments=page.getByRole("region",{name:"Daily player assignments",exact:true});
  await assignments.focus();await expect(assignments).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(()=>assignments.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
