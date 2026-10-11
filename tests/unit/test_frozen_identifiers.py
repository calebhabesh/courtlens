"""Rename regression evidence captured against the pre-RN01 package."""

import hashlib
import json
import time
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from courtlens.domain.conversation import OperationStep
from courtlens.frozen_identifiers import FROZEN_IDENTIFIERS
from courtlens.services.assistant.operations import (
    canonical_step,
    execute_operation,
    operation_hash,
)
from courtlens.services.assistant.rendering import render_result
from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "tests/fixtures/rn01-hashes.json"


def fixture_hashes() -> dict[str, Any]:
    context = ResolvedContext(
        release_id="release-a",
        snapshot_id="snapshot-a",
        dataset_id="dataset-a",
        dataset_type="workbench",
        semantic_signature="sealed",
        mode="research",
        source="fixture",
        season="2024-25",
        phase="regular_season",
        before_date=date(2025, 4, 15),
        cutoff_utc="2025-04-15T04:00:00+00:00",
        window="season",
        coverage_start=date(2024, 10, 1),
        coverage_end=date(2025, 4, 14),
        default_before_date=date(2025, 4, 15),
        supported_dates=[],
        published_at=None,
        warnings=[],
    )
    fingerprint = canonical_hash(context.to_dict())
    hashes: dict[str, Any] = {"context": fingerprint, "operations": {}}
    engine = create_engine("sqlite://")
    try:
        with Session(engine) as session:
            for metric in ("pts", "ast", "efg_pct"):
                step = canonical_step(
                    session,
                    context,
                    OperationStep(
                        step_id=metric, operation="definition", arguments={"metric": metric}
                    ),
                )
                data = execute_operation(session, context, step, time.monotonic() + 10)
                result = render_result(step, context, data, fingerprint)
                hashes["operations"][metric] = {
                    "operation": operation_hash(step, context),
                    "result": result.result_hash,
                    "rendered": canonical_hash(result.model_dump(mode="json")),
                }
    finally:
        engine.dispose()
    return hashes


def test_fixture_hashes_are_byte_identical() -> None:
    assert fixture_hashes() == json.loads(BASELINE.read_text())["fixture_hashes"]


def test_sealed_fixture_and_schema_bytes_are_unchanged() -> None:
    for relative, expected in json.loads(BASELINE.read_text())["file_sha256"].items():
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected, relative


def test_frozen_hash_identifiers_keep_their_production_occurrences() -> None:
    import re

    pattern = re.compile(r"courtload-[a-z0-9-]+-v[0-9]+")
    assert sorted(FROZEN_IDENTIFIERS) == json.loads(BASELINE.read_text())["frozen_identifiers"]
    baseline = json.loads(BASELINE.read_text())["identifier_occurrences"]
    retired = {"hybrid.py", "planner.py", "narrative.py", "retrieval.py"}
    for relative, expected in baseline.items():
        path = ROOT / relative
        if path.parent == ROOT / "src/courtlens/services/assistant" and path.name in retired:
            path = path.parent / "legacy" / path.name
        assert dict(Counter(pattern.findall(path.read_text()))) == expected, relative
    for base in ("src", "dashboard", "evaluation", "tests", "docs/design"):
        for path in (ROOT / base).rglob("*"):
            if not path.is_file() or path.suffix not in {".py", ".ts", ".tsx", ".json", ".mjs"}:
                continue
            if any(
                part in {"node_modules", ".next", "__pycache__", "test-results"}
                for part in path.parts
            ):
                continue
            assert set(pattern.findall(path.read_text())) <= FROZEN_IDENTIFIERS, str(path)


def test_knowledge_content_hashes_are_unchanged() -> None:
    from courtlens.services.assistant.knowledge import registry

    assert {entry.key: entry.content_sha256 for entry in registry()} == json.loads(
        BASELINE.read_text()
    )["knowledge_sections"]


def test_applied_migrations_change_only_python_imports() -> None:
    for relative, expected in json.loads(BASELINE.read_text())["migration_sha256"].items():
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected, relative


def test_no_unexplained_legacy_brand_references() -> None:
    import re
    import subprocess

    baseline = json.loads(BASELINE.read_text())
    historical = set(baseline["historical_docs"])
    # The current handoff describes the rename itself; its baseline is historical.
    historical.update({"docs/courtlens-refresh-plan.md", "docs/courtlens-refresh-progress.md"})
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT, text=True
    ).splitlines()
    unexplained = []
    for relative in sorted(set(names)):
        path = ROOT / relative
        if (
            not path.is_file()
            or relative in historical
            or relative in baseline["file_sha256"]
            or relative.startswith(("docs/evidence/", "migrations/versions/"))
            or relative == "tests/unit/test_frozen_identifiers.py"
        ):
            continue
        try:
            content = path.read_text()
        except UnicodeDecodeError:
            continue
        if relative == "AGENTS.md":
            content = "\n".join(
                line for line in content.splitlines() if not line.startswith("For the CourtLoad →")
            )
        if relative == "TODO.md":
            # Preserve the owner's pre-RN01, uncommitted rename instruction verbatim.
            content = content.replace("- [ ] Rename env vars to CourtLens instead of CourtLoad", "")
        if relative == "docs/frontend-overhaul-progress.md":
            # FO09 records retained pre-rename scratch directories, not current branding.
            content = content.replace("/tmp/courtload-*", "")
        for identifier in sorted(FROZEN_IDENTIFIERS, key=len, reverse=True):
            content = content.replace(identifier, "")
        # Explicit hard-cut mappings, their acceptance tests, and browser migration sources.
        if relative in {
            "src/courtlens/config.py",
            "scripts/migrate_env_names.py",
            "tests/unit/test_config.py",
            "tests/unit/test_migrate_env_names.py",
            "dashboard/lib/server-env.ts",
            "dashboard/lib/server-env.test.ts",
        }:
            content = re.sub(r"(?:NEXT_PUBLIC_)?COURTLOAD_[A-Z_]*", "", content)
        if relative in {"dashboard/lib/storage-keys.ts", "dashboard/lib/storage-keys.test.ts"}:
            content = content.replace("courtload_table_density", "")
        if relative == "tests/integration/test_rename_database_postgres.py":
            # RN02 exercises the old namespace exclusively as a negative control.
            content = content.replace("courtload.allow_admin_mutation", "")
            content = content.replace('"courtload_"', "").replace('"courtload"', "")
        if relative == "docker-compose.yml":
            content = "\n".join(line for line in content.splitlines() if not line.startswith("#"))
        if re.search("courtload", content, re.IGNORECASE):
            unexplained.append(relative)
    assert not unexplained, unexplained
