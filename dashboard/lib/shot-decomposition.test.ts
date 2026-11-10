import { describe, expect, it } from "vitest";
import { decompositionCsv, type DecompositionBoard } from "./shot-decomposition";

const board = {
  labels: { ts: "oTS", sq: "oSQ", make: "oMake", ft: "oFT" },
  rows: [{
    player_id: "1", player_name: 'A "B", C', tricode: "BOS", shots: 2000.5,
    values: { ts: 1.5, sq: 1, make: 0.25, ft: 0.25 },
    intervals: { ts: [1, 2], sq: [0, 2], make: [-1, 1], ft: [0, 1] },
  }],
} as unknown as DecompositionBoard;

describe("decompositionCsv", () => {
  it("writes exact values with intervals and quotes names", () => {
    const [head, row] = decompositionCsv(board).trim().split("\n");
    expect(head).toBe("player_id,player,team,shots,oTS,oTS_p10,oTS_p90,oSQ,oSQ_p10,oSQ_p90,oMake,oMake_p10,oMake_p90,oFT,oFT_p10,oFT_p90");
    expect(row).toBe('1,"A ""B"", C",BOS,2000.5,1.5,1,2,1,0,2,0.25,-1,1,0.25,0,1');
  });
});
