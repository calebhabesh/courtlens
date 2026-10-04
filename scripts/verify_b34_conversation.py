"""Start isolated production services and verify real browser/manual Research equivalence."""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
from sqlalchemy.orm import Session
from verify_b31_live import integrity

from courtload.database import engine
from courtload.services.workbench_analytics import resolve_workbench_context


def main():
    output = Path(sys.argv[1])
    if output.exists():
        raise ValueError("New evidence directory required")
    before = integrity()
    with Session(engine) as session:
        resolved = resolve_workbench_context(session, requested_season="2024-25")
    pinned = {
        k: resolved.to_dict()[k] for k in ("release_id", "season", "phase", "before_date", "window")
    }
    env = {
        **os.environ,
        "COURTLOAD_GEMINI_API_KEY": "",
        "COURTLOAD_CORS_ORIGINS": '["http://127.0.0.1:3114"]',
        "B34_PINNED_CONTEXT": json.dumps(pinned),
    }
    processes = []
    with (
        Path("/tmp/b34-real-api.log").open("w") as api_log,
        Path("/tmp/b34-real-next.log").open("w") as next_log,
    ):
        try:
            processes.append(
                subprocess.Popen(
                    [
                        ".venv/bin/uvicorn",
                        "courtload.api.app:create_app",
                        "--factory",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "8000",
                    ],
                    env=env,
                    stdout=api_log,
                    stderr=api_log,
                )
            )
            processes.append(
                subprocess.Popen(
                    [
                        "node",
                        "node_modules/next/dist/bin/next",
                        "start",
                        "-p",
                        "3114",
                        "--hostname",
                        "127.0.0.1",
                    ],
                    cwd="dashboard",
                    env=env,
                    stdout=next_log,
                    stderr=next_log,
                )
            )
            with httpx.Client(timeout=2) as client:
                for _ in range(100):
                    try:
                        if (
                            client.get("http://127.0.0.1:8000/api/health").status_code == 200
                            and client.get("http://127.0.0.1:3114/research/ask").status_code == 200
                        ):
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.1)
                else:
                    raise RuntimeError("Production services did not start")
            subprocess.run(
                ["node", "scripts/verify_b34_browser.cjs", str(output)], env=env, check=True
            )
            after = integrity()
            if before != after:
                raise AssertionError("Retained publication/finance relationships changed")
            (output / "integrity.json").write_text(
                json.dumps({"before": before, "after": after, "unchanged": True}, indent=2) + "\n"
            )
            print(
                "Real production browser: five workflows, six exact Research results, two reloads; "
                "publication and finance integrity unchanged"
            )
        finally:
            for process in reversed(processes):
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
