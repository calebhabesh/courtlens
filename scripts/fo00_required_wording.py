"""FO00 required-wording inventory (frontend overhaul D14).

Cross-references strings that contracts (docs/design/*.md) or tests (unit + e2e) assert against
strings that dashboard source currently renders. A string counts as required on-page wording
when it is asserted somewhere and also appears in non-test dashboard source.

Usage: python scripts/fo00_required_wording.py  -> docs/evidence/fo00/required-wording.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"
OUT = ROOT / "docs/evidence/fo00/required-wording.json"

SOURCE_DIRS = ("app", "components", "lib")
TEST_RE = re.compile(r"\.test\.tsx?$")
CAVEAT_RE = re.compile(
    r"\b(not|unknown|missing|cutoff|prior|confirm\w*|zero|provisional|estimat\w*|unavailable|"
    r"no |never|only|exclusive|admitted|retained|sealed|blocked|limitation\w*)\b",
    re.IGNORECASE,
)

# Assertion helpers whose first string argument is on-page text.
ASSERT_RE = re.compile(
    r"(getByText|queryByText|findByText|getAllByText|toContainText|toHaveText|getByLabel(?:Text)?|"
    r"getByPlaceholder(?:Text)?|toHaveTitle|getByTitle|name:)\s*\(?\s*([\"'`])((?:(?!\2).){4,}?)\2"
)
REGEX_ASSERT_RE = re.compile(
    r"(getByText|queryByText|findByText|getAllByText|toContainText|toHaveText|getByLabel(?:Text)?|"
    r"getByRole\([^)]*name:|name:)\s*\(?\s*/((?:\\/|[^/\n])+)/[a-z]*"
)
REGEX_META_RE = re.compile(r"[\[\](){}*+?|^$.]")
DOC_QUOTE_RE = re.compile(r"[\"“`]([A-Z][^\"”`\n]{9,}?)[\"”`]")


def source_files() -> list[Path]:
    files: list[Path] = []
    for d in SOURCE_DIRS:
        for p in (DASH / d).rglob("*"):
            if p.suffix in {".ts", ".tsx"} and not TEST_RE.search(p.name):
                files.append(p)
    return sorted(files)


def test_files() -> list[Path]:
    files = [p for d in SOURCE_DIRS for p in (DASH / d).rglob("*") if TEST_RE.search(p.name)]
    files += [p for p in (DASH / "e2e").rglob("*.ts")]
    return sorted(files)


def regex_literal(pattern: str) -> str:
    """Longest literal run of a test regex, unescaping simple escapes."""
    runs = REGEX_META_RE.split(re.sub(r"\\(.)", r"\1", pattern))
    return max(runs, key=len).strip() if runs else ""


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def find_rendered(needle: str, sources: dict[Path, list[str]]) -> list[str]:
    hits = []
    for path, lines in sources.items():
        for i, line in enumerate(lines, 1):
            if needle in line:
                hits.append(f"{rel(path)}:{i}")
    return hits


def main() -> None:
    sources = {p: p.read_text(encoding="utf-8").splitlines() for p in source_files()}
    required: dict[str, dict[str, object]] = {}

    def add(text: str, where: str, kind: str) -> None:
        text = text.strip()
        if len(text) < 5 or "${" in text:
            return
        rendered = find_rendered(text, sources)
        if not rendered:
            return
        entry = required.setdefault(
            text,
            {
                "text": text,
                "class": "caveat" if len(text) >= 40 or CAVEAT_RE.search(text) else "label",
                "required_by": [],
                "rendered_at": rendered[:8],
                "rendered_count": len(rendered),
            },
        )
        req = entry["required_by"]
        assert isinstance(req, list)
        if {"kind": kind, "at": where} not in req:
            req.append({"kind": kind, "at": where})

    for path in test_files():
        kind = "e2e" if "/e2e/" in str(path) else "unit"
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for m in ASSERT_RE.finditer(line):
                add(m.group(3), f"{rel(path)}:{i}", kind)
            for m in REGEX_ASSERT_RE.finditer(line):
                literal = regex_literal(m.group(2))
                if len(literal) >= 8:
                    add(literal, f"{rel(path)}:{i}", kind)

    for path in sorted((ROOT / "docs/design").glob("*.md")):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for m in DOC_QUOTE_RE.finditer(line):
                add(m.group(1), f"{rel(path)}:{i}", "contract")

    entries = sorted(
        required.values(), key=lambda e: (e["class"] != "caveat", str(e["text"]).lower())
    )
    summary = {
        "total": len(entries),
        "caveat": sum(e["class"] == "caveat" for e in entries),
        "label": sum(e["class"] == "label" for e in entries),
        "contract_required": sum(
            any(r["kind"] == "contract" for r in e["required_by"]) for e in entries
        ),  # type: ignore[union-attr]
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"summary": summary, "entries": entries}, indent=2, ensure_ascii=False) + "\n"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
