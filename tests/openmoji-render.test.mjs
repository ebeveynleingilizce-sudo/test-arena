import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { openmojiRegistry, resolveOpenMojiAsset } from '../src/assets/openmoji.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadAssetVisual } from './fixtures/asset-visual-renderer.mjs';

// Isolated library preview, no app login, network, API or Firestore access.
test('selected assets render at phone and desktop sizes', async () => {
  const ready = Object.keys(openmojiRegistry).filter(id => resolveOpenMojiAsset(id));
  const sources = new Map(ready.map(id => {
    const entry = resolveOpenMojiAsset(id);
    return [entry.file, readFileSync(`public${entry.file}`)];
  }));
  const reviewPath = '/review-student.svg';
  sources.set(reviewPath, readFileSync('vendor/openmoji/color/1F9D1-200D-1F393.svg'));
  const AssetVisual = await loadAssetVisual();
  const cards = ready.map(id => {
    const asset = resolveOpenMojiAsset(id);
    return `<figure>${renderToStaticMarkup(createElement(AssetVisual,{visualId:id,alt:asset.concept}))}<figcaption>${id}</figcaption></figure>`;
  }).join('') + `<figure><img src="${reviewPath}" alt="Student review"><figcaption>student — REVIEW only</figcaption></figure>`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;padding:16px;background:#fff8ed;color:#16243b;font:14px sans-serif}
    main{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:12px;max-width:960px;margin:auto}
    figure{margin:0;padding:12px;text-align:center;border:1px solid #e1d5c4;border-radius:12px;background:white}
    img{display:block;max-width:100%;object-fit:contain;margin:auto}figcaption{margin-top:8px;overflow-wrap:anywhere}
    </style><main>${cards}</main>`;
  mkdirSync('.firebase/openmoji-review', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{width:360,height:800},{width:1366,height:900}]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route('**/*', route => {
        const path = new URL(route.request().url()).pathname;
        if (sources.has(path)) return route.fulfill({ contentType:'image/svg+xml', body:sources.get(path) });
        if (path === '/') return route.fulfill({ contentType:'text/html', body:html });
        return route.abort();
      });
      await page.goto('http://openmoji-preview.test/');
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await page.locator('img').count(), ready.length + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await page.screenshot({path:`.firebase/openmoji-review/${viewport.width}.png`,fullPage:true});
      await page.close();
    }
  } finally { await browser.close(); }
});
