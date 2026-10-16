import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";


test("player comparison uses shared scope, signed values and contextual URL modes",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&players=23,24,1&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13&window=last_10");
  await expect(page.getByRole("heading",{level:1})).toHaveText("Player Comparison");
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toContainText("28.0");
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toBeVisible();
  await page.getByRole("radio",{name:"Offense",exact:true}).click();await expect(page).toHaveURL(/preset=offense/);
  await page.reload();await expect(page.getByRole("radio",{name:"Offense",exact:true})).toHaveAttribute("aria-checked","true");
  await page.getByRole("button",{name:"Swap players",exact:true}).click();
  await expect(page).toHaveURL(/playerA=24&playerB=23/);
  const url=new URL(page.url());expect(url.searchParams.get("releaseId")).toBe("fixture-release");expect(url.searchParams.get("window")).toBe("last_10");expect(url.searchParams.get("beforeDate")).toBe("2026-04-13");
  expect(url.searchParams.get("players")).toBe("24,23,1");
  await expect(page.locator('.pvp-slot').first()).toContainText("Fixture Guard");
  await expect(page.locator('.pvp-slot .pvp-portrait')).toHaveCount(2);
});

test("compare card: console actions, change cues, wordmark footer and trend tray (alignment row 3)",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  const bar=page.getByRole("region",{name:"Research context controls"});
  await expect(bar.getByRole("button",{name:"Edit Metrics",exact:true})).toBeVisible();await expect(bar.getByRole("button",{name:"Share Image",exact:true})).toBeVisible();
  await expect(page.locator(".pvp-change")).toHaveCount(2);await expect(page.locator(".pvp-foot .courtlens-wordmark")).toBeVisible();
  await expect(page.getByText("Descriptive differences under a shared scope.")).toHaveCount(0);
  await page.getByRole("button",{name:"Trend lines",exact:true}).click();await expect(page).toHaveURL(/compareView=lines/);
  await expect(page.locator(".pvp-tray-body").getByRole("region",{name:"Multi-Player Lines Progression Explorer"})).toBeVisible();
  await expect(page.getByText("Rolling statistic discipline:")).toHaveCount(0);
});

test("Clear players opens both slots; each plus searches in place and a full pair loads (row 3, 24)",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13&preset=offense");
  await page.getByRole("button",{name:"Clear players",exact:true}).click();
  await expect(page).toHaveURL(/empty=1/);
  const url=new URL(page.url());expect(url.searchParams.get("playerA")).toBeNull();expect(url.searchParams.get("preset")).toBe("offense");
  // The cleared card stays open instead of reloading the default pair.
  await page.reload();
  await expect(page.getByRole("button",{name:"Add Player A",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add Player B",exact:true})).toBeVisible();
  const bar=page.getByRole("region",{name:"Research context controls"});
  await expect(bar.getByRole("button",{name:"Edit Metrics",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Add Player A",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Player A"})).toBeFocused();
});

test("Career compares both players through the cutoff without league percentiles (row 3, 21)",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  await page.getByRole("button",{name:/^Counting mode,/}).click();await page.getByRole("menuitem",{name:"Career · Per Game",exact:true}).click();await expect(page).toHaveURL(/span=career/);
  const table=page.getByRole("table",{name:"Descriptive comparison"});
  await expect(table.locator("caption")).toHaveText("Career through 2025-26");
  await expect(table.getByRole("rowheader",{name:"Seasons",exact:true})).toBeVisible();
  await expect(table.locator(".stat-pct-sublabel")).toHaveCount(0);
  await expect(page.getByRole("table",{name:"Accolades"})).toBeVisible();
});

for(const width of [1440,390]) test(`counting menu keeps its slot across season and career modes at ${width}px`,async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width,height:900});
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13");
  const trigger=page.getByRole("button",{name:/^Counting mode,/});
  const before=await trigger.boundingBox();
  await trigger.click();await expect(page.getByRole("menuitem",{name:/^Per 75/})).toBeDisabled();
  expect(await page.getByRole("menuitem",{name:"Career · Per Game",exact:true}).evaluate(element=>getComputedStyle(element).borderWidth)).toBe("0px");
  // Click the visible item directly so Playwright's automatic scrolling does not move the page.
  const item=await page.getByRole("menuitem",{name:"Career · Per Game",exact:true}).boundingBox();
  expect(item).not.toBeNull();if(item) await page.mouse.click(item.x+item.width/2,item.y+item.height/2);
  await expect(trigger).toHaveText("Career · Per Game");
  const after=await trigger.boundingBox();
  expect(after?.x).toBeCloseTo(before?.x??0,0);expect(after?.y).toBeCloseTo(before?.y??0,0);expect(after?.width).toBe(before?.width);
  const presets=await page.locator(".pvp-presets").boundingBox();
  if(width===1440) expect(after?.y).toBeCloseTo(presets?.y??0,0);
  expect(await page.locator(".pvp-presets").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await trigger.click();await page.getByRole("menuitem",{name:"Per Game",exact:true}).click();await expect(trigger).toHaveText("Per Game");
  await trigger.click();
  const yearHeading=page.getByRole("group",{name:"2025-26",exact:true}).locator(".pvp-counting-group");
  await expect(yearHeading).toHaveText("2025-26");
  await expect(yearHeading).toHaveCSS("background-color","rgb(21, 23, 27)");
  await expect(page.getByRole("menuitem",{name:"2025-26",exact:true})).toHaveCount(0);
  await yearHeading.click();await expect(trigger).toHaveAttribute("aria-expanded","true");
  await trigger.focus();await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem",{name:"Per Game",exact:true})).toBeFocused();
});

