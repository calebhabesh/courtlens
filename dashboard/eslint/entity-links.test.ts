import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// SL01: a hand-built player, team, game or series href fails lint under the real config.
describe("entity href lint rule", () => {
  const eslint = new ESLint({ cwd: process.cwd(), ruleFilter: ({ ruleId }) => ruleId === "no-restricted-syntax" });
  const lint = async (code: string, filePath = "components/entity-href-probe.tsx") =>
    (await eslint.lintText(code, { filePath }))[0].messages.filter(message => message.message.includes("lib/entity-links.ts"));

  it("goes red on raw entity path literals", async () => {
    expect(await lint("export const a = (id: string) => `/players/${id}`;")).toHaveLength(1);
    expect(await lint(`export const A = () => <a href="/players/2544">x</a>;`)).toHaveLength(1);
    expect(await lint("export const b = (id: string) => `/teams/${id}?season=2024-25`;")).toHaveLength(1);
    expect(await lint("export const c = (id: string) => `/live/games/${id}`;")).toHaveLength(1);
    expect(await lint(`export const d = "/live/open?date=2025-01-15";`)).toHaveLength(1);
    expect(await lint(`export const e = "/playoffs/2024-25-west-r1";`)).toHaveLength(1);
  });
  it("leaves other paths, later template parts and the builders alone", async () => {
    expect(await lint("export const a = (id: string) => `/api/workbench/players/${id}`;")).toHaveLength(0);
    expect(await lint(`export const b = "/players"; export const c = "/teams?season=2024-25"; export const d = "/playoffs";`)).toHaveLength(0);
    expect(await lint("export const e = (base: string, id: string) => `${base}/players/${id}`;")).toHaveLength(0);
    expect(await lint("export const f = (id: string) => `/players/${id}`;", "lib/entity-links.ts")).toHaveLength(0);
  });
}, 120_000);
