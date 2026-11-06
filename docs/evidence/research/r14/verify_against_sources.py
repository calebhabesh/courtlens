"""R14 source check: recompute key numbers outside the pipeline.

Run from a directory whose `data/` is the main checkout's and whose `evaluation/` is this
branch's. Uses none of `lineup_model_*` or `lineup_backtest_runner`:

1. stint, usable-stint and possession counts per season straight from R01's sealed game files;
2. the ridge baseline's 2025-26 test error, rebuilt from the Parquet tables with its own design
   and an augmented least-squares solve (not the normal equations);
3. the lineup model's 2025-26 test error from the saved weights through a forward pass written
   here in plain PyTorch;
4. the pooled ridge-minus-lineup gain and its interval with a replicate loop;
5. the lineup model's 2023-24 game-backtest RMSE from the game strengths and R08's margins;
6. the lineup tool's prediction for 2025-26's most-used five through the plain-PyTorch pass.

Writes source-check.json next to this file.
"""

from __future__ import annotations

import gzip
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import torch

HERE = Path(__file__).resolve().parent
FROZEN = Path("evaluation/research/frozen")
DERIVED = Path("data/derived/lineup-model-v1")
REG = json.loads(
    Path("evaluation/research/registrations/courtlens-lineup-model-v1.json").read_text()
)
P = REG["parameters"]
STATS = (
    "points", "field_goals_attempted", "three_pointers_attempted", "free_throws_attempted",
    "rebounds_offensive", "rebounds_defensive", "assists", "steals", "blocks", "turnovers",
    "fouls_personal",
)  # fmt: skip


