import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visualAssetRegistry, resolveVisualAsset, isReadyVisualAsset } from '../src/assets/visual-assets.mjs';
import { openmojiRegistry, resolveOpenMojiAsset } from '../src/assets/openmoji.mjs';

test('existing OpenMoji IDs and selected files are unchanged', () => {
  for (const id of ['school', 'teacher', 'book', 'pencil', 'schoolbag', 'chair']) {
    assert.equal(resolveVisualAsset(id), resolveOpenMojiAsset(id));
    assert.equal(resolveVisualAsset(id).source, 'openmoji');
  }
  assert(Object.values(openmojiRegistry).filter(e => e.status === 'ready').length >= 6);
});
test('five custom illustrations are planned without activating nonexistent assets', () => {
  const ids = ['classroom', 'library', 'garden', 'headmaster', 'principal', 'pupil', 'student'];
  const planned = new Set();
  for (const id of ids) {
    const entry = visualAssetRegistry[id];
    assert.equal(entry.source, 'custom-education');
    assert.equal(entry.status, 'missing');
    assert.equal(entry.file, null);
    assert.equal(resolveVisualAsset(id), null);
    assert.equal(resolveOpenMojiAsset(id), null);
    planned.add(entry.plannedFile);
  }
  assert.equal(planned.size, 5);
});
test('both sources support controlled ready paths; missing, unknown and arbitrary paths fail closed', () => {
  assert.equal(isReadyVisualAsset({source:'custom-education',status:'ready',file:'/assets/education/school/classroom.svg'}), true);
  assert.equal(isReadyVisualAsset(visualAssetRegistry.teacher), true);
  for (const file of ['https://example.com/a.svg', 'data:image/svg+xml,x', '/assets/education/school/../x.svg', '/assets/education/school/a.svg?x', '/assets/education/school/a.png']) {
    assert.equal(isReadyVisualAsset({source:'custom-education',status:'ready',file}), false);
  }
  assert.equal(isReadyVisualAsset({source:'other',status:'ready',file:'/assets/education/school/a.svg'}), false);
  assert.equal(isReadyVisualAsset({source:'custom-education',status:'missing',file:'/assets/education/school/a.svg'}), false);
  for (const id of ['__proto__', 'constructor', 'https://example.com/a.svg', '../teacher', 'unknown', null]) assert.equal(resolveVisualAsset(id), null);
});
