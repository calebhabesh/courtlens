import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/styles/tokens.css", import.meta.url), "utf8");
const colors = Object.fromEntries([...css.matchAll(/(--color-[\w-]+):\s*(#[\da-f]{6})/gi)].map(match => [match[1], match[2]]));
function luminance(hex: string) {
  const linear = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
}
describe("v1.2 measured palette", () => {
  it("keeps identity/category/status labels at AA on all dashboard surfaces", () => {
    const textTokens = Object.keys(colors).filter(name => /--color-(identity-[ab]|category-\d|status-[\w-]+)$/.test(name));
    for (const token of textTokens) for (const surface of ["--color-bg", "--color-surface-1", "--color-surface-2", "--color-surface-3"]) expect(contrast(colors[token], colors[surface]), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps percentile text readable while luminance rises in one blue hue", () => {
    let previous = 0;
    for (let i = 1; i <= 5; i++) {
      const hex = colors[`--color-percentile-${i}`];
      const channels = [1, 3, 5].map(n => Number.parseInt(hex.slice(n, n + 2), 16));
      expect(channels[0]).toBeLessThan(channels[1]); expect(channels[1]).toBeLessThan(channels[2]);
      expect(luminance(hex)).toBeGreaterThan(previous); previous = luminance(hex);
      expect(contrast(colors["--color-text"], hex), `percentile-${i}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("does not allow raw hex palettes back into the three migrated views", () => {
    for (const file of ["multi-player-lines-view.tsx", "scatter-plot-view.tsx", "player-compare-view.tsx"]) {
      expect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).not.toMatch(/#[\da-f]{3,8}\b/i);
    }
  });
});
