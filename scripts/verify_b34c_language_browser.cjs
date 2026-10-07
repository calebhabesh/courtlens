// Opt-in real language/browser acceptance. Requires the owner-configured local API.
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
(async () => {
  const output = path.resolve(process.argv[2]);
  assert.ok(!fs.existsSync(output), 'Refusing to overwrite retained evidence');
  fs.mkdirSync(output, { recursive: true });
  const corpus = JSON.parse(fs.readFileSync('docs/evidence/b34c-language-final-context.json'));
  const pinned = Object.fromEntries(['release_id', 'season', 'phase', 'before_date', 'window'].map(k => [k, corpus.context[k]]));
  const url = new URL('http://127.0.0.1:3137/research/ask');
  for (const [k, v] of Object.entries(pinned)) url.searchParams.set(k, v);
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  const errors = [], workflows = [];
  const questions = [
    'Whose minutes increased recently without scoring increasing?',
    'Which players have produced similarly to Scottie Barnes over their last ten appearances?',
    'How variable has Scottie Barnes’s scoring been, and did his minutes vary too?',
  ];
  const expected = [['workload_shifts'], ['similarity'], ['distribution', 'distribution']];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const ui = page.getByRole('main');
    await page.goto(url.href);
    await ui.getByText('AI configured · gemini-3.5-flash-lite', { exact: true }).waitFor();
    for (let i = 0; i < questions.length; i++) {
      if (i) await ui.getByRole('button', { name: 'Clear conversation', exact: true }).click();
      await ui.getByLabel('Run manually without AI', { exact: true }).uncheck();
      await ui.getByLabel('Research question', { exact: true }).fill(questions[i]);
      const pending = page.waitForResponse(r => r.url().endsWith('/assistant/turn') && r.request().method() === 'POST', { timeout: 55000 });
      await ui.getByRole('button', { name: 'Ask CourtLens', exact: true }).click();
      const answer = await (await pending).json();
      assert.equal(answer.status, 'answered');
      assert.equal(answer.accounting.provider_calls, 1);
      assert.deepEqual(answer.results.map(r => r.operation).sort(), expected[i].sort());
      if (i === 2) assert.deepEqual(answer.results.map(r => r.arguments.metric).sort(), ['min_per_game', 'pts']);
      const manualResponse = await context.request.post('http://127.0.0.1:8036/api/workbench/assistant/turn', { data: { request_id: randomUUID(), message: 'Manual equivalence', context: pinned, plan: answer.plan } });
      assert.ok(manualResponse.ok());
      const manual = await manualResponse.json();
      assert.equal(manual.accounting.provider_calls, 0);
      assert.deepEqual(manual.results.map(r => r.result_hash), answer.results.map(r => r.result_hash));
      await context.request.delete(`http://127.0.0.1:8036/api/workbench/assistant/conversations/${manual.conversation_id}`);
      await ui.getByRole('region', { name: new RegExp(`^${expected[i][0]} data table`) }).first().waitFor();
      await page.screenshot({ path: path.join(output, `demo-${i + 1}.png`), fullPage: true });
      workflows.push({ question: questions[i], status: answer.status, plan: answer.plan, context: answer.context, accounting: answer.accounting, result_hashes: answer.results.map(r => r.result_hash), manual_match: true });
    }
    await ui.getByRole('button', { name: 'Clear conversation', exact: true }).click();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ workflows, page_errors: errors, real_provider_calls: 3, immutable_save_actions: 0 }, null, 2) + '\n');
    console.log(JSON.stringify({ workflows: workflows.length, page_errors: errors, real_provider_calls: 3 }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
