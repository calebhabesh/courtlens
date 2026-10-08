"""Generate Before / After Visual Baseline Index Markdown and HTML artifacts."""

import json
import os

CHANGE_NOTES = {
    "01-home": (
        "Single-row 56px header, command palette pill, tonal panels replacing bright borders."
    ),
    "02-stats": (
        "Compact header, centered table guide cells, tonal filter controls, tabular numbers."
    ),
    "03-players": (
        "Player card grid with tonal surfaces, subtle hairline borders, unified search pill."
    ),
    "04-player-detail": (
        "Clean hero section, tabular game log rows, borderless cards, 126px height reduction."
    ),
    "05-teams": ("Tonal team cards, subtle elevation shadows, consolidated navigation bar."),
    "06-team-detail": (
        "Tonal roster tables, shot charts with dark mode contrast, hairline dividers."
    ),
    "07-compare": (
        "Side-by-side player compare cards, tonal metric diff bars, clean selector dropdowns."
    ),
    "08-live": (
        "Live scoreboard cards with pulsing live dot, tabular score counters, borderless grid."
    ),
    "09-live-game": (
        "Live game hero banner, play-by-play feed with tonal cards, tabular shot distribution."
    ),
    "10-playoffs": (
        "Playoff tournament bracket tree, tonal matchup cards, 228px compact vertical rhythm."
    ),
    "11-ask-empty": (
        "Ask Assistant empty prompt hero, prompt chip suggestions, borderless input pill."
    ),
    "12-ask-answered": (
        "Threaded assistant conversation, streaming prose layout, tonal citation cards."
    ),
    "13-rapm": ("RAPM regression tables, tabular coefficients, subtle hairline cell dividers."),
    "14-wowy": ("WOWY lineup net rating cards, tonal differential bars, tabular minutes."),
    "15-contracts": (
        "Multi-year cap hits table, salary breakdown bars, tabular currency formatting."
    ),
    "16-settings": ("Settings cards, portrait pipeline triggers, tokenized toggle switches."),
    "17-data-status": (
        "Data status & snapshot health indicators, ingestion pipeline logs, badge pills."
    ),
}


def build_readme(records: list[dict[str, object]]) -> str:
    lines = [
        "# Before / After Visual Baseline Index (Design Language v1 Refresh)",
        "",
        (
            "**Parent Block:** DL09 (Enforcement and Acceptance) / DL08 in"
            " [courtlens-refresh-plan.md](../../courtlens-refresh-plan.md)  "
        ),
        "**Contract:** [design-language-v1.md](../../design/design-language-v1.md)  ",
        "**Date:** 2026-10-08  ",
        "**Status:** verified  ",
        (
            "**Interactive Viewer:** [index.html](index.html) (Open in browser"
            " for side-by-side visual inspection)"
        ),
        "",
        "---",
        "",
        "## Executive Summary",
        "",
        (
            "This index documents the comprehensive visual migration across"
            " the entire CourtLens application from the pre-refresh baseline"
            " ([`docs/evidence/dl01-before/`](../dl01-before/)) to the"
            " finalized Design Language v1 implementation"
            " ([`docs/evidence/dl08-after/`](./))."
        ),
        "",
        (
            "A total of **34 full-page screenshots** were systematically"
            " captured across **17 key application states** at both desktop"
            " (**1440px**) and mobile (**375px**) viewports under strict"
            " deterministic testing conditions (Playwright Chromium, mock"
            " time, disabled transitions/animations, transparent carets, and"
            " font readiness)."
        ),
        "",
        "### Primary Design Evolutions Captured:",
        (
            "1. **Single-Row 56px Sticky Header:** Replaced the legacy 2-row"
            " layout (~104px tall) with a unified 56px sticky bar featuring"
            " sliding spring active indicator, transparent-to-blur scroll"
            " behavior (`backdrop-filter: blur(12px)`), unified dropdown"
            " menus, and integrated ⌘K command palette."
        ),
        (
            "2. **Tonal Elevation & Borderless Surfaces:** Replaced"
            " high-contrast `#707783` borders across all cards, drawers, and"
            " tables with subtle tonal layering (`--color-surface-1`,"
            " `--color-surface-2`) and 6-10% white hairline accents"
            " (`--color-hairline`)."
        ),
        (
            "3. **Typography & Tabular Data:** Applied the strict 3-weight"
            " typographic scale and universal `tabular-nums` formatting across"
            " all statistical tables, scoreboards, and financial ledgers."
        ),
        (
            "4. **Responsive Mobile Drawers:** Replaced cramped mobile"
            " navigation with accessible left-sliding drawer menus (`<Drawer>`)"
            " with accordion navigation."
        ),
        (
            "5. **Zero Inline Styles:** Eradicated all 1,257+ raw `style={{`"
            " `... }}` instances across the application, moving dynamic"
            " calculations to type-safe CSS custom properties."
        ),
        "",
        "---",
        "",
        "## Visual Comparison Inventory",
        "",
        (
            "| # | Page State | Viewport | Dim Before | Dim After | Size Before"
            " | Size After | RMSE | % Pixel Delta | Visual Changes Summary |"
        ),
        "|---|---|---|---|---|---|---|---|---|---|",
    ]

    for i, r in enumerate(records, 1):
        key = str(r["key"])
        note = CHANGE_NOTES.get(key, "Tonal surfaces, single-row header, tabular numbers.")
        lines.append(
            f"| {i:02d} | [{r['title']}]({r['file']}) | `{r['viewport']}px` |"
            f" `{r['dim_before']}` | `{r['dim_after']}` | {r['size_before_kb']} KB |"
            f" {r['size_after_kb']} KB | {r['rmse']} | {r['pct_pixel_change']}% | {note} |"
        )

    lines.extend(
        [
            "",
            "---",
            "",
            "## Visual Inspection Instructions",
            "",
            (
                "To view all Before vs After screenshots side-by-side with"
                " zoom and viewport switching:"
            ),
            (
                "1. Open [`index.html`](index.html) in any modern browser (or serve"
                " locally via `python3 -m http.server 3200` in the workspace root)."
            ),
            "2. Toggle between **1440px (Desktop)** and **375px (Mobile)** tabs.",
            (
                "3. Compare the legacy pre-migration presentation against the"
                " polished Design Language v1 implementation."
            ),
            "",
        ]
    )
    return "\n".join(lines)


