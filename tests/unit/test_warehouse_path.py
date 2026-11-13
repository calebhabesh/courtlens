from pathlib import Path

import pytest

from courtlens.warehouse_path import warehouse_dir


def project(root: Path) -> Path:
    (root / "warehouse").mkdir(parents=True)
    (root / "warehouse" / "dbt_project.yml").write_text("name: x\n")
    return root / "warehouse"


def test_a_checkout_finds_the_project_next_to_the_source():
    found = warehouse_dir()
    assert (found / "dbt_project.yml").is_file()
    assert found == Path(__file__).resolve().parents[2] / "warehouse"


def test_an_installed_package_finds_the_project_under_the_working_directory(tmp_path):
    # As in the image: the package is in site-packages, the project is in /app/warehouse.
    app = project(tmp_path / "app")
    missing = tmp_path / "site-packages" / "warehouse"
    assert warehouse_dir(cwd=tmp_path / "app", source_relative=missing) == app


def test_no_project_anywhere_says_where_it_looked(tmp_path):
    with pytest.raises(FileNotFoundError, match="run from the repository root"):
        warehouse_dir(cwd=tmp_path, source_relative=tmp_path / "nowhere")
