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

test("Career compares both players through the cutoff without league percentiles (row 3, 21)",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  await page.getByRole("combobox",{name:"Counting mode",exact:true}).selectOption("career:per_game");await expect(page).toHaveURL(/span=career/);
  const table=page.getByRole("table",{name:"Descriptive comparison"});
  await expect(table.locator("caption")).toHaveText("Career through 2025-26");
  await expect(table.getByRole("rowheader",{name:"Seasons",exact:true})).toBeVisible();
  await expect(table.locator(".stat-pct-sublabel")).toHaveCount(0);
  await expect(page.getByRole("table",{name:"Accolades"})).toBeVisible();
});

test("each player can be compared in their own season; seasons without games say so (row 3, 38-39)",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  const seasonA=page.getByRole("combobox",{name:"Player A season",exact:true});
  await expect(seasonA).toHaveValue("2025-26");
  const other=await seasonA.locator("option").evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value).find(value=>value!=="2025-26"));
  if(other){await seasonA.selectOption(other);await expect(page).toHaveURL(new RegExp(`seasonA=${other}`));await expect(seasonA).toHaveValue(other);
    await page.getByRole("button",{name:"Swap players",exact:true}).click();await expect(page).toHaveURL(new RegExp(`seasonB=${other}`));
    await expect(page.getByRole("combobox",{name:"Player B season",exact:true})).toHaveValue(other);}
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
