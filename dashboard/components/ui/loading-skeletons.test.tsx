// @vitest-environment happy-dom
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { ArticleLoading as RootLoading } from "@/components/ui/article-loading";
import { StatsPageSkeleton as StatsLoading } from "@/components/stats-page-skeleton";
import PlayersLoading from "@/app/players/skeleton";
import PlayerProfileLoading from "@/app/players/[id]/loading";
import TeamsLoading from "@/app/teams/skeleton";
import TeamDetailLoading from "@/app/teams/[id]/skeleton";
import CompareLoading from "@/app/compare/skeleton";
import LiveLoading from "@/app/live/skeleton";
import LiveGameLoading from "@/app/live/games/[id]/loading";
import PlayoffsLoading from "@/app/playoffs/skeleton";
import AskLoading from "@/app/research/ask/skeleton";
import WowyLoading from "@/app/wowy/skeleton";
import ContractsLoading from "@/app/contracts/skeleton";
import ContractsBooksLoading from "@/app/contracts/books/skeleton";
import DataStatusLoading from "@/app/data-status/loading";
import ForecastsLoading from "@/app/forecasts/skeleton";
import SettingsLoading from "@/app/settings/skeleton";
import InvestigationsLoading from "@/app/investigations/skeleton";
import TeamCompareLoading from "@/app/team-compare/skeleton";
import MatchupsLoading from "@/app/matchups/skeleton";
import SeriesLoading from "@/app/playoffs/[seriesId]/skeleton";
import ContractsTeamLoading from "@/app/contracts/[team]/skeleton";
import FreeAgencyLoading from "@/app/free-agency/skeleton";
import RosterShapesLoading from "@/app/roster-shapes/skeleton";
import CalculatorLoading from "@/app/calculator/skeleton";
import EvaluationLoading from "@/app/evaluation/skeleton";
import ShowcaseLoading from "@/app/showcase/skeleton";
import RapmLoading from "@/app/research/rapm/skeleton";
import ShootingLoading from "@/app/research/shooting/skeleton";
import CaseStudiesLoading from "@/app/research/case-studies/skeleton";
import BacktestLoading from "@/app/research/backtest/skeleton";
import SignalNoiseLoading from "@/app/research/signal-noise/skeleton";
import LineupModelLoading from "@/app/research/lineup-model/skeleton";
import ProjectedImpactLoading from "@/app/research/projected-impact/skeleton";
import WinProbabilityLoading from "@/app/research/win-probability/skeleton";
import ZtsLoading from "@/app/research/zts/skeleton";
import ShotQualityLoading from "@/app/research/shot-quality/skeleton";
import DraftLoading from "@/app/draft/skeleton";
import WingspanLoading from "@/app/wingspan/skeleton";
import StandingsLoading from "@/app/standings/skeleton";
import LastGamesLoading from "@/app/last-games/skeleton";
import StatLineShiftLoading from "@/app/stat-line-shift/skeleton";

describe("Route Loading Skeletons", () => {
  const skeletons = [
    { name: "RootLoading", component: RootLoading },
    { name: "StatsLoading", component: StatsLoading },
    { name: "PlayersLoading", component: PlayersLoading },
    { name: "PlayerProfileLoading", component: PlayerProfileLoading },
    { name: "TeamsLoading", component: TeamsLoading },
    { name: "TeamDetailLoading", component: TeamDetailLoading },
    { name: "CompareLoading", component: CompareLoading },
    { name: "LiveLoading", component: LiveLoading },
    { name: "LiveGameLoading", component: LiveGameLoading },
    { name: "PlayoffsLoading", component: PlayoffsLoading },
    { name: "AskLoading", component: AskLoading },
    { name: "WowyLoading", component: WowyLoading },
    { name: "ContractsLoading", component: ContractsLoading },
    { name: "ContractsBooksLoading", component: ContractsBooksLoading },
    { name: "DataStatusLoading", component: DataStatusLoading },
    { name: "ForecastsLoading", component: ForecastsLoading },
    { name: "SettingsLoading", component: SettingsLoading },
    { name: "InvestigationsLoading", component: InvestigationsLoading },
    { name: "TeamCompareLoading", component: TeamCompareLoading },
    { name: "MatchupsLoading", component: MatchupsLoading },
    { name: "SeriesLoading", component: SeriesLoading },
    { name: "ContractsTeamLoading", component: ContractsTeamLoading },
    { name: "FreeAgencyLoading", component: FreeAgencyLoading },
    { name: "RosterShapesLoading", component: RosterShapesLoading },
    { name: "CalculatorLoading", component: CalculatorLoading },
    { name: "EvaluationLoading", component: EvaluationLoading },
    { name: "ShowcaseLoading", component: ShowcaseLoading },
    { name: "RapmLoading", component: RapmLoading },
    { name: "ShootingLoading", component: ShootingLoading },
    { name: "CaseStudiesLoading", component: CaseStudiesLoading },
    { name: "BacktestLoading", component: BacktestLoading },
    { name: "SignalNoiseLoading", component: SignalNoiseLoading },
    { name: "LineupModelLoading", component: LineupModelLoading },
    { name: "ProjectedImpactLoading", component: ProjectedImpactLoading },
    { name: "WinProbabilityLoading", component: WinProbabilityLoading },
    { name: "ZtsLoading", component: ZtsLoading },
    { name: "ShotQualityLoading", component: ShotQualityLoading },
    { name: "DraftLoading", component: DraftLoading },
    { name: "WingspanLoading", component: WingspanLoading },
    { name: "StandingsLoading", component: StandingsLoading },
    { name: "LastGamesLoading", component: LastGamesLoading },
    { name: "StatLineShiftLoading", component: StatLineShiftLoading },
  ];

  for (const { name, component: Component } of skeletons) {
    it(`renders ${name} with accessible skeletons and aria-busy`, () => {
      const { container } = render(<Component />);
      expect(container.firstChild).toBeDefined();

      const skeletonElements = container.querySelectorAll(".ui-skeleton, [data-skeleton='true']");
      expect(skeletonElements.length).toBeGreaterThan(0);

      // Verify no raw un-tokenized style attributes
      const allStyled = container.querySelectorAll("[style]");
      for (const el of allStyled) {
        const styleText = el.getAttribute("style") || "";
        // Every inline style must be CSS custom properties (--*)
        const propertyRegex = /([a-z-]+)\s*:/g;
        let match;
        while ((match = propertyRegex.exec(styleText)) !== null) {
          expect(match[1].startsWith("--")).toBe(true);
        }
      }
    });
  }
});

/** Every `loading.tsx` under app/, as route paths. */
function routeLoaders(dir = path.resolve(__dirname, "../../app"), route = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? routeLoaders(path.join(dir, entry.name), `${route}/${entry.name}`)
    : entry.name === "loading.tsx" ? [route || "/"] : []);
}

describe("Route loaders (snappy pages, 2026-11-17)", () => {
  it("keeps a loader only on routes whose first server render is often a second or more", () => {
    // A loader's skeleton, once React commits it, holds the page back for React's 300 ms reveal
    // batch, so a fast page shows sooner without one (a slow link click keeps the old page under
    // IntentLink's scrim instead). These four were measured at 1–8 s on a first hit: historical
    // player pages, Data Status, Methodology, and live games (uncached, real time). The other
    // routes' skeletons sit in `skeleton.tsx`, which Next does not treat as a loader.
    expect(routeLoaders().sort()).toEqual(["/data-status", "/live/games/[id]", "/methodology", "/players/[id]"]);
  });
});
