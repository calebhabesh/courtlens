# Published-data checks

These 19 checks certify exact historical release totals, real playoff structures, registered forecast evidence or retained M6 artifacts. A synthetic cohort cannot verify those claims. Original assertions are retained. Run `make test-published` with the explicit URL and artifact tree of a restored disposable backup (see CONTRIBUTING.md). They were not run against the owner database.

- `tests/integration/test_b15_api.py::test_teams_overview_enriched_percentages`
- `tests/integration/test_b15_api.py::test_team_detail_enhanced_splits`
- `tests/integration/test_b15_api.py::test_team_schedule_endpoint`
- `tests/integration/test_b15_api.py::test_team_schedule_temporal_cutoff`
- `tests/integration/test_b15_api.py::test_team_four_factors_endpoint`
- `tests/integration/test_b16_api.py::test_b16_teams_research_enriched_factors`
- `tests/integration/test_b16_api.py::test_b16_toronto_reconciled_investigation`
- `tests/integration/test_b16_api.py::test_b16_head_to_head_schedule`
- `tests/integration/test_b17_api.py::test_b17_playoff_bracket_hierarchy`
- `tests/integration/test_b17_api.py::test_b17_playoff_series_detail_slug_and_code`
- `tests/integration/test_b17_api.py::test_b17_temporal_cutoff_discipline`
- `tests/integration/test_b17_api.py::test_b17_public_route_compatibility`
- `tests/integration/test_restore_postgres.py::test_real_archive_backup_manifest_and_restore_verification`
- `tests/integration/test_restore_postgres.py::test_workbench_backup_manifest_and_restore_verification`
- `tests/integration/test_restore_postgres.py::test_disposable_fresh_database_restore`
- `tests/integration/test_workbench_api.py::test_traded_player_team_filters_and_stints`
- `tests/integration/test_workbench_api.py::test_toronto_team_research_and_detail`
- `tests/integration/test_workbench_api.py::test_workbench_forecasts_evaluation`
- `tests/unit/test_workbench_contracts.py::test_retained_m6_experiment_registration`
