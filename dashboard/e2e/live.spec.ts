import { expect, test, type Page } from "@playwright/test";
import { easternToday, type LiveCache, type LiveGame, shiftSlate } from "../lib/live";

const slate = easternToday();
const id = "11111111-1111-4111-8111-111111111111";
const game: LiveGame = { source_id: "123", canonical_id: null, identity_status: "unmapped", namespace: "espn", slate_date: slate, event_time: `${slate}T23:00:00Z`, status: "in_progress", period: 5, clock: null, provisional: true, teams: [{source_id:"1",canonical_id:null,identity_status:"unmapped",name:"Boston Celtics",side:"home",score:0},{source_id:"2",canonical_id:null,identity_status:"unmapped",name:"Toronto Raptors",side:"away",score:null}] };
const cache: LiveCache = {namespace:"espn",provisional:true,client_poll_seconds:60,capability:"not_yet_observed",status:"observed",paused:false,active_leases:2,stale:false,age_seconds:31,last_success_at:`${slate}T19:00:00Z`,last_poll_at:null,next_poll_at:null,error:null,observation_id:"observed-fixture",acquired_at:`${slate}T19:00:00Z`,source_time:null,http_date:null,content_sha256:"a".repeat(64),data:{games:[game]}};
async function mock(page: Page) {
  const calls: {method:string; path:string}[] = [];
  await page.route("**/api/live**", async route => {
    const request=route.request();const url=new URL(request.url());calls.push({method:request.method(),path:url.pathname});
    if (request.method()==="DELETE") return route.fulfill({status:204});
    if(request.method()==="POST") return route.fulfill({json:{id,expires_at:"later",heartbeat_seconds:60}});
    if(url.pathname.includes("historical")) return route.fulfill({json:{context:{release_id:"sealed-history",dataset_id:"historical-dataset",season:"2024-25",phase:"regular_season",before_date:"2025-04-16"},games:[{...game,source_id:"0022401190",slate_date:"2025-04-15",status:"final",provisional:false,identity_status:"admitted_research"}],players:null,status:"admitted_finals",warnings:["Missing rows remain unknown"]}});
    if(url.pathname.includes("/games/")) return route.fulfill({json:{...cache,stale:true,status:"source_error",error:"Provider temporarily unavailable",data:{game,players:[{source_id:"11",team_source_id:"1",name:"Observed Player",canonical_id:null,identity_status:"unmapped",reported_nonappearance:false,statistics:{PTS:"0",MIN:null}},{source_id:"12",team_source_id:"1",name:"Reported DNP",canonical_id:null,identity_status:"unmapped",reported_nonappearance:true,statistics:{PTS:"0",MIN:"0"}}],team_sections:null}}});
    return route.fulfill({json:cache});
  });
  return calls;
}

test("selected source boxes keep zero, missingness, clock and errors explicit",async({page})=>{
  await mock(page);await page.goto(`/live/games/123?date=${slate}&releaseId=retained-stats&season=2024-25`);
  const selected=page.getByRole("region",{name:"Selected game details"});await expect(selected).toContainText("OT 1 · Clock unknown");await expect(selected).toContainText("Stale");await expect(selected).toContainText("Provider temporarily unavailable");await expect(selected).toContainText("Actual slate:");
  const rows=selected.getByRole("row");await expect(rows.filter({hasText:"Observed Player"})).toContainText("0");await expect(rows.filter({hasText:"Observed Player"})).toContainText("—");await expect(rows.filter({hasText:"Reported DNP"})).not.toContainText("0");await expect(rows.filter({hasText:"Reported DNP"})).toContainText("Reported nonappearance");
  expect(new URL(page.url()).searchParams.get("releaseId")).toBe("retained-stats");
});

test("pause, visibility and navigation release leases and prevent hidden renewals",async({page})=>{
  await page.clock.install();const calls=await mock(page);await page.goto(`/live/${slate}`);await expect(page.getByRole("region",{name:"Game slate"})).toContainText("Boston Celtics");await expect.poll(()=>calls.filter(c=>c.method==="POST").length).toBeGreaterThan(0);
  await page.getByRole("button",{name:"Pause updates"}).click();await expect.poll(()=>calls.filter(c=>c.method==="DELETE").length).toBeGreaterThan(0);const count=calls.length;await page.clock.fastForward(180000);expect(calls.length).toBe(count);
  await page.getByRole("button",{name:"Resume updates"}).click();await expect(page.getByRole("status").filter({hasText:"Visible"})).toBeVisible();await expect.poll(()=>calls.length).toBeGreaterThan(count);
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});await expect(page.getByRole("status").filter({hasText:"Hidden"})).toBeVisible();const hiddenCount=calls.length;await page.clock.fastForward(180000);expect(calls.length).toBe(hiddenCount);
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));});await expect.poll(()=>calls.length).toBeGreaterThan(hiddenCount);
  await page.goto("/definitions");await expect.poll(()=>calls.filter(c=>c.method==="DELETE").length).toBeGreaterThan(1);
});

test("offline retains last observation; capacity and disabled acquisition stay usable",async({page,context})=>{
  await mock(page);await page.route("**/api/live/subscriptions",r=>r.fulfill({status:429,json:{detail:"capacity"}}));await page.goto(`/live/${slate}`);await expect(page.getByRole("alert").filter({hasText:"capacity"})).toBeVisible();await expect(page.getByRole("region",{name:"Game slate"})).toContainText("Boston Celtics");
  await context.setOffline(true);await expect(page.getByRole("status").filter({hasText:"Offline"})).toBeVisible();await expect(page.getByRole("region",{name:"Game slate"})).toContainText("Boston Celtics");await context.setOffline(false);
});

