"""Reuse actual source/service/restart and read-only retained verifiers in new PF07d evidence."""

import argparse
from pathlib import Path

import verify_pf07a_assistant as retained
import verify_pf07c_retrieval as retrieval

DIRECTORY = Path("docs/evidence/pf07d-evaluation")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retained-only", action="store_true")
    args = parser.parse_args()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    if args.retained_only:
        retained.DIRECTORY = DIRECTORY
        print(retained.verify_retained())
    else:
        retrieval.DIRECTORY = DIRECTORY
        retrieval.verify_sources()
        retrieval.verify_http()


if __name__ == "__main__":
    main()
