// Real-data check for RD07 (Patch Notes): the page is repo-backed, so every value it draws is compared with the committed
// dashboard/content/patch-notes.json (itself checked against git by dashboard/scripts/check-patch-notes.mjs). The production
// build on 3180 runs against the owner's API through the read-only proxy on 4180 (readonly-proxy.mjs, GET only), at 1440 and
// 390. Also: console errors, page overflow, broken images, phone controls and ButtonLinks under 40 px, the hero icon's
// centring, the sticky release column on a desktop and the release head above its entries on a phone.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const WEB = "http://localhost:3180/whats-new";
const [,, out, shots] = process.argv;
const notes = JSON.parse(readFileSync("/home/ethioking/dev/courtlens/dashboard/content/patch-notes.json", "utf8"));
const REPO = "https://github.com/calebhabesh/courtlens";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const short = iso => { const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const month = ({ from, to }) => {
  const [fy, fm] = from.split("-").map(Number), [ty, tm] = to.split("-").map(Number);
  if (fy === ty && fm === tm) return `${FULL[tm - 1]} ${ty}`;
  return fy === ty ? `${MONTHS[fm - 1]}–${MONTHS[tm - 1]} ${ty}` : `${MONTHS[fm - 1]} ${fy}–${MONTHS[tm - 1]} ${ty}`;
};
const range = ({ from, to }) => from === to ? short(from) : `${from.slice(0, 4) === to.slice(0, 4) ? short(from).replace(/, \d{4}$/, "") : short(from)} – ${short(to)}`;
const line = r => r.merge ? `${r.version} · merged ${short(r.merge.date)}` : `${r.version} · ${range(r.range)}`;
const display = t => t.replace(/ \(([0-9a-f]{7}), (\d{4}-\d{2}-\d{2})\)/g, (_, __, d) => ` (${short(d)})`).replace(/ \([0-9a-f]{7}\)/g, "");
const entries = notes.releases.flatMap(r => r.groups.flatMap(g => g.entries));
const latest = entries.map(e => e.date).sort().at(-1);

const report = [];
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, want) => { compared += 1; if (got !== want) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(WEB, { waitUntil: "networkidle", timeout: 120000 });
  const tag = width > 600 ? "1440" : "390";
  if (shots) await page.screenshot({ path: `${shots}/patch-notes-default-${tag}.png` });
  if (shots) await page.screenshot({ path: `${shots}/patch-notes-full-${tag}.png`, fullPage: true });

  // Hero.
  eq("h1", await page.locator("h1").innerText(), "Patch Notes");
  eq("tagline", (await page.locator(".rs-intro-tagline").innerText()).trim(), `Latest ${short(latest)} · ${notes.releases.length} releases · ${entries.length} changes`);
  eq("no tab bar", await page.getByRole("navigation", { name: "What's New sections" }).count(), 0);
  eq("hero icon centred", await page.evaluate(() => {
    const icon = document.querySelector(".pn-hero .ui-page-header-icon").getBoundingClientRect();
    const svg = document.querySelector(".pn-hero .ui-page-header-icon svg").getBoundingClientRect();
    return Math.abs((icon.left + icon.width / 2) - (svg.left + svg.width / 2)) <= 1 && Math.abs((icon.top + icon.height / 2) - (svg.top + svg.height / 2)) <= 1;
  }), true);

  // Every release and every entry against the committed source.
  const drawn = await page.evaluate(() => [...document.querySelectorAll("li.pn-release")].map(r => ({
    id: r.id,
    month: r.querySelector(".pn-month").textContent,
    number: r.querySelector(".pn-number").textContent,
    unmerged: !!r.querySelector('.pn-version [data-badge="unmerged"]'),
    name: r.querySelector(".pn-release-name").textContent,
    line: r.querySelector(".pn-release-line").textContent,
    mergeHref: r.querySelector(".pn-release-line a")?.getAttribute("href") ?? null,
    summary: r.querySelector(".pn-summary").textContent,
    groups: [...r.querySelectorAll(".pn-group")].map(g => ({
      title: g.querySelector(".pn-group-title").textContent,
      entries: [...g.querySelectorAll(".pn-entry")].map(e => ({
        title: e.querySelector(".pn-entry-title").firstChild.textContent,
        badge: e.querySelector(".pn-badge").textContent,
        explore: e.querySelector(".pn-explore")?.getAttribute("href") ?? null,
        text: e.querySelector(".pn-entry-text").textContent,
        bullets: [...e.querySelectorAll(".pn-bullets li")].map(li => li.textContent),
        date: e.querySelector("time").textContent,
        dateTime: e.querySelector("time").getAttribute("datetime"),
        commit: e.querySelector('a[aria-label^="Commit"]').getAttribute("href"),
        log: [...e.querySelectorAll(".pn-entry-meta a")].find(a => a.textContent === "Progress log")?.getAttribute("href") ?? null,
      })),
    })),
  })));
  eq("release count", drawn.length, notes.releases.length);
  notes.releases.forEach((release, i) => {
    const d = drawn[i] ?? {}; const at = release.id;
    eq(`${at} id`, d.id, release.id);
    eq(`${at} month`, d.month, month(release.range));
    eq(`${at} number`, d.number, release.number);
    eq(`${at} unmerged pill`, d.unmerged, release.merge === null && release.version !== "main");
    eq(`${at} name`, d.name, release.title);
    eq(`${at} line`, d.line, line(release));
    eq(`${at} merge link`, d.mergeHref, release.merge ? `${REPO}/commit/${release.merge.commit}` : null);
    eq(`${at} summary`, d.summary, release.summary);
    eq(`${at} groups`, d.groups?.length, release.groups.length);
    release.groups.forEach((group, j) => {
      const g = d.groups?.[j] ?? { entries: [] };
      eq(`${at}/${group.title} title`, g.title, group.title);
      eq(`${at}/${group.title} entries`, g.entries.length, group.entries.length);
      group.entries.forEach((entry, k) => {
        const e = g.entries[k] ?? {}; const w = `${at}/${entry.title}`;
        eq(`${w} title`, e.title?.trim(), entry.title);
        eq(`${w} badge`, e.badge, entry.badge);
        eq(`${w} explore`, e.explore, entry.href ?? null);
        eq(`${w} text`, e.text, display(entry.text));
        eq(`${w} bullets`, JSON.stringify(e.bullets), JSON.stringify((entry.bullets ?? []).map(display)));
        eq(`${w} date`, e.date, short(entry.date));
        eq(`${w} datetime`, e.dateTime, entry.date);
        eq(`${w} commit`, e.commit, `${REPO}/commit/${entry.commit}`);
        eq(`${w} log`, e.log, entry.log ? `${REPO}/blob/main/${entry.log.file}` : null);
      });
    });
  });
  eq("about credits Databallr", (await page.locator("#about").textContent()).includes("Databallr's changelog, the design reference"), true);

  // Release column: sticky beside the entries on a desktop; above them on a phone.
  const head = page.locator("li#pr-42 .pn-release-head");
  if (width > 600) {
    eq("release column width", Math.round((await head.boundingBox()).width), 160);
    await page.locator("li#pr-42 .pn-entry").nth(8).scrollIntoViewIfNeeded();
    const box = await head.boundingBox();
    eq("release column pinned in view", box.y > 0 && box.y < 200, true);
    if (shots) await page.screenshot({ path: `${shots}/patch-notes-sticky-${tag}.png` });
  } else {
    const [h, first] = [await head.boundingBox(), await page.locator("li#pr-42 .pn-entry").first().boundingBox()];
    eq("release head above its entries", h.y + h.height < first.y, true);
    await page.locator("li#pr-42").scrollIntoViewIfNeeded();
    if (shots) await page.screenshot({ path: `${shots}/patch-notes-release-${tag}.png` });
  }
  await page.evaluate(() => document.querySelector("#about details").open = true);
  if (shots) { await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(200); await page.screenshot({ path: `${shots}/patch-notes-about-${tag}.png` }); }

  // Images, overflow, phone controls.
  const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  let small = [], smallLinks = [];
  if (width < 600) {
    small = await page.evaluate(() => [...document.querySelectorAll("button, select, input, summary")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && Math.round(r.height) < 40 && !e.closest("[hidden]"); }).map(e => `${e.tagName} ${e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}`));
    smallLinks = await page.evaluate(() => [...document.querySelectorAll('a[data-kit="button"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && Math.round(r.height) < 40; }).map(e => `${e.textContent?.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}`));
    eq("Explore links measured", await page.locator(".pn-explore").count(), entries.filter(e => e.href).length);
  }

  report.push({ width, compared, mismatches, consoleErrors: errors, overflow, brokenImages: broken, phoneControlsUnder40: small, phoneButtonLinksUnder40: smallLinks });
  await page.close();
}
await browser.close();
const total = report.reduce((n, r) => n + r.compared, 0), bad = report.reduce((n, r) => n + r.mismatches.length, 0);
writeFileSync(out, JSON.stringify({ checkedOn: new Date().toISOString(), source: "dashboard/content/patch-notes.json (committed); API via readonly-proxy.mjs (GET only) → :8000", releases: notes.releases.length, entries: entries.length, total, mismatches: bad, scenes: report }, null, 2));
console.log(`compared ${total}, mismatches ${bad}`);
for (const r of report) console.log(r.width, "errors", r.consoleErrors.length, "overflow", r.overflow, "broken", r.brokenImages.length, "small", r.phoneControlsUnder40.length, "smallLinks", r.phoneButtonLinksUnder40.length, JSON.stringify(r.mismatches.slice(0, 5)));
