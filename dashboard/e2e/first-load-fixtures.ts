import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const floor=JSON.parse(readFileSync("../docs/evidence/b21-api-smoke.json","utf8")).response;
const shooting=JSON.parse(readFileSync("../docs/evidence/b23-api-smoke.json","utf8")).operations.matchups.response;
// Stat Line Shift (alignment row 13): real TOR 2025-26 responses from the local API, keyed by subject
// (none, Scottie Barnes 1630567, Immanuel Quickley 1630193), each trimmed to eight teammates.
export const statLineShift=JSON.parse(readFileSync("e2e/fixtures/stat-line-shift-v1.json","utf8"));
/** UI test inputs only; real database evidence is captured separately. */
export async function firstLoadFixtures(page: Page) {
  await page.route("**/api/workbench/operations/*",route=>{
    const operation=new URL(route.request().url()).pathname.split("/").at(-1);
    const request=route.request().postDataJSON();
    if(operation === "similarity") return route.fulfill({json:{operation_version:"fixture",evidence_hash:"fixture",target:{player_id:request.target_player_id,player_name:"Fixture Star",games_played:70,total_minutes:2500,team_tricode:"TOR",raw_values:{pts_per_36:28.2},standardized_values:{pts_per_36:1}},cohort:{cohort_size:2,min_appearances:10,min_minutes:150,window_description:"Last 10 appearances",dimensions:[]},peers:[],disclosures:["Synthetic UI test inputs"]}});
    if(operation === "stat-shift-roster") return route.fulfill({json:statLineShift[request.subject_id ?? "none"] ?? {...statLineShift.none,subject_id:request.subject_id}});
    if(operation === "wowy" || operation === "stat-shift") return route.fulfill({json:{...floor,operation,request:{...floor.request,...request},context:{...floor.context,...request}}});
    return route.fulfill({json:{...shooting,operation,request:{...shooting.request,...request},context:{...shooting.context,...request},profile:null,peers:[],shots:[],anchors:[],aftermath_summary:[],assignments:[]}});
  });
}

// Last X Games (alignment row 6): real Shai Gilgeous-Alexander 2025-26 regular season (68 games,
// +/- from accepted stints). Other players fall through to the mock API; earlier seasons have no games.
export const lastGames=JSON.parse(readFileSync("e2e/fixtures/last-games-v1.json","utf8"));
export const SGA="1628983";
export async function lastGamesFixtures(page: Page) {
  await page.route(`**/api/workbench/players/${SGA}/games?*`,route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get("season")!=="2025-26"||url.searchParams.get("phase")!=="regular_season") return route.fulfill({status:404,json:{detail:"player not found in snapshot"}});
    return route.fulfill({json:lastGames.regular_season});
  });
  // Follow-ups 25 and 28: OKC's real schedule (result, score, rest) and every team's defensive rating.
  await page.route("**/api/workbench/teams/OKC/schedule?*",route=>route.fulfill({json:lastGames.team_schedule}));
  await page.route("**/api/workbench/teams?*",route=>route.fulfill({json:lastGames.teams}));
}
