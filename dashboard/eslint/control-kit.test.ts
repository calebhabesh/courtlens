import { ESLint, RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { readFileSync } from "node:fs";
import stylelint, { type Config } from "stylelint";
import { describe, expect, it } from "vitest";
import { controlKitPlugin, PENDING_CONTROL_CLASS } from "./control-kit.mjs";

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

describe("PENDING_CONTROL_CLASS ratchet", () => {
  it("only shrinks from the 82 files UC03 started with", () => {
    expect(PENDING_CONTROL_CLASS.length).toBeLessThanOrEqual(82);
    expect([...PENDING_CONTROL_CLASS].sort()).toEqual(PENDING_CONTROL_CLASS);
    expect(new Set(PENDING_CONTROL_CLASS).size).toBe(PENDING_CONTROL_CLASS.length);
  });

  it("lists only files that still use control classes, so migrated files leave the list", async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
      overrideConfig: { rules: { "control-kit/no-control-class": "error" } },
      ruleFilter: ({ ruleId }) => ruleId === "control-kit/no-control-class",
    });
    const files = PENDING_CONTROL_CLASS.map((file) => file.replace(/\\/g, ""));
    const results = await eslint.lintFiles(files);
    const clean = results.filter((result) => result.errorCount === 0).map((result) => result.filePath);
    expect(results).toHaveLength(files.length);
    expect(clean).toEqual([]);
  }, 60_000);
});

describe("Stylelint kit-selector ratchet", () => {
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

  it("only shrinks from the six files UC03 started with, each still selecting kit classes", async () => {
    const files = ratchet?.files ?? [];
    expect(files.length).toBeLessThanOrEqual(6);
    for (const file of files) {
      const { results } = await stylelint.lint({ files: file, config: strict });
      expect(results[0].warnings.length, file).toBeGreaterThan(0);
    }
  });
});
