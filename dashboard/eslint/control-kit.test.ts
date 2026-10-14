import { ESLint, RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { readFileSync } from "node:fs";
import stylelint, { type Config } from "stylelint";
import { describe, expect, it } from "vitest";
import { controlKitPlugin } from "./control-kit.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe("control-kit/no-control-class", () => {
  tester.run("no-control-class", controlKitPlugin.rules["no-control-class"], {
    valid: [
      { code: `<button type="button" className="stats-cell-button">x</button>` },
      { code: `<div className="buttons-row" />` },
      { code: `<Button size="lg" className="kit:ms-auto" />` },
    ],
    invalid: [
      { code: `<button className="button button-small">x</button>`, errors: [{ messageId: "control" }, { messageId: "control" }] },
      { code: "<a className={`control-pill ${active ? 'active' : ''}`} />", errors: [{ messageId: "control" }] },
      { code: `<Link className={cx("ranking-chip-btn", on && "button-active")} />`, errors: [{ messageId: "control" }, { messageId: "control" }] },
      { code: `<Field triggerClassName="season-scope-trigger" />`, errors: [{ messageId: "control" }] },
    ],
  });
});

describe("control-kit/kit-layout-only", () => {
  tester.run("kit-layout-only", controlKitPlugin.rules["kit-layout-only"], {
    valid: [
      { code: `<Button className="kit:ms-auto kit:col-span-2 kit:phone:order-last" />` },
      { code: `<div className="kit:h-control-sm" />` },
    ],
    invalid: [
      { code: `<Button className="kit:h-control-sm" />`, errors: [{ messageId: "look" }] },
      { code: `<IconButton className="kit:phone:px-4 kit:ms-2" />`, errors: [{ messageId: "look" }] },
      { code: `<Chip className={cx(x && "kit:bg-accent")} />`, errors: [{ messageId: "look" }] },
    ],
  });
});

describe("control-kit/kit-tokens", () => {
  tester.run("kit-tokens", controlKitPlugin.rules["kit-tokens"], {
    valid: [
      { code: `const a = "kit:px-3 kit:pe-[calc(var(--space-8)-var(--kit-chevron)*4/24)] kit:h-px kit:duration-(--dur-fast)";` },
      { code: `const a = "kit:z-(--z-popover) kit:transition-[background-color,color] kit:rounded-sm";` },
      { code: `const a = "px-[13px] #fff";` },
    ],
    invalid: [
      { code: `const a = "kit:bg-[#ff0000]";`, errors: [{ messageId: "color" }] },
      { code: `const a = "kit:hover:text-[rgb(1,2,3)]";`, errors: [{ messageId: "color" }] },
      { code: `const a = "kit:pe-[calc(var(--space-8)-14px)]";`, errors: [{ messageId: "length" }] },
      { code: `const a = "kit:gap-[0.5rem]";`, errors: [{ messageId: "length" }] },
      { code: `const a = "kit:z-10";`, errors: [{ messageId: "z" }] },
      { code: `const a = "kit:z-[20]";`, errors: [{ messageId: "z" }] },
      { code: `const a = "kit:transition-all";`, errors: [{ messageId: "transition" }] },
      { code: `const a = "kit:duration-150";`, errors: [{ messageId: "duration" }] },
      { code: `const a = "kit:duration-[200ms]";`, errors: [{ messageId: "duration" }] },
      { code: `const a = "kit:px-3!";`, errors: [{ messageId: "important" }] },
      { code: "const a = `kit:h-control-sm kit:bg-[#000]`;", errors: [{ messageId: "color" }] },
    ],
  });
});

describe("control-class ratchet (closed in UC04 batch 6c)", () => {
  it("applies no-control-class to every dashboard file outside components/ui", async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
      ruleFilter: ({ ruleId }) => ruleId === "control-kit/no-control-class",
    });
    // The rule must be live under the real config, or the empty result below would prove nothing.
    const [probe] = await eslint.lintText(`export const A = () => <button className="button" />;`, { filePath: "components/ratchet-probe.tsx" });
    expect(probe.messages.map((message) => message.ruleId)).toContain("control-kit/no-control-class");
    const results = await eslint.lintFiles(["app/**/*.tsx", "components/**/*.tsx"]);
    expect(results.length).toBeGreaterThan(100);
    expect(results.flatMap((result) => result.messages.map((message) => `${result.filePath}:${message.line}`))).toEqual([]);
  }, 120_000);
});

describe("Stylelint kit-selector rule", () => {
  const config = JSON.parse(readFileSync(".stylelintrc.json", "utf8")) as {
    rules: NonNullable<Config["rules"]>;
    overrides: Array<{ files: string[]; rules: Record<string, unknown> }>;
  };
  const ratchet = config.overrides.find((override) => "selector-disallowed-list" in override.rules);
  const strict: Config = { rules: { "selector-disallowed-list": config.rules["selector-disallowed-list"] } };
  const problems = async (code: string) => (await stylelint.lint({ code, config: strict })).results[0].warnings.length;

  it("rejects selectors that reach kit classes and allows neighbours", async () => {
    expect(await problems(".stats-row .ui-button-sm { padding: 0; }")).toBe(1);
    expect(await problems(".toolbar > .ui-select:hover { height: 0; }")).toBe(1);
    expect(await problems("[data-kit='button'] { margin: 0; }")).toBe(1);
    expect(await problems(".ui-tabs-list, .ui-selectable, .stats-toolbar > * { margin: 0; }")).toBe(0);
  });

  it("is closed: no stylesheet is exempt from the kit-selector rule (UC04 batch 6c)", () => {
    expect(ratchet).toBeUndefined();
  });
});
