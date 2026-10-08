import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadAssetVisual } from './fixtures/asset-visual-renderer.mjs';

test('one renderer uses a resolved local file and contextual alt for either source', async () => {
  const current = await loadAssetVisual();
  const markup = renderToStaticMarkup(createElement(current,{visualId:'teacher',alt:'School scene'}));
  assert(markup.includes('src="/assets/openmoji/selected/1F9D1-200D-1F3EB.svg"'));
  assert(markup.includes('alt="School scene"'));
  assert(markup.includes('data-asset-source="openmoji"'));
  // Future readiness tested only in memory/SSR; no custom SVG is authored or served.
  const future = await loadAssetVisual(true);
  const customMarkup = renderToStaticMarkup(createElement(future,{visualId:'classroom',alt:'School scene'}));
  assert(customMarkup.includes('src="/assets/education/school/classroom.svg"'));
  assert(customMarkup.includes('data-asset-source="custom-education"'));
});
test('shared renderer does not request missing assets, supplied paths or images without alt', async () => {
  const component = await loadAssetVisual();
  for (const id of ['classroom','library','garden','headmaster','pupil','student','unknown','https://example.com/a.svg']) {
    assert.equal(renderToStaticMarkup(createElement(component,{visualId:id,alt:'School scene'})), '');
  }
  assert.equal(renderToStaticMarkup(createElement(component,{visualId:'teacher',alt:' '})), '');
});
