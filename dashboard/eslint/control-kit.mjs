// UC03 (docs/ui-consolidation-plan.md): lint contracts for the control kit (docs/design/control-kit-v1.md).
//
// - `no-control-class`: legacy `.button*` and bespoke control classes may not be applied outside
//   components/ui. Unmigrated files sit on a ratchet list in eslint.config.mjs.
// - `kit-layout-only`: a kit component's `className` is for layout (margin, grid or flex placement);
//   size, padding, text, gap and colour come from its props.
// - `kit-tokens`: the Tailwind equivalent of the Stylelint value contracts (.stylelintrc.json) for
//   `kit:` utilities: token colours, spacing, radii, type, z-index and motion only, no `!important`.

/** Legacy and bespoke control classes, from the control kit v1 mapping. */
export const CONTROL_CLASSES = [
  // Legacy `.button` classes.
  "button", "button-small", "button-primary", "button-secondary", "button-quiet", "button-active", "button-dark",
  "control-button-group",
  // → Button
  "stats-help-button", "stats-footer-button", "player-back-button", "views-modal-btn-action", "finance-detail-button",
  "courtlens-ask-btn", "ui-why-summary",
  // → IconButton
  "stats-tool-button", "stats-expand-button", "stats-icon-action", "stats-details-button", "player-career-expand",
  "ranking-reorder-btn", "ranking-meta-btn", "tier-reorder-btn", "tier-quick-fav-btn", "ranking-delete-btn",
  "tier-remove-btn", "tier-delete-btn", "modal-close-btn", "filter-clear-btn", "lookup-clear-btn",
  "courtlens-mobile-toggle", "courtlens-mobile-search-btn", "icon-button", "ui-icon-button", "context-stepper-button",
  // → Select
  "ui-select", "stats-team-select",
  // → Segmented
  "ui-segmented-item", "stats-preset-tab", "ui-tab-trigger", "tier-tab", "dist-tab", "player-tab",
  // → MenuTrigger
  "ui-menu-trigger", "ui-popover-trigger", "ui-date-trigger", "season-scope-trigger", "stats-team-button",
  "availability-trigger", "ui-filter-bar-toggle",
  // → Chip
  "control-pill", "stats-position-chip", "entity-chip", "ui-entity-chip", "compare-tray-chip",
  "ranking-chip-btn", "filter-action-pill", "season-scope-quick-button",
  "glossary-chip",
];

/**
 * Ratchet: files that still apply control classes. A UC04 batch removes the files it migrates;
 * nothing may be added. UC03 started with 82 files. Dynamic route folders are escaped glob patterns.
 */
export const PENDING_CONTROL_CLASS = [
  "components/assistant-status-card.tsx",
  "components/entity-picker.tsx",
  "components/install-interface.tsx",
  "components/lookup-input.tsx",
  "components/table-percentile-legend.tsx",
  "components/workbench-portrait-settings.tsx",
];

const CONTROL_SET = new Set(CONTROL_CLASSES);
const KIT_COMPONENTS = new Set([
  "Button", "ButtonLink", "ButtonSummary", "IconButton", "IconButtonLink", "Select", "Segmented", "MenuTrigger", "Chip", "RemovableChip",
]);

const isClassAttribute = (name) => name === "className" || /ClassName$/.test(name);

/** Every static class-name fragment inside an attribute value: literals, template text, object keys. */
function classStrings(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "Literal" && typeof node.value === "string") out.push({ node, text: node.value });
  else if (node.type === "TemplateElement") out.push({ node, text: node.value.cooked ?? node.value.raw });
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((item) => classStrings(item, out));
    else if (child && typeof child.type === "string") classStrings(child, out);
  }
  return out;
}

const tokens = (text) => text.split(/\s+/).filter(Boolean);

const noControlClass = {
  meta: {
    type: "problem",
    docs: { description: "Use the control kit instead of legacy or bespoke control classes (UC03)." },
    schema: [],
    messages: {
      control:
        "`{{name}}` is a legacy or bespoke control class. Use the control kit (components/ui/kit; mapping in docs/design/control-kit-v1.md).",
    },
  },
  create(context) {
    return {
      JSXAttribute(attribute) {
        if (attribute.name.type !== "JSXIdentifier" || !isClassAttribute(attribute.name.name)) return;
        for (const { node, text } of classStrings(attribute.value)) {
          for (const name of tokens(text)) {
            if (CONTROL_SET.has(name)) context.report({ node, messageId: "control", data: { name } });
          }
        }
      },
    };
  },
};

