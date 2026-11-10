// Read-only proxy for the RD01 to RD10 real-data checks: 4180 → the owner's API on :8000. GET, HEAD and OPTIONS, plus POST to the Stats query
// (anything else is refused with 405); Origin is rewritten to localhost:3100, and the API's CORS answer is
// handed back to the sandbox page's own origin.
import http from "node:http";
const ALLOWED = new Set(["GET", "HEAD", "OPTIONS"]);
http.createServer((req, res) => {
  // The rookie table's Stats query is the one POST it passes: the same read the Stats page makes.
  if (!ALLOWED.has(req.method) && !(req.method === "POST" && req.url === "/api/workbench/query")) { res.writeHead(405, { allow: "GET, HEAD, OPTIONS" }); res.end(); return; }
  const origin = req.headers.origin;
  const headers = { ...req.headers, host: "127.0.0.1:8000", ...(origin ? { origin: "http://localhost:3100" } : {}) };
  const upstream = http.request({ host: "127.0.0.1", port: 8000, path: req.url, method: req.method, headers }, up => {
    const out = { ...up.headers };
    if (origin && out["access-control-allow-origin"]) out["access-control-allow-origin"] = origin;
    res.writeHead(up.statusCode ?? 502, out); up.pipe(res);
  });
  upstream.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(upstream);
}).listen(4180, "127.0.0.1");
