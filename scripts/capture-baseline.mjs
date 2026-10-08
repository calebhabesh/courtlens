import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../dashboard/node_modules/@playwright/test');

const outputDir = process.argv[2] || 'docs/evidence/dl01-before';
fs.mkdirSync(outputDir, { recursive: true });

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';

const slate = '2026-10-07';
const game = {
  source_id: '123',
  canonical_id: null,
  identity_status: 'unmapped',
  namespace: 'espn',
  slate_date: slate,
  event_time: `${slate}T23:00:00Z`,
  status: 'in_progress',
  period: 4,
  clock: '2:30',
  provisional: true,
  teams: [
    { source_id: '1', canonical_id: null, identity_status: 'unmapped', name: 'Boston Celtics', side: 'home', score: 108 },
    { source_id: '2', canonical_id: null, identity_status: 'unmapped', name: 'Toronto Raptors', side: 'away', score: 102 }
  ]
};

const cache = {
  namespace: 'espn',
  provisional: true,
  client_poll_seconds: 60,
  capability: 'observed',
  status: 'observed',
  paused: false,
  active_leases: 2,
  stale: false,
  age_seconds: 31,
  last_success_at: `${slate}T19:00:00Z`,
  last_poll_at: null,
  next_poll_at: null,
  error: null,
  observation_id: 'observed-fixture',
  acquired_at: `${slate}T19:00:00Z`,
  source_time: null,
  http_date: null,
  content_sha256: 'a'.repeat(64),
  data: {
    game,
    games: [game],
    players: [
      { source_id: '11', team_source_id: '1', name: 'Jayson Tatum', canonical_id: null, identity_status: 'unmapped', reported_nonappearance: false, statistics: { PTS: '28', MIN: '34' } },
      { source_id: '12', team_source_id: '1', name: 'Jaylen Brown', canonical_id: null, identity_status: 'unmapped', reported_nonappearance: false, statistics: { PTS: '24', MIN: '32' } },
      { source_id: '21', team_source_id: '2', name: 'Scottie Barnes', canonical_id: null, identity_status: 'unmapped', reported_nonappearance: false, statistics: { PTS: '22', MIN: '35' } }
    ],
    team_sections: null
  }
};

const pages = [
  { key: '01-home', path: '/' },
  { key: '02-stats', path: '/stats' },
  { key: '03-players', path: '/players' },
  { key: '04-player-detail', path: '/players/1629029?season=2025-26' },
  { key: '05-teams', path: '/teams' },
  { key: '06-team-detail', path: '/teams/1610612738?season=2025-26' },
  { key: '07-compare', path: '/compare' },
  { key: '08-live', path: '/live' },
  { key: '09-live-game', path: '/live/games/123' },
  { key: '10-playoffs', path: '/playoffs' },
  { key: '11-ask-empty', path: '/research/ask' },
  { key: '12-ask-answered', path: '/research/ask?thread=b41147e7-3840-47e9-a9af-68bd862473b1' },
  { key: '13-rapm', path: '/research/rapm' },
  { key: '14-wowy', path: '/wowy' },
  { key: '15-contracts', path: '/contracts' },
  { key: '16-settings', path: '/settings' },
  { key: '17-data-status', path: '/data-status' }
];

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 }
];

async function run() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const manifest = [];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });

    const page = await context.newPage();

    // Disable animations, transitions, carets
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
        }
      `;
      document.head.appendChild(style);
    });

    // Handle live mock
    await page.route('**/api/live**', route => {
      route.fulfill({ json: cache });
    });

    for (const item of pages) {
      const filename = `${item.key}-${vp.name}.png`;
      const targetPath = path.join(outputDir, filename);
      console.log(`Capturing ${filename} (${item.path})...`);

      try {
        if (item.key === '12-ask-answered') {
          await page.evaluate(() => {
            localStorage.setItem('courtlens-assistant-active-thread-v2', 'b41147e7-3840-47e9-a9af-68bd862473b1');
            localStorage.setItem('courtload-assistant-active-thread-v2', 'b41147e7-3840-47e9-a9af-68bd862473b1');
          });
        } else if (item.key === '11-ask-empty') {
          await page.evaluate(() => {
            localStorage.removeItem('courtlens-assistant-active-thread-v2');
            localStorage.removeItem('courtload-assistant-active-thread-v2');
          });
        }

        await page.goto(`${baseUrl}${item.path}`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);

        if (item.key === '12-ask-answered') {
          await page.waitForSelector('.ask-turn', { timeout: 10000 });
        }

        // Wait briefly for any client-side paint / React layout to settle
        await page.waitForTimeout(500);

        await page.screenshot({ path: targetPath, fullPage: true });
        manifest.push({ key: item.key, viewport: vp.name, path: item.path, file: filename });
        console.log(`Saved ${filename}`);
      } catch (err) {
        console.error(`Error capturing ${filename}:`, err.message);
        throw err;
      }
    }

    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Finished capturing ${manifest.length} screenshots to ${outputDir}`);
}

run().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
