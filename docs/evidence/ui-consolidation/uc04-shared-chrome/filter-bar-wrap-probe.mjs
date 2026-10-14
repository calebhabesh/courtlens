import { createRequire } from "node:module";
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");
const S = "releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13";
const pages = [["stats", "/stats"], ["stats-1280", "/stats"]];
const variants = { kit: "", dense: "pad" };
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const ctx = await b.newContext({ viewport: { width: 1024, height: 800 }, colorScheme: "dark", reducedMotion: "reduce" });
for (const [name, path] of pages) for (const [v, mode] of Object.entries(variants)) {
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3180" + path, { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector('body > div[hidden][id^="S:"]'));
  if (mode) await p.addStyleTag({ content: `.ui-filter-bar-meta [data-kit=button]{padding-inline:8px!important}${mode.includes("text") ? ".ui-filter-bar-meta [data-kit=button]{font-size:12px!important}.ui-filter-bar-meta [data-kit=button] svg{width:14px!important;height:14px!important}" : ""}` });
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => { const bar = document.querySelector("main .ui-filter-bar"); const btn = bar?.querySelector(".ui-filter-bar-meta [data-kit=button]"); return { barH: bar?.getBoundingClientRect().height, btnW: btn?.getBoundingClientRect().width }; });
  console.log(name, v, JSON.stringify(r));
  await p.close();
}
await b.close();
