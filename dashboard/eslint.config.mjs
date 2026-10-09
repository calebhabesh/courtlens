import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// D26: arrows (U+2190–21FF), geometric shapes (U+25A0–25FF), misc symbols and dingbats incl. check
// marks and stars (U+2600–27BF), more arrows (U+2B00–2BFF) and emoji (surrogate pairs for
// U+1F000–1FAFF, matched by range so new emoji are caught too). U+2318 (⌘ in shortcut hints) and
// U+00D7 (× as multiplication) are outside these ranges.
const GLYPH = "/[\\u2190-\\u21FF\\u25A0-\\u25FF\\u2600-\\u27BF\\u2B00-\\u2BFF]|[\\uD83C-\\uD83E][\\uDC00-\\uDFFF]/";
const GLYPH_MESSAGE = "Use <Icon> from components/ui/icon.tsx instead of arrow, check, shape or emoji characters (D26). Genuine prose or a data encoding needs an eslint-disable comment that says why.";
const inlineStyleRule = {
  selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property:not([key.name=/^--/]):not([key.value=/^--/])",
  message: "Inline styles must be CSS custom properties (--*) or computed chart/virtualization geometry (design-language-v1)."
};
// FO06 (Design Language v1.1): page patterns that lint can detect.
const nativeDateRule = {
  selector: "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='date']",
  message: "Use DatePicker from components/ui/date-picker.tsx, not a native date input (D11, Design Language v1.1)."
};
const rawTitleRule = {
  selector: "JSXOpeningElement[name.name='h1']",
  message: "Page titles come from PageHeader in components/ui/panel.tsx (D7, Design Language v1.1)."
};
const baseSyntaxRules = [
  inlineStyleRule,
  { selector: `JSXText[value=${GLYPH}]`, message: GLYPH_MESSAGE },
  { selector: `Literal[value=${GLYPH}]`, message: GLYPH_MESSAGE },
  { selector: `TemplateElement[value.raw=${GLYPH}]`, message: GLYPH_MESSAGE }
];
// Ratchets: files that still use the old pattern until their overhaul block rebuilds them. A block
// that migrates a file removes it here; nothing may be added.
const PENDING_NATIVE_DATE = [
  "components/live-workspace.tsx", "components/playoffs-bracket-view.tsx", "app/schedule/page.tsx", // FO08
  "components/finance-contract-drawer.tsx", "components/finance-workspace.tsx", // FO10
  "components/shared-floor-view.tsx", // FO11
  "components/shooting-view.tsx", "components/trends-investigation-view.tsx", "app/research/rapm/page.tsx", // FO12
  "components/planner-client.tsx", "components/ask-courtlens.tsx" // FO13
];
// Dynamic route folders are escaped because these are glob patterns.
const PENDING_RAW_TITLE = [
  "components/live-workspace.tsx", "components/playoffs-series-view.tsx", "app/playoffs/page.tsx", "app/schedule/page.tsx", // FO08
  "app/players/page.tsx", "app/players/\\[id\\]/page.tsx", "components/workbench-player-profile.tsx", "app/last-games/page.tsx",
  "components/recent-games-view.tsx", "components/ranking-boards-view.tsx", "components/tier-list-view.tsx", // FO09
  "app/teams/page.tsx", "app/teams/\\[id\\]/page.tsx", "components/finance-workspace.tsx", // FO10
  "app/compare/page.tsx", "app/team-compare/page.tsx", "components/shared-floor-view.tsx", // FO11
  "components/shooting-view.tsx", "components/trends-investigation-view.tsx",
  "components/distributions-investigation-view.tsx", "app/forecasts/page.tsx", "app/evaluation/page.tsx",
  "components/case-studies-view.tsx", "app/investigations/page.tsx", "components/saved-operation-detail.tsx",
  "components/research-operation-view.tsx", "components/possession-calculator-view.tsx",
  "components/wingspan-explorer-view.tsx", // FO12
  "app/settings/page.tsx", "app/data-status/page.tsx",
  "app/planner/page.tsx", "components/stats-workspace.tsx", "app/research/ask/page.tsx", // FO13
  "app/not-found.tsx", "components/capability-notice.tsx" // FO14
];
const lucideImport = {
  name: "lucide-react",
  message: "Import icons through components/ui/icon.tsx (D26); add missing glyphs to its map."
};

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...baseSyntaxRules, nativeDateRule, rawTitleRule],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "motion",
              message: "Imports of motion are allowed only from components/ui/**, components/charts/**, and lib/motion.ts."
            },
            {
              name: "motion/react",
              message: "Imports of motion/react are allowed only from components/ui/**, components/charts/**, and lib/motion.ts."
            },
            {
              name: "framer-motion",
              message: "Use motion or motion/react per lib/motion.ts."
            },
            lucideImport
          ]
        }
      ]
    }
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "components/charts/**/*.{ts,tsx}", "lib/motion.ts", "lib/motion.tsx"],
    rules: {
      "no-restricted-imports": ["error", { paths: [lucideImport] }]
    }
  },
  {
    files: ["components/ui/icon.tsx"],
    rules: {
      "no-restricted-imports": "off"
    }
  },
  {
    files: PENDING_NATIVE_DATE.filter((file) => !PENDING_RAW_TITLE.includes(file)),
    rules: { "no-restricted-syntax": ["error", ...baseSyntaxRules, rawTitleRule] }
  },
  {
    files: PENDING_RAW_TITLE.filter((file) => !PENDING_NATIVE_DATE.includes(file)),
    rules: { "no-restricted-syntax": ["error", ...baseSyntaxRules, nativeDateRule] }
  },
  {
    files: PENDING_NATIVE_DATE.filter((file) => PENDING_RAW_TITLE.includes(file)),
    rules: { "no-restricted-syntax": ["error", ...baseSyntaxRules] }
  },
  {
    // PageHeader is the one place that renders the page title element.
    files: ["components/ui/panel.tsx"],
    rules: { "no-restricted-syntax": ["error", ...baseSyntaxRules, nativeDateRule] }
  },
  {
    // Tests and e2e specs assert real content (for example an emoji in an assistant answer).
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", inlineStyleRule]
    }
  },
  globalIgnores([".next/**", "out/**", "next-env.d.ts"])
]);
