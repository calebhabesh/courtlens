#!/usr/bin/env python3
"""Admit retained full-season assignments, or verify a previously sealed dataset."""

import argparse
import json
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from courtlens.assignment_models import AssignmentDataset
from courtlens.config import get_settings
from courtlens.services.assignment_admission import (
    AssignmentAdmissionError,
    admit_assignments,
    prepare_assignments,
    verify_assignments,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--methodology", type=Path)
    parser.add_argument("--store", type=Path, default=Path("data/artifacts/assignments"))
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--verify-dataset")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    candidate = None
    if not args.verify_dataset:
        if not args.source or not args.baseline or not args.methodology:
            parser.error("admission requires --source, --baseline and --methodology")
        try:
            candidate = prepare_assignments(
                args.source, args.baseline, args.methodology, args.store, args.year
            )
        except (AssignmentAdmissionError, ValueError) as exc:
            failures = exc.failures if isinstance(exc, AssignmentAdmissionError) else [str(exc)]
            (args.output / "rejection.json").write_text(json.dumps(failures, indent=2) + "\n")
            raise
    engine = create_engine(get_settings().database_url)
    try:
        with Session(engine) as session:
            if candidate is not None:
                dataset = admit_assignments(session, candidate)
            else:
                dataset = session.get(AssignmentDataset, args.verify_dataset)
                if dataset is None:
                    raise ValueError("assignment dataset not found")
            result = verify_assignments(session, dataset, args.store)
            (args.output / "manifest.json").write_text(
                json.dumps(dataset.manifest_json, indent=2, sort_keys=True) + "\n"
            )
            session.commit()
            (args.output / "verification.json").write_text(
                json.dumps(result, indent=2, sort_keys=True) + "\n"
            )
            print(json.dumps(result, sort_keys=True))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
