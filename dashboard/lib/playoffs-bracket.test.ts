import { describe, expect, it } from "vitest";
import modern from "../e2e/fixtures/playoffs-bracket-2025-26.json";
import byes from "../e2e/fixtures/playoffs-bracket-1975-76.json";
import divisions from "../e2e/fixtures/playoffs-bracket-1965-66.json";
import threeGroups from "../e2e/fixtures/playoffs-bracket-1949-50.json";
import { buildBracket, recordLabel, seasonSeriesLabel, seedOrder, type BracketSlot } from "./playoffs-bracket";
import type { PlayoffBracketResponse, PlayoffRoundResponse } from "./types";

const rounds = (bracket: unknown) => (bracket as PlayoffBracketResponse).rounds;
const codes = (column: BracketSlot[]) => column.map(slot => slot.kind === "series" ? `${slot.series.team1.tricode}-${slot.series.team2.tricode}` : slot.kind);

describe("mirrored bracket", () => {
  it("orders standard seeds so 1 meets the 4/5 winner", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(2)).toEqual([1, 2]);
  });

  it("places each series under the one its winner played next (2025-26)", () => {
    const layout = buildBracket(rounds(modern))!;
    expect(layout.finals?.slug).toBe("2026-finals-sas-nyk");
    expect(layout.west.columns.map(codes)).toEqual([
      ["OKC-PHX", "LAL-HOU", "SAS-POR", "DEN-MIN"],
      ["OKC-LAL", "SAS-MIN"],
      ["OKC-SAS"]
    ]);
    // NBA matchup order (DET, BOS, NYK, CLE) is not bracket order: DET met CLE next.
    expect(layout.east.columns.map(codes)).toEqual([
      ["DET-ORL", "CLE-TOR", "BOS-PHI", "NYK-ATL"],
      ["DET-CLE", "NYK-PHI"],
      ["NYK-CLE"]
    ]);
    expect(layout.west.roundNames).toEqual(["First Round", "Semifinals", "Conference Finals"]);
  });

  it("leaves later rounds open while the playoffs are under way, in seed order", () => {
    const firstRound = rounds(modern).map(round => round.round_number === 1 ? round : { ...round, series: [], eastern_series: [], western_series: [], finals_series: [] } as PlayoffRoundResponse);
    const layout = buildBracket(firstRound)!;
    expect(layout.finals).toBeNull();
    expect(codes(layout.west.columns[0])).toEqual(["OKC-PHX", "LAL-HOU", "SAS-POR", "DEN-MIN"]);
    expect(codes(layout.west.columns[1])).toEqual(["tbd", "tbd"]);
    expect(codes(layout.east.columns[2])).toEqual(["tbd"]);
  });

  it("marks byes where a team entered a later round (1975-76)", () => {
    const layout = buildBracket(rounds(byes))!;
    expect(codes(layout.east.columns[0])).toEqual(["bye", "PHI-BUF", "bye", "bye"]);
    expect(codes(layout.east.columns[1])).toEqual(["BOS-BUF", "CLE-WSB"]);
    expect(codes(layout.west.columns[0])).toEqual(["bye", "MIL-DET", "bye", "bye"]);
  });

  it("draws division playoffs with byes as a two-round tree (1965-66)", () => {
    const layout = buildBracket(rounds(divisions))!;
    expect(codes(layout.east.columns[0])).toEqual(["bye", "BOS-CIN"]);
    expect(codes(layout.east.columns[1])).toEqual(["PHI-BOS"]);
  });

  it("keeps the round columns when a season has three groups (1949-50)", () => {
    expect(buildBracket(rounds(threeGroups))).toBeNull();
  });

  it("labels records and season series", () => {
    const okc = rounds(modern)[0].western_series[0];
    expect(recordLabel(okc.team1)).toBe("64–18");
    expect(seasonSeriesLabel(okc)).toBe("OKC 3–2");
    expect(seasonSeriesLabel({ ...okc, team1: { ...okc.team1, season_series_wins: null } })).toBeNull();
    expect(seasonSeriesLabel({ ...okc, team2: { ...okc.team2, season_series_wins: 3 } })).toBe("Split 3–3");
  });
});
