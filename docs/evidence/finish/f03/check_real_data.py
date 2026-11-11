"""F03 real-data check: every value the Win Probability page shows, against the live API, computed without the page's code."""
import json, sys, urllib.request
api = lambda p: json.load(urllib.request.urlopen("http://localhost:8000" + p))
page = api("/api/win-probability"); card, sc = page["card"], page["scorecard"]
scrape = json.load(open(sys.argv[1])); T, F = scrape["tables"], scrape["fields"]
checked = mism = 0
def eq(label, shown, want):
    global checked, mism
    checked += 1
    ok = (shown is None and want is None) or (want is not None and shown not in (None, "") and abs(float(shown) - float(want)) < 1e-12) if not isinstance(want, str) else shown == want
    if not ok: mism += 1; print("MISMATCH", label, shown, want)
def val(cells, field, attr="data-value"): return cells.get(field, {}).get(attr)
# Answer
g = sc["prospective"]["same_events"]["log_loss_gap"]
for a, k in (("data-value", "mean"), ("data-low", "low"), ("data-high", "high"), ("data-games", "games")): eq(f"headline {k}", F["headline"][a], g[k])
t = card["espn"]["comparison"]["overall"]["log_loss"]["espn_minus_courtlens"]
for a, k in (("data-value", "mean"), ("data-low", "low"), ("data-high", "high")): eq(f"answer-test {k}", F["answer-test"][a], t[k])
eq("drift value", F["drift-line"]["data-value"], sc["drift"]["latest"]["calibration_error"]); eq("drift status", F["drift-line"]["data-status"], sc["drift"]["latest"]["status"])
eq("drift low", F["drift-line"]["data-low"], sc["drift"]["latest"]["interval"]["low"]); eq("drift high", F["drift-line"]["data-high"], sc["drift"]["latest"]["interval"]["high"])
eq("replay games", F["replay-line"]["data-games"], sc["pre_freeze_replay"]["games"])
# Scorecard + replay
for name, grp in (("Games since the freeze", "prospective"), ("Replayed games", "pre_freeze_replay")):
    s = sc[grp]["same_events"]; cells = T[name][0]["cells"]
    for f in ("courtlens_log_loss", "espn_log_loss", "courtlens_brier", "espn_brier", "courtlens_calibration_error", "espn_calibration_error"): eq(f"{grp} {f}", val(cells, f), s[f])
    for a, k in (("data-value", "mean"), ("data-low", "low"), ("data-high", "high")): eq(f"{grp} gap {k}", val(cells, "gap", a), s["log_loss_gap"][k])
# Ledger
games = {x["game_id"]: x for x in sc["recent_games"]}
eq("ledger rows", len(T["Scored games"]), len(games))
for r in T["Scored games"]:
    x = games[r["attrs"]["data-game"]]
    eq("ledger courtlens", val(r["cells"], "courtlens"), x["espn"]["courtlens_log_loss"]); eq("ledger espn", val(r["cells"], "espn"), x["espn"]["log_loss"])
    eq("ledger away", val(r["cells"], "final", "data-away"), x["away_score"]); eq("ledger home", val(r["cells"], "final", "data-home"), x["home_score"])
    eq("ledger counted", val(r["cells"], "counted"), "prospective" if x["prospective"] else "replay")
# Final test, every phase
labels = {"overall": "All states", "first_half": "First half", "third_quarter": "Third quarter", "fourth_early": "Q4, before last 2 min", "last_two": "Last 2 min", "overtime": "Overtime"}
for ph, lab in labels.items():
    c = card["espn"]["comparison"][ph]; rows = {r["attrs"]["data-row"]: r["cells"] for r in T[f"Final test: {lab}"]}
    for row, key in (("courtlens", "courtlens"), ("espn", "espn"), ("gap", "espn_minus_courtlens")):
        for m in ("log_loss", "brier"):
            for a, k in (("data-value", "mean"), ("data-low", "low"), ("data-high", "high")): eq(f"{ph} {row} {m} {k}", val(rows[row], m, a), c[m][key][k])
    eq(f"{ph} ece courtlens", val(rows["courtlens"], "ece"), card["phases"][ph]["calibration_error"])
    if c.get("ece"): eq(f"{ph} ece espn", val(rows["espn"], "ece"), c["ece"]["espn"])
eq("A1", F["A1"]["data-value"], card["gates"]["A1"]["improvement"]["mean"]); eq("A2", F["A2"]["data-value"], card["gates"]["A2"]["ece"])
# Steps: selection from steps, test from pairs (references fixed by R15a)
test_ref = {"S0g": "S0", "S1": "S0g", "S2": "S1", "S3": "S2", "S4": "S2", "S5": "S2", "E": "S2"}
rows = {r["attrs"]["data-step"]: r["cells"] for r in T["Model steps"]}
for k, ref in test_ref.items():
    pair = next(p for p in card["pairs"] if p["model"] == k and p["reference"] == ref)["overall"]["log_loss"]
    for a, kk in (("data-value", "mean"), ("data-low", "low"), ("data-high", "high")):
        eq(f"step {k} test {kk}", val(rows[k], "test", a), pair[kk])
        if k in card["steps"]: eq(f"step {k} sel {kk}", val(rows[k], "selection", a), card["steps"][k]["selection_gain"][kk])
    want = "diagnostic" if k == "S0g" else "kept" if (k == "E" or card["steps"][k]["accepted"]) else "not-kept"
    eq(f"step {k} result", val(rows[k], "kept"), want)
# Market, tip-off, overtime
eq("market cl", F["market"]["data-courtlens"], card["market"]["courtlens_rmse"]); eq("market", F["market"]["data-market"], card["market"]["market_rmse"])
eq("tipoff", F["tipoff"]["data-value"], card["espn"]["tipoff"]["log_loss"]["espn_minus_courtlens"]["mean"]); eq("overtime", F["overtime"]["data-value"], card["phases"]["overtime"]["calibration_error"])
# WPA: every season, every player once, all five values
for season in page["wpa_seasons"]:
    w = api(f"/api/win-probability/wpa?season={season}")
    by = {}
    for r in w["leaders"] + w["clutch_leaders"]: by.setdefault(r["player_id"] or r["player"], r)
    shown = T[f"Win probability added, {season}"]
    eq(f"wpa {season} rows", len(shown), len(by))
    for r in shown:
        x = by[r["attrs"]["data-player"]]
        for f in ("wpa", "events", "games", "clutch_wpa", "clutch_events"): eq(f"wpa {season} {f}", val(r["cells"], f), x[f])
print(f"{checked} values checked, {mism} mismatches")
