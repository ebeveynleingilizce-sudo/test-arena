import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

// Local only. Removing modern viewport declarations emulates their rejection
// by Chromium before 108 without changing application/session behavior.
const baseline = process.argv.includes('--baseline');
const browser = await chromium.launch();
const results = [];
const output = 'artifacts/landing-viewport';
mkdirSync(output, { recursive: true });
try {
  for (const legacy of [false, true]) {
    for (const [width, height, scale] of [[360,800,1],[390,844,3],[768,1024,2],[1024,768,1],[1366,768,1],[1920,1080,1],[3840,2160,1],[2560,1440,1.5],[1280,720,1.5],[1920,1800,1],[1920,600,1]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      if (legacy) await page.route('**/src/ui/*.css', async route => {
        const response = await route.fetch();
        const source = await response.text();
        await route.fulfill({ response, body: source.replace(/(?:min-|max-)?height\s*:[^;{}]*\b\d+(?:s|d|l)vh[^;{}]*(?:;|(?=\}))/g, '') });
      });
      await page.goto('http://127.0.0.1:5173/');
      await page.locator('.landing').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const measure = () => page.evaluate(() => {
        const main = document.querySelector('.landing');
        const rect = main.getBoundingClientRect();
        return { viewport: innerHeight, elementHeight: rect.height, bottom: rect.bottom, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, background: getComputedStyle(main).backgroundColor, minHeight: getComputedStyle(main).minHeight };
      });
      const metrics = await measure();
      results.push({ legacy, width, height, scale, ...metrics });
      assert(metrics.scrollWidth <= width, `Horizontal overflow: ${JSON.stringify(metrics)}`);
      if (!baseline) assert(metrics.bottom >= height - 1, `Uncovered viewport: ${JSON.stringify(metrics)}`);
      if (width === 360 || width === 1920 && height === 1080 || width === 3840) await page.screenshot({ path: `${output}/${baseline?'before':'after'}-${legacy?'legacy':'modern'}-${width}.png`, fullPage: true });
      // Resize the same document, including a tall browser window.
      await page.setViewportSize({ width, height: height + 300 });
      if (!baseline) assert((await measure()).bottom >= height + 299);
      await page.getByRole('link', { name: /Öğrenci Girişi/ }).click();
      await page.getByLabel('Öğrenci kısa kodu').waitFor();
      await page.goto('http://127.0.0.1:5173/');
      await page.getByRole('link', { name: /Öğretmen Girişi/ }).click();
      await page.getByLabel('E-posta', { exact: true }).waitFor();
      // Check the initial loading surface with the same production stylesheet.
      await page.evaluate(() => {
        document.getElementById('root').innerHTML = '<main class="loading" role="status">Test Arena hazırlanıyor…</main>';
      });
      if (!baseline) assert(await page.locator('.loading').evaluate(main => main.getBoundingClientRect().height >= innerHeight - 1));
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  writeFileSync(`${output}/${baseline?'before':'after'}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ cases: results.length, uncovered: results.filter(r => r.bottom < r.viewport - 1), errors: 0 }, null, 2));
} finally { await browser.close(); }
