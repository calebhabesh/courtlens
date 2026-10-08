#!/usr/bin/env python3
"""Split globals.css into app/styles/{tokens,base,motion,components,pages}.css in @layer order."""

from pathlib import Path

ROOT = Path("/home/ethioking/dev/nba-analytics")
GLOBALS_CSS = ROOT / "dashboard/app/globals.css"
STYLES_DIR = ROOT / "dashboard/app/styles"
STYLES_DIR.mkdir(parents=True, exist_ok=True)

with open(GLOBALS_CSS, encoding="utf-8") as f:
    lines = f.readlines()

# 1. tokens.css: Already written with Design Language v1 tokens + legacy aliases.
# Let's ensure tokens.css matches the design-language-v1 contract exactly.

tokens_content = """@layer tokens {
  :root {
    color-scheme: dark;

    /* Design Language v1 Color Tokens */
    --color-bg: #0c0d10;
    --color-surface-1: #121419;
    --color-surface-2: #181b21;
    --color-surface-3: #1f232a;
    --color-surface-hover: rgb(255 255 255 / 4%);
    --color-surface-press: rgb(255 255 255 / 7%);
    --color-hairline: rgb(255 255 255 / 6%);
    --color-hairline-strong: rgb(255 255 255 / 10%);
    --color-text: #f2f3f5;
    --color-text-secondary: #a9afb9;
    --color-text-tertiary: #7d838d;
    --color-accent: #ffd166;
    --color-accent-soft: rgb(255 209 102 / 12%);
    --color-on-accent: #0c0d10;
    --color-brand: #ff7a2f;
    --color-positive: #60d394;
    --color-negative: #ff6b6b;
    --color-info: #67aaf9;
    --focus-ring: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);

    /* Elevation Tokens */
    --shadow-1: 0 1px 2px rgb(0 0 0 / 40%);
    --shadow-2: 0 4px 16px rgb(0 0 0 / 35%), inset 0 1px 0 rgb(255 255 255 / 3%);
    --shadow-3: 0 16px 48px rgb(0 0 0 / 55%), inset 0 1px 0 rgb(255 255 255 / 4%);

    /* Spacing Tokens */
    --space-0: 0;
    --space-0-5: 2px;
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-8: 32px;
    --space-10: 40px;
    --space-12: 48px;
    --space-16: 64px;

    /* Radius Tokens */
    --radius-xs: 4px;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --radius-pill: 999px;

    /* Sizing Tokens */
    --control-sm: 28px;
    --control-md: 32px;
    --control-lg: 40px;
    --header-height: 56px;

    /* Typography Tokens */
    --text-xs: 12px;
    --text-xs-lh: 16px;
    --text-sm: 13px;
    --text-sm-lh: 18px;
    --text-md: 14px;
    --text-md-lh: 20px;
    --text-lg: 16px;
    --text-lg-lh: 24px;
    --text-xl: 20px;
    --text-xl-lh: 28px;
    --text-2xl: 24px;
    --text-2xl-lh: 32px;
    --text-3xl: 32px;
    --text-3xl-lh: 40px;

    /* Z-Index Tokens */
    --z-base: 0;
    --z-sticky: 10;
    --z-header: 30;
    --z-dropdown: 40;
    --z-drawer: 50;
    --z-modal: 60;
    --z-toast: 70;
    --z-tooltip: 80;

    /* Motion Tokens */
    --dur-instant: 80ms;
    --dur-fast: 140ms;
    --dur-base: 200ms;
    --dur-slow: 320ms;
    --dur-chart: 450ms;
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-in: cubic-bezier(0.4, 0, 1, 1);
    --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);

    /* Legacy Aliases for Migration (to be deleted in DL08) */
    --bg: #0c0d10;
    --surface: #15171c;
    --surface-raised: #202329;
    --border: #707783;
    --separator: #343840;
    --text: #f2f3f5;
    --text-muted: #a9afb9;
    --accent: #ffd166;
    --on-accent: #0c0d10;
    --positive: #60d394;
    --warning: #ffd166;
    --negative: #ff6b6b;
    --series-secondary: #67aaf9;
    --brand-orange: #ff7a2f;
    --radius: 6px;
    --shadow: 0 4px 24px rgb(0 0 0 / 50%);
    --control-height: 40px;
    --app-row-height: 56px;
    --nav-row-height: 46px;
    --shell-height: calc(var(--app-row-height) + var(--nav-row-height));
    --page-gutter: 24px;
    --ink: var(--text);
    --ink-soft: var(--text-muted);
    --paper: var(--bg);
    --paper-deep: var(--surface);
    --white: var(--surface);
    --lime: var(--accent);
    --lime-deep: #e0b445;
    --orange: var(--brand-orange);
    --blue: var(--series-secondary);
    --muted: var(--text-muted);
    --line: var(--separator);
  }
}
"""

with open(STYLES_DIR / "tokens.css", "w", encoding="utf-8") as f:
    f.write(tokens_content)

# 2. base.css:
# Lines 44-136 (0-indexed: 43 to 136)
# Lines 2807-2819 (B36 tabular nums / code fonts)
# Lines 2906-2910 (forced-colors)
base_chunks = []
base_chunks.append("".join(lines[43:136]))
base_chunks.append(
    "\n/* B36: tabular interface figures and literal data/code operators. */\n"
    + "".join(lines[2806:2819])
)
base_chunks.append("\n" + "".join(lines[2905:2910]))

with open(STYLES_DIR / "base.css", "w", encoding="utf-8") as f:
    f.write("@layer base {\n" + "".join(base_chunks).strip() + "\n}\n")

