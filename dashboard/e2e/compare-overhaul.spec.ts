import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

const empty = JSON.parse(readFileSync("../docs/evidence/b21-api-smoke.json", "utf8")).response;

test("player comparison uses shared scope, signed values and contextual URL modes",async({page})=>{
  await openWorkbench(page,"/compare?playerA=23&playerB=24&players=23,24,1&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13&window=last_10");
  await expect(page.getByRole("heading",{level:1})).toHaveText("Player Comparison");
  await expect(page.getByRole("table",{name:"Descriptive comparison"})).toContainText("28.0");
  await page.getByRole("radio",{name:"Table",exact:true}).click();await expect(page).toHaveURL(/compareView=table/);
  await page.getByRole("radio",{name:"Offense",exact:true}).click();await expect(page).toHaveURL(/preset=offense/);
  await page.reload();await expect(page.getByRole("radio",{name:"Offense",exact:true})).toHaveAttribute("aria-checked","true");
  await page.getByRole("button",{name:"Swap players",exact:true}).click();
  await expect(page).toHaveURL(/playerA=24&playerB=23/);
  const url=new URL(page.url());expect(url.searchParams.get("releaseId")).toBe("fixture-release");expect(url.searchParams.get("window")).toBe("last_10");expect(url.searchParams.get("beforeDate")).toBe("2026-04-13");
  expect(url.searchParams.get("players")).toBe("24,23,1");
  await expect(page.locator('.ui-compare-side').first()).toContainText("Fixture Guard");
  await expect(page.locator('.ui-compare-side .ui-identity-media')).toHaveCount(2);
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

test("WOWY cancels an old context and a late response cannot replace the new result",async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let oldStarted=false;
  await page.route("**/api/workbench/operations/wowy",async route=>{
    const request=route.request().postDataJSON();
    if(request.team_id === "TOR") {oldStarted=true;await held;}
    await route.fulfill({json:{...empty,request:{...empty.request,...request},evidence_hash:`fixture-${request.team_id}`,context:{...empty.context,...request}}}).catch(()=>{});
  });
  await openWorkbench(page,"/wowy?team_id=TOR&together=1");await expect.poll(()=>oldStarted).toBe(true);
  const team=page.getByRole("combobox",{name:"Team",exact:true});await team.fill("Boston");await page.getByRole("option").filter({hasText:"Boston Celtics"}).click();
  await expect(page.locator(".floor-result")).toContainText("0 / 82 finalized games reconstructed");
  const current=new URL(page.url()).searchParams.get("team_id");expect(current).not.toBe("TOR");release();await page.waitForTimeout(250);
  expect(new URL(page.url()).searchParams.get("team_id")).toBe(current);
  await page.getByRole("button",{name:"Data details",exact:true}).click();await expect(page.getByText(`fixture-${current}`,{exact:true})).toBeVisible();
});

test("Matchups applies scoped changes automatically and shows fractional assignments without inventing rates",async({page})=>{
  const requests:Record<string,unknown>[]=[];
  await page.route("**/api/workbench/operations/matchups",async route=>{
    const req=route.request().postDataJSON();requests.push(req);
    const original=JSON.parse(readFileSync("../docs/evidence/b23-api-smoke.json","utf8"));
    const data=original.operations.matchups.response;
    await route.fulfill({json:{...data,request:{...data.request,...req},assignments:[{offensive_player_id:"1",defensive_player_id:"2",games:1,seconds:0,fractional_possessions:0.125,attempts:0,makes:0,player_points:0,team_points:0,fg_pct:null}]}});
  });
  await openWorkbench(page,"/matchups?player_id=1&defender_id=2&releaseId=fixture-release&season=2025-26&phase=regular_season&beforeDate=2026-04-13");
  await expect(page.getByRole("region",{name:"Assignment matrix"})).toContainText("0.125");
  await expect(page.getByRole("region",{name:"Assignment matrix"})).toContainText("—");
  await page.getByLabel("Minimum games",{exact:true}).fill("7");await expect.poll(()=>requests.at(-1)?.min_games).toBe(7);
  expect(requests.at(-1)).toMatchObject({release_id:"fixture-release",season:"2025-26",phase:"regular_season",before_date:"2026-04-13"});
  await expect(page.getByRole("button",{name:"Run shooting analysis"})).toHaveCount(0);
});

test("an initially default WOWY query retains its resolved release and cutoff when a gate changes",async({page})=>{
  const requests:Record<string,unknown>[]=[];
  await page.route("**/api/workbench/operations/wowy",route=>{
    const request=route.request().postDataJSON();requests.push(request);
    return route.fulfill({json:{...empty,request:{...empty.request,...request},context:{...empty.context,release_id:"fixture-resolved-release",season:"2025-26",phase:"regular_season",before_date:"2026-04-13"}}});
  });
  await openWorkbench(page,"/wowy?team_id=TOR&together=1");await expect(page.locator(".floor-result")).toBeVisible();
  await page.getByLabel("Minimum games",{exact:true}).fill("7");
  await expect.poll(()=>requests.at(-1)?.min_games).toBe(7);
  expect(requests.at(-1)).toMatchObject({release_id:"fixture-resolved-release",season:"2025-26",phase:"regular_season",before_date:"2026-04-13"});
});

test("an initially default Matchups query retains its resolved release and cutoff when a gate changes",async({page})=>{
  const requests:Record<string,unknown>[]=[];
  const data=JSON.parse(readFileSync("../docs/evidence/b23-api-smoke.json","utf8")).operations.matchups.response;
  await page.route("**/api/workbench/operations/matchups",route=>{
    const request=route.request().postDataJSON();requests.push(request);
    return route.fulfill({json:{...data,request:{...data.request,...request},context:{...data.context,release_id:"fixture-resolved-release",season:"2025-26",phase:"regular_season",before_date:"2026-04-13"}}});
  });
  await openWorkbench(page,"/matchups?player_id=1&defender_id=2");await expect(page.locator(".floor-result")).toBeVisible();
  await page.getByLabel("Minimum games",{exact:true}).fill("7");
  await expect.poll(()=>requests.at(-1)?.min_games).toBe(7);
  expect(requests.at(-1)).toMatchObject({release_id:"fixture-resolved-release",season:"2025-26",phase:"regular_season",before_date:"2026-04-13"});
});
