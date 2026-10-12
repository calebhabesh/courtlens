import { describe, expect, it } from "vitest";
import { glossaryEntries, glossaryName, glossaryPlain, glossaryShortName } from "./stats-glossary";
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

describe("glossary structure: abbreviation, full name, definition", () => {
  it("spells abbreviations out as full names", () => {
    expect(glossaryName(metric("impact_three_point_rate", "3PR", "3PR"))).toBe("Three-Point Attempt Rate");
    expect(glossaryName(metric("bpr_2y", "2Y BPR", "2Y BPR"))).toBe("Box Prior RAPM (2 seasons)");
    expect(glossaryName(metric("pbp_create_ts", "Create analogue ts", "Create analogue ts"))).toBe("Self-Created True Shooting Percentage");
    expect(glossaryName(metric("on_net_rating", "Net on", "Net on"))).toBe("Net Rating On Court");
  });
  it("never opens a definition by restating its name", () => {
    for (const [key, name] of [["ctov_pct", "Creation-Adjusted Turnover Percentage"], ["on_ball_pct", "On-Ball Percentage"],
      ["pts_created", "Points Created"], ["offensive_load", "Offensive Load"], ["impact_rts", "rTS"], ["bpr", "1Y BPR"], ["o_ts", "oTS"]]) {
      const entry = metric(key, name, name);
      const plain = glossaryPlain(entry).toLowerCase();
      expect(plain.startsWith(glossaryName(entry).toLowerCase())).toBe(false);
      expect(plain.startsWith(name.toLowerCase())).toBe(false);
    }
  });
});
