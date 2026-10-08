import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property:not([key.name=/^--/]):not([key.value=/^--/])",
          message: "Inline styles must be CSS custom properties (--*) or computed chart/virtualization geometry (design-language-v1)."
        }
      ],
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
            }
          ]
        }
      ]
    }
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "components/charts/**/*.{ts,tsx}", "lib/motion.ts", "lib/motion.tsx"],
    rules: {
      "no-restricted-imports": "off"
    }
  },
  globalIgnores([".next/**", "out/**", "next-env.d.ts"])
]);
