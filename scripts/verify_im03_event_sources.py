"""Re-extract every independent IM03 proof input from the retained immutable archives."""

from __future__ import annotations

import argparse
import tempfile
import time
from pathlib import Path

from courtlens.domain.impact_public_verification import public_sequence_groups
from courtlens.ingestion.impact_archive import archive_rows
from courtlens.ingestion.impact_population import read_json, verified_report, verify_event_receipt
from courtlens.ingestion.impact_repair_audit import ArchiveGames, retain_candidate, retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    accepted = verified_report(Path("docs/evidence/im02/audit-accepted-first.json.gz"))
    reports = []
    public_cache = {}
    started = time.monotonic()
    for path in args.bundle:
        bundle = read_json(path)
        year = int(bundle["season"][:4])
        phase = bundle["phase"]
        cohort = accepted["seasons"][f"{bundle['season']}:{phase}"]
        if (
            content_hash({k: v for k, v in bundle.items() if k != "content_sha256"})
            != bundle["content_sha256"]
        ):
            raise ValueError("bundle hash mismatch")
        if set(bundle["members"]) != {
            gid for gid, game in cohort["games"].items() if game["quality"] != "excluded"
        }:
            raise ValueError("accepted IM02 membership mismatch")
        players, boxes, receipts = retained_boxes(Path("data/raw"), year + 1)
        if receipts != cohort["box_receipts"]:
            raise ValueError("accepted independent box receipts mismatch")
        public_sha = bundle["public_possession_crosscheck"]["source_sha256"]
        if public_sha and phase == "regular_season" and public_sha not in public_cache:
            raw = Path("data/raw/impact-archive/objects") / public_sha[:2] / public_sha
            if hash_file(raw)[0] != public_sha:
                raise ValueError("original public archive hash mismatch")
            public_cache[public_sha] = public_sequence_groups(archive_rows(raw, f"pbpstats_{year}"))
        checked = {}
        with tempfile.TemporaryDirectory(prefix="courtlens-event-proof-") as temporary:
            store = ArchiveGames(Path(temporary) / "inputs.sqlite")
            try:
                for source, family in (("v3", "nbastatsv3"), ("cdn", "cdnnba")):
                    digest = cohort["input_sha256"][source]
                    raw = Path("data/raw/impact-archive/objects") / digest[:2] / digest
                    if hash_file(raw)[0] != digest:
                        raise ValueError("original archive hash mismatch")
                    name = f"{family}{'_po' if phase == 'playoffs' else ''}_{year}"
                    store.load(source, raw, name)
                for gid, member in sorted(bundle["members"].items()):
                    if member["candidate_sha256"] != cohort["games"][gid]["content_sha256"]:
                        raise ValueError("candidate differs from accepted IM02 report")
                    reference = member["event_verification"]
                    proof = read_json(Path(reference["path"]))
                    source = proof["source"]
                    if proof["rows"] != store.get(source, gid):
                        raise ValueError(f"selected raw excerpt mismatch: {gid}")
                    if proof.get("other_rows") and proof["other_rows"] != store.get(
                        "cdn" if source == "v3" else "v3", gid
                    ):
                        raise ValueError(f"cross-source excerpt mismatch: {gid}")
                    if (
                        proof["player_boxes"] != players[gid]
                        or proof["team_boxes"] != boxes[gid]
                        or proof["box_receipts"] != receipts
                    ):
                        raise ValueError(f"box excerpt mismatch: {gid}")
                    for review in proof["public_reviews"].values():
                        if review["source_sha256"] != public_sha or review[
                            "groups"
                        ] != public_cache[public_sha].get((gid, review["opponent"]), []):
                            raise ValueError(f"public group excerpt mismatch: {gid}")
                    if (
                        member["public_possession_crosscheck"]["status"] == "unavailable"
                        and public_sha
                        and phase == "regular_season"
                    ):
                        sides = [b["team_tricode"] for b in boxes[gid]]
                        if all(public_cache[public_sha].get((gid, side)) for side in sides):
                            raise ValueError(
                                f"available public source mislabeled unavailable: {gid}"
                            )
                    game = read_json(Path(member["path"]))
                    if (
                        content_hash({k: v for k, v in game.items() if k != "content_sha256"})
                        != member["content_sha256"]
                    ):
                        raise ValueError("game content hash mismatch")
                    check = verify_event_receipt(member, game)
                    if not check["passed"] or not check["public_passed"]:
                        raise ValueError(f"event verification failed: {gid}: {check['errors'][:3]}")
                    checked[gid] = check["content_sha256"]
                    if len(checked) % 200 == 0:
                        print(bundle["season"], phase, "source verified", len(checked), flush=True)
            finally:
                store.close()
        reports.append(
            {
                "season": bundle["season"],
                "phase": phase,
                "bundle_sha256": bundle["content_sha256"],
                "games": len(checked),
                "proof_hashes": checked,
            }
        )
    result = {
        "accepted_im02_sha256": accepted["content_sha256"],
        "cohorts": reports,
        "games": sum(r["games"] for r in reports),
        "verifier_sha256": hash_file(Path(__file__))[0],
    }
    result["content_sha256"] = content_hash(result)
    result["elapsed_seconds"] = round(time.monotonic() - started, 3)
    retain_candidate(args.output, result)
    print(
        "All independent raw inputs verified", result["games"], result["content_sha256"], flush=True
    )


if __name__ == "__main__":
    main()