test("each player can be compared in their own season; seasons without games say so (row 3, 38-39)",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  const seasonA=page.getByRole("button",{name:/^Player A season, 2025-26/});
  await expect(seasonA).toBeVisible();
  await seasonA.click();
  const items=page.getByRole("menuitem");
  const other=(await items.allTextContents()).map(text=>text.slice(0,7)).find(value=>value!=="2025-26");
  if(other){await items.filter({hasText:other}).first().click();await expect(page).toHaveURL(new RegExp(`seasonA=${other}`));
    await expect(page.getByRole("button",{name:new RegExp(`^Player A season, ${other}`)})).toBeVisible();
    await page.getByRole("button",{name:"Swap players",exact:true}).click();await expect(page).toHaveURL(new RegExp(`seasonB=${other}`));
    await expect(page.getByRole("button",{name:new RegExp(`^Player B season, ${other}`)})).toBeVisible();}
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2003-04&phase=regular_season");
  await expect(page.locator(".pvp-slot[data-inactive]").first()).toContainText("No Games in 2003-04");
  await expect(page.locator(".pvp-name").first()).not.toHaveText(/^\d+$/);
});

test("the console Season is a global override that clears per-player seasons (row 3, 42)",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&seasonA=2024-25");
  // The console season is a menu showing who played each season (row 3, 44).
  await page.getByRole("button",{name:/^Filter by season/}).click();
  const items=page.getByRole("menuitem");
  const other=(await items.allTextContents()).map(text=>text.slice(0,7)).find(value=>value!=="2025-26");
  test.skip(!other,"Fixture catalog has one season");
  await items.filter({hasText:other!}).first().click();await expect(page).toHaveURL(new RegExp(`season=${other}`));
  expect(new URL(page.url()).searchParams.get("seasonA")).toBeNull();
});

for(const width of [1440,390]) test(`season honors show every badge in aligned rows at ${width}px (row 3, 49)`,async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width,height:900});
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-07-01");
  const honors=page.getByRole("region",{name:"Season honors",exact:true});
  await expect(honors).toContainText("DPOY Winner");
  const centers=await page.evaluate(()=>{
    const center=(element:Element)=>{const box=element.getBoundingClientRect();return box.x+box.width/2;};
    return {values:Array.from(document.querySelectorAll('.pvp-rows[aria-label="Descriptive comparison"] tbody tr:not(.pvp-group) .pvp-value')).slice(0,2).map(center),honors:Array.from(document.querySelectorAll(".pvp-honors-side")).map(center)};
  });
  centers.values.forEach((value,index)=>expect(centers.honors[index]).toBeCloseTo(value,0));
  for(const label of ["DPOY Winner","All-NBA 1st","All-Def 1st","All-Star","MVP 2nd"]) await expect(honors.getByText(label,{exact:true})).toBeVisible();
  await expect(honors.getByText("All-Star",{exact:true})).toHaveCSS("color","rgb(255, 209, 102)");
  await expect(honors.getByRole("button")).toHaveCount(0);
  const badgeRows=await honors.locator('.pvp-honors-side[data-identity="b"] .ui-badge').evaluateAll(elements=>{
    const rows=new Map<number,{left:number;right:number;count:number}>();
    for(const element of elements){const box=element.getBoundingClientRect(),row=rows.get(box.y);rows.set(box.y,{left:Math.min(row?.left??box.left,box.left),right:Math.max(row?.right??box.right,box.right),count:(row?.count??0)+1});}
    return [...rows.values()];
  });
  expect(badgeRows.reduce((count,row)=>count+row.count,0)).toBe(5);
  badgeRows.forEach(row=>expect((row.left+row.right)/2).toBeCloseTo(centers.values[1],0));
  if(width===1440) expect(badgeRows.some(row=>row.count===2)).toBe(true);
  await page.getByRole("button",{name:/^Player B season/}).click();
  await expect(page.getByRole("menuitem",{name:/2025-26 All-Star/})).toBeVisible();
  const legend=page.locator(".pvp-season-legend");
  expect(await legend.getByText("All-Star",{exact:true}).evaluate(element=>element.getBoundingClientRect().height)).toBeLessThan(20);
  const star=page.getByRole("menuitem",{name:/2025-26 All-Star/}).locator(".pvp-season-honor-icons svg");
  expect(await star.evaluate(element=>getComputedStyle(element).color)).toBe("rgb(255, 209, 102)");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [1440,390]) test(`midseason honors show badges and empty dashes without pending copy at ${width}px (row 3, 57)`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  const honors=page.getByRole("region",{name:"Season honors",exact:true});
  await expect(honors.getByText("All-Star",{exact:true})).toBeVisible();
  await expect(honors.locator('.pvp-honors-side[data-identity="a"] .pvp-honors-empty')).toContainText("—");
  await expect(honors.locator('.pvp-honors-side[data-identity="a"]')).toContainText("Honors unavailable");
  await expect(honors).not.toContainText(/Pending|awards pending|None recorded/i);
  await expect(honors.getByText("DPOY Winner",{exact:true})).toHaveCount(0);
  const exported=page.locator(".pvp-export-svg");
  await expect(exported).toContainText("All-Star");
  await expect(exported).not.toContainText(/Pending|awards pending|None recorded/i);
});

