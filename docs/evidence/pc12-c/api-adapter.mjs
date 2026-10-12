// Read-only adapter for isolated production capture. Owner API CORS settings stay intact.
import { createServer } from "node:http";
const origin = "http://localhost:3413";
createServer(async (request, response) => {
  const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" };
  if (request.method === "OPTIONS") { response.writeHead(204, cors); response.end(); return; }
  const path = request.url ?? "/";
  if (!/^\/api\/(workbench|analytics)\//.test(path) || request.method !== "GET") { response.writeHead(405, cors); response.end(); return; }
  try {
    const upstream = await fetch(`http://localhost:8000${path}`);
    response.writeHead(upstream.status, { ...Object.fromEntries(upstream.headers), ...cors });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { response.writeHead(502, cors); response.end(); }
}).listen(4183, "127.0.0.1");
