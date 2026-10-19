import { describe, expect, it } from "vitest";
import {
  BOX, FIT_SHAPES, category, packShapes, parseMode, parseSort, shapeGeometry, shapeKind, signed, sortTeams, surname, type ShapeKind, type ShapeTeam
} from "./roster-shapes";

const team = (tricode: string, name: string, fill: number, ease: number | null, fillPlayoff = fill): ShapeTeam => ({
  team_id: tricode, team_tricode: tricode, team_name: name, conference: "West", players: 0, sized_players: 0, below_replacement_players: 0,
  unknown_players: 0, size: fill, size_playoff: fillPlayoff, fill, fill_playoff: fillPlayoff, fit_ease: ease, roster: []
});
type Placed = { kind: ShapeKind; x: number; y: number; side: number };
const outline = (s: Placed) => shapeGeometry(s.kind).points.map(([x, y]) => [s.x + (x + 1) * s.side / 2, s.y + (y + 1) * s.side / 2] as [number, number]);
function inside(points: [number, number][], [x, y]: [number, number]) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** Outlines touch when a vertex or edge midpoint of one lies inside the other (bounding squares may overlap). */
const overlaps = (a: Placed, b: Placed) => {
  const pa = outline(a), pb = outline(b);
  const dense = (p: [number, number][]) => p.flatMap((v, i) => { const w = p[(i + 1) % p.length]; return [v, [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2] as [number, number]]; });
  return dense(pa).some(v => inside(pb, v)) || dense(pb).some(v => inside(pa, v));
};

describe("roster shapes", () => {
  it("maps only the six fitted clusters to categorical tokens", () => {
    expect([category(0), category(5), category(6), category(null)]).toEqual([1, 6, null, null]);
  });
  it("sorts Fullest (by mode), Best fit (unknown last) and A–Z with stable name ties", () => {
    const teams = [team("B", "Bravo", 0.5, null, 0.1), team("A", "Alpha", 0.5, 0.4), team("C", "Charlie", 0.9, 0.6)];
    expect(sortTeams(teams, "fullest").map(t => t.team_tricode)).toEqual(["C", "A", "B"]);
    expect(sortTeams(teams, "fullest", "playoff").map(t => t.team_tricode)).toEqual(["C", "A", "B"]);
    expect(sortTeams([team("X", "X", 0.1, 0, 0.9), team("Y", "Y", 0.5, 0)], "fullest", "playoff").map(t => t.team_tricode)).toEqual(["X", "Y"]);
    expect(sortTeams(teams, "fit").map(t => t.team_tricode)).toEqual(["C", "A", "B"]);
    expect(sortTeams(teams, "az").map(t => t.team_tricode)).toEqual(["A", "B", "C"]);
    expect([parseSort(null), parseSort("fit"), parseSort("nope")]).toEqual(["fullest", "fit", "fullest"]);
    expect([parseMode(null), parseMode("playoff")]).toEqual(["regular", "playoff"]);
  });
  it("labels shapes by surname, keeping suffixes with it", () => {
    expect([surname("Victor Wembanyama"), surname("Jaren Jackson Jr."), surname("Nenê")]).toEqual(["Wembanyama", "Jackson Jr.", "Nenê"]);
  });
  it("signs follow the rounded value", () => {
    expect([signed(0.04), signed(-0.04), signed(2.26), signed(-1.5), signed(null)]).toEqual(["0.0", "0.0", "+2.3", "−1.5", "—"]);
  });
  it("orders shapes squarer to spikier, each normalised to the unit square", () => {
    const ratios = FIT_SHAPES.map(kind => shapeGeometry(kind).ratio);
    expect(ratios[0]).toBeGreaterThan(ratios[1]);
    expect(ratios.at(-2)!).toBeLessThan(ratios[0]);
    for (const kind of [...FIT_SHAPES, "unknown" as const]) {
      const xs = shapeGeometry(kind).points.map(p => p[0]), ys = shapeGeometry(kind).points.map(p => p[1]);
      expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeCloseTo(2, 6);
    }
    expect([shapeKind(null), shapeKind(0), shapeKind(7), shapeKind(99)]).toEqual(["unknown", "squircle", "burst", "burst"]);
  });
  it("packs every outline inside the box without touching another, drawn area equal to its share", () => {
    const items = [38, 11, 5, 3, 2, 1.5, 1, 1, 0.5, 0.2].map((share, i) => ({ id: `p${i}`, area: share / 100 * BOX * BOX, kind: FIT_SHAPES[i % 8] }));
    const { shapes, scale } = packShapes(items);
    expect(scale).toBe(1);
    expect(shapes).toHaveLength(items.length);
    for (const shape of shapes) {
      expect(shape.x).toBeGreaterThanOrEqual(0); expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.x + shape.side).toBeLessThanOrEqual(BOX + 1e-6); expect(shape.y + shape.side).toBeLessThanOrEqual(BOX + 1e-6);
      expect(shape.side ** 2 * shapeGeometry(shape.kind).ratio).toBeCloseTo(shape.area, 6);
    }
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) expect(overlaps(shapes[i], shapes[j])).toBe(false);
    // Deterministic: the same roster always draws the same picture.
    expect(packShapes(items)).toEqual(packShapes([...items].reverse()));
  });
  it("lays a sparse roster on an even grid, largest in the centre", () => {
    const items = [2, 1, 0.5, 0.4, 0.3].map((share, i) => ({ id: `s${i}`, area: share / 100 * BOX * BOX, kind: "circle" as const }));
    const { shapes } = packShapes(items);
    const centre = (id: string) => { const s = shapes.find(x => x.id === id)!; return [s.x + s.side / 2, s.y + s.side / 2]; };
    expect(shapes).toHaveLength(5);
    // Three columns, two rows: the largest sits in a middle-column cell.
    expect(centre("s0")[0]).toBeCloseTo(50, 6);
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) expect(overlaps(shapes[i], shapes[j])).toBe(false);
  });
  it("draws nothing for zero or unknown sizes", () => {
    expect(packShapes([{ id: "a", area: 0, kind: "circle" }]).shapes).toEqual([]);
  });
});
