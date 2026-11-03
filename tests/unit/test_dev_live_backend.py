import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/dev-live-backend.sh"


def run_backend(tmp_path: Path, port: int) -> subprocess.CompletedProcess[str]:
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    launcher = scripts / SCRIPT.name
    shutil.copy2(SCRIPT, launcher)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "python").symlink_to(sys.executable)
    for name in ("docker", "alembic", "courtlens", "uvicorn"):
        executable = bin_dir / name
        body = "echo 'API server started'" if name == "uvicorn" else "exit 0"
        executable.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
        executable.chmod(0o755)

    return subprocess.run(
        [str(launcher)],
        env={
            **os.environ,
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
            "COURTLENS_VENV_DIR": str(tmp_path),
            "COURTLENS_API_HOST": "127.0.0.1",
            "COURTLENS_API_PORT": str(port),
            "COURTLENS_DEV_SEED_MODE": "never",
        },
        capture_output=True,
        text=True,
        timeout=10,
    )


@pytest.mark.parametrize("port_state", ["free", "closed_connection", "listening"])
def test_backend_port_availability(tmp_path: Path, port_state: str) -> None:
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.settimeout(2)
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        if port_state == "closed_connection":
            with socket.create_connection(("127.0.0.1", port), timeout=2) as client:
                connection, _ = listener.accept()
                connection.close()
                assert client.recv(1) == b""
        if port_state != "listening":
            listener.close()

        result = run_backend(tmp_path, port)

    if port_state == "listening":
        assert result.returncode == 1
        assert f"Backend port {port} is already in use" in result.stderr
        assert "API server started" not in result.stdout
    else:
        assert result.returncode == 0, result.stderr
        assert "API server started" in result.stdout
