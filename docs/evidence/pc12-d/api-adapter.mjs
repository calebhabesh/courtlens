// GETs and the bounded query read only. No personal-state or analytical writes are forwarded.
import { createServer } from "node:http";
const origin = "http://localhost:3415";
createServer(async (request, response) => {
  const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" };
  if (request.method === "OPTIONS") { response.writeHead(204, cors); response.end(); return; }
  const path = request.url ?? "/";
  const read = request.method === "GET" && /^\/api\/(workbench\/|workspace(?:\?|$))/.test(path);
  const query = request.method === "POST" && path === "/api/workbench/query";
  if (!read && !query) { response.writeHead(405, cors); response.end(); return; }
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    const upstream = await fetch(`http://localhost:8000${path}`, { method: request.method, ...(query ? { headers: { "Content-Type": "application/json" }, body } : {}) });
    response.writeHead(upstream.status, { ...Object.fromEntries(upstream.headers), ...cors });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { response.writeHead(502, cors); response.end(); }
}).listen(4185, "127.0.0.1");
