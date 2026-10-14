// UC04 batch 5: measure the controls on Ask and the CourtLens-only pages, before and after the
// kit migration. Run from dashboard/ against a fixture build:
//   BASE=http://127.0.0.1:3180 OUT=<dir> LABEL=before node ../docs/evidence/ui-consolidation/uc04-courtlens/measure-courtlens.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");

const BASE = process.env.BASE ?? "http://127.0.0.1:3180";
const OUT = process.env.OUT;
const LABEL = process.env.LABEL ?? "run";
const SCOPE = "main, .ui-drawer-panel, [role=dialog], dialog[open]";

const collect = scope => {
  const out = [];
  const seen = new Set();
  for (const root of document.querySelectorAll(scope)) {
    for (const el of root.querySelectorAll("button, a, select, summary, [role='radiogroup'], .context-season-stepper, .ui-filter-bar-meta")) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;
      const svgs = [...el.querySelectorAll(":scope svg")].slice(0, 3).map(s => {
        const b = s.getBoundingClientRect();
        return { w: +b.width.toFixed(1), l: +(b.left - r.left).toFixed(1), rt: +(r.right - b.right).toFixed(1), color: getComputedStyle(s).color };
      });
      const name = (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || el.getAttribute("class") || "").trim().replace(/\s+/g, " ").slice(0, 48);
      out.push({
        key: `${el.tagName.toLowerCase()}|${el.getAttribute("role") || ""}|${name}`,
        x: +r.left.toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        fs: cs.fontSize, fw: cs.fontWeight, radius: cs.borderRadius, gap: cs.columnGap,
        bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, shadow: cs.boxShadow,
        state: el.getAttribute("aria-pressed") || el.getAttribute("aria-checked") || el.getAttribute("aria-selected") || el.getAttribute("aria-expanded") || "",
        svgs,
        cls: (el.getAttribute("class") || "").slice(0, 120),
      });
    }
  }
  return out;
};

const settle = async page => {
  await page.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector('body > div[hidden][id^="S:"]'));
  await page.waitForTimeout(400);
};
const visible = (page, role, name) => page.getByRole(role, { name, exact: true }).filter({ visible: true }).first();

// Retained-operation mocks, from e2e/saved-operations.spec.ts (the fixture API has no saved operations).
const hash = "a".repeat(64), savedId = "22222222-2222-4222-8222-222222222222";
const context = { release_id: "retained-release", season: "2024-25", phase: "regular_season", before_date: "2025-04-15", window: "season" };
const retained = ["distribution"].map((operation, index) => ({ step_id: `step-${index}`, operation, operation_version: "retained-v1", arguments: { metric: "pts" }, operation_hash: hash, result_hash: hash, data: {}, rows: [{ value: 0 }, { value: null }], evidence: [{ evidence_id: `cell-${index}`, result_hash: hash, operation_hash: hash, operation_version: "retained-v1", context_fingerprint: hash, entity_id: "1630567", row_identity: "/rows/0", path: "/rows/0/value", metric: "pts", metric_version: "basketball-v2", unit: "points", value: 0, sample: { n: 20 }, input_identity: context, null_reason: null }], open_url: `/stats?releaseId=${context.release_id}&season=${context.season}&beforeDate=${context.before_date}`, eligible_count: 2, limitations: ["Descriptive; retained bounds"] }));
const detail = { id: savedId, title: "Retained scoring", created_at: "2026-10-04T12:00:00Z", manifest_sha256: hash, metadata: { question_saved: false, question: null }, manifest: { schema_version: "courtload-saved-operation-v1", context, context_fingerprint: hash, plan: { steps: [] }, origin_plan: { steps: [] }, origin_manifest_sha256: hash, metric_version: "basketball-v2", result_scope: "complete_stats_cohort_and_declared_operation_bounds", results: retained, limitations: ["Upstream aggregate rounding remains explicit"] } };
const mockSaved = async page => page.route("**/api/workbench/assistant/**", async route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith("/status")) return route.fulfill({ json: { configured: false, model: "fixture" } });
  if (path.endsWith("/operations")) return route.fulfill({ json: [] });
  if (path.endsWith("/turn")) { const req = route.request().postDataJSON(); return route.fulfill({ json: { schema_version: "courtload-conversation-v1", status: "answered", conversation_id: "11111111-1111-4111-8111-111111111111", turn_id: req.request_id, context, context_fingerprint: hash, interpretation: "Executed without AI", plan: req.plan, results: retained, choices: [], limitations: [], manifest: { hash }, accounting: { provider_calls: 0 } } }); }
  if (path.endsWith("/investigations")) return route.fulfill({ json: [{ ...detail, context, operations: ["distribution"], question_saved: false }] });
  if (path.endsWith("/reproduce")) return route.fulfill({ json: { id: savedId, manifest_sha256: hash, match: true, reason: null, provider_calls: 0, operations: [{ step_id: "step", operation: "distribution", match: true, saved_result_sha256: hash, recomputed_result_sha256: hash }] } });
  return route.fulfill({ json: detail });
});

