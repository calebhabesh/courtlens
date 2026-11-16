"""Replay SP06's two edits onto a tree's workbench.py (a file shared with the pager session)."""

import sys
from pathlib import Path

path = Path(sys.argv[1]) / "src/courtlens/api/routers/workbench.py"
source = path.read_text()
ROUTE = '@router.get("/players/{id}/portrait", response_model=None)\ndef get_player_portrait('
WEBP = '@router.get("/players/{id}/portrait.webp", response_model=None)\n'
LAST = "    Commons career photo found through Wikidata is the last resort.\n"
CHECK = '    """\n    if size is not None and size not in PORTRAIT_SIZES:'
NOTE = (
    "\n    ``/portrait.webp`` is the same handler with the same parameters and bytes"
    " (speed plan SP06):\n"
    "    Cloudflare caches by file extension, so the dashboard asks for that path."
    " ``/portrait``\n"
    "    stays for the ``portrait_url`` values the API returns and for older links.\n"
)
for old, new in ((ROUTE, WEBP + ROUTE), (LAST + CHECK, LAST + NOTE + CHECK)):
    assert source.count(old) == 1, old[:60]
    source = source.replace(old, new)
path.write_text(source)
print("replayed into", path)
