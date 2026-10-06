"""Read-only production API passthrough for the isolated PF02 preview origins."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class Proxy(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        self.forward()

    def do_POST(self) -> None:
        if self.path != "/api/workbench/query":
            self.send_error(405, "Only read-only queries are permitted")
            return
        self.forward()

    def cors_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin in {"http://127.0.0.1:3154", "http://127.0.0.1:3155"}:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def forward(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length", "0"))) or None
        request = Request(
            "http://127.0.0.1:8000" + self.path,
            data=body,
            method=self.command,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=15) as response:
                status, data = response.status, response.read()
        except HTTPError as error:
            status, data = error.code, error.read()
        self.send_response(status)
        self.cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8154), Proxy).serve_forever()
