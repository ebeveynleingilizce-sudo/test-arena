import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDocFromServer} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {sparkRules} from '../scripts/spark-rules.mjs';
import {preparedBankFixture} from './prepared-bank-fixture.mjs';
import {prepareSparkStore} from '../scripts/prepare-spark-store.mjs';
const projectId='demo-test-arena-classroom-test';
if(process.env.GCLOUD_PROJECT!==projectId)throw Error('Isolated emulator required');
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8380,rules:sparkRules}});
await env.clearFirestore();
const admin=initializeApp({projectId},'classroom-browser'),db=getFirestore(admin);
const email='classroom-ui@fixture.invalid',password='classroom-fixture-only';
try{await getAuth(admin).createUser({uid:'classroom-ui',email,password});}catch(e){if(e.code!=='auth/uid-already-exists')throw e;}
await db.doc('roles/classroom-ui').set({role:'teacher'});
const {prepared}=preparedBankFixture('matematik',2,10);
const group=prepared.records.filter(r=>r.question.unitId===prepared.records[0].question.unitId&&r.question.topic===prepared.records[0].question.topic).slice(0,10);
const batch=db.batch();batch.set(db.doc('curricula/2'),prepared.curricula[0]);for(const r of group){batch.set(db.doc('questions/'+r.question.questionId),r.question);batch.set(db.doc('privateQuestionAnswers/'+r.question.questionId),r.answer);}await batch.commit();await prepareSparkStore(db);
const catalog=(await db.doc('sparkCatalog/2').get()).data(),subject=catalog.subjects.find(s=>s.count>0),unit=subject.units.find(u=>u.count>0),pack=[...unit.packs,...unit.topics.flatMap(t=>t.packs)][0];
const keyPath=`privateQuizKeys/${pack.templateId}/answers/${group[0].question.questionId}`;
await assertSucceeds(getDocFromServer(doc(env.authenticatedContext('classroom-ui').firestore(),keyPath)));
await assertFails(getDocFromServer(doc(env.authenticatedContext('unknown-user').firestore(),keyPath)));
await assertFails(getDocFromServer(doc(env.unauthenticatedContext().firestore(),keyPath)));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','tests/classroom.vite.config.mjs'],{env:{...process.env,VITE_SPARK_TEST:'true',VITE_USE_EMULATORS:'true'},windowsHide:true,stdio:'pipe'});
let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5176')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();await mkdir('artifacts/classroom-arena',{recursive:true});
 for(const [name,viewport] of [['phone',{width:390,height:844}],['desktop',{width:1366,height:900}]]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  let testingOffline=false;page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(testingOffline&&m.text().includes('ERR_INTERNET_DISCONNECTED')))errors.push(m.text());});
  await page.goto('http://127.0.0.1:5176/ogretmen/sinif-arenasi');await page.waitForURL('**/ogretmen-giris');
  await page.getByLabel('E-posta',{exact:true}).fill(email);await page.getByLabel('Şifre',{exact:true}).fill(password);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogretmen');
  await page.getByRole('link',{name:'Sınıf Arenası',exact:true}).click();
  await page.getByLabel('Ders',{exact:true}).selectOption(subject.id);await page.getByLabel('Ünite / Tema').selectOption(unit.id);
  await page.getByRole('button',{name:'+ Öğrenci / takım ekle',exact:true}).click();await page.getByLabel('Oyuncu 1',{exact:true}).fill('Ali');await page.getByLabel('Oyuncu 2',{exact:true}).fill('Ece');
  await page.getByLabel('Toplam soru sayısı').fill('4');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`artifacts/classroom-arena/${name}-setup.png`,fullPage:true});
  await page.getByRole('button',{name:'Arenayı başlat →',exact:true}).click();await page.getByRole('heading',{name:'Sıra: Ali',exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`artifacts/classroom-arena/${name}-play.png`,fullPage:true});
  await page.locator('.classroom-choices button').first().click();await page.getByRole('button',{name:'Devam →',exact:true}).click();await page.getByRole('heading',{name:'Sıra: Ece',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Yarışmayı sürdür',exact:true}).click();await page.getByRole('heading',{name:'Sıra: Ece',exact:true}).waitFor();testingOffline=true;await context.setOffline(true);
  await page.locator('.classroom-roster summary').click();await page.getByRole('button',{name:'Çıkar',exact:true}).first().click();await page.getByRole('button',{name:'Geri al',exact:true}).click();
  for(let i=0;i<3;i++){await page.locator('.classroom-choices button').first().click();await page.getByRole('button',{name:'Devam →',exact:true}).click();}
  await page.locator('.classroom-results').waitFor();assert(await page.evaluate(()=>sessionStorage.getItem('test-arena:classroom:classroom-ui')===null));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`artifacts/classroom-arena/${name}-results.png`,fullPage:true});
  await context.setOffline(false);testingOffline=false;await page.getByRole('button',{name:'Yeni yarışma',exact:true}).click();await page.getByLabel('Ders',{exact:true}).selectOption(subject.id);await page.getByLabel('Ünite / Tema').selectOption(unit.id);await page.getByLabel('Süre (saniye, 0 = sınırsız)').fill('1');await page.getByLabel('Toplam soru sayısı').fill('2');await page.getByRole('button',{name:'Arenayı başlat →',exact:true}).click();await page.getByText('Yanlış / Süre doldu',{exact:false}).waitFor();
  assert.equal((await db.collection('teachers/classroom-ui/students').get()).size,0);
  assert.deepEqual(errors,[]);console.log(`${name}: auth guard, setup, answers, turn, recovery, remove/undo, results, timer, no overflow/errors passed`);await context.close();
 }
}finally{await browser?.close();server.kill();await env.cleanup();await deleteApp(admin);}




