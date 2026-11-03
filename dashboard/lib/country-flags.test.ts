import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FLAG_CODES, countryFlag } from "./country-flags";

describe("countryFlag", () => {
  it("resolves the player index's spellings, aliases included", () => {
    expect(countryFlag("Serbia")).toBe("/flags/rs.png");
    expect(countryFlag("USA")).toBe("/flags/us.png");
    expect(countryFlag("DRC")).toBe(countryFlag("Democratic Republic of the Congo"));
    expect(countryFlag("Scotland")).toBe("/flags/gb-sct.png");
  });
  it("gives no flag for unknown or missing countries", () => {
    expect(countryFlag("Atlantis")).toBeNull();
    expect(countryFlag(null)).toBeNull();
  });
  it("has a vendored image for every mapped code", () => {
    const missing = FLAG_CODES.filter(code => !existsSync(resolve(__dirname, `../public/flags/${code}.png`)));
    expect(missing).toEqual([]);
  });
});