# 3. motion.css:
# Keyframes + rewritten reduced-motion
motion_content = """@layer motion {
  @keyframes lookupSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes fadeInDropdown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideUpTray {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  @keyframes ask-pulse {
    50% {
      opacity: 0.3;
    }
  }

  /* Rewritten reduced-motion handling per Design Language v1 */
  @media (prefers-reduced-motion: reduce) {
    :root {
      --dur-instant: 1ms;
      --dur-base: 1ms;
      --dur-slow: 1ms;
      --dur-chart: 1ms;
      /* Note: opacity fades retain --dur-fast (140ms) per contract */
    }

    *, *::before, *::after {
      scroll-behavior: auto !important;
    }

    .ask-phase::before {
      animation: none;
    }

    /* Transform-based enters become opacity-only in reduced motion */
    .lineage-drawer,
    .hotkeys-modal,
    .replica-tray {
      transform: none !important;
    }
  }
}
"""

with open(STYLES_DIR / "motion.css", "w", encoding="utf-8") as f:
    f.write(motion_content)

# Now identify components vs pages:
# Lines 137 to 1381:
# Note: strip out lookupSpin (lines 366-368) and fadeInDropdown (lines 773-777)
# Lines 1526-1675: Lineage Drawer (strip @keyframes slideIn lines 1548-1550)
# Lines 1676-1780: Callout & Disclaimers, Responsive & Mobile Constraints
# Lines 2772-2806: B34 conversation and B35b retained evidence
# Lines 2820-2902: Shared controls (lines 2820 to 2902, 0-indexed 2819 to 2902)
# Lines 2911-2946: PF03 team-logo, PF04 entity-select
# Lines 3051-3178: AR06 chat layout, Ask composer, drawer chat overlay (strip @keyframes ask-pulse)
# Lines 3213-3258: AR07 page selections, AG05 answer-first rendering, suggestions

# Pages:
# Lines 1382-1525: Player Profile & Trends, Trend Charts
# Lines 1781-1888: Compare Controls & Results
# Lines 1889-2318: Stats explorer (dense table, preset tabs, filter toolbar, sticky headers)
# Lines 2319-2514: Live workspace & games (strip @keyframes slideInRight lines 2347-2350)
# Lines 2515-2620: Playoffs workspace (strip @keyframes slideUpTray lines 2535-2537)
# Lines 2621-2771: WOWY, shared-floor, shooting, advanced research, finance, live additions
# Lines 2947-3050: PF05 metric widths, tray layout, PF06 route-wide surfaces
# Lines 3179-3212: Planner layout


def clean_lines(slice_lines, strip_keyframes):
    text = "".join(slice_lines)
    # If any keyframe definitions should be removed because they are in motion.css:
    for kf in strip_keyframes:
        while kf in text:
            start = text.find(kf)
            # find matching closing brace
            brace_count = 0
            idx = text.find("{", start)
            end = idx
            while idx < len(text):
                if text[idx] == "{":
                    brace_count += 1
                elif text[idx] == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end = idx + 1
                        break
                idx += 1
            text = text[:start] + text[end:]
    return text


components_text = []
# Lines 137 to 1381
components_text.append(
    clean_lines(lines[136:1381], ["@keyframes lookupSpin", "@keyframes fadeInDropdown"])
)
# Lines 1526 to 1780
components_text.append(clean_lines(lines[1525:1780], ["@keyframes slideIn"]))
# Lines 2772 to 2806 (B34 & B35b)
components_text.append("".join(lines[2771:2806]))
# Lines 2820 to 2902 (Shared control conventions)
components_text.append("".join(lines[2819:2902]))
# Lines 2911 to 2946 (PF03 team-logo, PF04 entity-select)
components_text.append("".join(lines[2910:2946]))
# Lines 3051 to 3178 (AR06 chat layout, Ask composer, drawer chat overlay)
components_text.append(
    clean_lines(
        lines[3050:3178], ["@keyframes ask-pulse", "@media (prefers-reduced-motion: reduce)"]
    )
)
# Lines 3213 to 3259 (AR07 page selections, AG05 answer-first rendering, suggestions)
components_text.append("".join(lines[3212:3259]))

with open(STYLES_DIR / "components.css", "w", encoding="utf-8") as f:
    f.write("@layer components {\n" + "".join(components_text).strip() + "\n}\n")

pages_text = []
# Lines 1382 to 1525 (Player Profile & Trends, Trend Charts)
pages_text.append("".join(lines[1381:1525]))
# Lines 1781 to 1888 (Compare Controls & Results)
pages_text.append("".join(lines[1780:1888]))
# Lines 1889 to 2318 (Stats explorer)
pages_text.append("".join(lines[1888:2318]))
# Lines 2319 to 2514 (Live workspace & games)
pages_text.append(clean_lines(lines[2318:2514], ["@keyframes slideInRight"]))
# Lines 2515 to 2620 (Playoffs workspace)
pages_text.append(clean_lines(lines[2514:2620], ["@keyframes slideUpTray"]))
# Lines 2621 to 2771 (WOWY, shared-floor, shooting, advanced research, finance, Live additions)
pages_text.append("".join(lines[2620:2771]))
# Lines 2947 to 3050 (PF05 metric widths, tray layout, PF06 route-wide surfaces)
pages_text.append("".join(lines[2946:3050]))
# Lines 3179 to 3212 (Planner layout)
pages_text.append("".join(lines[3178:3212]))

with open(STYLES_DIR / "pages.css", "w", encoding="utf-8") as f:
    f.write("@layer pages {\n" + "".join(pages_text).strip() + "\n}\n")

print("CSS split complete.")
