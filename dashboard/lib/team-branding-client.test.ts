import { describe, expect, it } from "vitest";
import full from "./team-branding.json";
import client from "./team-branding.client.json";

// Speed plan SP05: the browser imports team-branding.client.json, the catalog's records without
// provenance, hashes or byte counts. scripts/team_branding_assets.py writes both; this fails when
// they disagree (the full file regenerated without the client copy, or a hand edit to either).
const FIELDS = {
  teams: ["team_id", "tricode", "artwork_name", "asset"],
  eras: ["code", "franchise_id", "artwork_name", "first_season", "last_season", "stored_as_code", "asset", "brand_color"],
  inactive: ["franchise_id", "first_season", "last_season"],
  season_logos: ["franchise_id", "first_season", "last_season", "asset"],
  conferences: ["conference", "artwork_name", "asset", "width", "height"]
} as const;

describe("team-branding.client.json", () => {
  it("holds exactly the client fields of every record in team-branding.json, in order", () => {
    const projected = Object.fromEntries(Object.entries(FIELDS).map(([key, fields]) => [key,
      ((full as unknown as Record<string, Record<string, unknown>[]>)[key] ?? []).map(record =>
        Object.fromEntries(fields.filter(field => field in record).map(field => [field, record[field]])))]));
    expect(client).toEqual(projected);
    expect(Object.keys(client)).toEqual(Object.keys(FIELDS));
  });

  it("keeps every record and is much smaller than the full catalog", () => {
    expect(client.teams).toHaveLength(30);
    expect(client.season_logos.length).toBe(full.season_logos.length);
    expect(JSON.stringify(client).length).toBeLessThan(JSON.stringify(full).length / 2);
  });
});