def season_of(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


# 1 -----------------------------------------------------------------------------------------------
def counts_from_game_files() -> dict[str, dict[str, float]]:
    acceptance = json.loads(
        gzip.decompress(Path("docs/evidence/im03-event-gate/acceptance-v2.json.gz").read_bytes())
    )
    admitted = {d["content_sha256"] for d in acceptance["datasets"]}
    out: dict[str, dict[str, float]] = {}
    for root, sealed in (
        ("data/derived/impact-event-gate/bundles", True),
        ("data/derived/impact-history-v2/bundles", False),
    ):
        for path in sorted(Path(root).glob("*.json.gz")):
            if sealed and path.name.removesuffix(".json.gz") not in admitted:
                continue
            bundle = json.loads(gzip.decompress(Path(path).read_bytes()))
            if bundle["phase"] != "regular_season":
                continue
            row = {"games": 0, "stints": 0, "usable_stints": 0, "usable_possessions": 0.0}
            for member in bundle["members"].values():
                game = json.loads(gzip.decompress(Path(member["path"]).read_bytes()))
                row["games"] += 1
                for s in game["stints"]:
                    row["stints"] += 1
                    h, a = s["home_possessions"], s["away_possessions"]
                    if h > 0 and a > 0:
                        row["usable_stints"] += 1
                        row["usable_possessions"] += (h + a) / 2
            out[bundle["season"]] = row
    return out


# 2 and 3 -----------------------------------------------------------------------------------------
def load_tables() -> tuple[dict[str, np.ndarray], dict[tuple[str, str], dict[str, float]]]:
    t = pq.read_table(
        DERIVED / "dataset" / f"stints-{P['dataset_sha256']['stints_sha256']}.parquet"
    ).to_pydict()
    cols = {k: np.asarray(v) for k, v in t.items()}
    b = pq.read_table(
        DERIVED / "dataset" / f"boxes-{P['dataset_sha256']['boxes_sha256']}.parquet"
    ).to_pydict()
    boxes = {
        (s, p): {k: b[k][i] for k in ("seconds", *STATS)}
        for i, (s, p) in enumerate(zip(b["season"], b["player_id"], strict=True))
    }
    return cols, boxes


def window_design(cols: dict[str, np.ndarray], boxes: dict, target_year: int):  # type: ignore[no-untyped-def]
    home = np.stack([cols[f"home{i}"] for i in range(1, 6)], 1)
    away = np.stack([cols[f"away{i}"] for i in range(1, 6)], 1)
    hp, ap = cols["home_possessions"], cols["away_possessions"]
    usable = (hp > 0) & (ap > 0)
    train = usable & (cols["season"] >= target_year - 3) & (cols["season"] < target_year)
    test = usable & (cols["season"] == target_year)
    poss = defaultdict(float)
    for i in np.flatnonzero(train):
        m = (hp[i] + ap[i]) / 2
        for p in (*home[i], *away[i]):
            poss[p] += m
    own = sorted(p for p, v in poss.items() if v >= P["min_possessions"])
    slot = {p: i for i, p in enumerate(own)}
    seasons = [season_of(y) for y in range(target_year - 3, target_year)]

    def raw(p: str) -> np.ndarray | None:
        tot = defaultdict(float)
        for s in seasons:
            for k, v in boxes.get((s, p), {}).items():
                tot[k] += v
        if tot["seconds"] <= 0:
            return None
        return np.array(
            [tot[k] * 2160 / tot["seconds"] for k in STATS] + [math.log1p(tot["seconds"] / 60)]
        )

    fallback = [p for p in poss if p not in slot and raw(p) is not None]
    feats = np.array([raw(p) for p in fallback])
    w = np.array([poss[p] for p in fallback])
    mean = np.average(feats, axis=0, weights=w)
    sd = np.sqrt(np.average((feats - mean) ** 2, axis=0, weights=w))
    sd[sd <= 0] = 1

    def feature(p: str) -> np.ndarray:
        r = raw(p)
        return np.zeros(len(STATS) + 1) if r is None else (r - mean) / sd

    def rows(idx: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        k, f = len(own), len(STATS) + 1
        x = np.zeros((len(idx), k + f + 2))
        slots = np.full((len(idx), 2, 5), -1)
        fx = np.zeros((len(idx), 2, 5, f))
        for r, i in enumerate(idx):
            for side, five, sign in ((0, home[i], 1.0), (1, away[i], -1.0)):
                for j, p in enumerate(five):
                    if p in slot:
                        x[r, slot[p]] += sign
                        slots[r, side, j] = slot[p]
                    else:
                        v = feature(p)
                        x[r, k : k + f] += sign * v
                        x[r, k + f] += sign
                        fx[r, side, j] = v
            x[r, -1] = 0.0 if cols["neutral"][i] else 1.0
        m = (hp[idx] + ap[idx]) / 2
        y = (cols["home_points"][idx] - cols["away_points"][idx]) / m
        return x, y, m, slots, fx

    return own, rows, np.flatnonzero(train), np.flatnonzero(test)


def ridge_error(cols, boxes, target_year: int, alpha: float):  # type: ignore[no-untyped-def]
    own, rows, train, test = window_design(cols, boxes, target_year)
    x, y, w, _, _ = rows(train)
    pen = np.full(x.shape[1], math.sqrt(alpha))
    pen[-1] = 0.0
    a = np.vstack([x * np.sqrt(w)[:, None], np.diag(pen)])
    b = np.concatenate([y * np.sqrt(w), np.zeros(x.shape[1])])
    beta = np.linalg.lstsq(a, b, rcond=None)[0]
    xt, yt, wt, slots, fx = rows(test)
    pred = 100 * xt @ beta
    err = np.sqrt(np.sum(wt * (100 * yt - pred) ** 2) / wt.sum())
    return float(err), pred, (xt, yt, wt, slots, fx, cols["game_id"][test]), own


def plain_forward(
    w: dict[str, torch.Tensor], slots: torch.Tensor, fx: torch.Tensor, home: torch.Tensor
) -> torch.Tensor:
    """The registered architecture, written out again."""

    def vec(s: torch.Tensor, f: torch.Tensor) -> torch.Tensor:
        own = w["e_own"][s.clamp(min=0)]
        return torch.where((s >= 0).unsqueeze(-1), own, f @ w["a"] + w["a0"])

    def rating(s: torch.Tensor, f: torch.Tensor) -> torch.Tensor:
        return torch.where(s >= 0, w["b_own"][s.clamp(min=0)], f @ w["gamma"] + w["gamma0"])

    def one(first: torch.Tensor, second: torch.Tensor) -> torch.Tensor:
        t = torch.cat([first + w["side"][0], second + w["side"][1]], 1)
        n, k, d = t.shape
        heads = P["heads"]
        q = (t @ w["wq"]).view(n, k, heads, d // heads).transpose(1, 2)
        kk = (t @ w["wk"]).view(n, k, heads, d // heads).transpose(1, 2)
        v = (t @ w["wv"]).view(n, k, heads, d // heads).transpose(1, 2)
        att = torch.softmax(q @ kk.transpose(-1, -2) / math.sqrt(d // heads), -1)
        z = t + (att @ v).transpose(1, 2).reshape(n, k, d) @ w["wo"]
        z = z + torch.relu(z @ w["w1"] + w["c1"]) @ w["w2"] + w["c2"]
        return (z[:, :5].mean(1) - z[:, 5:].mean(1)) @ w["w_out"]

    h, a = vec(slots[:, 0], fx[:, 0]), vec(slots[:, 1], fx[:, 1])
    b = rating(slots, fx)
    inter = 0.5 * (one(h, a) - one(a, h))
    return 100 * (w["home"] * home + b[:, 0].sum(1) - b[:, 1].sum(1) + inter)


def seeds_from(digest: str) -> list[dict[str, torch.Tensor]]:
    with np.load(DERIVED / "models" / f"{digest}.npz") as z:
        out: dict[int, dict[str, torch.Tensor]] = defaultdict(dict)
        for key in z.files:
            i, name = key.split("/", 1)
            out[int(i)][name] = torch.from_numpy(z[key].astype(np.float64))
    return [out[i] for i in sorted(out)]


def main() -> None:
    torch.set_num_threads(2)
    report: dict = {}
    facts = json.loads((FROZEN / "courtlens-lineup-model-v1-facts.json").read_text())
    counted = counts_from_game_files()
    report["counts"] = {
        s: {"recomputed": counted[s], "served": {k: facts["seasons"][s][k] for k in counted[s]}}
        for s in sorted(counted)
    }
    report["counts_equal"] = all(
        abs(counted[s][k] - facts["seasons"][s][k]) < 0.051 for s in counted for k in counted[s]
    )
    results = json.loads((FROZEN / "courtlens-lineup-model-v1.json").read_text())
    cols, boxes = load_tables()
    ridge, ridge_pred, (xt, yt, wt, slots, fx, gid), _ = ridge_error(
        cols, boxes, 2025, results["selected_alpha"]
    )
    served = json.loads((FROZEN / "courtlens-lineup-model-v1-scores.json").read_text())["models"]
    report["ridge_2025_26"] = {
        "recomputed": ridge,
        "served": served["ridge"]["seasons"]["2025-26"]["wrmse"],
    }
    seeds = seeds_from(results["models"]["2025-26"]["lineup"])
    with torch.no_grad():
        home = torch.from_numpy(xt[:, -1])
        lineup_pred = (
            torch.stack(
                [
                    plain_forward(w, torch.from_numpy(slots), torch.from_numpy(fx), home)
                    for w in seeds
                ]
            )
            .mean(0)
            .numpy()
        )
    lineup = float(np.sqrt(np.sum(wt * (100 * yt - lineup_pred) ** 2) / wt.sum()))
    report["lineup_2025_26"] = {
        "recomputed": lineup,
        "served": served["lineup"]["seasons"]["2025-26"]["wrmse"],
    }

    # 4: 2025-26 gain interval with an explicit replicate loop over games.
    games, pos = np.unique(gid, return_inverse=True)
    sq = {
        "ridge": np.bincount(pos, wt * (100 * yt - ridge_pred) ** 2, len(games)),
        "lineup": np.bincount(pos, wt * (100 * yt - lineup_pred) ** 2, len(games)),
    }
    den = np.bincount(pos, wt, len(games))
    rng = np.random.default_rng(np.random.SeedSequence([REG["seed"], 2025]))
    picks = rng.integers(0, len(games), size=(P["replicates"], len(games)))
    gains = []
    for row in picks:
        r = math.sqrt(sq["ridge"][row].sum() / den[row].sum())
        lin = math.sqrt(sq["lineup"][row].sum() / den[row].sum())
        gains.append(r - lin)
    g = results["gains"]["lineup_over_ridge"]["seasons"]["2025-26"]
    report["gain_2025_26"] = {
        "recomputed": {
            "gain": ridge - lineup,
            "low": float(np.quantile(gains, 0.025)),
            "high": float(np.quantile(gains, 0.975)),
        },
        "served": g,
    }

    # 5: the lineup model's 2023-24 game-backtest RMSE from strengths and R08's margins.
    bt = json.loads((FROZEN / "courtlens-lineup-backtest-v1.json").read_text())
    strengths = json.loads(
        (DERIVED / "game-strengths" / f"{results['game_strengths_sha256']}.json").read_text()
    )["seasons"]
    v1 = json.loads(
        Path("evaluation/research/registrations/courtlens-metric-backtest-v1.json").read_text()
    )["parameters"]["table_sha256"]

    def season_rows(season: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        table = json.loads(
            Path(f"data/derived/metric-backtest-v1/tables/{v1[season]}.json").read_text()
        )
        kept = [g for g in table["games"] if g["game_id"] in strengths[season]]
        d = np.array([strengths[season][g["game_id"]]["lineup_model"] for g in kept])
        h = np.array([0.0 if g["neutral"] else 1.0 for g in kept])
        m = np.array([float(g["margin"]) for g in kept])
        return d, h, m

    d0, h0, m0 = season_rows("2022-23")
    coef = np.linalg.lstsq(np.column_stack([h0, d0]), m0, rcond=None)[0]
    d1, h1, m1 = season_rows("2023-24")
    rmse = float(np.sqrt(np.mean((m1 - np.column_stack([h1, d1]) @ coef) ** 2)))
    report["backtest_lineup_2023_24"] = {
        "recomputed": rmse,
        "served": bt["candidates"]["lineup_model"]["seasons"]["2023-24"]["rmse"],
        "games": len(m1),
    }

    # 6: the tool's default five against the panel, through the plain forward pass.
    serving = json.loads((FROZEN / "courtlens-lineup-model-v1-serving.json").read_text())
    with np.load(DERIVED / "models" / f"{serving['inputs_sha256']}.npz") as z:
        own_ids = [str(p) for p in z["own_ids"]]
        tool_ids = [str(p) for p in z["tool_ids"]]
        feats = z["tool_features"]
    slot = {p: i for i, p in enumerate(own_ids)}
    feat = {p: feats[i] for i, p in enumerate(tool_ids)}
    five = serving["panel"][0]
    panel = [p for p in serving["panel"] if not set(p) & set(five)]
    n = len(panel)
    s = np.full((n, 2, 5), -1)
    f = np.zeros((n, 2, 5, feats.shape[1]))
    for r, opp in enumerate(panel):
        for side, group in ((0, five), (1, opp)):
            for j, p in enumerate(group):
                s[r, side, j] = slot.get(p, -1)
                if p not in slot:
                    f[r, side, j] = feat[p]
    serve_seeds = seeds_from(serving["lineup_weights_sha256"])
    with torch.no_grad():
        nets = [
            float(plain_forward(w, torch.from_numpy(s), torch.from_numpy(f), torch.zeros(n)).mean())
            for w in serve_seeds
        ]
    report["tool_default_five"] = {
        "five": five,
        "opponents": n,
        "recomputed_net": float(np.mean(nets)),
    }

    tol = 1e-6
    report["all_equal"] = bool(
        report["counts_equal"]
        and abs(report["ridge_2025_26"]["recomputed"] - report["ridge_2025_26"]["served"]) < 1e-6
        and abs(report["lineup_2025_26"]["recomputed"] - report["lineup_2025_26"]["served"]) < 1e-6
        and all(
            abs(report["gain_2025_26"]["recomputed"][k] - g[k]) < tol
            for k in ("gain", "low", "high")
        )
        and abs(rmse - report["backtest_lineup_2023_24"]["served"]) < 1e-9
    )
    (HERE / "source-check.json").write_text(json.dumps(report, indent=1, sort_keys=True) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "counts"}, indent=1))


if __name__ == "__main__":
    main()
