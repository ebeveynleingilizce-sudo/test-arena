import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';

// Isolated local fixture uses the same startup/admin sync engine.
test('real student quiz renders package image at phone and desktop sizes',async()=>{
 assert(!existsSync('.firebase/package-image-local.json'),'Disposable fixture already active');
 const env={...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',GCLOUD_PROJECT:'demo-test-arena'};
 const run=(...args)=>execFileSync(process.execPath,args,{env,timeout:60000});
 try{run('tests/fixtures/package-image-local.mjs','setup');run('scripts/import-question-folder.mjs');run('tests/fixtures/package-image-local.mjs','session');}catch(e){if(existsSync('.firebase/package-image-local.json'))run('tests/fixtures/package-image-local.mjs','cleanup');throw e;}
 const fixture=JSON.parse(readFileSync('.firebase/package-image-local.json','utf8'));
 const browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto('http://127.0.0.1:5173/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(fixture.code);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogrenci');
  await page.goto('http://127.0.0.1:5173/ogrenci/coz/'+fixture.testId);
  const image=page.locator('.question-visual .package-question-image');await image.waitFor({state:'visible'});
  mkdirSync('.firebase/image-visual-proof',{recursive:true});
  for(const [width,height] of [[360,800],[1366,900]]){
   await page.setViewportSize({width,height});await image.scrollIntoViewIfNeeded();
   const dimensions=await image.evaluate(img=>({loaded:img.complete&&img.naturalWidth>0,w:img.getBoundingClientRect().width,h:img.getBoundingClientRect().height,parent:img.parentElement.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert(dimensions.loaded);assert(dimensions.w<=dimensions.parent+1);assert(dimensions.h<=421);assert(!dimensions.overflow);
   await page.screenshot({path:'.firebase/image-visual-proof/'+width+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();run('tests/fixtures/package-image-local.mjs','cleanup');run('scripts/import-question-folder.mjs');}
});