async function expectReleaseInDetails(page: Page, release: string) {
  // D5: the research release lives in Data details, not the main flow.
  await page.getByRole("button",{name:"Data Details"}).click();const details=page.getByRole("dialog");await expect(details).toContainText(release);await page.keyboard.press("Escape");
}

test("historical final detail has no demand and pins resolved release in links",async({page})=>{
  const calls=await mock(page);await page.goto("/live/2025-04-15?season=2024-25");await expect(page.getByRole("region",{name:"Game slate"}).getByRole("link")).toHaveCount(1);await expectReleaseInDetails(page,"sealed-history");expect(calls.some(c=>c.method==="POST")).toBe(false);
  await page.getByRole("region",{name:"Game slate"}).getByRole("link").click();await expect.poll(()=>new URL(page.url()).searchParams.get("releaseId")).toBe("sealed-history");await expect(page.getByRole("region",{name:"Selected game details"})).toContainText("Finalized research");await expect(page.getByRole("region",{name:"Selected game details"})).toContainText("Player boxes unknown");expect(calls.some(c=>c.method==="POST")).toBe(false);
  await page.reload();await expect(page.getByRole("region",{name:"Selected game details"})).toContainText("Finalized research");await expectReleaseInDetails(page,"sealed-history");
});

test("mobile and landscape source box regions contain overflow and keyboard focus",async({page})=>{
  await mock(page);await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:"reduce"});await page.goto(`/live/games/123?date=${slate}`);await expect(page.getByRole("region",{name:"Selected game details"})).toContainText("Observed Player");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const table=page.getByRole("region",{name:"Boston Celtics player box table"});await table.focus();await expect(table).toBeFocused();await page.screenshot({path:test.info().outputPath("live-mobile.png"),fullPage:true});await page.setViewportSize({width:812,height:375});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("a delayed old selection cannot overwrite new date observations",async({page})=>{
  await mock(page);let resolveOld:()=>void=()=>{};await page.route(`**/api/live?slate_date=${slate}`,async route=>{await new Promise<void>(r=>{resolveOld=r;});await route.fulfill({json:cache}).catch(()=>{});});
  await page.goto(`/live/${slate}`);await expect(page.getByRole("status").filter({hasText:"Visible"})).toBeVisible();const next=shiftSlate(slate,1);await page.getByRole("navigation",{name:"Live dates"}).locator(`a[href^="/live/${next}"]`).click();await expect(page).toHaveURL(new RegExp(`/live/${next}`));await expect(page.getByRole("region",{name:"Game slate"})).toContainText("Boston Celtics");resolveOld();await expect(page).toHaveURL(new RegExp(`/live/${next}`));await expect(page.getByRole("button",{name:/^Slate date:/})).toHaveAttribute("data-value",next);
});

test("disabled acquisition, observed empty slate and invalid dates stay distinct", async({page}) => {
  // Unknown is never zero: an unobserved slate shows no game count.
  const calls = await mock(page);
  await page.route("**/api/live?slate_date=*", route => route.fulfill({json:{...cache,status:"not_configured",capability:"not_configured",paused:true,data:null,age_seconds:null}}));
  await page.goto(`/live/${slate}`);
  await expect(page.locator("main")).toContainText("not configured");
  await expect(page.locator("main")).toContainText("Awaiting a cached slate");
  await expect(page.locator(".ui-count-chip")).toHaveCount(0);
  await page.unroute("**/api/live?slate_date=*");
  await page.route("**/api/live?slate_date=*", route => route.fulfill({json:{...cache,data:{games:[]}}}));
  await page.reload(); await expect(page.locator("main")).toContainText("No games in the observed source slate");
  await expect(page.locator(".ui-count-chip")).toHaveText("0 games");
  await page.goto("/live/2026-02-30");await expect(page.getByRole("status").filter({hasText:"Invalid date"})).toBeVisible();
  const count=calls.length; await page.getByRole("button",{name:"Pause updates"}).click();expect(calls.length).toBe(count);
});

test("FO08 board: one title, Live tabs, date strip counts and nearest-date jumps",async({page})=>{
  await mock(page);await page.route("**/api/live?slate_date=*", route => route.fulfill({json:{...cache,data:{games:[]}}}));
  await page.setViewportSize({width:1440,height:900});await page.goto(`/live/${slate}`);
  await expect(page.locator("h1")).toHaveText("Live");
  const tabs=page.getByRole("navigation",{name:"Live sections"});await expect(tabs.getByRole("link")).toHaveText(["Live","Finals","Playoffs"]);await expect(tabs.locator('[aria-current="page"]')).toHaveText("Live");
  const strip=page.getByRole("navigation",{name:"Live dates"});await expect(strip.locator(".live-date")).toHaveCount(15);await expect(strip.locator('[aria-current="date"]')).toContainText("Today");
  expect(await strip.locator(".live-date").evaluateAll(links=>links.every(link=>(link.getAttribute("data-empty")!==null)===(link.querySelector(".live-date-count")?.textContent==="0")))).toBe(true);
  await expect(page.getByRole("button",{name:/^Load/})).toHaveCount(0);await expect(page.locator('input[type="date"]')).toHaveCount(0);
  const empty=page.getByRole("note").filter({hasText:"No games on"});await expect(empty.getByRole("link")).toHaveCount(2);
  await empty.getByRole("link").last().click();await expect(page).toHaveURL(new RegExp(`/live/${shiftSlate(slate,1)}`));
  await tabs.getByRole("link",{name:"Finals"}).click();await expect(page).toHaveURL(/live_mode=history/);await expect(tabs.locator('[aria-current="page"]')).toHaveText("Finals");
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
