"""Unit tests for Block B15: Team analytical operations, schedules, and four factors.

Verifies:
1. Dean Oliver Four Factors arithmetic (eFG%, TOV%, ORB%, FTR, defensive variants).
2. Conventional estimated possessions, tempo/pace, and offensive/defensive/net ratings.
3. League ranking sorting (high-is-good vs low-is-good) and empirical percentile distributions.
4. Schedule context: rest days (date diff - 1), back-to-backs, streaks, road trips.
5. Three-point variation scenario (Feature F18: what-if accounting holding volume constant).
6. Statistical team peers / similarity: Euclidean distance, self-exclusion, stable sorting.
"""

from __future__ import annotations

from datetime import date

import pytest

from courtlens.domain.team_analytics import (
    compute_defensive_rating,
    compute_dreb_pct,
    compute_efg_pct,
    compute_estimated_possessions,
    compute_ftr,
    compute_league_rankings,
    compute_net_rating,
    compute_offensive_rating,
    compute_oreb_pct,
    compute_team_four_factors,
    compute_team_pace,
    compute_team_schedule_context,
    compute_team_similarity,
    compute_three_point_variation,
    compute_tov_pct,
)


class TestFourFactorsMath:
    """Test pure mathematical formulas for Dean Oliver Four Factors."""

    def test_efg_pct(self) -> None:
        # 40 FGM, 10 3PM, 80 FGA -> (40 + 0.5 * 10) / 80 = 45 / 80 = 0.5625
        assert compute_efg_pct(40.0, 10.0, 80.0) == 0.5625
        # Zero FGA returns None
        assert compute_efg_pct(0.0, 0.0, 0.0) is None

    def test_tov_pct(self) -> None:
        # 15 TOV, 80 FGA, 20 FTA -> 15 / (80 + 0.44 * 20 + 15) = 15 / 103.8 = 0.1445
        assert compute_tov_pct(15.0, 80.0, 20.0) == 0.1445
        # Zero denominator returns None
        assert compute_tov_pct(0.0, 0.0, 0.0) is None

    def test_oreb_and_dreb_pct(self) -> None:
        # 12 OREB, 28 Opp DREB -> 12 / (12 + 28) = 12 / 40 = 0.3000
        assert compute_oreb_pct(12.0, 28.0) == 0.3000
        # 30 DREB, 10 Opp OREB -> 30 / (30 + 10) = 30 / 40 = 0.7500
        assert compute_dreb_pct(30.0, 10.0) == 0.7500
        # Zero rebounds returns None
        assert compute_oreb_pct(0.0, 0.0) is None
        assert compute_dreb_pct(0.0, 0.0) is None

    def test_ftr(self) -> None:
        # 24 FTA, 80 FGA -> 24 / 80 = 0.3000
        assert compute_ftr(24.0, 80.0) == 0.3000
        assert compute_ftr(0.0, 0.0) is None

    def test_estimated_possessions(self) -> None:
        # 85 FGA, 20 FTA, 10 OREB, 14 TOV -> 85 + 0.44 * 20 - 10 + 14 = 85 + 8.8 - 10 + 14 = 97.8
        assert compute_estimated_possessions(85.0, 20.0, 10.0, 14.0) == 97.8

    def test_pace_and_ratings(self) -> None:
        # 8,200 possessions across 82 games -> 100.0 pace
        assert compute_team_pace(8200.0, 82) == 100.0
        # Total minutes provided: 8,200 possessions across (82 * 240) player minutes
        assert compute_team_pace(8200.0, 82, total_minutes=82 * 240.0) == 100.0

        # ORTG: 110 pts on 100 possessions -> 110.0
        assert compute_offensive_rating(110.0, 100.0) == 110.0
        # DRTG: 105 opp pts on 100 possessions -> 105.0
        assert compute_defensive_rating(105.0, 100.0) == 105.0
        # Net Rating: 110.0 - 105.0 = +5.0
        assert compute_net_rating(110.0, 105.0) == 5.0


