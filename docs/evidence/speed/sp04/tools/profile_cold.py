"""profile_cold.py <path>...: fresh process; catalog first (unprofiled), then each path's first request profiled briefly."""
import cProfile, pstats, sys, time, io, logging
from fastapi.testclient import TestClient
from courtlens.api.app import create_app
logging.disable(logging.INFO)
client = TestClient(create_app())
t=time.perf_counter(); client.get("/api/workbench/catalog"); print(f"catalog first {1000*(time.perf_counter()-t):.0f} ms")
for path in sys.argv[1:]:
    prof = cProfile.Profile(); t0 = time.perf_counter(); prof.enable()
    method, _, p = path.partition(" ")
    r = client.get(p) if method == "GET" else client.post("/api/workbench/query", content=open(p).read(), headers={"content-type":"application/json"})
    prof.disable(); dt = time.perf_counter() - t0
    t1=time.perf_counter(); client.get(p) if method=="GET" else None; dt2=time.perf_counter()-t1
    print(f"===== {p[:90]} {r.status_code} first {dt*1000:.0f} ms, second {dt2*1000:.0f} ms")
    out = io.StringIO(); pstats.Stats(prof, stream=out).sort_stats("cumulative").print_stats("src/courtlens", 14); print("\n".join(l for l in out.getvalue().splitlines() if "courtlens/" in l))
