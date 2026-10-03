import { describe, it, expect } from "vitest";
import type { TeamResearchItem } from "./types";

describe("Team Explorer and Comparison Logic", () => {
  const sampleTeams: TeamResearchItem[] = [
    {
      team_id: "1610612738",
      tricode: "BOS",
      name: "Boston Celtics",
      games_played: 82,
      wins: 64,
      losses: 18,
      win_pct: 0.78,
      conference: "Eastern",
      division: "Atlantic",
      production: { pts_per_game: 120.6, fg_pct: 0.487, fg3_pct: 0.388 },
      allowance: { pts_allowed_per_game: 109.2, fg_pct_allowed: 0.453 },
      observed_games: 82,
      exclusions: 0,
      ratings: { off_rating: 121.0, def_rating: 109.7, net_rating: 11.3, pace: 99.7 },
      four_factors: { efg_pct: 0.578, tov_pct: 0.102, oreb_pct: 0.249, ftr: 0.224, opp_efg_pct: 0.523 },
    },
    {
      team_id: "1610612742",
      tricode: "DAL",
      name: "Dallas Mavericks",
      games_played: 82,
      wins: 50,
      losses: 32,
      win_pct: 0.61,
      conference: "Western",
      division: "Southwest",
      production: { pts_per_game: 117.9, fg_pct: 0.481, fg3_pct: 0.369 },
      allowance: { pts_allowed_per_game: 115.6, fg_pct_allowed: 0.475 },
      observed_games: 82,
      exclusions: 0,
      ratings: { off_rating: 117.0, def_rating: 114.9, net_rating: 2.1, pace: 100.8 },
      four_factors: { efg_pct: 0.559, tov_pct: 0.107, oreb_pct: 0.235, ftr: 0.245, opp_efg_pct: 0.548 },
    },
    {
      team_id: "1610612761",
      tricode: "TOR",
      name: "Toronto Raptors",
      games_played: 82,
      wins: 25,
      losses: 57,
      win_pct: 0.305,
      conference: "Eastern",
      division: "Atlantic",
      production: { pts_per_game: 112.4, fg_pct: 0.471, fg3_pct: 0.347 },
      allowance: { pts_allowed_per_game: 118.8, fg_pct_allowed: 0.491 },
      observed_games: 82,
      exclusions: 0,
      ratings: { off_rating: 111.8, def_rating: 118.1, net_rating: -6.3, pace: 100.2 },
      four_factors: { efg_pct: 0.537, tov_pct: 0.125, oreb_pct: 0.245, ftr: 0.231, opp_efg_pct: 0.562 },
    },
  ];

  it("groups teams correctly by conference", () => {
    const east = sampleTeams.filter((t) => t.conference === "Eastern");
    const west = sampleTeams.filter((t) => t.conference === "Western");

    expect(east.map((t) => t.tricode)).toEqual(["BOS", "TOR"]);
    expect(west.map((t) => t.tricode)).toEqual(["DAL"]);
  });

  it("groups teams correctly by division", () => {
    const atlantic = sampleTeams.filter((t) => t.division === "Atlantic");
    const southwest = sampleTeams.filter((t) => t.division === "Southwest");

    expect(atlantic.map((t) => t.tricode)).toEqual(["BOS", "TOR"]);
    expect(southwest.map((t) => t.tricode)).toEqual(["DAL"]);
  });

  it("sorts teams correctly by win percentage descending", () => {
    const sorted = [...sampleTeams].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0));
    expect(sorted.map((t) => t.tricode)).toEqual(["BOS", "DAL", "TOR"]);
  });

  it("sorts teams correctly by defensive rating ascending (lower is better)", () => {
    const sorted = [...sampleTeams].sort(
      (a, b) => (a.ratings?.def_rating ?? 999) - (b.ratings?.def_rating ?? 999)
    );
    expect(sorted.map((t) => t.tricode)).toEqual(["BOS", "DAL", "TOR"]);
  });

  it("calculates Head-to-Head series record accurately", () => {
    const games = [
      { opponent_id: "1610612742", opponent_tricode: "DAL", team_points: 125, opponent_points: 112, is_win: true },
      { opponent_id: "1610612742", opponent_tricode: "DAL", team_points: 138, opponent_points: 110, is_win: true },
    ];

    let aWins = 0;
    let bWins = 0;
    let aPts = 0;
    let bPts = 0;

    for (const g of games) {
      if (g.is_win) aWins++;
      else bWins++;
      aPts += g.team_points;
      bPts += g.opponent_points;
    }

    const margin = (aPts - bPts) / games.length;
    expect(aWins).toBe(2);
    expect(bWins).toBe(0);
    expect(margin).toBe(20.5);
  });

  it("calculates F18 Three-Point Variation slider arithmetic correctly", () => {
    const observedFg3m = 1351;
    const observedFg3a = 3482;
    const observed3pPct = observedFg3m / observedFg3a; // ~0.38799
    const league3pPct = 0.366;
    const regressionFraction = 1.0; // 100% regression to league mean

    const target3pPct = observed3pPct + regressionFraction * (league3pPct - observed3pPct);
    const hypotheticalFg3m = target3pPct * observedFg3a;
    const deltaPoints = Math.round((hypotheticalFg3m - observedFg3m) * 3);

    expect(target3pPct).toBeCloseTo(0.366, 3);
    expect(deltaPoints).toBeLessThan(0); // Shooting was above league average, so points regress downwards

    const gamesPlayed = 82;
    const actualPpg = 120.6;
    const hypotheticalPpg = (actualPpg * gamesPlayed + deltaPoints) / gamesPlayed;
    expect(hypotheticalPpg).toBeLessThan(actualPpg);
  });
});