class TestTeamFourFactorsAggregation:
    """Test full four factors calculation from aggregated team and opponent totals."""

    def test_compute_team_four_factors(self) -> None:
        team_totals = {
            "field_goals_made": 400.0,
            "field_goals_attempted": 800.0,
            "three_pointers_made": 100.0,
            "three_pointers_attempted": 300.0,
            "free_throws_made": 150.0,
            "free_throws_attempted": 200.0,
            "rebounds_offensive": 100.0,
            "rebounds_defensive": 300.0,
            "turnovers": 120.0,
            "points": 1050.0,
        }
        opp_totals = {
            "field_goals_made": 380.0,
            "field_goals_attempted": 820.0,
            "three_pointers_made": 90.0,
            "three_pointers_attempted": 270.0,
            "free_throws_made": 140.0,
            "free_throws_attempted": 180.0,
            "rebounds_offensive": 90.0,
            "rebounds_defensive": 280.0,
            "turnovers": 130.0,
            "points": 990.0,
        }

        factors = compute_team_four_factors(team_totals, opp_totals, games_played=10)

        # Offense Four Factors
        # eFG%: (400 + 0.5 * 100) / 800 = 450 / 800 = 0.5625
        assert factors["efg_pct"] == 0.5625
        # TOV%: 120 / (800 + 0.44 * 200 + 120) = 120 / 1008 = 0.1190
        assert factors["tov_pct"] == 0.1190
        # ORB%: 100 / (100 + 280) = 100 / 380 = 0.2632
        assert factors["oreb_pct"] == 0.2632
        # FTR: 200 / 800 = 0.2500
        assert factors["ftr"] == 0.2500

        # Defense Four Factors
        # Opp eFG%: (380 + 0.5 * 90) / 820 = 425 / 820 = 0.5183
        assert factors["opp_efg_pct"] == 0.5183
        # Opp TOV%: 130 / (820 + 0.44 * 180 + 130) = 130 / 1029.2 = 0.1263
        assert factors["opp_tov_pct"] == 0.1263
        # DREB%: 300 / (300 + 90) = 300 / 390 = 0.7692
        assert factors["dreb_pct"] == 0.7692

        # Possessions & Ratings
        # Team Poss: 800 + 0.44 * 200 - 100 + 120 = 908.0
        assert factors["possessions_estimated"] == 908.0
        # Pace: 908 / 10 = 90.8
        assert factors["pace"] == 90.8
        # ORTG: 100 * 1050 / 908 = 115.64
        assert factors["off_rating"] == 115.64
        assert factors["def_rating"] is not None
        assert factors["net_rating"] is not None
        assert factors["net_rating"] > 0


class TestLeagueRankingsAndPercentiles:
    """Test league-wide rankings and percentiles across high-is-good and low-is-good metrics."""

    def test_league_rankings_directionality(self) -> None:
        team_data = {
            "TEAM_A": {
                "efg_pct": 0.580,  # Best eFG%
                "tov_pct": 0.100,  # Best (lowest) TOV%
                "off_rating": 118.0,
                "def_rating": 112.0,  # Worse DRTG
                "net_rating": 6.0,
                "pace": 102.0,
                "oreb_pct": 0.28,
                "ftr": 0.26,
                "opp_efg_pct": 0.53,
                "opp_tov_pct": 0.14,
                "dreb_pct": 0.77,
                "opp_oreb_pct": 0.23,
                "opp_ftr": 0.22,
            },
            "TEAM_B": {
                "efg_pct": 0.540,
                "tov_pct": 0.130,
                "off_rating": 112.0,
                "def_rating": 106.0,  # Best (lowest) DRTG
                "net_rating": 6.0,
                "pace": 98.0,
                "oreb_pct": 0.25,
                "ftr": 0.24,
                "opp_efg_pct": 0.50,
                "opp_tov_pct": 0.12,
                "dreb_pct": 0.75,
                "opp_oreb_pct": 0.25,
                "opp_ftr": 0.20,
            },
            "TEAM_C": {
                "efg_pct": 0.510,  # Worst eFG%
                "tov_pct": 0.160,  # Worst (highest) TOV%
                "off_rating": 106.0,
                "def_rating": 114.0,  # Worst DRTG
                "net_rating": -8.0,
                "pace": 95.0,
                "oreb_pct": 0.22,
                "ftr": 0.20,
                "opp_efg_pct": 0.56,
                "opp_tov_pct": 0.10,
                "dreb_pct": 0.72,
                "opp_oreb_pct": 0.28,
                "opp_ftr": 0.25,
            },
        }

        averages, rankings = compute_league_rankings(team_data)

        # Check League Averages
        assert pytest.approx(averages["efg_pct"], 0.001) == (0.580 + 0.540 + 0.510) / 3

        # Check eFG% (High is good): TEAM_A = Rank 1, TEAM_B = Rank 2, TEAM_C = Rank 3
        assert rankings["TEAM_A"]["efg_pct"]["rank"] == 1
        assert rankings["TEAM_B"]["efg_pct"]["rank"] == 2
        assert rankings["TEAM_C"]["efg_pct"]["rank"] == 3
        pct_a = rankings["TEAM_A"]["efg_pct"]["percentile"]
        pct_c = rankings["TEAM_C"]["efg_pct"]["percentile"]
        assert pct_a > pct_c

        # Check TOV% (Low is good): TEAM_A (0.10) = Rank 1, TEAM_B (0.13) = 2, TEAM_C (0.16) = 3
        assert rankings["TEAM_A"]["tov_pct"]["rank"] == 1
        assert rankings["TEAM_B"]["tov_pct"]["rank"] == 2
        assert rankings["TEAM_C"]["tov_pct"]["rank"] == 3
        # Lower turnover percentage yields higher percentile performance
        tov_pct_a = rankings["TEAM_A"]["tov_pct"]["percentile"]
        tov_pct_c = rankings["TEAM_C"]["tov_pct"]["percentile"]
        assert tov_pct_a > tov_pct_c

        # Check Defensive Rating (Low is good): TEAM_B (106) = 1, TEAM_A (112) = 2, TEAM_C (114) = 3
        assert rankings["TEAM_B"]["def_rating"]["rank"] == 1
        assert rankings["TEAM_A"]["def_rating"]["rank"] == 2
        assert rankings["TEAM_C"]["def_rating"]["rank"] == 3


