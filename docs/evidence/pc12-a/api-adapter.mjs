// Local evidence adapter: forward real API bytes; allow the isolated 3411 UI origin.
// The owner's API permits 3000/3100, which are occupied. No global settings are changed.
import { createServer } from "node:http";
const origin = "http://localhost:3411";
createServer(async (request, response) => {
  const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" };
  if (request.method === "OPTIONS") { response.writeHead(204, cors); response.end(); return; }
  const path = request.url ?? "/";
  if (!path.startsWith("/api/workbench/") || (request.method !== "GET" && !(request.method === "POST" && path === "/api/workbench/query"))) {
    response.writeHead(405, cors); response.end(); return;
  }
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(`http://localhost:8000${path}`, { method: request.method,
      headers: { "Content-Type": request.headers["content-type"] ?? "application/json" },
      ...(request.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
    response.writeHead(upstream.status, { ...Object.fromEntries(upstream.headers), ...cors });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { response.writeHead(502, cors); response.end(); }
}).listen(4180, "127.0.0.1");
