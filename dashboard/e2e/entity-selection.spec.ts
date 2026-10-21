import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// /compare opens on a resolved pair (alignment row 3); the fixture snapshot keeps the two-field picker.
const PICKER = "/compare?snapshotId=snapshot-browser-fixture";

async function choose(page: import("@playwright/test").Page, label: string, name: string) {
  const input = page.getByRole("combobox",{name:label,exact:true});
  await input.fill(name);
  const option = page.getByRole("option").filter({hasText:name});
  await expect(option).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
}

test("two mounted pickers have distinct active descendants; ambiguous Enter never commits",async({page})=>{
  await openWorkbench(page,PICKER);
  const a = page.getByRole("combobox",{name:"Player A",exact:true}), b = page.getByRole("combobox",{name:"Player B",exact:true});
  await a.fill("Fixture"); await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();
  await a.press("Enter"); await expect(page.locator('input[name="playerA"]')).toHaveValue("");
  await a.press("ArrowDown"); const aid = await a.getAttribute("aria-activedescendant");
  expect(await page.locator(`[id=${JSON.stringify(aid)}]`).count()).toBe(1);
  await a.press("Enter"); await expect(page.locator('input[name="playerA"]')).not.toHaveValue("");
  await b.fill("Fixture"); await expect(page.locator('[role="option"]').first()).toBeVisible();await b.press("ArrowDown");
  const bid=await b.getAttribute("aria-activedescendant");expect(bid).not.toBe(aid);
  await b.press("Escape");await expect(b).toHaveAttribute("aria-expanded","false");
});

test("editing and clear invalidate committed single ID; form never submits draft text",async({page})=>{
  await openWorkbench(page,PICKER);await choose(page,"Player A","Fixture Star");await choose(page,"Player B","Fixture Guard");
  await expect(page).toHaveURL(/playerA=23.*playerB=24/);
  await page.getByRole("combobox",{name:"Player A",exact:true}).fill("uncommitted");
  await expect(page.locator('input[name="playerA"]')).toHaveValue("");await expect(page.getByRole("button",{name:"Compare players"})).toHaveCount(0);
  await page.getByRole("button",{name:"Clear Player A",exact:true}).click();await expect(page.getByRole("combobox",{name:"Player A",exact:true})).toHaveValue("");
});

test("debounce and cache-hit paths reject delayed responses; empty input clears stale options",async({page})=>{
  await openWorkbench(page,PICKER);const input=page.getByRole("combobox",{name:"Player A",exact:true});
  await input.fill("Fixture Star");await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();
  let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
  await page.route("**/api/workbench/lookup?**",async route=>{const q=new URL(route.request().url()).searchParams.get("q");if(q === "slow") {await pending;await route.fulfill({json:{items:[{id:"slow",canonical_id:"slow",kind:"player",display_name:"Obsolete"}]}}).catch(()=>{});} else await route.continue();});
  await input.fill("slow");await page.waitForRequest(r=>new URL(r.url()).searchParams.get("q")==="slow");
  await input.fill("Fixture Star");await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();release();await page.waitForTimeout(200);await expect(page.getByRole("option").filter({hasText:"Obsolete"})).toHaveCount(0);
  await input.fill("");await input.press("Enter");await expect(page.locator('input[name="playerA"]')).toHaveValue("");
});

test("IME composition suppresses lookup and Enter; Tab closes and keeps natural focus",async({page})=>{
  await openWorkbench(page,PICKER);const input=page.getByRole("combobox",{name:"Player A",exact:true});
  await input.dispatchEvent("compositionstart");await input.fill("Fixture Star");await input.press("Enter");await page.waitForTimeout(180);await expect(page.locator('[role="option"]')).toHaveCount(0);await expect(page.locator('input[name="playerA"]')).toHaveValue("");
  await input.dispatchEvent("compositionend");await expect(page.getByRole("option").filter({hasText:"Fixture Star"})).toBeVisible();await input.press("Tab");await expect(input).not.toBeFocused();await expect(input).toHaveAttribute("aria-expanded","false");
});

test("API failure preserves text; retry and no-match states are distinct",async({page})=>{
  await openWorkbench(page,PICKER);await page.route("**/api/workbench/lookup?**",route=>route.fulfill({status:503,json:{detail:"fixture failure"}}));
  const input=page.getByRole("combobox",{name:"Player A",exact:true});await input.fill("retry question");await expect(page.getByText("Search is unavailable.",{exact:false}).first()).toBeVisible();await expect(input).toHaveValue("retry question");
  await page.unroute("**/api/workbench/lookup?**");await page.getByRole("button",{name:"Retry search"}).click();await expect(page.getByText("No matches for",{exact:false})).toBeVisible();
});

// The multi-player chip and lookup scope-race checks moved to Vitest (entity-picker.test.tsx,
// lookup-input.test.tsx) when Stat Line Shift (row 13) dropped its condition pickers.

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
  await page.goto("/planner?week=2026-10-05");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email",{exact:true}).fill("fixture@courtlens.local");await page.getByLabel("Password",{exact:true}).fill("fixture-only");await page.getByRole("button",{name:"Sign in",exact:true}).click();
  // FO13: the week lives in the URL and the styled picker; the plan loads without a Recalculate button.
  await expect(page.getByRole("button",{name:"Week starts: Oct 5, 2026"})).toHaveAttribute("data-value","2026-10-05");
  const drop=page.getByRole("combobox",{name:"Drop",exact:true});await drop.waitFor();await drop.fill("Jokic");await page.getByRole("option").filter({hasText:"Private Jokić"}).click();
  const add=page.getByRole("combobox",{name:"Add candidate",exact:true});await add.fill("Doncic");await page.getByRole("option").filter({hasText:"Private Dončić"}).click();await expect(page.getByRole("button",{name:"Remove Private Dončić from Add candidate",exact:true})).toBeVisible();expect(lookups).toBe(0);
  await page.setViewportSize({width:375,height:812});
  const assignments=page.getByRole("region",{name:"Daily player assignments",exact:true});
  await assignments.focus();await expect(assignments).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(()=>assignments.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
