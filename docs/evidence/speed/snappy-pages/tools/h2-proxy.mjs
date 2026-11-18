// HTTP/2 TLS reverse proxy with the hosted Caddyfile's routes: Next's own /api paths and pages go to
// the dashboard, every other /api/* to the API. Usage: node proxy.mjs <listen> <dashboardPort> <apiPort>
import http2 from "node:http2";
import http from "node:http";
import fs from "node:fs";
const [listen, dash, api] = process.argv.slice(2).map(Number);
const NEXT_API = /^\/api\/(assistant-v2|live|workspace|jobs|finance-import|account)(\/|$|\?)/;
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "http2-settings", "host"]);
const server = http2.createSecureServer({ key: fs.readFileSync(new URL("./key.pem", import.meta.url)), cert: fs.readFileSync(new URL("./cert.pem", import.meta.url)), allowHTTP1: true });
server.on("request", (req, res) => {
  const path = req.url;
  const port = path.startsWith("/api/") && !NEXT_API.test(path) ? api : dash;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!k.startsWith(":") && !HOP.has(k)) headers[k] = v;
  headers.host = `localhost:${listen}`;
  headers["x-forwarded-proto"] = "https";
  const up = http.request({ host: "127.0.0.1", port, method: req.method, path, headers }, upRes => {
    const out = {};
    for (const [k, v] of Object.entries(upRes.headers)) if (!HOP.has(k)) out[k] = v;
    res.writeHead(upRes.statusCode, out);
    upRes.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
});
server.listen(listen, "127.0.0.1", () => console.log(`h2 proxy :${listen} -> dashboard :${dash}, api :${api}`));
