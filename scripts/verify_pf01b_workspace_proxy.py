"""Read-only real-API proxy with one off-page favorite fixture; never writes workspace."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

UPSTREAM = "http://127.0.0.1:8000"
with urlopen(f"{UPSTREAM}/api/workbench/catalog") as response:
    catalog = json.load(response)
query = {
    "release_id": catalog["release_id"],
    "season": catalog["default_season"],
    "phase": catalog["default_phase"],
    "before_date": catalog["default_before_date"],
    "sort": [{"field": "pts_per_game", "direction": "desc"}],
    "page": {"limit": 100},
}
with urlopen(
    Request(
        f"{UPSTREAM}/api/workbench/query",
        data=json.dumps({"query": query, "presentation": {}}).encode(),
        headers={"Content-Type": "application/json"},
    )
) as response:
    favorite = json.load(response)["items"][60]["player_id"]
print(
    json.dumps({"fixture_favorite": favorite, "source_row": 61, "application_mutations": 0}),
    flush=True,
)


class Proxy(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.forward()

    def do_POST(self) -> None:
        if self.path != "/api/workbench/query":
            self.send_error(405, "Verification proxy permits only read-only queries")
            return
        self.forward()

    def forward(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length", "0"))) or None
        request = Request(
            UPSTREAM + self.path,
            data=body,
            method=self.command,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=15) as response:
                status, data = response.status, response.read()
        except HTTPError as error:
            status, data = error.code, error.read()
        if self.path.startswith("/api/workbench/workspace") and status == 200:
            workspace = json.loads(data)
            workspace["favorites"] = [favorite]
            data = json.dumps(workspace).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


ThreadingHTTPServer(("127.0.0.1", 8152), Proxy).serve_forever()
