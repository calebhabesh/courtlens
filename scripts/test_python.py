"""Run Python checks without the owner's dotenv, data, keys, or database.

By default an ephemeral PostgreSQL 17 container supplies the relational fixtures.
CI may provide a disposable COURTLENS_TEST_POSTGRES_URL instead. Published-data
checks require --published and an explicit URL to a restored disposable backup.

``-n N`` (or ``-n auto``) runs pytest-xdist workers. After the migration, each worker gets
its own database cloned from the migrated one (``<database>_gw0``, ``<database>_gw1``, ...),
and ``tests/conftest.py`` points that worker's COURTLENS_TEST_POSTGRES_URL at it, so no two
workers share tables, advisory locks or published-snapshot guards.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from uuid import uuid4

WORKER_DATABASES = "COURTLENS_TEST_POSTGRES_PER_WORKER"


def worker_count(arguments: list[str]) -> tuple[int, list[str]]:
    """Read pytest-xdist's ``-n``/``--numprocesses`` and pin ``auto`` to a number.

    The script creates one database per worker before pytest starts, so it must know
    the count; it passes an explicit ``-n <count>`` on to pytest.
    """
    rest: list[str] = []
    value: str | None = None
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        if argument in {"-n", "--numprocesses"} and index + 1 < len(arguments):
            value = arguments[index + 1]
            index += 2
            continue
        if argument.startswith("--numprocesses="):
            value = argument.split("=", 1)[1]
        elif argument.startswith("-n") and len(argument) > 2 and not argument.startswith("--"):
            value = argument[2:]
        else:
            rest.append(argument)
        index += 1
    if value is None:
        return 0, rest
    count = (os.cpu_count() or 1) if value in {"auto", "logical"} else int(value)
    return count, ([*rest, "-n", str(count)] if count > 0 else rest)


def worker_database_urls(test_url: str, count: int) -> list[str]:
    from sqlalchemy.engine import make_url

    url = make_url(test_url)
    return [
        url.set(database=f"{url.database}_gw{index}").render_as_string(hide_password=False)
        for index in range(count)
    ]


def clone_worker_databases(test_url: str, count: int, *, drop_only: bool = False) -> None:
    """Create (or drop) one database per xdist worker from the migrated test database."""
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    url = make_url(test_url)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            for worker_url in worker_database_urls(test_url, count):
                name = make_url(worker_url).database
                connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
                if not drop_only:
                    connection.execute(text(f'CREATE DATABASE "{name}" TEMPLATE "{url.database}"'))
    finally:
        admin.dispose()


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    arguments = sys.argv[1:]
    published = "--published" in arguments
    arguments = [argument for argument in arguments if argument != "--published"]
    workers, arguments = worker_count(arguments)
    if workers and importlib.util.find_spec("xdist") is None:
        print(
            "pytest-xdist is not installed (make install); running in one process.",
            file=sys.stderr,
        )
        workers, arguments = worker_count([*arguments, "-n", "0"])
    if published and workers:
        raise SystemExit("Published checks run in one process; drop -n")
    test_url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if published and not test_url:
        raise SystemExit(
            "Published checks require a disposable restored COURTLENS_TEST_POSTGRES_URL"
        )
    container = None
    cloned = False
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
                and key
                not in {"GEMINI_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"}
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
            # Explicit isolated browser fixture endpoints only; never forward provider keys.
            for option in (
                "COURTLENS_AR07_BROWSER_BASE_URL",
                "COURTLENS_AR07_DASHBOARD_DIR",
                "COURTLENS_AR07_API_PORT",
            ):
                if option in os.environ:
                    environment[option] = os.environ[option]
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
            if workers:
                clone_worker_databases(test_url, workers)
                cloned = True
                environment[WORKER_DATABASES] = "1"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pytest",
                    "-m",
                    "requires_published_data"
                    if published
                    else "not requires_published_data and not kernel_limits",
                    *arguments,
                ],
                cwd=workspace,
                env=environment,
            )
            return result.returncode
    finally:
        if cloned and test_url and not container:
            clone_worker_databases(test_url, workers, drop_only=True)
        if container:
            subprocess.run(
                ["docker", "rm", "-f", "-v", container],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )


if __name__ == "__main__":
    sys.exit(main())
