#!/usr/bin/env python3
"""List the API reads each page in urls.json makes while the dashboard renders it (speed plan SP00).

Runs a recording proxy in front of the API and requests each page from a dashboard whose
server-side reads go through that proxy, one page at a time:

    COURTLENS_API_INTERNAL_URL=http://localhost:8181 node .next/standalone/server.js  # port 3180
    scripts/speed/capture_reads.py --api http://localhost:8180 --listen 8181 \
        --dashboard http://localhost:3180 --out docs/evidence/speed/sp00/page-reads.json

Only reads made by the dashboard's server are seen; requests the browser makes after the page
arrives (search, grids) go straight to the API. Local use only: it is not a measuring tool.
"""

from __future__ import annotations

import argparse
import json
import threading
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
HOP_HEADERS = {"host", "connection", "keep-alive", "transfer-encoding", "content-length"}


class Recorder:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.reads: list[dict[str, Any]] = []

    def take(self) -> list[dict[str, Any]]:
        with self.lock:
            reads, self.reads = self.reads, []
        return reads


def make_handler(upstream: str, recorder: Recorder) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args: Any) -> None:
            return

        def _forward(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else None
            headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
            request = urllib.request.Request(
                upstream + self.path, data=body, headers=headers, method=self.command
            )
            started = time.perf_counter()
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    status, payload, reply = response.status, response.read(), response.headers
            except urllib.error.HTTPError as error:
                status, payload, reply = error.code, error.read(), error.headers
            entry: dict[str, Any] = {
                "method": self.command,
                "path": self.path,
                "status": status,
                "seconds": round(time.perf_counter() - started, 4),
                "server_timing": reply.get("Server-Timing"),
            }
            if body:
                try:
                    entry["body"] = json.loads(body)
                except ValueError:
                    entry["body_text"] = body.decode("utf-8", "replace")
            with recorder.lock:
                recorder.reads.append(entry)
            self.send_response(status)
            for key, value in reply.items():
                if key.lower() not in HOP_HEADERS:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        do_GET = _forward
        do_POST = _forward
        do_HEAD = _forward

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", required=True, help="upstream API origin")
    parser.add_argument("--listen", type=int, default=8181, help="proxy port")
    parser.add_argument("--dashboard", required=True, help="dashboard origin")
    parser.add_argument("--urls", type=Path, default=HERE / "urls.json")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    recorder = Recorder()
    server = ThreadingHTTPServer(("127.0.0.1", args.listen), make_handler(args.api, recorder))
    threading.Thread(target=server.serve_forever, daemon=True).start()

    pages = json.loads(args.urls.read_text())["pages"]
    result: list[dict[str, Any]] = []
    for page in pages:
        recorder.take()
        started = time.perf_counter()
        with urllib.request.urlopen(args.dashboard + page["path"], timeout=120) as response:
            status, size = response.status, len(response.read())
        time.sleep(0.5)  # late reads still in flight when the stream closes
        reads = recorder.take()
        result.append(
            {
                "name": page["name"],
                "path": page["path"],
                "status": status,
                "bytes": size,
                "seconds": round(time.perf_counter() - started - 0.5, 3),
                "reads": reads,
            }
        )
        print(f"{page['name']:<16} {status} {len(reads):>3} reads")
    server.shutdown()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    document = {
        "tool": "scripts/speed/capture_reads.py",
        "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "pages": result,
    }
    args.out.write_text(json.dumps(document, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