for(const width of [1440,390]) test(`player search shows full names in wider viewport-bounded results at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route("**/api/workbench/lookup?*",route=>route.fulfill({json:{
    query:{raw:"gianna",normalized:"gianna",tokens:["gianna"],version:"fixture-pf04"},catalog_version:"fixture-pf04",total_matches:1,
    items:[{id:"34",canonical_id:"34",kind:"player",display_name:"Giannis Antetokounmpo",portrait_fallback:"GA",destination_url:"/players/34"}]
  }}));
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13");
  await page.getByRole("button",{name:/^Change Player A,/}).click();
  await page.getByRole("combobox",{name:"Player A",exact:true}).fill("gianna");
  const result=page.getByRole("option",{name:"Giannis Antetokounmpo"});await expect(result).toBeVisible();
  const name=result.locator(".lookup-item-name");
  expect(await name.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  const box=await page.locator(".lookup-floating-dropdown").boundingBox();
  expect(box?.width).toBeCloseTo(Math.min(440,width-16),0);expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x??0)+(box?.width??0)).toBeLessThanOrEqual(width);
});

test("team comparison preserves unknown versus zero, unknown outcomes and scope across tabs",async({page})=>{
  await openWorkbench(page,"/team-compare?teamA=100&teamB=200&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  const points=page.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Points Per Game",exact:true})});
  await expect(points.getByRole("cell").nth(1)).toHaveText("—");
  const fg=page.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Field Goal %",exact:true})});await expect(fg.getByRole("cell").nth(1)).toContainText("0.0%");
  await expect(page.getByRole("cell",{name:"Unknown",exact:true})).toBeVisible();await expect(page.getByText("Team B win",{exact:true})).toHaveCount(0);
  await page.getByRole("radio",{name:"Four Factors",exact:true}).focus();await page.keyboard.press("Space");
  await expect(page).toHaveURL(/tab=factors/);await expect(page.getByText("74%ile",{exact:true})).toHaveCount(2);
  const defense=page.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Opponent eFG%",exact:true})});
  await expect(defense.getByRole("cell").nth(1)).toContainText("88%ile");
  await page.reload();await expect(page.getByRole("radio",{name:"Four Factors",exact:true})).toHaveAttribute("aria-checked","true");
  expect(new URL(page.url()).searchParams.get("beforeDate")).toBe("2026-04-13");
});

test("WOWY: a late response for an earlier team cannot replace the current result (PC11)",async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let heldStarted=false;
  await page.route("**/api/workbench/wowy?*",async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get("teamId") === "1610612738") {heldStarted=true;await held;}
    const body=await (await route.fetch()).json();
    if(url.searchParams.get("teamId") === "1610612738") body.team={team_id:"1610612738",team_tricode:"BOS",team_name:"Boston Celtics"};
    await route.fulfill({json:body}).catch(()=>{});
  });
  await openWorkbench(page,"/wowy");await expect(page.getByRole("combobox",{name:"Team",exact:true})).toHaveValue("1610612761");
  await page.getByRole("combobox",{name:"Team",exact:true}).selectOption("1610612738");await expect.poll(()=>heldStarted).toBe(true);
  // Filters replace the URL; a newer navigation arrives while the Boston request is still held.
  await page.evaluate(()=>window.history.pushState(null,"","/wowy?teamId=1610612761"));await expect(page.getByRole("combobox",{name:"Team",exact:true})).toHaveValue("1610612761");
  release();await page.waitForTimeout(250);
  await expect(page.getByRole("combobox",{name:"Team",exact:true})).toHaveValue("1610612761");
  await expect(page.locator(".feed-subject").getByText("Toronto Raptors",{exact:true})).toBeVisible();
});