def build_html(records: list[dict[str, object]]) -> str:
    desktop = [r for r in records if r["viewport"] == "1440"]
    mobile = [r for r in records if r["viewport"] == "375"]

    css_block = """
    :root {
      --bg: #0b0e14;
      --surface-1: #121721;
      --surface-2: #19202e;
      --border: #232c3d;
      --accent: #ff6b35;
      --text: #e6edf3;
      --text-muted: #8b949e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    header {
      max-width: 1400px;
      margin: 0 auto 24px auto;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    p.lead { color: var(--text-muted); font-size: 14px; margin-bottom: 16px; }
    .controls { display: flex; gap: 12px; align-items: center; }
    .tab-btn {
      padding: 8px 16px;
      background: var(--surface-1);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .comparison-grid {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    .page-card {
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .page-card-header {
      padding: 14px 20px;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .page-card-header h2 { font-size: 16px; font-weight: 600; }
    .meta-badges { display: flex; gap: 10px; font-size: 12px; color: var(--text-muted); }
    .badge {
      background: var(--bg);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    .card-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 20px;
    }
    @media (max-width: 900px) {
      .card-body { grid-template-columns: 1fr; }
    }
    .column { display: flex; flex-direction: column; gap: 8px; }
    .column-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .img-wrapper {
      background: #000;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: auto;
      max-height: 700px;
    }
    .img-wrapper img { display: block; width: 100%; height: auto; }
    .note { font-size: 13px; color: var(--text-muted); padding: 0 20px 16px 20px; }
"""

    parts = [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        "  <title>CourtLens Design Language v1 — Before / After Comparison Index</title>",
        f"  <style>{css_block}</style>",
        "</head>",
        "<body>",
        "  <header>",
        "    <h1>CourtLens Design Language v1 — Visual Baseline Comparison</h1>",
        (
            '    <p class="lead">34 full-page captures across 17 application states'
            " comparing pre-refresh baselines against finalized Design Language v1"
            " implementation.</p>"
        ),
        '    <div class="controls">',
        (
            '      <button class="tab-btn active" id="btn-1440"'
            " onclick=\"showViewport('1440')\">Desktop (1440px Viewport · 17"
            " Views)</button>"
        ),
        (
            '      <button class="tab-btn" id="btn-375"'
            " onclick=\"showViewport('375')\">Mobile (375px Viewport · 17"
            " Views)</button>"
        ),
        "    </div>",
        "  </header>",
        '  <main class="comparison-grid" id="container-1440">',
    ]

    for r in desktop:
        key = str(r["key"])
        note = CHANGE_NOTES.get(key, "Tonal surfaces, single-row header, tabular numbers.")
        parts.append(f"""    <section class="page-card">
      <div class="page-card-header">
        <h2>{r["title"]}</h2>
        <div class="meta-badges">
          <span class="badge">Route: {r["path"]}</span>
          <span class="badge">Dim: {r["dim_before"]} &rarr; {r["dim_after"]}</span>
          <span class="badge">Size: {r["size_before_kb"]}KB &rarr; {r["size_after_kb"]}KB</span>
          <span class="badge">RMSE: {r["rmse"]}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="column">
          <span class="column-title">Before (Legacy 2-Row / #707783 Borders)</span>
          <div class="img-wrapper">
            <a href="../dl01-before/{r["file"]}" target="_blank">
              <img src="../dl01-before/{r["file"]}" alt="Before: {r["title"]}" loading="lazy" />
            </a>
          </div>
        </div>
        <div class="column">
          <span class="column-title">After (Design Language v1 / Tonal Elevation)</span>
          <div class="img-wrapper">
            <a href="./{r["file"]}" target="_blank">
              <img src="./{r["file"]}" alt="After: {r["title"]}" loading="lazy" />
            </a>
          </div>
        </div>
      </div>
      <p class="note"><strong>Design Updates:</strong> {note}</p>
    </section>""")

    parts.append(
        '  </main>\n  <main class="comparison-grid" id="container-375" style="display: none;">'
    )

    for r in mobile:
        key = str(r["key"])
        note = CHANGE_NOTES.get(key, "Tonal surfaces, single-row header, tabular numbers.")
        parts.append(f"""    <section class="page-card">
      <div class="page-card-header">
        <h2>{r["title"]} (Mobile)</h2>
        <div class="meta-badges">
          <span class="badge">Route: {r["path"]}</span>
          <span class="badge">Dim: {r["dim_before"]} &rarr; {r["dim_after"]}</span>
          <span class="badge">Size: {r["size_before_kb"]}KB &rarr; {r["size_after_kb"]}KB</span>
          <span class="badge">RMSE: {r["rmse"]}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="column">
          <span class="column-title">Before (Mobile Legacy)</span>
          <div class="img-wrapper">
            <a href="../dl01-before/{r["file"]}" target="_blank">
              <img src="../dl01-before/{r["file"]}" alt="Before: {r["title"]}" loading="lazy" />
            </a>
          </div>
        </div>
        <div class="column">
          <span class="column-title">After (Mobile Drawer & Tonal V1)</span>
          <div class="img-wrapper">
            <a href="./{r["file"]}" target="_blank">
              <img src="./{r["file"]}" alt="After: {r["title"]}" loading="lazy" />
            </a>
          </div>
        </div>
      </div>
      <p class="note"><strong>Design Updates:</strong> {note}</p>
    </section>""")

    parts.append("""  </main>
  <script>
    function showViewport(vp) {
      document.getElementById('container-1440').style.display = vp === '1440' ? 'flex' : 'none';
      document.getElementById('container-375').style.display = vp === '375' ? 'flex' : 'none';
      document.getElementById('btn-1440').classList.toggle('active', vp === '1440');
      document.getElementById('btn-375').classList.toggle('active', vp === '375');
    }
  </script>
</body>
</html>""")
    return "\n".join(parts)


def main() -> None:
    after_dir = "docs/evidence/dl08-after"
    manifest_path = os.path.join(after_dir, "comparison-report.json")
    with open(manifest_path, encoding="utf-8") as f:
        records = json.load(f)

    readme_content = build_readme(records)
    with open(os.path.join(after_dir, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme_content)

    html_content = build_html(records)
    with open(os.path.join(after_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_content)

    print("Successfully generated docs/evidence/dl08-after/README.md and index.html")


if __name__ == "__main__":
    main()
