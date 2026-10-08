import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildAssetCatalog, approveCatalogAsset } from '../scripts/asset-catalog.mjs';

const metadata = JSON.parse(readFileSync('vendor/openmoji/data/openmoji.json','utf8'));
const concepts = JSON.parse(readFileSync('data/asset-catalog/example-concepts.json','utf8'));
const registry = JSON.parse(readFileSync('src/assets/openmoji-registry.json','utf8'));
const catalog = buildAssetCatalog(metadata,concepts,registry);
test('20 concepts produce 13 direct proposals, 7 review, 0 missing without production changes', () => {
  const before = structuredClone(registry);
  assert.deepEqual(catalog.summary,{total:20,ready:13,review:7,missing:0});
  assert.equal(catalog.entries.filter(e=>e.approved).length,concepts.filter(spec=>registry[typeof spec==='string'?spec:spec.visualId]?.status==='ready').length);
  assert.deepEqual(registry,before);
  assert.equal(readdirSync('public/assets/openmoji/selected').length,new Set(Object.values(registry).filter(e=>e.source==='openmoji'&&e.status==='ready').map(e=>e.hexcode)).size);
});
test('fruit, whole animals and transport matches use metadata evidence, not substrings or brand logos', () => {
  for (const [id,annotation] of Object.entries({apple:'red apple',cat:'cat',dog:'dog',bus:'bus',car:'automobile',milk:'glass of milk'})) {
    const entry = catalog.entries.find(e=>e.visualId===id);
    assert.equal(entry.status,'ready');
    assert.equal(entry.candidates[0].annotation,annotation);
    assert.equal(entry.approved,registry[id]?.status==='ready');
  }
  assert(!catalog.entries.find(e=>e.visualId==='apple').candidates.some(e=>e.hexcode==='F8FF'));
  assert(!catalog.entries.find(e=>e.visualId==='cat').candidates.some(e=>e.annotation==='medication'));
});
test('kinship cannot become ready from person images, even with direct-match hints', () => {
  for (const id of ['mother','father','sister','brother','grandmother','grandfather']) {
    const e=catalog.entries.find(e=>e.visualId===id);
    assert.equal(e.status,'review');assert.equal(e.requiresContext,true);
  }
  const injected=buildAssetCatalog(metadata,[{visualId:'sister',preferredAnnotation:'girl',directMatch:true}]);
  assert.equal(injected.entries[0].status,'review');
  assert.equal(catalog.entries.find(e=>e.visualId==='water').status,'review');
});
test('missing and custom fallback remain fail-closed; arbitrary new concepts can be searched', () => {
  const result=buildAssetCatalog(metadata,['nonexistent-concept','classroom','library','school-garden','banana'],registry);
  assert.equal(result.entries[0].status,'missing');
  for (const id of ['classroom','library']) {
    const e=result.entries.find(e=>e.visualId===id);
    assert.equal(e.source,'custom-education');assert.equal(e.status,'missing');
  }
  assert.equal(result.entries.find(e=>e.visualId==='banana').status,'ready');
});
test('approval is explicit, metadata-bound and preserves existing ready/custom entries', () => {
  const before=structuredClone(registry);
  const approved=approveCatalogAsset(registry,catalog,{visualId:'apple',hexcode:'1F34E',reviewedBy:'test-reviewer',note:'Test-only decision'});
  assert.equal(approved.apple.status,'ready');
  assert.equal(approved.apple.file,'/assets/openmoji/selected/1F34E.svg');
  assert.equal(approved.apple.approval.reviewedBy,'test-reviewer');
  assert.deepEqual(registry,before); // No registry file write or SVG copy in tests.
  for (const options of [
    {visualId:'apple',hexcode:'1F34E'},
    {visualId:'apple',hexcode:'F8FF',reviewedBy:'x',note:'x'},
    {visualId:'apple',hexcode:'../../x',reviewedBy:'x',note:'x'}
  ]) assert.throws(()=>approveCatalogAsset(registry,catalog,options));
  const fallback=buildAssetCatalog(metadata,['library'],registry);
  assert.throws(()=>approveCatalogAsset(registry,fallback,{visualId:'library',hexcode:'1F4D6',reviewedBy:'x',note:'x'}));
});
test('shared semantic ID and file paths are subject-independent; duplicate semantic IDs are rejected', () => {
  assert.throws(()=>buildAssetCatalog(metadata,['apple','apple']));
  assert.throws(()=>buildAssetCatalog(metadata,['__proto__']));
  const approved=approveCatalogAsset(registry,catalog,{visualId:'apple',hexcode:'1F34E',reviewedBy:'x',note:'Test only'});
  assert(!('subject' in approved.apple));
  assert(!('grade' in approved.apple));
  assert.equal(approveCatalogAsset(approved,catalog,{visualId:'apple',hexcode:'1F34E',reviewedBy:'x',note:'Test only'}),approved);
});
test('CLI rejects unsafe output paths and incomplete approval without modifying registry', () => {
  const before=readFileSync('src/assets/openmoji-registry.json');
  for (const args of [['--out','src/assets/openmoji-registry.json'],['--approve','apple'],['--bad-option','x']]) {
    const result=spawnSync(process.execPath,['scripts/asset-catalog-cli.mjs',...args],{encoding:'utf8'});
    assert.notEqual(result.status,0);
  }
  assert.deepEqual(readFileSync('src/assets/openmoji-registry.json'),before);
});
