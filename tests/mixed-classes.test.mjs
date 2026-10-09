import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,updateDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import {initializeApp as adminApp,deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {getFirestore as adminFirestore} from 'firebase-admin/firestore';
import {sparkCall} from '../src/data/spark.mjs';
import {sparkRules} from '../scripts/spark-rules.mjs';
import {preparedBankFixture} from './prepared-bank-fixture.mjs';
import {prepareSparkStore} from '../scripts/prepare-spark-store.mjs';
import {backfillLegacyClassAccess} from '../scripts/legacy-class-access.mjs';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
const projectId='demo-test-arena-spark-prototype';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180')throw Error('Isolated emulators required');
let env,admin,teacher,foreign,mixed,s2,s5,s1;const apps=[];
const call=(c,n,d={})=>sparkCall(n,d,c),r=(c,p)=>doc(c.db,p);
async function client(name,email){const app=initializeApp({projectId,apiKey:'demo-emulator-key'},'mixed-'+name);apps.push(app);const auth=getAuth(app),db=getFirestore(app);connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8180);if(email)await signInWithEmailAndPassword(auth,email,'test-only-password');return {app,auth,db,emulator:true,testPorts:{auth:9199,firestore:8180}};}
before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8180,rules:sparkRules}});await env.clearFirestore();
 await fetch(`http://127.0.0.1:9199/emulator/v1/projects/${projectId}/accounts`,{method:'DELETE'});
 admin=adminApp({projectId},'mixed-admin');for(const uid of ['mixed-owner','mixed-foreign'])await adminAuth(admin).createUser({uid,email:uid+'@fixture.invalid',password:'test-only-password'});
 const db=adminFirestore(admin);for(const grade of [2,5]){const {prepared}=preparedBankFixture(grade===5?'turkce':'matematik',grade,10);const b=db.batch();b.set(db.doc('curricula/'+grade),prepared.curricula[0]);for(const rec of prepared.records){b.set(db.doc('questions/'+rec.question.questionId),rec.question);b.set(db.doc('privateQuestionAnswers/'+rec.question.questionId),rec.answer);}await b.commit();}await prepareSparkStore(db);
 teacher=await client('teacher','mixed-owner@fixture.invalid');foreign=await client('foreign','mixed-foreign@fixture.invalid');s2=await client('g2');s5=await client('g5');s1=await client('g1');
});
after(async()=>{await Promise.all(apps.map(deleteApp));await deleteAdminApp(admin);await env.cleanup();});
test('mixed Firebase model, assignments, bulk idempotency and teacher isolation',async()=>{
 mixed=await call(teacher,'createClass',{className:'KARMA',classMode:'mixed',gradeLevels:[1,2,3,4,5,6]});
 const cls=(await getDocFromServer(r(teacher,`teachers/mixed-owner/classes/${mixed.classId}`))).data();assert.deepEqual(cls.gradeLevels,[1,2,3,4,5,6]);assert.equal(cls.classMode,'mixed');
 for(const [grade,c]of [[2,s2],[5,s5],[1,s1]]){const student=await call(teacher,'createStudent',{classId:mixed.classId,gradeLevel:grade,firstName:'Kademe'+grade,lastName:'Test'});await call(c,'studentLogin',{code:student.code});c.student=student;}
 await assert.rejects(call(teacher,'createStudent',{classId:mixed.classId,gradeLevel:7,firstName:'Yasak',lastName:''}));
 const input={classId:mixed.classId,gradeLevel:4,names:['Ali Kaya','Ece Ak'],requestId:'mixed-bulk'};const a=await call(teacher,'bulkCreateStudents',input);assert(a.results.every(r=>r.code));assert.deepEqual(await call(teacher,'bulkCreateStudents',input),a);assert((await call(teacher,'bulkCreateStudents',{...input,gradeLevel:3})).results.every(r=>r.error));
 await assert.rejects(call(foreign,'createStudent',{storageUid:'mixed-owner',classId:mixed.classId,gradeLevel:3,firstName:'Yabancı'}));
});
test('individual catalog and direct template/session security, including first grade',async()=>{
 for(const [grade,c]of [[2,s2],[5,s5],[1,s1]])assert.deepEqual((await call(c,'quizCatalog')).allowedGrades,[grade]);
 const cat=await call(s2,'quizCatalog'),subject=cat.curricula[0].subjects.find(s=>s.count),unit=subject.units.find(u=>u.count),pack=subject.navigationModel==='theme-test'?unit.packs[0]:unit.topics.find(t=>t.count).packs[0];
 await assertFails(getDocFromServer(r(s5,'quizTemplates/'+pack.templateId)));
 await assert.rejects(call(s5,'startTest',{grade:2,subjectId:subject.id,unitId:unit.id,packId:pack.id}));
 await assertFails(setDoc(r(s5,`teachers/mixed-owner/students/${s5.student.studentId}/quizzes/forged`),{templateId:pack.templateId,classId:mixed.classId,resolved:0,correct:0,wrong:0,blank:0,lastQuestionId:'',status:'active',startedAt:serverTimestamp(),completedAt:null}));
 await assertFails(updateDoc(r(s5,`teachers/mixed-owner/students/${s5.student.studentId}`),{gradeLevel:2}));
 const b=writeBatch(teacher.db),event='invalid-assignment';b.set(r(teacher,`teachers/mixed-owner/classes/${mixed.classId}/audit/${event}`),{actorUid:'mixed-owner',actorEmail:'mixed-owner@fixture.invalid',operation:'studentCreated',targetId:'invalid',changes:{},at:serverTimestamp()});b.set(r(teacher,'teachers/mixed-owner/students/invalid'),{studentId:'invalid',teacherUid:'mixed-owner',classId:mixed.classId,className:'KARMA',firstName:'Yasak',lastName:'',gradeLevel:7,status:'pending',credentialVersion:0,lastActionId:event});await assertFails(b.commit());
});
test('editing preserves students/history and filtered report totals',async()=>{
 const db=adminFirestore(admin),root=`teachers/mixed-owner/students/${s5.student.studentId}`;await db.doc(root+'/analytics/summary').set({overall:{solved:10,correct:8,wrong:2},weekly:{solved:0,correct:0,wrong:0}});await db.doc(root+'/analyticsDimensions/turkce').set({kind:'subject',gradeLevel:5,subject:'turkce',subjectName:'Türkçe',overall:{solved:10,correct:8,wrong:2},weekly:{solved:0,correct:0,wrong:0}});
 const before=(await db.doc(root).get()).data(),summary=(await db.doc(root+'/learning/summary').get()).data();
 await call(teacher,'updateClass',{classId:mixed.classId,className:'KARMA GÜNCEL',classMode:'mixed',gradeLevels:[1,2,3,4,6]});
 const after=(await db.doc(root).get()).data();assert.equal(after.gradeLevel,5);assert.equal(after.authUid,before.authUid);assert.equal(after.credentialVersion,before.credentialVersion);assert.deepEqual((await db.doc(root+'/learning/summary').get()).data(),summary);assert.deepEqual((await call(s5,'quizCatalog')).allowedGrades,[5]);
 const all=await call(teacher,'teacherAnalytics',{classId:mixed.classId}),g5=await call(teacher,'teacherAnalytics',{classId:mixed.classId,gradeLevel:5}),g2=await call(teacher,'teacherAnalytics',{classId:mixed.classId,gradeLevel:2});assert.equal(all.students.length,5);assert.equal(g5.students.length,1);assert.equal(g5.classes[0].studentCount,1);assert.equal(g5.totals.overall.solved,10);assert.equal(g5.dimensions[0].overall.solved,10);assert.equal(g2.totals.overall.solved,0);assert.equal(g2.dimensions.length,0);const concurrent=await Promise.all(Array.from({length:4},()=>call(teacher,'teacherAnalytics',{classId:mixed.classId,gradeLevel:5})));assert(concurrent.every(r=>r.students.length===1&&r.totals.overall.solved===10));
 await call(teacher,'updateClass',{classId:mixed.classId,className:'KARMA',classMode:'mixed',gradeLevels:[1,2,3,4,5,6]});
 const legacy=db.doc('teachers/mixed-owner/classes/legacy');await legacy.set({classId:'legacy',className:'ESKİ',defaultGradeLevel:6});const legacyBefore=(await legacy.get()).data();await backfillLegacyClassAccess(db);assert.deepEqual((await legacy.get()).data(),legacyBefore);assert((await call(teacher,'listTeacherClasses')).some(c=>c.classId==='legacy'));assert.equal((await backfillLegacyClassAccess(db)).createdAccessLinks,0);const old=await call(teacher,'createStudent',{classId:'legacy',firstName:'Eski',lastName:'Öğrenci',gradeLevel:3});const c=await client('legacy');await call(c,'studentLogin',{code:old.code});assert.deepEqual((await call(c,'quizCatalog')).allowedGrades,[2,3]);
});
test('real teacher creates/edits mixed group and filters pupils at phone and desktop',async()=>{
 const baseUrl=process.env.MIXED_BROWSER_URL||'http://127.0.0.1:5176';
 const vite=process.env.MIXED_BROWSER_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5176'],{env:{...process.env,VITE_SPARK_TEST:'true',VITE_USE_EMULATORS:'true',VITE_TEST_AUTH_PORT:'9199',VITE_TEST_FIRESTORE_PORT:'8180'},windowsHide:true,stdio:'ignore'});let browser;
 try{for(let i=0;i<60;i++){try{if((await fetch(baseUrl)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}browser=await chromium.launch({args:['--no-proxy-server']});
 for(const width of [360,1366]){const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(baseUrl+'/ogretmen-giris');await page.getByLabel('E-posta').fill('mixed-owner@fixture.invalid');await page.getByLabel('Şifre').fill('test-only-password');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogretmen');await page.goto(baseUrl+'/ogretmen/siniflar');await page.getByRole('button',{name:'+ Sınıf oluştur'}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Sınıf / Grup adı').fill('UI Karma '+width);await dialog.getByLabel('Sınıf türü').selectOption('mixed');await dialog.getByLabel('5. Sınıf',{exact:true}).check();await dialog.getByLabel('6. Sınıf',{exact:true}).check();await page.screenshot({path:`test-results/mixed-create-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await dialog.getByRole('button',{name:'Sınıf oluştur',exact:false}).click();await expect(dialog).toHaveCount(0,{timeout:30000});await expect(page.getByText('UI Karma '+width,{exact:true})).toBeVisible();
 await page.goto(`${baseUrl}/ogretmen/siniflar/${mixed.classId}?owner=mixed-owner`);await expect(page.locator('.student-row')).toHaveCount(5);await page.getByLabel('Kademe filtresi',{exact:true}).selectOption('5');await expect(page.locator('.student-row')).toHaveCount(1);await page.getByRole('button',{name:'Genel Bakış',exact:true}).click();await expect(page.locator('[data-analytics-student]')).toHaveCount(1,{timeout:30000}).catch(async error=>{console.log('Analytics failure',await page.locator('body').innerText(),errors);await page.screenshot({path:'test-results/mixed-failure.png',fullPage:true});throw error;});await page.getByRole('button',{name:'Sınıfı düzenle',exact:true}).click();await expect(dialog.getByLabel('Sınıf türü')).toHaveValue('mixed');await dialog.getByLabel('12. Sınıf',{exact:true}).check();await dialog.getByRole('button',{name:'Değişiklikleri kaydet'}).click();await expect(dialog).toHaveCount(0,{timeout:30000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('[data-analytics-student]')).toHaveCount(1,{timeout:30000}).catch(async error=>{console.log('Analytics failure',await page.locator('body').innerText(),errors);await page.screenshot({path:'test-results/mixed-failure.png',fullPage:true});throw error;});await page.screenshot({path:`test-results/mixed-filter-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();}
 }finally{await browser?.close();vite?.kill();}
});