// Durable threads, from e2e/threaded-assistant.spec.ts (the fixture API has none). The turn returns an
// agent answer with a citation, follow-ups and an action, so every Ask control row renders.
const mockThreads = async page => {
  const headers = [], records = new Map();
  await page.route("**/api/assistant-v2/**", async route => {
    const request = route.request(), url = new URL(request.url()), parts = url.pathname.replace(/.*\/api\/assistant-v2\//, "").split("/"), method = request.method();
    if (parts[0] === "threads" && parts.length === 1) {
      if (method === "POST") { const header = { thread_id: `11111111-1111-4111-8111-${String(headers.length + 1).padStart(12, "0")}`, title: "New conversation", created_at: "2026-10-06T12:00:00Z", updated_at: "2026-10-06T12:00:00Z" }; headers.push(header); records.set(header.thread_id, []); return route.fulfill({ json: header }); }
      return route.fulfill({ json: { threads: headers, next_cursor: null } });
    }
    if (parts[0] === "threads") return route.fulfill({ json: { thread: headers.find(row => row.thread_id === parts[1]), turns: records.get(parts[1]) ?? [], next_cursor: null } });
    if (parts[0] === "turn" && parts[1] === "stream") return route.fulfill({ status: 404, json: { detail: "Unknown assistant route" } });
    const body = request.postDataJSON();
    const response = { schema_version: "courtlens-assistant-v3", request_id: body.request_id, thread_id: body.thread_id, turn_id: body.request_id, status: "answered", mode: "agent",
      answer: { text: "Fixture Guard led the league in assists per game.[^s1]" }, accounting: { provider: "replay", model: "synthetic-uc04", prompt_version: "fixture" },
      sources: [{ source_id: "s1", origin: "web", url: "https://example.org/uc04", title: "Synthetic source", publisher: "example.org" }], results: [], saveable: false,
      follow_ups: ["How did his assist rate change from last season to this one?", "Who else averaged double-digit assists?"],
      actions: [{ kind: "open", label: "Open assist leaders in Stats", url: "/stats" }] };
    const row = { thread_id: body.thread_id, turn_id: body.request_id, request: body, request_sha256: hash, accepted_at: "2026-10-06T12:00:00Z", state: "completed", response };
    records.get(body.thread_id)?.push(row); const header = headers.find(h => h.thread_id === body.thread_id); if (header) header.title = body.message;
    return route.fulfill({ json: response });
  });
};

const P = "season=2025-26&phase=regular_season&beforeDate=2026-04-13";
const PAGES = [
  ["forecasts", "/forecasts"],
  ["evaluation", "/evaluation"],
  ["evaluation-missing", "/evaluation?snapshotId=incompatible"],
  ["investigations", "/investigations"],
  ["investigations-personal", "/investigations?view=personal", null, { saved: true }],
  ["saved-detail", `/investigations/saved/${savedId}`, async page => { await visible(page, "button", "Verify reproduction without AI").click(); }, { saved: true }],
  ["operation-gallery", "/research/operation"],
  ["case-studies", "/research/case-studies"],
  ["distributions", `/research/distributions?playerId=1630567&${P}`],
  ["distributions-ranked", `/research/distributions?tab=rank&${P}`],
  ["trends", "/research/trends"],
  ["trends-rank", `/research/trends?view=rank&${P}`],
  ["adjusted-shooting", "/research/shooting/adjusted"],
  ["data-status", "/data-status"],
  ["settings", "/settings"],
  ["planner", "/planner?week=2026-10-05"],
  ["ask", "/research/ask", null, { threads: true }],
  ["ask-answered", "/research/ask", async page => {
    await page.locator("#content").getByLabel("Your question", { exact: true }).fill("Who led the league in assists?");
    await visible(page, "button", "Send question").click();
    await page.locator("#content").getByText("Who else averaged double-digit assists?").waitFor();
  }, { threads: true }],
  ["ask-manual", "/research/ask?experience=manual", async page => { await visible(page, "button", "Run manual operation").click(); await page.getByText("Executed without AI").first().waitFor(); }, { saved: true }],
  ["ask-drawer", "/players/23", async page => { await visible(page, "button", "Ask").click(); await page.locator("dialog[open], .ask-panel, [role=dialog]").first().waitFor(); }],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium" });
const results = [];
try {
  for (const width of [1440, 390]) {
    const phone = width === 390;
    const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, colorScheme: "dark", reducedMotion: "reduce", isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
    for (const [name, path, act, opts = {}] of PAGES) {
      if (process.env.STATES && !process.env.STATES.split(",").includes(name)) continue;
      if ((opts.desktopOnly && width !== 1440) || (opts.notDesktop && width === 1440) || (opts.phoneOnly && !phone) || (opts.notPhone && phone)) continue;
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      if (opts.saved) await mockSaved(page);
      if (opts.threads) await mockThreads(page);
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        await settle(page);
        if (act) { await act(page); await page.waitForTimeout(500); }
        const controls = await page.evaluate(collect, SCOPE);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        results.push({ state: name, width, errors, overflow, controls });
        if (OUT) await page.screenshot({ path: `${OUT}/${LABEL}-${name}-${width}.png` });
      } catch (error) {
        results.push({ state: name, width, error: String(error).slice(0, 300) });
        if (OUT) await page.screenshot({ path: `${OUT}/${LABEL}-${name}-${width}-failed.png` }).catch(() => {});
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (OUT) writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(results, null, 1));
console.log(results.map(r => `${r.state}@${r.width}: ${r.error ?? `${r.controls.length} controls, ${r.errors.length} errors, overflow ${r.overflow}`}`).join("\n"));
