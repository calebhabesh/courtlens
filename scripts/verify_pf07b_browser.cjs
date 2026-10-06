const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3178/settings', { waitUntil: 'networkidle' });
  const answer = await page.evaluate(async () => {
    async function api(path, method = 'GET', body) {
      const response = await fetch(`/api/assistant-v2/${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      const value = await response.json();
      if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(value)}`);
      return value;
    }
    const thread = await api('threads', 'POST');
    const request = { request_id: crypto.randomUUID(), thread_id: thread.thread_id, message: 'Explain pick and roll' };
    const answer = await api('turn', 'POST', request);
    return { request, answer };
  });
  await page.reload({ waitUntil: 'networkidle' });
  const history = await page.evaluate(async tid => {
    const response = await fetch(`/api/assistant-v2/threads/${tid}/turns`);
    return response.json();
  }, answer.answer.thread_id);
  if (JSON.stringify(history.turns[0].response) !== JSON.stringify(answer.answer)) throw new Error('Reload changed the answer');
  const blocked = await page.evaluate(async () => {
    const response = await fetch('/api/assistant-v2/investigations', { method: 'POST' });
    return response.status;
  });
  if (blocked !== 404) throw new Error('Unregistered credential target accepted');
  const result = { checks: ['production browser same-origin New chat', 'durable browser turn', 'reload reopens exact turn', 'unregistered proxy target rejected'], page_errors: errors, ...answer };
  if (errors.length) throw new Error(errors.join('\n'));
  fs.writeFileSync('docs/evidence/pf07b-history/browser.json', JSON.stringify(result, null, 2) + '\n');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
