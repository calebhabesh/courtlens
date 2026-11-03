import { describe, expect, it } from "vitest";
import {
  LAST_GAMES_STATS, changeTone, chosenStats, clampWindow, formatChange, formatStat, gamesCsv, playedChronological,
  rolling, splitWindow, totals, stretchVerdict, sinceAnchors, gamesSince, contextSummary, MIN_STRETCHES,
} from "./last-games";
import type { PlayerGameLogItem } from "./types";

const stat = (key: string) => LAST_GAMES_STATS.find(s => s.key === key)!;

function game(id: string, date: string, box: Partial<Record<string, number | null>>, minutes: number | null = 30, appearance = "appeared"): PlayerGameLogItem {
  return {
    game_id: id, game_date: date, season: "2025-26", phase: "regular_season", team_id: "OKC", team_tricode: "OKC",
    opponent_id: "SAS", opponent_tricode: "SAS", side: "away", appearance, minutes, points: box.points ?? null,
    stats: { field_goals_made: 0, field_goals_attempted: 0, three_pointers_made: 0, three_pointers_attempted: 0, free_throws_made: 0, free_throws_attempted: 0, ...box },
    legacy_fantasy_score: null, lineage_ref: id,
  };
}

const games = [
  game("3", "2026-01-03", { points: 30, assists: 10, turnovers: 2, field_goals_made: 10, field_goals_attempted: 20, three_pointers_made: 2, three_pointers_attempted: 5, free_throws_made: 8, free_throws_attempted: 10, plus_minus: 7 }, 40),
  game("1", "2026-01-01", { points: 10, assists: 2, turnovers: 4, field_goals_made: 4, field_goals_attempted: 10, three_pointers_made: 0, three_pointers_attempted: 2, free_throws_made: 2, free_throws_attempted: 2, plus_minus: null }, 20),
  game("x", "2026-01-02", {}, null, "inactive"),
  game("2", "2026-01-02", { points: 20, assists: 6, turnovers: 3, field_goals_made: 8, field_goals_attempted: 16, three_pointers_made: 1, three_pointers_attempted: 4, free_throws_made: 3, free_throws_attempted: 4, plus_minus: -3 }, 30),
];

