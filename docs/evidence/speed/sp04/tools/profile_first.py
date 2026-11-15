"""Profile the first catalog, career and query requests in a fresh process (SP04 diagnosis)."""
import cProfile, pstats, sys, time, json, io
from sqlalchemy import event
from sqlalchemy.engine import Engine
from fastapi.testclient import TestClient
from courtlens.api.app import create_app

statements = []
@event.listens_for(Engine, "before_cursor_execute")
def _b(conn, cursor, stmt, params, ctx, many):
    conn.info.setdefault("t", []).append(time.perf_counter())
@event.listens_for(Engine, "after_cursor_execute")
def _a(conn, cursor, stmt, params, ctx, many):
    t = conn.info["t"].pop()
    statements.append((time.perf_counter() - t, " ".join(stmt.split())[:300]))

client = TestClient(create_app())
release = "71639af2-d8b7-4ce7-99a9-3194b1869853"
steps = [("catalog", "GET", "/api/workbench/catalog", None),
         ("career", "GET", f"/api/workbench/players/2544/career?phase=regular_season&releaseId={release}", None)]
which = sys.argv[1:] or [s[0] for s in steps]
for name, method, path, body in steps:
    if name not in which: 
        client.request(method, path, json=body); continue
    statements.clear()
    prof = cProfile.Profile(); t0 = time.perf_counter(); prof.enable()
    r = client.request(method, path, json=body)
    prof.disable(); dt = time.perf_counter() - t0
    print(f"\n===== {name} {r.status_code} {dt*1000:.0f} ms; {len(statements)} statements, {sum(s[0] for s in statements)*1000:.0f} ms db")
    for d, s in sorted(statements, reverse=True)[:8]: print(f"  {d*1000:7.1f} ms  {s[:220]}")
    out = io.StringIO(); pstats.Stats(prof, stream=out).sort_stats("cumulative").print_stats(45); print(out.getvalue()[:9000])
