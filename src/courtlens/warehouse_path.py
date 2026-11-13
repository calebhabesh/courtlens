"""Where the dbt project lives, in a source checkout and in the installed image."""

from __future__ import annotations

from pathlib import Path

# In a checkout this module sits at src/courtlens/, three levels below the repository root. The
# image installs the package into site-packages and copies the project to /app/warehouse, its
# working directory, so the source-relative path does not exist there (2026-11-13: the VPS jobs
# service's first release publish failed on it).
_SOURCE_RELATIVE = Path(__file__).resolve().parents[2] / "warehouse"


def warehouse_dir(cwd: Path | None = None, source_relative: Path = _SOURCE_RELATIVE) -> Path:
    """The dbt project directory: next to the source when it is there, else under the cwd."""
    if (source_relative / "dbt_project.yml").is_file():
        return source_relative
    candidate = (cwd or Path.cwd()) / "warehouse"
    if (candidate / "dbt_project.yml").is_file():
        return candidate
    raise FileNotFoundError(
        f"no dbt project at {source_relative} or {candidate}; run from the repository root"
    )