class TestThreePointVariationScenario:
    """Test Feature F18: Three-point variation what-if scenario."""

    def test_three_point_variation_accounting(self) -> None:
        # Team made 800 3PM on 2400 3PA (33.3% 3P). League average is 36.0%.
        # Over 80 games with 8,000 total points and 8,000 possessions.
        res = compute_three_point_variation(
            observed_fg3m=800.0,
            observed_fg3a=2400.0,
            points_total=8000.0,
            possessions=8000.0,
            games_played=80,
            def_rating=105.0,
            league_3p_pct=0.3600,
        )

        # Hypothetical 3PM = 2400 * 0.3600 = 864.0
        assert res["hypothetical_fg3m"] == 864.0
        # Delta 3PM = 64 -> Delta Points = 64 * 3 = 192.0
        assert res["delta_points"] == 192.0
        # Actual PPG = 100.0, Hypothetical PPG = 8192 / 80 = 102.4
        assert res["actual_ppg"] == 100.0
        assert res["hypothetical_ppg"] == 102.4

        # Actual ORTG = 100.0, Hypothetical ORTG = 100 * 8192 / 8000 = 102.4
        assert res["actual_off_rating"] == 100.0
        assert res["hypothetical_off_rating"] == 102.4
        assert res["delta_off_rating"] == 2.4

        # Actual Net = 100 - 105 = -5.0, Hyp Net = 102.4 - 105 = -2.6
        assert res["actual_net_rating"] == -5.0
        assert res["hypothetical_net_rating"] == -2.6
        assert res["delta_net_rating"] == 2.4

        # Non-inferential disclaimer must be present
        assert "what-if accounting" in res["disclaimer"]
        assert "never a claim that shooting variance was caused by luck" in res["disclaimer"]


