// Actual Chromium against a disposable local server. No NBA traffic or owner services.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { once } = require('node:events');
const { chromium } = require('../dashboard/node_modules/playwright');
const { capture, validateJob } = require('./fetch_nba_browser.cjs');

async function main(output) {
  const original = Buffer.from('{ "value": 7, "text": "✓" }\n');
  const server = http.createServer((request, response) => {
    const route = request.url;
    if (route === '/') { response.end('<!doctype html><title>IM08 isolated fixture</title>'); return; }
    response.setHeader('Content-Type', 'application/json');
    if (route === '/exact') response.end(original);
    else if (route === '/denied') { response.statusCode = 403; response.end('denied'); }
    else if (route === '/declared') { response.setHeader('Content-Length', 4096); response.end('x'); }
    else if (route === '/chunked') { response.write('x'.repeat(300)); response.end('x'.repeat(300)); }
    else if (route === '/slow') {
      const timer = setTimeout(() => response.end('{}'), 2000);
      response.on('close', () => clearTimeout(timer));
    } else if (route === '/redirect') { response.writeHead(302, { Location: '/exact' }); response.end(); }
    else if (route === '/empty') response.end();
    else { response.statusCode = 404; response.end('unknown'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const results = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base);
    let result = await capture(page, base + '/exact', 512, 1000);
    assert.equal(result.http_status, 200);
    assert.deepEqual(Buffer.from(result.body_base64, 'base64'), original);
    results.push({ check: 'exact decoded bytes including whitespace and Unicode', passed: true });
    result = await capture(page, base + '/denied', 512, 1000);
    assert.equal(result.http_status, 403);
    assert.equal(Buffer.from(result.body_base64, 'base64').toString(), 'denied');
    results.push({ check: 'HTTP denial retains actual status and body', passed: true });
    for (const route of ['/declared', '/chunked']) {
      result = await capture(page, base + route, 512, 1000);
      assert.equal(result.error, 'body_too_large');
      assert.equal(result.body_base64, undefined);
      results.push({ check: route + ' size limit aborts without partial asset', passed: true });
    }
    const started = Date.now();
    result = await capture(page, base + '/slow', 512, 100);
    assert.equal(result.error, 'timeout');
    assert(Date.now() - started < 1000);
    results.push({ check: 'deadline aborts incomplete stream', passed: true });
    result = await capture(page, base + '/redirect', 512, 1000);
    assert.equal(result.error, 'browser_network_error');
    assert.equal(result.body_base64, undefined);
    results.push({ check: 'redirect rejected without following', passed: true });
    // Different hostname is a different origin. No Access-Control-Allow-Origin is supplied.
    result = await capture(page, `http://localhost:${port}/exact`, 512, 1000);
    assert.equal(result.error, 'browser_network_error');
    results.push({ check: 'ordinary Chromium CORS remains enforced', passed: true });
    result = await capture(page, base + '/empty', 512, 1000);
    assert.equal(result.error, 'empty_body');
    results.push({ check: 'empty body not retained', passed: true });
    const job = { targets: [{ key: 'terms', url: 'https://www.nba.com/termsofuse' }],
      max_bytes: 8 * 1024 * 1024, interval_ms: 10000, timeout_ms: 30000 };
    validateJob(job);
    for (const url of ['https://databallr.com/', 'https://nba.com.attacker.test/',
      'https://stats.nba.com/private', 'http://stats.nba.com/stats/synergyplaytypes',
      'https://user:pass@stats.nba.com/stats/synergyplaytypes']) {
      assert.throws(() => validateJob({ ...job, targets: [{ key: 'test', url }] }));
    }
    results.push({ check: 'fixed NBA origin/path/scheme credential restrictions', passed: true });
    assert.throws(() => validateJob({ ...job, interval_ms: 9999 }));
    assert.throws(() => validateJob({ ...job, timeout_ms: 30001 }));
    assert.throws(() => validateJob({ ...job, max_bytes: 8 * 1024 * 1024 + 1 }));
    assert.throws(() => validateJob({ ...job, targets: Array(19).fill(job.targets[0]) }));
    assert.throws(() => validateJob({ ...job, targets: [job.targets[0], job.targets[0]] }));
    results.push({ check: 'request rate/time/size/count and duplicate limits', passed: true });
    await context.close();
    const report = { version: 'courtlens-im08-browser-controls-v1',
      chromium_version: browser.version(), boundary: 'actual local Chromium; no NBA traffic',
      passed: results.length, checks: results };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(`${results.length} real Chromium controls passed`);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
