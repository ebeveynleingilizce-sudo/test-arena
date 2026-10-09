import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDocFromServer,setDoc,serverTimestamp,setLogLevel} from 'firebase/firestore';
import {initializeApp as adminApp,deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {getFirestore as adminFirestore} from 'firebase-admin/firestore';
import {sparkRules} from '../scripts/spark-rules.mjs';
import {sparkCall} from '../src/data/spark.mjs';
import {preparedBankFixture} from './prepared-bank-fixture.mjs';
import {prepareSparkStore} from '../scripts/prepare-spark-store.mjs';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
const projectId='demo-test-arena-behavior';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8189'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9198')throw Error('Isolated emulator required');
setLogLevel('silent');let env,admin,teacher,student,foreign,quiz,records;const apps=[];
const call=(c,n,d={})=>sparkCall(n,d,c),root='teachers/behavior-owner/students/behavior-student';
async function client(name,email,password){const app=initializeApp({projectId,apiKey:'emulator-only'},name),auth=getAuth(app),db=getFirestore(app);apps.push(app);connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8189);if(email)await signInWithEmailAndPassword(auth,email,password);return {app,auth,db,emulator:true,testPorts:{auth:9198,firestore:8189}};}
before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8189,rules:sparkRules}});await env.clearFirestore();await fetch(`http://127.0.0.1:9198/emulator/v1/projects/${projectId}/accounts`,{method:'DELETE'});
 admin=adminApp({projectId},'behavior-fixtures');const db=adminFirestore(admin),auth=adminAuth(admin);
 for(const uid of ['behavior-owner','behavior-foreign']){await auth.createUser({uid,email:`${uid}@fixture.invalid`,password:'behavior-test-only'});await db.doc(`roles/${uid}`).set({role:'teacher'});}
 await auth.createUser({uid:'behavior-auth',email:'k7m4q9@students.testarena.invalid',password:'K7M4Q9'});
 const p={studentId:'behavior-student',teacherUid:'behavior-owner',classId:'behavior-class',className:'Davranış Testi',firstName:'Gözlem',lastName:'Test',gradeLevel:2,status:'active',credentialVersion:1,authUid:'behavior-auth'};
 await db.doc(root).set(p);await db.doc('roles/behavior-auth').set({role:'student'});await db.doc('studentBindings/behavior-auth').set({teacherUid:p.teacherUid,studentId:p.studentId,version:1});
 await db.doc('teachers/behavior-owner/classes/behavior-class').set({classId:p.classId,className:p.className,defaultGradeLevel:2,ownerUid:p.teacherUid,status:'active'});
 await db.doc('teacherClassAccess/behavior-owner/classes/behavior-owner~behavior-class').set({storageUid:p.teacherUid,classId:p.classId});
 await db.doc(`${root}/learning/summary`).set({totalXP:0,academicXP:0,lastAwardQuestionId:'',answeredCount:0,correctCount:0,wrongCount:0});
 await db.doc(`teachers/behavior-owner/classes/behavior-class/leaderboard/${p.studentId}`).set({studentId:p.studentId,classId:p.classId,displayName:'Gözlem Test',academicXP:0,weeklyAcademicXP:0,weekKey:'',lastAwardQuestionId:''});
 const {prepared}=preparedBankFixture('matematik',2,10),groups=new Map();for(const r of prepared.records){const key=r.question.unitId+':'+r.question.topic;groups.set(key,[...(groups.get(key)||[]),r]);}records=[...groups.values()].find(v=>v.length>=10).slice(0,10);
 const batch=db.batch();batch.set(db.doc('curricula/2'),prepared.curricula[0]);for(const r of records){batch.set(db.doc(`questions/${r.question.questionId}`),r.question);batch.set(db.doc(`privateQuestionAnswers/${r.question.questionId}`),r.answer);}await batch.commit();await prepareSparkStore(db);
 teacher=await client('behavior-teacher','behavior-owner@fixture.invalid','behavior-test-only');foreign=await client('behavior-foreign','behavior-foreign@fixture.invalid','behavior-test-only');student=await client('behavior-pupil');await call(student,'studentLogin',{code:'K7M4Q9'});
 const catalog=(await db.doc('sparkCatalog/2').get()).data(),subject=catalog.subjects.find(s=>s.id==='matematik'),unit=subject.units.find(u=>u.count>0),topic=unit.topics.find(t=>t.count>0),pack=subject.navigationModel==='theme-test'?unit.packs[0]:topic.packs[0];
 // Fixture session bypasses unrelated curriculum/teacher-management work in progress.
 await db.doc(`${root}/quizzes/behavior-test`).set({templateId:pack.templateId,classId:'behavior-class',resolved:0,correct:0,wrong:0,blank:0,lastQuestionId:'',status:'active',startedAt:new Date(),completedAt:null});
 quiz=await call(student,'getTestSession',{testSessionId:'behavior-test'});records=quiz.questions.map(q=>records.find(r=>r.question.questionId===q.questionId));
});
after(async()=>{await Promise.all(apps.map(deleteApp));if(admin)await deleteAdminApp(admin);await env?.cleanup();});
test('current rules store telemetry, preserve isolation and refuse invalid/unbounded writes',async()=>{
 const snapshot={visibleMs:3000,hiddenMs:1200,exitCount:1,questionMs:[3000,...Array(9).fill(0)],questionChanges:[2,...Array(9).fill(0)]};
 const saved=await call(student,'recordQuizBehavior',{testSessionId:quiz.testSessionId,streamId:'isolated-stream',snapshot});assert.equal(saved.slot,'0');
 const path=`${root}/quizzes/${quiz.testSessionId}/behavior/0`,v=(await getDocFromServer(doc(student.db,path))).data();assert.equal(v.revision,1);
 assert.equal((await getDocFromServer(doc(teacher.db,path))).data().exitCount,1);
 await assertFails(getDocFromServer(doc(foreign.db,path)));await assertFails(getDocFromServer(doc(env.unauthenticatedContext().firestore(),path)));
 for(const data of [{visibleMs:-1},{revision:121},{questionMs:[1]},{totalXP:999},{streamId:'tamper'}])await assertFails(setDoc(doc(student.db,path),{...v,revision:2,updatedAt:serverTimestamp(),...data}));
 await assertFails(setDoc(doc(foreign.db,path),{...v,revision:2,updatedAt:serverTimestamp()}));
 const report=await call(teacher,'teacherAnalytics',{studentId:'behavior-student'});assert.equal(report.testHistory.length,1);assert.equal(report.testHistory[0].hiddenMs,1200);assert.equal(report.testHistory[0].questions[0].changes,2);
 assert.equal((await call(foreign,'teacherAnalytics',{studentId:'behavior-student'})).testHistory.length,0);
});
test('telemetry cannot unlock answers, increase XP or affect correct/wrong settlement',async()=>{
 const current=(await getDocFromServer(doc(student.db,`${root}/quizzes/${quiz.testSessionId}`))).data();await assertFails(getDocFromServer(doc(student.db,`privateQuizKeys/${current.templateId}/answers/${records[0].question.questionId}`)));
 assert.equal((await getDocFromServer(doc(student.db,`${root}/learning/summary`))).data().totalXP,0);
 for(const [i,q]of quiz.questions.entries()){const answer=records[i].answer.correctOptionId,choice=i===0?q.choices.find(c=>c.choiceId!==answer).choiceId:answer;const r=await call(student,'submitAnswer',{testSessionId:quiz.testSessionId,questionId:q.questionId,selectedChoiceId:choice});assert.equal(r.answer.isCorrect,i!==0);if(i===0)assert.equal(r.answer.earnedXP,0);}
 assert.equal((await getDocFromServer(doc(student.db,`${root}/learning/summary`))).data().totalXP,9);
 const report=await call(teacher,'teacherAnalytics',{studentId:'behavior-student'});assert.equal(report.testHistory[0].correct,9);assert.equal(report.testHistory[0].wrong,1);assert(report.testHistory[0].serverDurationMs>=0);assert.equal(report.testHistory[0].hiddenMs,1200);
 await call(student,'getTestSession',{testSessionId:quiz.testSessionId});assert.equal((await getDocFromServer(doc(student.db,`${root}/learning/summary`))).data().totalXP,9);
});

