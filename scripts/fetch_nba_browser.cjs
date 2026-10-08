// IM08 transport: ordinary Chromium fetch, bounded streams, serial fixed URLs, no retries.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../dashboard/node_modules/playwright');

const TERMS_URL = 'https://www.nba.com/termsofuse';
const MAX_BYTES = 8 * 1024 * 1024;

async function capture(page, url, maxBytes, timeoutMs) {
  // Fetch runs inside Chromium, preserving normal browser CORS/TLS behavior.
  return page.evaluate(async ({ url, maxBytes, timeoutMs }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status = null;
    let headers = {};
    try {
      const response = await fetch(url, {
        method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
        signal: controller.signal,
      });
      status = response.status;
      headers = Object.fromEntries(
        ['content-type', 'content-length', 'date', 'etag', 'last-modified', 'retry-after']
          .map(key => [key, response.headers.get(key)]).filter(([, value]) => value !== null),
      );
      if (Number(headers['content-length']) > maxBytes) {
        controller.abort();
        return { http_status: status, headers, error: 'body_too_large' };
      }
      if (!response.body) return { http_status: status, headers, error: 'empty_body' };
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxBytes) {
          controller.abort();
          return { http_status: status, headers, error: 'body_too_large' };
        }
        chunks.push(value);
      }
      if (!length) return { http_status: status, headers, error: 'empty_body' };
      const joined = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
      // Chunk conversion avoids apply/spread's argument-count limit.
      let binary = '';
      for (let i = 0; i < joined.length; i += 16384) {
        binary += String.fromCharCode(...joined.subarray(i, i + 16384));
      }
      return { http_status: status, headers, body_base64: btoa(binary), error: null };
    } catch (error) {
      return { http_status: status, headers,
        error: controller.signal.aborted ? 'timeout' : 'browser_network_error',
        error_detail: String(error.message).slice(0, 200) };
    } finally { clearTimeout(timer); }
  }, { url, maxBytes, timeoutMs });
}

function validateJob(job) {
  if (!Array.isArray(job.targets) || job.targets.length < 1 || job.targets.length > 18
      || job.max_bytes !== MAX_BYTES || job.interval_ms < 10000
      || job.interval_ms > 60000 || job.timeout_ms < 1000 || job.timeout_ms > 30000) {
    throw new Error('Invalid bounded browser job');
  }
  const keys = new Set();
  for (const target of job.targets) {
    if (!/^[A-Za-z_]+$/.test(target.key) || keys.has(target.key)) throw new Error('Invalid target key');
    keys.add(target.key);
    const url = new URL(target.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
      throw new Error('Invalid NBA URL');
    }
    const valid = target.url === TERMS_URL
      || (url.hostname === 'stats.nba.com' && [
        '/stats/leaguehustlestatsplayer', '/stats/leaguedashptdefend',
        '/stats/leaguedashptstats', '/stats/synergyplaytypes',
      ].includes(url.pathname))
      || (url.hostname === 'cdn.nba.com' && !url.search && (
        url.pathname === '/static/json/liveData/scoreboard/todaysScoreboard_00.json'
        || /^\/static\/json\/liveData\/playbyplay\/playbyplay_\d{10}\.json$/.test(url.pathname)
      ));
    if (!valid) throw new Error('URL outside direct NBA endpoint allowlist');
  }
}

async function run(job, output) {
  validateJob(job);
  const browser = await chromium.launch({ headless: !job.headed });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const allowed = new Set([TERMS_URL, ...job.targets.map(t => t.url)]);
  // Block redirects, analytics, images, scripts and every other unexpected request.
  await context.route('**/*', route => (
    allowed.has(route.request().url()) && route.request().method() === 'GET'
      && !route.request().redirectedFrom()
      ? route.continue() : route.abort('blockedbyclient')
  ));
  const network = [];
  page.on('requestfailed', request => {
    if (allowed.has(request.url())) network.push({
      url: request.url(), failure: request.failure()?.errorText ?? 'unknown',
      observed_at: new Date().toISOString(),
    });
  });
  page.on('response', response => {
    if (allowed.has(response.url())) network.push({
      url: response.url(), http_status: response.status(), observed_at: new Date().toISOString(),
    });
  });
  const report = {
    transport_version: 'courtlens-nba-chromium-v1', playwright_version: require('../dashboard/node_modules/playwright/package.json').version,
    chromium_version: browser.version(), interval_ms: job.interval_ms, timeout_ms: job.timeout_ms,
    max_bytes: job.max_bytes, retries: 0, concurrency: 1,
    user_agent: await page.evaluate(() => navigator.userAgent), responses: [],
  };
  let lastStarted = Date.now();
  try {
    try {
      const response = await page.goto(TERMS_URL, { waitUntil: 'commit', timeout: job.timeout_ms });
      report.bootstrap = { url: TERMS_URL, http_status: response?.status() ?? null,
        completed_at: new Date().toISOString() };
    } catch (error) {
      report.bootstrap = { url: TERMS_URL, error: String(error.message).slice(0, 240),
        completed_at: new Date().toISOString() };
    }
    for (const target of job.targets) {
      const remaining = job.interval_ms - (Date.now() - lastStarted);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      lastStarted = Date.now();
      const startedAt = new Date(lastStarted).toISOString();
      let result;
      try { result = await capture(page, target.url, job.max_bytes, job.timeout_ms); }
      catch (error) { result = { http_status: null, headers: {}, error: 'browser_context_error',
        error_detail: String(error.message).slice(0, 240) }; }
      if (result.body_base64) {
        const bytes = Buffer.from(result.body_base64, 'base64');
        if (bytes.length > job.max_bytes) throw new Error('Browser violated byte bound');
        result.body_file = `${target.key}.body`;
        fs.writeFileSync(path.join(output, result.body_file), bytes, { flag: 'wx' });
        delete result.body_base64;
      }
      report.responses.push({ key: target.key, url: target.url, started_at: startedAt,
        completed_at: new Date().toISOString(), ...result });
      console.log(`${target.key}: ${result.error ?? `HTTP ${result.http_status}`}`);
    }
    report.network_events = network;
    fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  } finally { await context.close(); await browser.close(); }
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
    if (input.length > 65536) throw new Error('Browser job exceeds input bound');
  });
  process.stdin.on('end', () => run(JSON.parse(input), process.argv[2]).catch(error => {
    console.error(error.message); process.exitCode = 1;
  }));
}
module.exports = { capture, validateJob };
