"""profile_reads.py <path> [warm]: profile one GET in-process (after warm-up requests if `warm`)."""
import cProfile, pstats, sys, time, io
from sqlalchemy import event
from sqlalchemy.engine import Engine
from fastapi.testclient import TestClient
from courtlens.api.app import create_app
statements = []
@event.listens_for(Engine, "before_cursor_execute")
def _b(conn, cursor, stmt, params, ctx, many): conn.info.setdefault("t", []).append(time.perf_counter())
@event.listens_for(Engine, "after_cursor_execute")
def _a(conn, cursor, stmt, params, ctx, many):
    statements.append((time.perf_counter() - conn.info["t"].pop(), " ".join(stmt.split())[:300]))
import logging; logging.disable(logging.INFO)
client = TestClient(create_app())
path = sys.argv[1]
if len(sys.argv) > 2:
    client.get("/api/workbench/catalog"); client.get(path); client.get(path)
statements.clear()
prof = cProfile.Profile(); t0 = time.perf_counter(); prof.enable()
r = client.get(path)
prof.disable(); dt = time.perf_counter() - t0
print(f"===== {r.status_code} {dt*1000:.0f} ms; {len(statements)} statements, {sum(s[0] for s in statements)*1000:.0f} ms db, {len(r.content)} bytes")
for d, s in sorted(statements, reverse=True)[:10]: print(f"  {d*1000:7.1f} ms  {s[:200]}")
out = io.StringIO(); pstats.Stats(prof, stream=out).sort_stats("cumulative").print_stats("courtlens", 40); print(out.getvalue())