/** Utilities that set a kit control's size, spacing, type or colour (Tailwind v4 names, `kit:` prefix). */
const LOOK_UTILITY =
  /^-?(?:size|h|w|min-h|min-w|max-h|max-w|p[xytrblse]?|gap(?:-[xy])?|text|leading|font|tracking|rounded(?:-[a-z]+)?|bg|border(?:-[a-z]+)?|ring|inset-ring|shadow|opacity|scale)(?:-|$)/;

/** Strip the `kit:` prefix, variants and important markers: `kit:phone:hover:-mt-2!` → `-mt-2`. */
function utilityOf(token) {
  if (!token.startsWith("kit:")) return null;
  let rest = token.slice(4);
  let depth = 0;
  let start = 0;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;
    else if (char === ":" && depth === 0) start = index + 1;
  }
  rest = rest.slice(start);
  return rest.replace(/^!|!$/g, "");
}

const kitLayoutOnly = {
  meta: {
    type: "problem",
    docs: { description: "A kit component's className may only place it (UC03)." },
    schema: [],
    messages: {
      look: "`{{name}}` changes the control's size, spacing, type or colour. Use the kit's size, variant and tone props; className is for layout only.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(element) {
        if (element.name.type !== "JSXIdentifier" || !KIT_COMPONENTS.has(element.name.name)) return;
        for (const attribute of element.attributes) {
          if (attribute.type !== "JSXAttribute" || attribute.name.name !== "className") continue;
          for (const { node, text } of classStrings(attribute.value)) {
            for (const name of tokens(text)) {
              const utility = utilityOf(name);
              if (utility && LOOK_UTILITY.test(utility)) context.report({ node, messageId: "look", data: { name } });
            }
          }
        }
      },
    };
  },
};

// Mirrors .stylelintrc.json. Arbitrary values (`[…]`, and `(…)` variable shorthands) are where a raw
// value could slip in; theme utilities are already limited to tokens by `--*: initial` in tailwind.css.
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const SPACED_UTILITY = /^-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|rounded(?:-[a-z]+)?|text|leading)-[[(]/;
const RAW_LENGTH = /(?:\b0\.\d+px|\b(?:[02-9]|[1-9]\d+)(?:\.\d+)?px|\d+(?:\.\d+)?rem)/;
const RAW_Z = /^-?z-(?:\[[^\]]*(?<![0-9])[1-9]\d*|[1-9]\d*$)/;
const TRANSITION_ALL = /^transition(?:-all$|-\[[^\]]*\ball\b)/;
const RAW_DURATION = /^(?:duration|delay)-(?:\d+$|\[[^\]]*\d+(?:s|ms)\b)/;

const kitTokens = {
  meta: {
    type: "problem",
    docs: { description: "Kit utilities use design tokens only (Design Language v1, UC03)." },
    schema: [],
    messages: {
      color: "`{{name}}` uses a raw colour. Use a token colour from app/styles/tailwind.css.",
      length: "`{{name}}` uses a raw length. Use --space-*, --radius-*, --text-* or a --kit-* token.",
      z: "`{{name}}` uses a numeric z-index. Use a --z-* token.",
      transition: "`{{name}}` transitions all properties. Name the properties.",
      duration: "`{{name}}` uses a raw duration. Use a --dur-* motion token so reduced motion applies.",
      important: "`{{name}}` uses !important.",
    },
  },
  create(context) {
    const check = (node, text) => {
      for (const name of tokens(text)) {
        const utility = utilityOf(name);
        if (utility === null) continue;
        let messageId = null;
        if (/^kit:(?:.*:)?!|!$/.test(name)) messageId = "important";
        else if (RAW_COLOR.test(utility)) messageId = "color";
        else if (SPACED_UTILITY.test(utility) && RAW_LENGTH.test(utility)) messageId = "length";
        else if (RAW_Z.test(utility)) messageId = "z";
        else if (TRANSITION_ALL.test(utility)) messageId = "transition";
        else if (RAW_DURATION.test(utility)) messageId = "duration";
        if (messageId) context.report({ node, messageId, data: { name } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string" && node.value.includes("kit:")) check(node, node.value);
      },
      TemplateElement(node) {
        const text = node.value.cooked ?? node.value.raw;
        if (text.includes("kit:")) check(node, text);
      },
    };
  },
};

export const controlKitPlugin = {
  meta: { name: "courtlens-control-kit" },
  rules: { "no-control-class": noControlClass, "kit-layout-only": kitLayoutOnly, "kit-tokens": kitTokens },
};
