"""Read-only result contracts with explicitly synthetic immutable artifact fixtures."""

import json
from pathlib import Path
from uuid import uuid4

from courtlens.api.routers.research import research_artifact_root
from courtlens.ingestion.sportsdataverse import hash_file


def fixture_run(root: Path) -> str:
    run_id = str(uuid4())
    path = root / run_id
    (path / "run").mkdir(parents=True)
    (path / "run/evaluation.json").write_text(
        json.dumps({"status": "selection_failed_negative_result", "fixture": "synthetic"})
    )
    (path / "run/model-card.md").write_text("Synthetic test model card; no fitted model.")
    manifest = {
        "schema_version": "courtload-research-run-v1",
        "run_id": run_id,
        "experiment": "courtload-expected-shot-retrospective-v2",
        "status": "selection_failed_negative_result",
        "classification": "retrospective_research",
        "final_previously_exposed": True,
        "final_report_opened": False,
        "prospective_promotion_authorized": False,
        "protocol_sha256": "a" * 64,
        "binding_sha256": "b" * 64,
        "dataset_content_sha256": "c" * 64,
        "registered_at": "2026-10-03T00:00:00+00:00",
        "horizons": {
            "training": "2024-04-14",
            "validation": "2025-04-13",
            "final_test": "2026-04-12",
        },
        "report_through_date": "2025-01-15",
        "limits": {"enforcement": "synthetic_fixture"},
        "artifacts": {
            str(p.relative_to(path)): {"sha256": hash_file(p)[0], "bytes": p.stat().st_size}
            for p in (path / "run").iterdir()
        },
    }
    (path / "manifest.json").write_text(json.dumps(manifest))
    return run_id


def test_results_are_read_only_cutoff_bound_and_integrity_checked(
    api_client, tmp_path: Path
) -> None:
    root = tmp_path / "research"
    run_id = fixture_run(root)
    api_client.app.dependency_overrides[research_artifact_root] = lambda: root
    base = "/api/workbench/research"
    result = api_client.get(f"{base}/runs/{run_id}")
    assert result.status_code == 200
    body = result.json()
    assert body["run"]["final_previously_exposed"]
    assert not body["run"]["prospective_promotion_authorized"]
    assert body["evaluation"]["fixture"] == "synthetic"
    assert api_client.get(f"{base}/runs/{run_id}?before_date=2024-01-01").status_code == 422
    assert api_client.get(f"{base}/runs/{run_id}?before_date=2025-01-16").status_code == 200
    assert api_client.post(f"{base}/runs", json={}).status_code == 405
    assert api_client.get(f"{base}/runs/not-a-uuid").status_code == 422
    assert api_client.get(f"{base}/runs/{uuid4()}").status_code == 404
    assert len(api_client.get(f"{base}/runs").json()) == 1
    catalog = api_client.get(f"{base}/experiments").json()
    assert (
        next(r for r in catalog if r["experiment"] == "courtload-rapm-v1")["status"]
        == "source_blocked"
    )
    (root / run_id / "run/evaluation.json").write_text("{}")
    assert api_client.get(f"{base}/runs/{run_id}").status_code == 503


def test_append_only_package_is_parent_bound_and_integrity_checked(api_client, tmp_path: Path):
    root = tmp_path / "research-runs"
    run_id = fixture_run(root)
    api_client.app.dependency_overrides[research_artifact_root] = lambda: root
    package = tmp_path / "research-run-packages" / run_id
    package.mkdir(parents=True)
    (package / "model-card.md").write_text("Synthetic derived package card.")
    (package / "attempts.json").write_text(json.dumps({"candidate_fits": 1, "packaging_fits": 0}))
    (package / "candidate-predictions.jsonl").write_text("Synthetic fixture; no fitted data.\n")
    manifest = {
        "schema_version": "courtload-research-package-v1",
        "run_id": run_id,
        "parent_manifest_sha256": hash_file(root / run_id / "manifest.json")[0],
        "binding_sha256": "b" * 64,
        "candidate_fits": 0,
        "new_error_evaluations": 0,
        "artifacts": {
            p.name: {"sha256": hash_file(p)[0], "bytes": p.stat().st_size}
            for p in package.iterdir()
        },
    }
    (package / "manifest.json").write_text(json.dumps(manifest))
    url = f"/api/workbench/research/runs/{run_id}"
    result = api_client.get(url)
    assert result.status_code == 200
    assert result.json()["model_card"] == "Synthetic derived package card."
    assert result.json()["package_manifest_sha256"] == hash_file(package / "manifest.json")[0]
    manifest["parent_manifest_sha256"] = "f" * 64
    (package / "manifest.json").write_text(json.dumps(manifest))
    assert api_client.get(url).status_code == 503
    manifest["parent_manifest_sha256"] = hash_file(root / run_id / "manifest.json")[0]
    (package / "manifest.json").write_text(json.dumps(manifest))
    (package / "candidate-predictions.jsonl").write_text("altered")
    assert api_client.get(url).status_code == 503
