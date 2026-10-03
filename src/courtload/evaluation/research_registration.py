"""Validate and retain B25 offline designs. No network, database, fitting or serving."""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path

from courtload.domain.research_registration import (
    ExternalOutput,
    FrozenContract,
    ResearchBinding,
    ResearchProtocol,
)

MAX_DOCUMENT_BYTES = 8 * 1024 * 1024


def load_document(path: Path, *, external: bool = False) -> ResearchProtocol | ExternalOutput:
    with path.open("rb") as stream:
        payload = stream.read(MAX_DOCUMENT_BYTES + 1)
    if len(payload) > MAX_DOCUMENT_BYTES:
        raise ValueError("registration document exceeds 8 MiB")
    if external:
        return ExternalOutput.model_validate_json(payload)
    return ResearchProtocol.model_validate_json(payload)


def retain_document(document: FrozenContract, root: Path) -> Path:
    """Content-addressed exclusive creation; changed documents always get a new address."""
    digest = document.content_hash()
    destination = root / f"{digest}.json"
    payload = (
        json.dumps(document.model_dump(mode="json"), indent=2, sort_keys=True) + "\n"
    ).encode()
    root.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open("xb") as stream:
            stream.write(payload)
    except FileExistsError:
        if destination.read_bytes() != payload:
            raise ValueError("existing registration bytes differ; refusing overwrite") from None
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("document", type=Path)
    parser.add_argument("--external", action="store_true")
    parser.add_argument("--binding", type=Path, help="Optional complete-game binding for a design")
    parser.add_argument("--known-before", type=datetime.fromisoformat)
    parser.add_argument("--before-date", type=date.fromisoformat)
    parser.add_argument("--retain-under", type=Path)
    args = parser.parse_args()
    try:
        document = load_document(args.document, external=args.external)
        if isinstance(document, ExternalOutput):
            if args.binding:
                parser.error("--binding applies only to internal research designs")
            if args.known_before is None or args.before_date is None:
                parser.error("external validation requires --known-before and --before-date")
            reasons = document.gate_reasons(
                known_before=args.known_before, before_date=args.before_date
            )
            if reasons:
                print(json.dumps({"status": "source_blocked", "reasons": reasons}))
                raise SystemExit(2)
            status = "metadata_valid_requires_evidence_byte_verification"
        else:
            status = "design_registered_input_memberships_unbound_no_fit_authorized"
            if args.binding:
                with args.binding.open("rb") as stream:
                    payload = stream.read(MAX_DOCUMENT_BYTES + 1)
                if len(payload) > MAX_DOCUMENT_BYTES:
                    raise ValueError("binding document exceeds 8 MiB")
                binding = ResearchBinding.model_validate_json(payload)
                binding.validate_protocol(document)
                status = "binding_metadata_valid_requires_independent_source_verification"
                if args.retain_under:
                    retain_document(binding, args.retain_under)
        retained = retain_document(document, args.retain_under) if args.retain_under else None
        print(
            json.dumps(
                {
                    "status": status,
                    "sha256": document.content_hash(),
                    "retained_path": str(retained) if retained else None,
                }
            )
        )
    except ValueError as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
