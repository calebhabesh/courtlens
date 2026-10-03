"""Verify B08 through fresh migrations, real browser requests, and disposable DB restore.

Requires a dashboard build, local Compose PostgreSQL, and COURTLOAD_TEST_POSTGRES_URL.
Only the two randomly named databases created here are removed in cleanup.
"""

import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
name = "b08_verify_" + uuid4().hex[:12]
restored_name = name + "_restored"
source_url = make_url(os.environ["COURTLOAD_TEST_POSTGRES_URL"])
admin_url = source_url.set(drivername="postgresql", database="postgres").render_as_string(
    hide_password=False
)
url = source_url.set(drivername="postgresql", database=name).render_as_string(hide_password=False)
restored_url = source_url.set(drivername="postgresql", database=restored_name).render_as_string(
    hide_password=False
)
env = dict(
    os.environ,
    COURTLOAD_DATABASE_URL=url.replace("postgresql://", "postgresql+psycopg://"),
    COURTLOAD_OPERATOR_TOKEN="b08-local-verification-token",
)
servers = []
created_databases = []


def run(args, **kwargs):
    result = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, **kwargs)
    if result.returncode:
        print(result.stdout[-5000:])
        print(result.stderr[-5000:])
        raise RuntimeError(f"{args[0]} failed: {result.returncode}")
    return result


def wait_ready(url, process):
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError("Server exited before readiness")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("Server readiness timeout")


try:
    with psycopg.connect(admin_url, autocommit=True) as admin:
        for db in [name, restored_name]:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db)))
            created_databases.append(db)
    result = run([str(root / ".venv/bin/alembic"), "upgrade", "head"])
    print("Fresh PostgreSQL migration: PASS")
    with psycopg.connect(url) as conn:
        revision = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        assert revision == "1b66214e7c08", revision
        conn.execute(
            "INSERT INTO workbench_identities "
            "(id,namespace,kind,external_id,display_name,metadata_json) "
            "VALUES ('b08-player','fixture','player','1','Verification Player','{}')"
        )
    with tempfile.TemporaryDirectory(prefix="b08-verify-") as tmp:
        tmp = Path(tmp)
        api_log = (tmp / "api.log").open("w")
        api = subprocess.Popen(
            [
                str(root / ".venv/bin/uvicorn"),
                "courtload.api.app:create_app",
                "--factory",
                "--port",
                "18008",
            ],
            cwd=root,
            env=env,
            stdout=api_log,
            stderr=api_log,
        )
        servers.append(api)
        wait_ready("http://localhost:18008/api/workbench/workspace", api)
        front_env = dict(
            env,
            COURTLOAD_API_INTERNAL_URL="http://localhost:18008",
            NEXT_PUBLIC_COURTLOAD_API_URL="http://localhost:18008",
        )
        front_log = (tmp / "frontend.log").open("w")
        front = subprocess.Popen(
            ["node", "node_modules/next/dist/bin/next", "start", "-p", "3108"],
            cwd=root / "dashboard",
            env=front_env,
            stdout=front_log,
            stderr=front_log,
        )
        servers.append(front)
        wait_ready("http://localhost:3108/api/workspace", front)
        browser_env = dict(
            front_env,
            PLAYWRIGHT_EXTERNAL_SERVER="true",
            PLAYWRIGHT_BASE_URL="http://localhost:3108",
            COURTLOAD_REAL_WORKSPACE_TEST="1",
        )
        result = subprocess.run(
            [
                "npm",
                "--prefix",
                "dashboard",
                "run",
                "test:browser",
                "--",
                "workspace-persistence.spec.ts",
            ],
            cwd=root,
            env=browser_env,
            capture_output=True,
            text=True,
        )
        print(result.stdout)
        if result.returncode:
            print(result.stderr[-3000:])
            print((tmp / "api.log").read_text()[-3000:])
            raise RuntimeError("Real workspace browser test failed")
        with psycopg.connect(url) as conn:
            before = conn.execute(
                "SELECT * FROM workbench_personal_workspaces ORDER BY id"
            ).fetchall()
            assert len(before) == 2
        # Use the same PostgreSQL 17 tools as the local Compose database.
        if source_url.host not in {"localhost", "127.0.0.1"} or source_url.port != 5432:
            raise RuntimeError(
                "This verification script requires the local Compose PostgreSQL on port 5432"
            )
        dump = subprocess.run(
            [
                "docker",
                "compose",
                "exec",
                "-T",
                "db",
                "pg_dump",
                "--format=custom",
                "--username",
                source_url.username or "courtload",
                "--dbname",
                name,
            ],
            cwd=root,
            capture_output=True,
            check=True,
        ).stdout
        subprocess.run(
            [
                "docker",
                "compose",
                "exec",
                "-T",
                "db",
                "pg_restore",
                "--exit-on-error",
                "--no-owner",
                "--no-acl",
                "--username",
                source_url.username or "courtload",
                "--dbname",
                restored_name,
            ],
            cwd=root,
            input=dump,
            capture_output=True,
            check=True,
        )
        with psycopg.connect(restored_url) as conn:
            after = conn.execute(
                "SELECT * FROM workbench_personal_workspaces ORDER BY id"
            ).fetchall()
            assert before == after
        print(
            "Full PostgreSQL dump/fresh restore: PASS; "
            "2 complete workspace rows match including views, boards, tiers and preferences"
        )
finally:
    for process in reversed(servers):
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    with psycopg.connect(admin_url, autocommit=True) as admin:
        for db in reversed(created_databases):
            admin.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(db))
            )
