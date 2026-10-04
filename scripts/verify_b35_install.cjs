/* Real headed Chromium installation in an isolated Linux desktop/profile.
 * Usage: node scripts/verify_b35_install.cjs NEW_EVIDENCE_DIRECTORY
 * Requires live standalone Next server, FastAPI, Chromium and Xvfb.
 * CDP PWA.install performs installation; no synthetic events/media overrides.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('../dashboard/node_modules/playwright');
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error('New evidence directory required');
fs.mkdirSync(output, { recursive: true });
const site = process.env.B35_SITE_URL || 'http://127.0.0.1:3135';
const manifestId = new URL('/', site).href;
const executablePath = process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium';
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'courtload-b35-install-'));
const profile = path.join(sandbox, 'profile');
const env = { ...process.env, XDG_DATA_HOME: path.join(sandbox, 'data'), XDG_CONFIG_HOME: path.join(sandbox, 'config'), XDG_CACHE_HOME: path.join(sandbox, 'cache') };
for (const dir of [env.XDG_DATA_HOME, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME]) fs.mkdirSync(dir);
const report = { block: 'B35c', recorded_at: new Date().toISOString(), site, manifest_id: manifestId, isolated_desktop: true, synthetic_events: false, media_emulation: false, steps: [], limits: ['Linux Chromium only; CDP installs without exercising a human install dialog', 'No offline database operation promised', 'B32 live observations and B36 typography remain independent'] };
let context;
let xvfb;
function record(name, value) { report.steps.push({ name, value }); }
function desktopFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? desktopFiles(path.join(dir, item.name)) : item.name.endsWith('.desktop') ? [path.join(dir, item.name)] : []);
}
async function start(args = []) {
  return chromium.launchPersistentContext(profile, { executablePath, headless: false, env, viewport: null, args });
}
async function state(page) {
  return page.evaluate(async () => ({ secure_origin: isSecureContext, standalone: matchMedia('(display-mode: standalone)').matches, browser: matchMedia('(display-mode: browser)').matches, workers: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys(), url: location.href }));
}
(async () => {
  try {
    // Let Xvfb select an unused display without touching the owner's display.
    xvfb = spawn('Xvfb', ['-displayfd', '1', '-screen', '0', '1440x1000x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const display = await new Promise((resolve, reject) => { xvfb.once('error', reject); xvfb.once('exit', code => reject(new Error(`Xvfb exited ${code}`))); xvfb.stdout.once('data', data => resolve(data.toString().trim())); });
    env.DISPLAY = ':' + display;
    context = await start();
    const browser = context.browser();
    const cdp = await browser.newBrowserCDPSession();
    record('browser_version', await cdp.send('Browser.getVersion'));
    const page = context.pages()[0];
    await page.goto(site + '/stats');
    await page.locator('main h1').waitFor();
    const before = await state(page);
    assert.equal(before.secure_origin, true);
    assert.equal(before.standalone, false);
    record('before_install', before);
    const pageCdp = await context.newCDPSession(page);
    record('manifest', await pageCdp.send('Page.getAppManifest'));
    const eligibility = await pageCdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(eligibility.installabilityErrors, []);
    record('installability', eligibility);
    await cdp.send('PWA.install', { manifestId, installUrlOrBundleUrl: site + '/stats' });
    record('installed_os_state', await cdp.send('PWA.getOsAppState', { manifestId }));
    await cdp.send('PWA.changeAppUserSettings', { manifestId, displayMode: 'standalone' });
    const newPage = context.waitForEvent('page');
    record('launch', await cdp.send('PWA.launch', { manifestId }));
    const app = await newPage;
    await app.waitForLoadState();
    await app.locator('main h1').waitFor();
    const installed = await state(app);
    assert.equal(installed.standalone, true);
    assert.equal(installed.workers, 0);
    assert.deepEqual(installed.caches, []);
    record('installed_launch', installed);
    await app.goto(site + '/settings');
    await app.getByRole('status').filter({ hasText: 'Running as a standalone app' }).waitFor();
    await app.screenshot({ path: path.join(output, 'installed-settings.png'), fullPage: true });
    const shortcuts = desktopFiles(env.XDG_DATA_HOME);
    assert.ok(shortcuts.length > 0, 'Actual Linux desktop launcher must exist');
    record('desktop_launchers', shortcuts.map(file => ({ filename: path.basename(file), content: fs.readFileSync(file, 'utf8') })));
    for (const file of shortcuts) fs.copyFileSync(file, path.join(output, path.basename(file)));
    const appId = fs.readFileSync(shortcuts[0], 'utf8').match(/--app-id=([a-p]{32})/)[1];
    await context.close(); context = null;
    // Restart Chromium with the installed app ID, proving persistence beyond CDP launch.
    context = await start(['--app-id=' + appId]);
    const relaunched = context.pages()[0] || await context.waitForEvent('page');
    await relaunched.waitForURL(site + '/stats');
    await relaunched.locator('main h1').waitFor();
    const restartState = await state(relaunched);
    assert.equal(restartState.standalone, true);
    record('restart_app_id_launch', { app_id: appId, ...restartState });
    await relaunched.screenshot({ path: path.join(output, 'restarted-stats.png'), fullPage: true });
    const restartCdp = await context.browser().newBrowserCDPSession();
    await restartCdp.send('PWA.uninstall', { manifestId });
    assert.deepEqual(desktopFiles(env.XDG_DATA_HOME), []);
    record('uninstalled', { remaining_desktop_launchers: 0 });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = error.stack; throw error;
  } finally {
    if (context) await context.close();
    if (xvfb) xvfb.kill();
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
  process.stdout.write(JSON.stringify({ status: report.status, steps: report.steps.map(step => step.name) }) + '\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
