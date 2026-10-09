import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
const sparkRules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const projectId='demo-test-arena-classroom-test';if(process.env.GCLOUD_PROJECT!==projectId)throw Error('Isolated demo project required');
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8380,rules:sparkRules}});
const app=initializeApp({projectId},'class-delete-browser'),db=getFirestore(app),email='class-delete@fixture.invalid',password='teacher-delete-only';
await getAuth(app).createUser({uid:'class-delete-ui',email,password});await db.doc('roles/class-delete-ui').set({role:'teacher'});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','tests/classroom.vite.config.mjs'],{env:{...process.env,VITE_SPARK_TEST:'true',VITE_USE_EMULATORS:'true'},stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5176')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({args:['--no-proxy-server']});await mkdir('artifacts/class-delete',{recursive:true});
 for(const [name,width,height]of [['phone',390,844],['desktop',1366,900]]){
  const root='teachers/class-delete-ui',emptyId='empty-'+name,fullId='full-'+name;
  const batch=db.batch();batch.set(db.doc(`${root}/classes/${emptyId}`),{classId:emptyId,className:'BOŞ SINIF',defaultGradeLevel:6});batch.set(db.doc(`${root}/classes/${fullId}`),{classId:fullId,className:'DOSTLAR',defaultGradeLevel:6});batch.set(db.doc(`${root}/students/pupil-${name}`),{studentId:'pupil-'+name,teacherUid:'class-delete-ui',classId:fullId,className:'DOSTLAR',gradeLevel:6,firstName:'Ali',lastName:'Kaya',status:'active',credentialVersion:1});await batch.commit();
  for(const c of [emptyId,fullId]){await db.doc(`${root}/classes/${c}`).update({ownerUid:'class-delete-ui',createdBy:'class-delete-ui',status:'active'});await db.doc(`teacherClassAccess/class-delete-ui/classes/class-delete-ui~${c}`).set({storageUid:'class-delete-ui',classId:c});await db.doc(`${root}/classes/${c}/teacherMembers/class-delete-ui`).set({uid:'class-delete-ui',email,status:'active'});}
  await db.doc(`${root}/studentCodes/pupil-${name}`).set({code:'ABC234',credentialVersion:1});
  await db.doc(`${root}/students/history-${name}`).set({studentId:'history-'+name,teacherUid:'class-delete-ui',classId:emptyId,status:'removed'});await db.doc(`${root}/students/history-${name}/learning/summary`).set({totalXP:7});
  await db.doc(`${root}/classes/shared-${name}`).set({classId:'shared-'+name,className:'ORTAK SINIF',defaultGradeLevel:6,ownerUid:'another-owner',status:'active'});await db.doc(`teacherClassAccess/class-delete-ui/classes/class-delete-ui~shared-${name}`).set({storageUid:'class-delete-ui',classId:'shared-'+name});await db.doc(`${root}/classes/shared-${name}/teacherMembers/class-delete-ui`).set({uid:'class-delete-ui',email,status:'active'});
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5176/ogretmen-giris',{waitUntil:'domcontentloaded',timeout:60000});await page.getByLabel('E-posta',{exact:true}).fill(email);await page.getByLabel('Şifre',{exact:true}).fill(password);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogretmen');
  await page.getByRole('link',{name:'Sınıflarım',exact:true}).click();await page.getByRole('button',{name:'BOŞ SINIF sınıfını sil',exact:true}).waitFor();await page.screenshot({path:`artifacts/class-delete/${name}-classes.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.getByRole('button',{name:'ORTAK SINIF sınıfını sil',exact:true}).first().isDisabled(),true);
  await page.getByRole('button',{name:'DOSTLAR sınıfını sil',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByText('Sınıfta öğrenci var.',{exact:false}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Sınıfı silmeyi onayla'}).isDisabled(),true);await dialog.getByRole('button',{name:'Vazgeç',exact:true}).click();
  await page.goto(`http://127.0.0.1:5176/ogretmen/siniflar/${emptyId}`);await page.getByRole('button',{name:'Sınıfı sil',exact:true}).click();await dialog.getByRole('button',{name:'Sınıfı silmeyi onayla'}).waitFor();await page.screenshot({path:`artifacts/class-delete/${name}-confirmation.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await dialog.getByRole('button',{name:'Vazgeç'}).click();assert((await db.doc(`${root}/classes/${emptyId}`).get()).exists);
  await page.getByRole('button',{name:'Sınıfı sil',exact:true}).click();await dialog.getByRole('button',{name:'Sınıfı silmeyi onayla'}).click();await page.waitForURL('**/ogretmen/siniflar');await page.getByText('Sınıf silindi.',{exact:true}).waitFor();assert.equal((await db.doc(`${root}/classes/${emptyId}`).get()).exists,false);assert((await db.doc(`${root}/students/pupil-${name}`).get()).exists);assert.deepEqual(errors,[]);console.log(`${name}: list/detail delete buttons, cancel, nonempty protection, confirmed deletion, navigation, no overflow or console errors passed`);await context.close();
 }
 for(const name of ['phone','desktop'])assert.equal((await db.doc(`teachers/class-delete-ui/students/history-${name}/learning/summary`).get()).data().totalXP,7);
}finally{await browser?.close();server.kill();await deleteApp(app);await env.cleanup();}
