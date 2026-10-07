"""Run Python checks without the owner's dotenv, data, keys, or database.

By default an ephemeral PostgreSQL 17 container supplies the relational fixtures.
CI may provide a disposable COURTLENS_TEST_POSTGRES_URL instead. Published-data
checks require --published and an explicit URL to a restored disposable backup.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from uuid import uuid4


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    arguments = sys.argv[1:]
    published = "--published" in arguments
    arguments = [argument for argument in arguments if argument != "--published"]
    test_url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if published and not test_url:
        raise SystemExit(
            "Published checks require a disposable restored COURTLENS_TEST_POSTGRES_URL"
        )
    container = None
    try:
        if not test_url:
            container = "courtlens-tests-" + uuid4().hex[:12]
            subprocess.run(
                [
                    "docker",
                    "run",
                    "--rm",
                    "-d",
                    "--name",
                    container,
                    "-e",
                    "POSTGRES_USER=courtlens",
                    "-e",
                    "POSTGRES_PASSWORD=courtlens",
                    "-e",
                    "POSTGRES_DB=courtlens_test",
                    "-p",
                    "127.0.0.1::5432",
                    "postgres:17-alpine",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            port = (
                subprocess.check_output(["docker", "port", container, "5432/tcp"], text=True)
                .strip()
                .rsplit(":", 1)[1]
            )
            test_url = f"postgresql+psycopg://courtlens:courtlens@127.0.0.1:{port}/courtlens_test"
            for _ in range(100):
                ready = subprocess.run(
                    ["docker", "exec", container, "pg_isready", "-U", "courtlens"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                if ready.returncode == 0:
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError("Disposable PostgreSQL did not become ready")
        with tempfile.TemporaryDirectory(prefix="courtlens-python-") as temporary:
            workspace = Path(temporary)
            for path in root.iterdir():
                if path.name == "data" or (
                    path.name.startswith(".env") and path.name != ".env.example"
                ):
                    continue
                (workspace / path.name).symlink_to(path, target_is_directory=path.is_dir())
            if published:
                (workspace / "data").symlink_to(root / "data", target_is_directory=True)
            else:
                (workspace / "data").mkdir()
            environment = {
                key: value
                for key, value in os.environ.items()
                if not key.startswith("COURTLENS_")
                and key not in {"GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"}
            }
            environment.update(
                PYTHONPATH=str(root / "src"),
                COURTLENS_ENVIRONMENT="test",
                COURTLENS_DATABASE_URL=test_url if published else "sqlite+pysqlite:///:memory:",
                COURTLENS_TEST_POSTGRES_URL=test_url,
                COURTLENS_REQUIRE_POSTGRES_TESTS="true",
                COURTLENS_PROJECT_ROOT=str(workspace),
                COURTLENS_RAW_STORE_PATH=str(workspace / "data/raw"),
                COURTLENS_ARTIFACTS_ROOT=str(workspace / "data/artifacts"),
                COURTLENS_ASSISTANT_PROVIDER="none",
            )
            if container or os.environ.get("COURTLENS_TEST_POSTGRES_CONTAINER"):
                environment["COURTLENS_TEST_POSTGRES_CONTAINER"] = (
                    container or os.environ["COURTLENS_TEST_POSTGRES_CONTAINER"]
                )
            if not published:
                subprocess.run(
                    [sys.executable, "-m", "alembic", "upgrade", "head"],
                    cwd=workspace,
                    env={**environment, "COURTLENS_DATABASE_URL": test_url},
                    check=True,
                )
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pytest",
                    "-m",
                    "requires_published_data" if published else "not requires_published_data",
                    *arguments,
                ],
                cwd=workspace,
                env=environment,
            )
            return result.returncode
    finally:
        if container:
            subprocess.run(
                ["docker", "rm", "-f", container],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )


if __name__ == "__main__":
    sys.exit(main())