test('real quiz recorder and teacher history render on mobile/desktop in isolated emulator',async()=>{
 // Test-only project substitution; application Firebase configuration is unchanged.
 const vite=await createServer({configFile:false,plugins:[{name:'isolated-behavior-project',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/data/firebaseEnvironment.ts'))return code.replace('demo-test-arena-spark-prototype',projectId);}},react()],define:{'import.meta.env.VITE_SPARK_TEST':JSON.stringify('true'),'import.meta.env.VITE_USE_EMULATORS':JSON.stringify('true'),'import.meta.env.VITE_TEST_AUTH_PORT':JSON.stringify('9198'),'import.meta.env.VITE_TEST_FIRESTORE_PORT':JSON.stringify('8189')},server:{host:'127.0.0.1',port:5179,strictPort:true,fs:{allow:[process.cwd(),dirname(createRequire(import.meta.url).resolve('@fontsource/manrope/package.json'))]},watch:{ignored:['**/.firebase/**']}}});
 await vite.listen();let browser;
 try{
  browser=await chromium.launch();await mkdir('.firebase/behavior-test',{recursive:true});
  for(const [width,height]of [[360,800],[1366,900]]){
   const db=adminFirestore(admin),testId=`behavior-browser-${width}`,templateId=(await db.doc(`${root}/quizzes/behavior-test`).get()).data().templateId;
   await db.doc(`${root}/quizzes/${testId}`).set({templateId,classId:'behavior-class',resolved:0,correct:0,wrong:0,blank:0,lastQuestionId:'',status:'active',startedAt:new Date(),completedAt:null});
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto('http://127.0.0.1:5179/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill('K7M4Q9');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogrenci');
   await page.goto(`http://127.0.0.1:5179/ogrenci/coz/${testId}`);const choices=page.locator('[data-choice-id]');await choices.first().waitFor();await choices.first().click();await choices.nth(1).click();
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await new Promise(r=>setTimeout(r,300));
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
   await page.getByRole('button',{name:'Cevabı kontrol et',exact:true}).click();await page.locator('.answer-feedback').waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`.firebase/behavior-test/real-quiz-${width}.png`,fullPage:true});
   let observations;for(let i=0;i<30;i++){observations=(await db.collection(`${root}/quizzes/${testId}/behavior`).get()).docs.map(d=>d.data());if(observations.some(v=>v.questionChanges[0]===1&&v.hiddenMs>=200))break;await new Promise(r=>setTimeout(r,100));}
   assert(observations.some(v=>v.questionChanges[0]===1&&v.hiddenMs>=200&&v.exitCount===1));assert.deepEqual(errors,[]);await page.close();
   const teacherPage=await browser.newPage({viewport:{width,height}}),teacherErrors=[];teacherPage.on('pageerror',e=>teacherErrors.push(e.message));teacherPage.on('console',m=>{if(m.type()==='error')teacherErrors.push(m.text());});
   await teacherPage.goto('http://127.0.0.1:5179/ogretmen-giris');await teacherPage.getByLabel('E-posta',{exact:true}).fill('behavior-owner@fixture.invalid');await teacherPage.getByLabel('Şifre',{exact:true}).fill('behavior-test-only');await teacherPage.getByRole('button',{name:'Giriş yap',exact:true}).click();await teacherPage.waitForURL('**/ogretmen');
   await teacherPage.goto('http://127.0.0.1:5179/ogretmen/ogrenciler/behavior-student');await teacherPage.locator('.behavior-history article').first().waitFor();await teacherPage.getByText('Soru bazında süreler',{exact:true}).first().click();
   const overflow=await teacherPage.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({cls:e.className,text:e.textContent.slice(0,60)})).slice(-15)}));
   await teacherPage.screenshot({path:`.firebase/behavior-test/real-report-${width}.png`,fullPage:true});assert(overflow.scroll<=width,JSON.stringify(overflow));assert.deepEqual(teacherErrors,[]);await teacherPage.close();
  }
 }finally{await browser?.close();await vite.close();}
});