describe("last X games math", () => {
  it("keeps played games only, oldest first", () => {
    expect(playedChronological(games).map(g => g.game_id)).toEqual(["1", "2", "3"]);
  });

  it("splits the last N from the games before them, bounded by the games played", () => {
    const played = playedChronological(games);
    expect(splitWindow(played, 1).last.map(g => g.game_id)).toEqual(["3"]);
    expect(splitWindow(played, 1).first.map(g => g.game_id)).toEqual(["1", "2"]);
    expect(clampWindow(9, 3)).toBe(2);
    expect(clampWindow(0, 3)).toBe(1);
    expect(clampWindow(5, 1)).toBe(1);
  });

  it("averages counting stats over known games and scales Per 36 by their minutes", () => {
    const t = totals(playedChronological(games));
    expect(stat("pts").value(t, "per_game")).toBe(20);
    expect(stat("pts").value(t, "per_36")).toBeCloseTo(60 / 90 * 36);
    expect(stat("mpg").value(t, "per_game")).toBe(30);
  });

  it("reads rates from summed makes and attempts, never averaged percentages", () => {
    const t = totals(playedChronological(games));
    expect(stat("ts").value(t, "per_game")).toBeCloseTo(60 / (2 * (46 + 0.44 * 16)));
    expect(stat("2p").value(t, "per_game")).toBeCloseTo((22 - 3) / (46 - 11));
    expect(stat("ftr").value(t, "per_game")).toBeCloseTo(16 / 46);
    expect(stat("fg2a").value(t, "per_game")).toBeCloseTo((46 - 11) / 3);
  });

  it("leaves an unknown +/- out instead of counting it as zero", () => {
    const t = totals(playedChronological(games));
    expect(t.pm.n).toBe(2);
    expect(stat("pm").value(t, "per_game")).toBe(2);
    expect(stat("pm").value(totals([games[1]]), "per_game")).toBeNull();
    expect(formatStat(stat("pm"), null)).toBe("—");
  });

  it("tones a change by whether it is better, so more turnovers read blue", () => {
    expect(changeTone(stat("pts"), 2)).toBe("up");
    expect(changeTone(stat("pts"), -2)).toBe("down");
    expect(changeTone(stat("tov"), 1)).toBe("down");
    expect(changeTone(stat("tov"), 0)).toBeNull();
    expect(changeTone(stat("tov"), null)).toBeNull();
  });

  it("formats like Databallr: trailing .0 dropped, percentages to one decimal", () => {
    expect(formatStat(stat("pts"), 10)).toBe("10");
    expect(formatStat(stat("pts"), 25.44)).toBe("25.4");
    expect(formatStat(stat("ts"), 0.5667)).toBe("56.7%");
    expect(formatStat(stat("mpg"), 43.3, true)).toBe("43");
    expect(formatChange(stat("pts"), -5.4)).toBe("-5.4");
    expect(formatChange(stat("stl"), 0)).toBe("+0");
    expect(formatChange(stat("ts"), -0.09)).toBe("-9.0%");
    // A change that shows as zero has no sign and no tone.
    expect(formatChange(stat("fg3a"), -0.03)).toBe("+0");
    expect(changeTone(stat("pts"), 0.04)).toBeNull();
  });

  it("rolls over the games up to each point, early points using what has been played", () => {
    const played = playedChronological(games);
    expect(rolling(played, stat("pts"), 2, "per_game")).toEqual([10, 15, 25]);
  });

  it("ends each rolling line on the window's value when the average follows the window", () => {
    const played = playedChronological(games);
    for (const key of ["pts", "ts", "pm"]) {
      const s = stat(key), { last } = splitWindow(played, 2);
      expect(rolling(played, s, 2, "per_game").at(-1)).toEqual(s.value(totals(last), "per_game"));
    }
  });

  it("orders chosen stats by the catalog so each group is one run", () => {
    expect(chosenStats("pm,pts,ts").map(s => s.key)).toEqual(["pts", "ts", "pm"]);
    expect(chosenStats("bogus").length).toBe(16);
  });

  it("exports the log as CSV with quoted names", () => {
    const csv = gamesCsv("Shai, SGA", playedChronological(games), chosenStats("pts,pm"), "per_game");
    expect(csv.split("\n")[0]).toBe("player,date,season,phase,team,opponent,side,PTS,+/-");
    expect(csv).toContain('"Shai, SGA",2026-01-01');
    expect(csv.split("\n")[1].endsWith(",10,")).toBe(true);
  });

  it("judges the window against every stretch of the season, and not with too few", () => {
    const run = (points: number[]) => points.map((p, i) => game(`g${i}`, `2026-01-${String(i + 1).padStart(2, "0")}`, { points: p }));
    const pts = stat("pts");
    // 20 games scoring 20, then a 2-game window of 5s: the lowest 2-game stretch of the season.
    expect(stretchVerdict(run([...Array(20).fill(20), 5, 5]), pts, 2, "per_game")).toMatchObject({ kind: "low", unusual: true, extreme: true });
    expect(stretchVerdict(run([...Array(20).fill(20), 40, 40]), pts, 2, "per_game")?.text).toBe("Highest 2-game PTS of the season (best)");
    // An alternating season: a 2-game window of one 10 and one 30 sits in the middle.
    expect(stretchVerdict(run(Array.from({ length: 22 }, (_, i) => i % 2 ? 30 : 10)), pts, 2, "per_game")).toMatchObject({ kind: "normal", unusual: false });
    expect(stretchVerdict(run(Array(MIN_STRETCHES).fill(20)), pts, 2, "per_game")).toBeNull();
  });

  it("names Since anchors from facts only: team changes, the playoffs and long gaps", () => {
    const g = (id: string, date: string, team: string, phase = "regular_season") => ({ ...game(id, date, { points: 10 }), team_id: team, team_tricode: team, phase });
    const log = [g("1", "2026-01-01", "TOR"), g("2", "2026-01-03", "TOR"), g("3", "2026-01-20", "TOR"), g("4", "2026-02-10", "DAL"), g("5", "2026-04-20", "DAL", "playoffs")];
    expect(sinceAnchors(log).map(a => a.label)).toEqual(["Since the playoffs began", "Since joining DAL", "Since a 17-day gap"]);
    expect(gamesSince(log, "2026-02-10")).toBe(2);
  });

  it("summarises opponent defence and record over the games it knows", () => {
    const log = playedChronological(games);
    const context = { "1": { result: "W" as const, teamPoints: 110, opponentPoints: 100, side: "home" as const, restDays: 0, backToBack: true }, "2": { result: "L" as const, teamPoints: 90, opponentPoints: 99, side: "away" as const, restDays: 2, backToBack: false } };
    const summary = contextSummary(log, context, g => g.game_id === "3" ? null : { rating: 110, rank: g.game_id === "1" ? 4 : 10 });
    expect(summary).toMatchObject({ rank: 7, rating: 110, known: 2, wins: 1, losses: 1, b2b: 1 });
  });
});
