import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../dashboard/node_modules/@playwright/test');

const outputDir = 'docs/evidence/dl02';
fs.mkdirSync(outputDir, { recursive: true });

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 }
];

async function run() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1
    });

    const page = await context.newPage();

    // Disable running animations for stable snapshot
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

    console.log(`Navigating to ${baseUrl}/design at ${vp.name}px...`);
    await page.goto(`${baseUrl}/design`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const targetPath = path.join(outputDir, `design-${vp.name}.png`);
    await page.screenshot({ path: targetPath, fullPage: true });
    console.log(`Saved screenshot to ${targetPath}`);

    await context.close();
  }

  await browser.close();
  console.log('Capture completed.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
