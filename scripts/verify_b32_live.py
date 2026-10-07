"""Real three-browser Live coalescing and finalized-detail smoke with bounded source polling.

Usage: .venv/bin/python scripts/verify_b32_live.py NEW_EVIDENCE_DIRECTORY
Requires local PostgreSQL, a completed dashboard build and Chromium. Starts isolated
servers, polls at most twice, stops both servers and releases probe-owned demand.
"""

import json
import os
import signal
import subprocess
import sys
import time
from contextlib import suppress
from pathlib import Path
from threading import Event, Thread

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from verify_b31_live import integrity

from courtlens.config import get_settings
from courtlens.database import engine
from courtlens.live_models import LiveLease, LiveObservation
from courtlens.services.live import poll_once, release
from courtlens.services.live_provider import ESPNLiveProvider


def main():
    output = Path(sys.argv[1])
    if output.exists():
        raise ValueError("New evidence directory required; refusing overwrite")
    before = integrity()
    with Session(engine) as session:
        if session.scalar(select(func.count()).select_from(LiveLease)):
            raise RuntimeError("Probe requires no existing Live leases")
        observations_before = session.scalar(select(func.count()).select_from(LiveObservation))
    env = {
        **os.environ,
        "COURTLENS_LIVE_ENABLED": "true",
        "COURTLENS_API_INTERNAL_URL": "http://127.0.0.1:8012",
        "NEXT_PUBLIC_COURTLENS_API_URL": "http://127.0.0.1:8012",
        "COURTLENS_OPERATOR_TOKEN": get_settings().operator_token.get_secret_value(),
        "PLAYWRIGHT_BASE_URL": "http://127.0.0.1:3140",
    }
    stop = Event()
    calls = []
    errors = []

    def poll():
        provider = ESPNLiveProvider()
        while not stop.is_set():
            try:
                calls.append(poll_once(engine, provider))
            except Exception as error:
                errors.append(type(error).__name__)
                stop.set()
            stop.wait(5)

    with (
        Path("/tmp/b32-api.log").open("w") as api_log,
        Path("/tmp/b32-next.log").open("w") as next_log,
    ):
        api = subprocess.Popen(
            [
                ".venv/bin/uvicorn",
                "courtlens.api.app:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                "8012",
            ],
            env=env,
            stdout=api_log,
            stderr=api_log,
        )
        frontend = subprocess.Popen(
            ["npm", "--prefix", "dashboard", "run", "start", "--", "-H", "127.0.0.1", "-p", "3140"],
            env=env,
            stdout=next_log,
            stderr=next_log,
            start_new_session=True,
        )
        thread = Thread(target=poll, daemon=True)
        try:
            for _ in range(100):
                if api.poll() is not None or frontend.poll() is not None:
                    raise RuntimeError("Probe server failed; inspect /tmp/b32 logs")
                try:
                    if httpx.get("http://127.0.0.1:3140/live", timeout=2).status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Probe servers not ready")
            thread.start()
            subprocess.run(
                ["node", "scripts/verify_b32_live_browser.cjs", str(output)], env=env, check=True
            )
            stop.set()
            thread.join(timeout=15)
            assert not thread.is_alive() and not errors, errors
            assert 1 <= sum(calls) <= 2, calls
            # Idle tick must make zero acquisitions after all browser cleanup paths.
            idle = poll_once(engine, ESPNLiveProvider())
            assert idle == 0
            with Session(engine) as session:
                observations_after = session.scalar(
                    select(func.count()).select_from(LiveObservation)
                )
            after = integrity()
            assert before == after
            record = {
                "capture_kind": "real three-browser coalescing; scheduled-only source evidence",
                "poller_requests": sum(calls),
                "poller_ticks": len(calls),
                "idle_acquisitions": idle,
                "observations_before": observations_before,
                "observations_after": observations_after,
                "integrity_before": before,
                "integrity_after": after,
            }
            (output / "real-service.json").write_text(json.dumps(record, indent=2) + "\n")
        finally:
            stop.set()
            if thread.is_alive():
                thread.join(timeout=15)
            # Release only explicitly recorded browser capabilities from this probe.
            lease_file = output / "owned-leases.json"
            if lease_file.exists():
                with Session(engine) as session:
                    for identifier in json.loads(lease_file.read_text()):
                        release(session, identifier)
            api.terminate()
            frontend.terminate()
            api.wait(timeout=15)
            frontend.wait(timeout=15)
            with suppress(ProcessLookupError):
                os.killpg(frontend.pid, signal.SIGTERM)


if __name__ == "__main__":
    main()