class TestTeamScheduleContext:
    """Test team schedule context, rest days, back-to-backs, and venue streaks."""

    def test_schedule_progression_and_splits(self) -> None:
        games = [
            {
                "game_id": "0022300001",
                "game_date": date(2023, 10, 25),
                "side": "home",
                "opponent_id": "1610612738",
                "opponent_tricode": "BOS",
                "opponent_name": "Boston Celtics",
                "points": 105,
                "opponent_points": 100,
            },
            {
                "game_id": "0022300002",
                "game_date": date(2023, 10, 27),  # 1 day rest (27 - 25 - 1 = 1)
                "side": "home",
                "opponent_id": "1610612741",
                "opponent_tricode": "CHI",
                "opponent_name": "Chicago Bulls",
                "points": 110,
                "opponent_points": 108,
            },
            {
                "game_id": "0022300003",
                "game_date": date(2023, 10, 28),  # 0 days rest -> BACK TO BACK! (28 - 27 - 1 = 0)
                "side": "away",
                "opponent_id": "1610612755",
                "opponent_tricode": "PHI",
                "opponent_name": "Philadelphia 76ers",
                "points": 95,
                "opponent_points": 102,
            },
            {
                "game_id": "0022300004",
                "game_date": date(2023, 10, 31),  # 2 days rest (31 - 28 - 1 = 2)
                "side": "away",
                "opponent_id": "1610612749",
                "opponent_tricode": "MIL",
                "opponent_name": "Milwaukee Bucks",
                "points": 115,
                "opponent_points": 105,
            },
        ]

        sched = compute_team_schedule_context(games)

        # 1. Overall Record: 3-1, W1 streak
        assert sched["overall_record"]["games_played"] == 4
        assert sched["overall_record"]["wins"] == 3
        assert sched["overall_record"]["losses"] == 1
        assert sched["overall_record"]["win_pct"] == 0.75
        assert sched["overall_record"]["current_streak"] == "W1"

        # 2. Home vs Away Splits
        assert sched["home_split"]["games_played"] == 2
        assert sched["home_split"]["wins"] == 2
        assert sched["home_split"]["losses"] == 0
        assert sched["home_split"]["win_pct"] == 1.0

        assert sched["away_split"]["games_played"] == 2
        assert sched["away_split"]["wins"] == 1
        assert sched["away_split"]["losses"] == 1
        assert sched["away_split"]["win_pct"] == 0.5

        # 3. Rest Days & Back-to-Backs
        g_list = sched["games"]
        # Game 1 (Opener): rest_days is None, not B2B, streak W1, venue Home 1
        assert g_list[0]["rest_days"] is None
        assert g_list[0]["is_back_to_back"] is False
        assert g_list[0]["streak"] == "W1"
        assert g_list[0]["venue_streak"] == "Home 1"

        # Game 2: 1 day rest, not B2B, streak W2, venue Home 2
        assert g_list[1]["rest_days"] == 1
        assert g_list[1]["is_back_to_back"] is False
        assert g_list[1]["streak"] == "W2"
        assert g_list[1]["venue_streak"] == "Home 2"

        # Game 3: 0 days rest -> B2B second leg! streak L1, venue Road 1
        assert g_list[2]["rest_days"] == 0
        assert g_list[2]["is_back_to_back"] is True
        assert g_list[2]["streak"] == "L1"
        assert g_list[2]["venue_streak"] == "Road 1"

        # Game 4: 2 days rest, not B2B, streak W1, venue Road 2
        assert g_list[3]["rest_days"] == 2
        assert g_list[3]["is_back_to_back"] is False
        assert g_list[3]["streak"] == "W1"
        assert g_list[3]["venue_streak"] == "Road 2"

        # 4. Longest homestand and road trip
        assert sched["longest_homestand"] == 2
        assert sched["longest_road_trip"] == 2

        # 5. Back-to-Back Summary
        b2b_summary = sched["back_to_back_summary"]
        # Second leg games (0 days rest): 1 game, 0 wins, 1 loss
        assert b2b_summary["second_leg_games"]["games"] == 1
        assert b2b_summary["second_leg_games"]["wins"] == 0
        assert b2b_summary["second_leg_games"]["losses"] == 1

        # First leg games (Game 2 was followed by Game 3 next day): 1 game, 1 win, 0 losses
        assert b2b_summary["first_leg_games"]["games"] == 1
        assert b2b_summary["first_leg_games"]["wins"] == 1


class TestTeamSimilarityPeers:
    """Test standardized Euclidean distance peer matching across four factors and pace."""

    def test_team_similarity(self) -> None:
        cohort = {
            "TARGET": {
                "efg_pct": 0.550,
                "tov_pct": 0.120,
                "oreb_pct": 0.280,
                "ftr": 0.250,
                "opp_efg_pct": 0.520,
                "opp_tov_pct": 0.130,
                "dreb_pct": 0.760,
                "opp_ftr": 0.220,
                "pace": 99.0,
                "off_rating": 114.0,
                "def_rating": 110.0,
            },
            "PEER_CLOSE": {
                "efg_pct": 0.552,
                "tov_pct": 0.122,
                "oreb_pct": 0.278,
                "ftr": 0.248,
                "opp_efg_pct": 0.522,
                "opp_tov_pct": 0.128,
                "dreb_pct": 0.758,
                "opp_ftr": 0.222,
                "pace": 99.2,
                "off_rating": 114.2,
                "def_rating": 110.2,
            },
            "PEER_DISTANT": {
                "efg_pct": 0.490,
                "tov_pct": 0.160,
                "oreb_pct": 0.200,
                "ftr": 0.180,
                "opp_efg_pct": 0.580,
                "opp_tov_pct": 0.090,
                "dreb_pct": 0.690,
                "opp_ftr": 0.300,
                "pace": 105.0,
                "off_rating": 102.0,
                "def_rating": 118.0,
            },
        }

        peers = compute_team_similarity("TARGET", cohort, limit=5)

        # 1. TARGET must exclude self
        assert len(peers) == 2
        assert all(p["team_id"] != "TARGET" for p in peers)

        # 2. PEER_CLOSE must be first with lower distance and higher similarity score
        assert peers[0]["team_id"] == "PEER_CLOSE"
        assert peers[1]["team_id"] == "PEER_DISTANT"
        assert peers[0]["distance"] < peers[1]["distance"]
        assert peers[0]["similarity_score"] > peers[1]["similarity_score"]
