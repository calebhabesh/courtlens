"""Real analytical passthrough; personal interactions use disposable memory only."""

import json
from http.server import ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from verify_pf04_proxy import Proxy as ReadOnlyProxy

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
with urlopen(f"{UPSTREAM}/api/workbench/workspace") as response:
    workspace = json.load(response)
workspace.update(favorites=[favorite], compare_tray=[], views=[], version=1)
workspace["preferences"].update(identity_mode="photos", default_view_id="overview")
lock = Lock()
print(json.dumps({"fixture_favorite": favorite, "source_row": 61}), flush=True)


class Proxy(ReadOnlyProxy):
    def do_POST(self) -> None:
        if urlsplit(self.path).path.startswith("/api/workbench/workspace"):
            self.forward()
        else:
            super().do_POST()

    def do_PATCH(self) -> None:
        self.forward()

    def do_DELETE(self) -> None:
        self.forward()

    def forward(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/workbench/workspace" or path.startswith("/api/workbench/workspace/"):
            with lock:
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                payload = json.loads(body) if body else {}
                if self.command != "GET":
                    if path.endswith("/preferences"):
                        workspace["preferences"].update(payload)
                    elif "/compare-tray" in path or "/favorites" in path:
                        field = "compare_tray" if "/compare-tray" in path else "favorites"
                        if self.command == "POST":
                            entity = payload.get("player_id", path.rsplit("/", 1)[-1])
                            if entity not in workspace[field]:
                                workspace[field].append(entity)
                        elif path.endswith(("/compare-tray", "/favorites")):
                            workspace[field] = []
                        else:
                            entity = path.rsplit("/", 1)[-1]
                            workspace[field] = [x for x in workspace[field] if x != entity]
                    else:
                        self.send_error(405, "Only disposable selection mutations allowed")
                        return
                    workspace["version"] += 1
                data = json.dumps(workspace).encode()
            self.send_response(200)
            self.cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if self.command not in {"GET", "POST"}:
            self.send_error(405, "Read-only analytics only")
            return
        super().forward()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8155), Proxy).serve_forever()
