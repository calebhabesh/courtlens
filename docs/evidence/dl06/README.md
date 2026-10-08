# Block DL06 Evidence Artifacts — Research Workspaces & Investigations Styling

**Captured:** 2026-10-07  
**Scope:** Research suite workspaces, shooting analysis, floor splits, lineup analytics, deep research explorations, and saved investigations library.

---

## 1. Summary of Captured Workspaces

Evidence captured at desktop (1440×900) and mobile (375×812) viewports:

| Workspace Route | Desktop Screenshot | Mobile Screenshot | Description |
|---|---|---|---|
| `/shot-profile-twin` | [`shot-profile-twin-1440.png`](shot-profile-twin-1440.png) | [`shot-profile-twin-375.png`](shot-profile-twin-375.png) | Shot profile peers and court zones explorer with tokenized control ribbons and responsive floor canvas. |
| `/shot-aftermath` | [`shot-aftermath-1440.png`](shot-aftermath-1440.png) | [`shot-aftermath-375.png`](shot-aftermath-375.png) | Shot aftermath rebound and possession transition tracking with tokenized indicators and empirical disclosures. |
| `/wowy` | [`wowy-1440.png`](wowy-1440.png) | [`wowy-375.png`](wowy-375.png) | WOWY (with or without you) on/off shared-floor differential analyzer with dynamic tabular layouts and sample filters. |
| `/matchups` | [`matchups-1440.png`](matchups-1440.png) | [`matchups-375.png`](matchups-375.png) | Defensive matchup assignments, shot distribution frequencies, and empirical allowances. |
| `/research/distributions` | [`distributions-1440.png`](distributions-1440.png) | [`distributions-375.png`](distributions-375.png) | Empirical score & metric distributions, Type 7 linear interpolation quantile strips, venue & rest day splits, and dispersion rankings. |
| `/research/trends` | [`trends-1440.png`](trends-1440.png) | [`trends-375.png`](trends-375.png) | Period A vs. Period B rolling trend analyzer with stat cards, delta metric grids, and out-of-time historical baselines. |
| `/research/similarity` | [`similarity-1440.png`](similarity-1440.png) | [`similarity-375.png`](similarity-375.png) | Multi-dimensional player style similarity matching with adjustable feature weights and metric comparison grids. |
| `/research/case-studies` | [`case-studies-1440.png`](case-studies-1440.png) | [`case-studies-375.png`](case-studies-375.png) | Analytical case studies library with structured findings, cryptographic lineage hashes, and reproducible query parameters. |
| `/rankings` | [`rankings-1440.png`](rankings-1440.png) | [`rankings-375.png`](rankings-375.png) | Custom tier lists and ranking boards with modal builders, reorder controls, and contextual stat badges. |
| `/stat-line-shift` | [`stat-line-shift-1440.png`](stat-line-shift-1440.png) | [`stat-line-shift-375.png`](stat-line-shift-375.png) | Counterfactual stat line shift simulation with on/off production splits. |
| `/wingspan` | [`wingspan-1440.png`](wingspan-1440.png) | [`wingspan-375.png`](wingspan-375.png) | Draft combine physical measurements explorer with interactive scatter plot and SVG tooltips. |
| `/investigations` | [`investigations-1440.png`](investigations-1440.png) | [`investigations-375.png`](investigations-375.png) | Saved investigations library with parameter breadcrumbs, reproducible query links, and provenance cards. |

---

## 2. Key Architecture & Styling Standards

1. **Tokenized Surfaces & Typography:**
   - All card surfaces, borders, tables, and typography migrated to Design Language v1 tokens (`--color-surface-1`, `--color-surface-2`, `--color-hairline`, `--space-*`, `--text-*`).
   - Replaced all ad-hoc `#707783` borders with subtle `--color-hairline` and `--color-hairline-strong`.
2. **Zero Inline Styles (`style={{ ... }}` Elimination):**
   - Eliminated all raw inline styling from touched research components and pages.
   - Dynamic track geometries (quantile strip spans, median indicators, outlier points) use strictly type-safe CSS custom properties (`--span-left`, `--span-width`, `--dot-left`, `--label-left`).
   - Achieved 0 ESLint warnings for `no-restricted-syntax`.
3. **Analytical & Invariant Preservation:**
   - Preserved all sample thresholds ($n \ge 5$), Type 7 linear interpolation calculations, cryptographic SHA-256 hashes, and descriptive provenance notes.
   - Retained all ARIA roles, input labels, and locators for existing automated test suites.
