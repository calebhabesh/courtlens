"""Read-only registered research artifacts; numerical results come only from sealed runs."""

from datetime import date
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from courtlens.config import get_settings
from courtlens.domain.research_registration import ResearchProtocol
from courtlens.evaluation.research_inputs import read_json
from courtlens.evaluation.research_registration import load_document
from courtlens.ingestion.sportsdataverse import hash_file

router = APIRouter(prefix="/workbench/research", tags=["registered research"])


class RunSummary(BaseModel):
    run_id: str
    experiment: str
    status: str
    classification: str
    final_previously_exposed: bool
    final_report_opened: bool | None
    prospective_promotion_authorized: bool
    protocol_sha256: str
    binding_sha256: str
    dataset_content_sha256: str
    horizons: dict[str, str]


class ResearchResult(BaseModel):
    run: RunSummary
    manifest_sha256: str
    evaluation: dict[str, Any] | None
    model_card: str
    resource_accounting: dict[str, Any]
    model_fit_through_date: str | None
    calibration_fit_through_date: str | None
    report_through_date: str
    package_manifest_sha256: str | None = None


def verified_package(root: Path, run_id: str, manifest: dict[str, Any]) -> Path | None:
    path = root.parent / "research-run-packages" / run_id
    if not path.exists():
        return None
    try:
        if path.is_symlink():
            raise ValueError("unsafe package locator")
        package = read_json(path / "manifest.json", maximum=64 * 1024)
        if (
            package["schema_version"] != "courtload-research-package-v1"
            or package["run_id"] != run_id
            or package["parent_manifest_sha256"] != hash_file(root / run_id / "manifest.json")[0]
            or package["binding_sha256"] != manifest["binding_sha256"]
            or package["candidate_fits"] != 0
            or package["new_error_evaluations"] != 0
        ):
            raise ValueError("package parent or derivation changed")
        for name, expected in package["artifacts"].items():
            file = path / name
            if file.is_symlink() or not file.resolve().is_relative_to(path.resolve()):
                raise ValueError("unsafe package artifact")
            digest, size = hash_file(file)
            if expected != {"sha256": digest, "bytes": size}:
                raise ValueError("package artifact changed")
        return path
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(503, "research package failed integrity verification") from exc


def research_artifact_root() -> Path:
    return get_settings().artifacts_root / "research-runs"


def verified_run(root: Path, run_id: str) -> tuple[Path, dict[str, Any]]:
    path = root / run_id
    if (
        path.is_symlink()
        or (path / "manifest.json").is_symlink()
        or not (path / "manifest.json").is_file()
    ):
        raise HTTPException(404, "registered research run not found")
    try:
        manifest = read_json(path / "manifest.json", maximum=64 * 1024)
        if (
            manifest["schema_version"] != "courtload-research-run-v1"
            or manifest["run_id"] != run_id
        ):
            raise ValueError("run identity mismatch")
        for name, declared in manifest["artifacts"].items():
            relative = Path(name)
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or (path / relative).is_symlink()
                or not (path / relative).resolve().is_relative_to(path.resolve())
            ):
                raise ValueError("unsafe artifact locator")
            digest, size = hash_file(path / relative)
            if declared != {"sha256": digest, "bytes": size}:
                raise ValueError("run artifact changed")
        return path, manifest
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(
            503, "registered research artifact failed integrity verification"
        ) from exc


@router.get("/runs", response_model=list[RunSummary])
def list_runs(
    limit: int = Query(default=20, ge=1, le=100), root: Path = Depends(research_artifact_root)
) -> list[RunSummary]:
    if not root.exists():
        return []
    candidates = []
    for index, path in enumerate(root.iterdir()):
        if index >= 2000:
            raise HTTPException(503, "research registry directory budget exceeded")
        try:
            UUID(path.name)
        except ValueError:
            continue
        if (path / "manifest.json").is_file():
            _, manifest = verified_run(root, path.name)
            candidates.append(manifest)
    candidates.sort(key=lambda r: r["registered_at"], reverse=True)
    return [RunSummary.model_validate(r) for r in candidates[:limit]]


@router.get("/runs/{run_id}", response_model=ResearchResult)
def get_run(
    run_id: UUID, before_date: date | None = None, root: Path = Depends(research_artifact_root)
) -> ResearchResult:
    path, manifest = verified_run(root, str(run_id))
    if before_date is not None and before_date <= date.fromisoformat(
        manifest["report_through_date"]
    ):
        raise HTTPException(422, "requested cutoff predates the research report horizon")
    completed = manifest["status"] != "failed_or_limited"
    package = verified_package(root, str(run_id), manifest) if completed else None
    model_card = path / "run/model-card.md" if completed else path / "model-card.md"
    if package is not None:
        model_card = package / "model-card.md"
    if model_card.stat().st_size > 64 * 1024:
        raise HTTPException(503, "model-card byte budget exceeded")
    attempts = (
        read_json(path / "run/attempts.json")
        if "run/attempts.json" in manifest["artifacts"]
        else None
    )
    if package is not None:
        attempts = read_json(package / "attempts.json")
    binding = (
        read_json(path / "run/binding.json", maximum=8 * 1024 * 1024)
        if "run/binding.json" in manifest["artifacts"]
        else None
    )
    calibration_ids = set(binding["calibration_games"]) if binding else set()
    return ResearchResult(
        run=RunSummary.model_validate(manifest),
        manifest_sha256=hash_file(path / "manifest.json")[0],
        evaluation=read_json(path / "run/evaluation.json", maximum=4 * 1024 * 1024)
        if completed
        else None,
        model_card=model_card.read_text(),
        resource_accounting={"supervisor": manifest["limits"], "worker": attempts},
        model_fit_through_date=manifest["horizons"]["training"] if attempts else None,
        calibration_fit_through_date=max(
            g["game_date"] for g in binding["games"] if g["game_id"] in calibration_ids
        )
        if binding and attempts and attempts["candidate_fits"] == 2
        else None,
        report_through_date=manifest["report_through_date"],
        package_manifest_sha256=hash_file(package / "manifest.json")[0] if package else None,
    )


@router.get("/experiments")
def experiments(root: Path = Depends(research_artifact_root)) -> list[dict[str, Any]]:
    runs = list_runs(100, root)
    results = []
    gates = {
        "courtload-rapm-v1": "requires complete reconciled stint and possession seasons",
        "courtload-six-factor-v1": "requires shooting, turnover and rebound attribution",
        "courtload-adjusted-shooting-v1": "requires admitted playtypes and foul trips",
        "courtload-expected-shot-v1": "prior exposure requires the retrospective amendment",
    }
    for path in sorted(Path("evaluation/research/protocols").glob("*.json")):
        protocol = load_document(path)
        if not isinstance(protocol, ResearchProtocol):
            raise HTTPException(503, "research protocol registry contains an invalid document")
        latest = next((r for r in runs if r.experiment == protocol.experiment), None)
        results.append(
            {
                "experiment": protocol.experiment,
                "protocol_sha256": protocol.content_hash(),
                "status": latest.status if latest else "source_blocked",
                "run_id": latest.run_id if latest else None,
                "gate": None
                if latest
                else gates.get(protocol.experiment, "admitted inputs and exact binding required"),
                "classification": "retrospective_research",
                "http_fitting_available": False,
            }
        )
    return results
