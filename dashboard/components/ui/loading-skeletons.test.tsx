// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import RootLoading from "@/app/loading";
import StatsLoading from "@/app/stats/loading";
import PlayersLoading from "@/app/players/loading";
import PlayerProfileLoading from "@/app/players/[id]/loading";
import TeamsLoading from "@/app/teams/loading";
import TeamDetailLoading from "@/app/teams/[id]/loading";
import CompareLoading from "@/app/compare/loading";
import LiveLoading from "@/app/live/loading";
import LiveGameLoading from "@/app/live/games/[id]/loading";
import PlayoffsLoading from "@/app/playoffs/loading";
import AskLoading from "@/app/research/ask/loading";
import WowyLoading from "@/app/wowy/loading";
import ContractsLoading from "@/app/contracts/loading";
import ContractsBooksLoading from "@/app/contracts/books/loading";
import DataStatusLoading from "@/app/data-status/loading";
import ForecastsLoading from "@/app/forecasts/loading";
import SettingsLoading from "@/app/settings/loading";
import TierListLoading from "@/app/tierlist/loading";
import InvestigationsLoading from "@/app/investigations/loading";

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
    { name: "TierListLoading", component: TierListLoading },
    { name: "InvestigationsLoading", component: InvestigationsLoading },
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
