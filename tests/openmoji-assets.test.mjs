import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { openmojiRegistry, resolveOpenMojiAsset } from '../src/assets/openmoji.mjs';

const metadata = JSON.parse(readFileSync('vendor/openmoji/data/openmoji.json', 'utf8'));
const selected = Object.values(openmojiRegistry).filter(entry => entry.status === 'ready');
test('only registry-selected metadata-confirmed original color SVGs are distributed', () => {
  assert.deepEqual(readdirSync('public/assets/openmoji/selected').sort(), [...new Set(selected.map(e => e.hexcode + '.svg'))].sort());
  for (const entry of selected) {
    assert(metadata.some(row => row.hexcode === entry.hexcode && row.annotation === entry.annotation));
    assert.equal(entry.file, `/assets/openmoji/selected/${entry.hexcode}.svg`);
    const original = readFileSync(`vendor/openmoji/color/${entry.hexcode}.svg`);
    const copy = readFileSync(`public${entry.file}`);
    assert.deepEqual(copy, original);
    assert(!/<(?:script|foreignObject)\b|\bon\w+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(copy.toString()));
  }
});
test('semantic resolver is closed and missing concepts do not get guessed fallbacks', () => {
  assert.equal(resolveOpenMojiAsset('school').concept, 'school');
  for (const id of ['student', 'pupil', 'headmaster', 'principal', 'classroom', 'library', 'garden', 'desk', '__proto__', 'constructor', '../../school', '/assets/openmoji/selected/1F3EB.svg', 'https://example.com/a.svg', null]) {
    assert.equal(resolveOpenMojiAsset(id), null);
  }
  assert(Object.isFrozen(openmojiRegistry));
  assert(Object.isFrozen(openmojiRegistry.school));
});
test('distributed attribution and license are retained', () => {
  assert(readFileSync('public/assets/openmoji/ATTRIBUTION.txt', 'utf8').includes('All emojis designed by OpenMoji – the open-source emoji and icon project. License: CC BY-SA 4.0'));
  assert.deepEqual(readFileSync('public/assets/openmoji/LICENSE.txt'), readFileSync('vendor/openmoji/LICENSE.txt'));
});
