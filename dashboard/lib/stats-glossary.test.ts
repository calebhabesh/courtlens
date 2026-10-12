import { describe, expect, it } from "vitest";
import { glossaryEntries, glossaryPlain, glossaryShortName } from "./stats-glossary";
import type { MetricDefinition } from "./types";

const metric = (key: string, short_name = key.toUpperCase(), display_name = short_name, formula = key): MetricDefinition => ({
  key, version: "v3", display_name, short_name, category: "efficiency", unit: "x", formula, denominator: null,
  phase_scope: [], default_sort_direction: "desc", limitations: []
});

describe("stats glossary copy", () => {
  it("describes every catalog family instead of repeating the metric name", () => {
    for (const key of ["pts_per_game", "reb_total_per_game", "ast_per_36", "rapm_3y", "dbpr", "pbp_space_rts", "onoff_net_rating", "team_tov_pct", "impact_rts"]) {
      const text = glossaryPlain(metric(key));
      expect(text, key).not.toBe(key.toUpperCase());
      expect(text.length, key).toBeGreaterThan(20);
    }
    expect(glossaryPlain(metric("ast_per_game"))).toBe("Passes that directly lead to a made basket by a teammate, averaged per game.");
  });

  it("shows readable short forms, never backend field names", () => {
    expect(glossaryShortName(metric("pts_per_game", "PPG"))).toBe("PPG");
    expect(glossaryShortName(metric("team_possessions_estimated", "POSS_EST"))).toBe("POSS");
    expect(glossaryShortName(metric("pbp_create_frequency", "Create analogue frequency"))).toBe("Create Freq");
  });

  it("collapses catalog aliases with the same meaning", () => {
    const entries = glossaryEntries([metric("reb", "REB", "Total Rebounds", "sum(r)"), metric("reb_total", "REB", "Total Rebounds", "sum(r)")]);
    expect(entries).toHaveLength(1);
  });
});
