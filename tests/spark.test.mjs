import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,updatePassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDocFromServer,getDocs,collection,setDoc,updateDoc,writeBatch,serverTimestamp,setLogLevel} from 'firebase/firestore';
import {initializeApp as adminApp,deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {getFirestore as adminFirestore} from 'firebase-admin/firestore';
import {preparedBankFixture} from './prepared-bank-fixture.mjs';
import {prepareSparkStore} from '../scripts/prepare-spark-store.mjs';
import {sparkCall,ensureTeacher} from '../src/data/spark.mjs';
import {sparkRules} from '../scripts/spark-rules.mjs';
import {heartbeat,invite,respond,publishAnswer,duelScore,closeExpired} from '../src/data/duel.mjs';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const projectId='demo-test-arena-spark-prototype';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Isolated emulators required');
setLogLevel('silent');
let env,admin,ta,tb,sa,sb,cls,student,otherStudent,cat,pack,records,quiz,retake,newCode;
const apps=[],call=(c,n,d={})=>sparkCall(n,d,c),root=()=>`teachers/st/students/${student.studentId}`;
const ref=(c,p)=>doc(c.db,p);
async function client(name,email){const app=initializeApp({projectId,apiKey:'emulator-only'},`spark-main-${name}`),auth=getAuth(app),db=getFirestore(app);apps.push(app);connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8180);if(email)await signInWithEmailAndPassword(auth,email,'teacher-fixture-only');return {app,auth,db,emulator:true,testPorts:{auth:9199,firestore:8180}};}
before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8180,rules:sparkRules}});await env.clearFirestore();
 await fetch(`http://127.0.0.1:9199/emulator/v1/projects/${projectId}/accounts`,{method:'DELETE'});
 admin=adminApp({projectId},'spark-main-fixtures');
 for(const uid of ['st','st-other'])await adminAuth(admin).createUser({uid,email:`${uid}@fixture.invalid`,password:'teacher-fixture-only'});
 const {prepared}=preparedBankFixture('matematik',2,10);
 const groups=new Map();for(const r of prepared.records){const key=r.question.unitId+':'+r.question.topic;groups.set(key,[...(groups.get(key)||[]),r]);}
 records=[...groups.values()].find(group=>group.length>=10).slice(0,10);
 const db=adminFirestore(admin),batch=db.batch();batch.set(db.doc('curricula/2'),prepared.curricula[0]);for(const r of records){batch.set(db.doc(`questions/${r.question.questionId}`),r.question);batch.set(db.doc(`privateQuestionAnswers/${r.question.questionId}`),r.answer);}await batch.commit();await prepareSparkStore(db);
 ta=await client('teacher','st@fixture.invalid');tb=await client('foreign-teacher','st-other@fixture.invalid');sa=await client('student');sb=await client('other-student');await ensureTeacher(ta.db,ta.auth.currentUser);await ensureTeacher(tb.db,tb.auth.currentUser);
});
after(async()=>{await Promise.all(apps.map(deleteApp));if(admin)await deleteAdminApp(admin);await env?.cleanup();});
test('Spark teacher creates class/student/code; student logs in with code alone',async()=>{
 cls=await call(ta,'createClass',{className:'DOSTLAR',defaultGradeLevel:2});student=await call(ta,'createStudent',{classId:cls.classId,firstName:'Elif',lastName:'Kaya',gradeLevel:2});assert.match(student.code,/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);await call(sa,'studentLogin',{code:student.code});assert.equal(ta.auth.currentUser.uid,'st');assert.equal((await getDocFromServer(ref(sa,root()))).data().firstName,'Elif');
 otherStudent=await call(ta,'createStudent',{classId:cls.classId,firstName:'Ali',lastName:'Ak',gradeLevel:2});await call(sb,'studentLogin',{code:otherStudent.code});
});
test('catalog projection and real test selection return public questions without answers',async()=>{
 cat=await call(sa,'quizCatalog');const subject=cat.curricula[0].subjects.find(s=>s.id==='matematik'),unit=subject.units.find(u=>u.count>0);pack=(subject.navigationModel==='theme-test'?unit.packs:unit.topics.find(t=>t.count>0).packs)[0];
 const topic=unit.topics.find(t=>t.packs.some(p=>p.templateId===pack.templateId));
 quiz=await call(sa,'startTest',{grade:2,subjectId:subject.id,unitId:unit.id,...(topic?{topicId:topic.id}:{}),packId:pack.id});assert.equal(quiz.questions.length,10);
 for(const q of quiz.questions)for(const f of ['correctOptionId','explanation','answer'])assert(!(f in q));
 records=quiz.questions.map(q=>records.find(r=>r.question.questionId===q.questionId));assert(records.every(Boolean));
});
test('private answers and feedback are denied before a locked submission; no global code listing',async()=>{
 for(const c of [sa,sb,tb])await assertFails(getDocFromServer(ref(c,`privateQuestionAnswers/${records[0].question.questionId}`)));
 for(const c of [sa,sb])await assertFails(getDocFromServer(ref(c,`privateQuizKeys/${pack.templateId}/answers/${records[0].question.questionId}`)));
 for(const c of [ta,tb])await assertSucceeds(getDocFromServer(ref(c,`privateQuizKeys/${pack.templateId}/answers/${records[0].question.questionId}`)));
 await assertFails(getDocs(collection(sa.db,'codeTickets')));await assertFails(getDocs(collection(sa.db,'studentBindings')));
 await assertFails(getDocFromServer(ref(tb,root())));await assertFails(getDocFromServer(ref(sb,root())));
});
test('student cannot alter role/grade/XP, forge completion or grade without a committed answer',async()=>{
 await assert.rejects(ensureTeacher(sa.db,sa.auth.currentUser));await assertFails(updateDoc(ref(sa,root()),{gradeLevel:12}));await assertFails(updateDoc(ref(sa,`${root()}/learning/summary`),{totalXP:999}));
 await assertFails(updateDoc(ref(sa,`${root()}/quizzes/${quiz.testSessionId}`),{status:'completed',resolved:10,correct:10,completedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(sa,`${root()}/quizzes/${quiz.testSessionId}/results/${records[0].question.questionId}`),{isCorrect:true,skipped:false,gradedAt:serverTimestamp()}));
 const batch=writeBatch(sa.db),q=records[0].question.questionId;batch.set(ref(sa,`${root()}/quizzes/${quiz.testSessionId}/submissions/${q}`),{selectedChoiceId:records[0].answer.correctOptionId,submittedAt:serverTimestamp()});batch.set(ref(sa,`${root()}/quizzes/${quiz.testSessionId}/results/${q}`),{isCorrect:true,skipped:false,gradedAt:serverTimestamp()});await assertFails(batch.commit());
});
test('wrong/correct grading and post-answer feedback work; incomplete quiz awards no XP',async()=>{
 const r=records[0],wrong=r.question.choices.find(c=>c.choiceId!==r.answer.correctOptionId).choiceId;
 const result=await call(sa,'submitAnswer',{testSessionId:quiz.testSessionId,questionId:r.question.questionId,selectedChoiceId:wrong});assert.equal(result.answer.isCorrect,false);assert.equal(result.answer.earnedXP,0);assert.equal(result.answer.correctChoiceId,r.answer.correctOptionId);
 const correct=await call(sa,'submitAnswer',{testSessionId:quiz.testSessionId,questionId:records[1].question.questionId,selectedChoiceId:records[1].answer.correctOptionId});assert.equal(correct.answer.isCorrect,true);assert.equal(correct.answer.pendingXP,true);assert.equal(correct.totalXP,0);
 await assertFails(updateDoc(ref(sa,`${root()}/learning/summary`),{answeredCount:999,correctCount:999}));
});
test('concurrent answers and finish with one blank: eight XP and consistent counters/week/Arena',async()=>{
 for(let i=2;i<8;i+=2)await Promise.all([i,i+1].map(i=>call(sa,'submitAnswer',{testSessionId:quiz.testSessionId,questionId:records[i].question.questionId,selectedChoiceId:records[i].answer.correctOptionId})));
 await call(sa,'submitAnswer',{testSessionId:quiz.testSessionId,questionId:records[8].question.questionId,selectedChoiceId:records[8].answer.correctOptionId});
 const done=await call(sa,'finishTest',{testSessionId:quiz.testSessionId});assert.equal(done.blankCount,1);assert.equal(done.correctCount,8);assert.equal(done.wrongCount,1);assert.equal(done.earnedXP,8);assert.equal(done.status,'completed');
 const p=await call(sa,'prepareArena'),summary=(await getDocFromServer(ref(sa,`${root()}/learning/summary`))).data(),week=(await getDocFromServer(ref(sa,`${root()}/academicWeeks/${p.weekKey}`))).data();assert.equal(summary.totalXP,8);assert.equal(summary.answeredCount,9);assert.equal(summary.correctCount,8);assert.equal(week.academicXP,8);
 const row=(await getDocFromServer(ref(sa,`teachers/st/classes/${cls.classId}/leaderboard/${student.studentId}`))).data();assert.equal(row.academicXP,8);assert.equal(row.weeklyAcademicXP,8);
});
test('retake awards only two newly correct questions and repeated settlement gives zero extra XP',async()=>{
 const template=(await getDocFromServer(ref(sa,`quizTemplates/${pack.templateId}`))).data();const selection={grade:2,subjectId:template.subject,unitId:template.unitId,...(template.topic?{topicId:template.topic}:{}),packId:template.packId};retake=await call(sa,'startTest',selection);
 for(const r of records)await call(sa,'submitAnswer',{testSessionId:retake.testSessionId,questionId:r.question.questionId,selectedChoiceId:r.answer.correctOptionId});
 const done=await call(sa,'getTestSession',{testSessionId:retake.testSessionId});assert.equal(done.earnedXP,2);await call(sa,'getTestSession',{testSessionId:retake.testSessionId});assert.equal((await getDocFromServer(ref(sa,`${root()}/learning/summary`))).data().totalXP,10);
});
test('Spark analytics preserves solved/correct/wrong and reads teacher-owned data only',async()=>{
 const report=await call(ta,'teacherAnalytics',{classId:cls.classId}),s=report.students.find(s=>s.studentId===student.studentId);assert.deepEqual(s.overall,{solved:19,correct:18,wrong:1});assert.equal(s.academicXP,10);assert.equal(s.weeklyAcademicXP,10);assert.equal(s.overallRank,1);assert(report.dimensions.length>0);
 const foreign=await call(tb,'teacherAnalytics',{});assert.equal(foreign.students.length,0);
});
test('known native Auth password risk, teacher renewal restores access and keeps XP/history',async()=>{
 await updatePassword(sa.auth.currentUser,'fixture-student-changed');const fresh=await client('fresh');await assert.rejects(call(fresh,'studentLogin',{code:student.code}));newCode=await call(ta,'rotateStudentCode',{studentId:student.studentId});await assertFails(getDocFromServer(ref(sa,root())));await call(sa,'studentLogin',{code:newCode.code});assert.equal((await getDocFromServer(ref(sa,`${root()}/learning/summary`))).data().totalXP,10);assert.equal((await call(sa,'getTestSession',{testSessionId:retake.testSessionId})).earnedXP,2);
});
test('bulk request retries do not duplicate students and removal revokes access',async()=>{
 const input={classId:cls.classId,names:['Ezgi Gür','Ayşe Yılmaz'],requestId:'fixture-bulk-request'},a=await call(ta,'bulkCreateStudents',input),b=await call(ta,'bulkCreateStudents',input);assert.equal(a.results.length,2);assert(a.results.every(r=>r.code));assert.deepEqual(a,b);
 await call(ta,'removeStudent',{studentId:student.studentId});await assertFails(getDocFromServer(ref(sa,root())));assert.equal((await getDocFromServer(ref(ta,`${root()}/learning/summary`))).data().totalXP,10);
});
test('missing current-grade catalog does not block access to the allowed previous grade',async()=>{
 const s=await call(ta,'createStudent',{classId:cls.classId,firstName:'Üst',lastName:'Kademe',gradeLevel:3}),c=await client('missing-grade');await call(c,'studentLogin',{code:s.code});
 const result=await call(c,'quizCatalog');assert.deepEqual(result.allowedGrades,[2,3]);assert.deepEqual(result.curricula.map(c=>c.grade),[2]);await assertFails(getDocFromServer(ref(c,'sparkCatalog/5')));
});
test('duel invite, rejection, locking, common questions and verified scores preserve XP rules',async()=>{
 const a=await call(ta,'createStudent',{classId:cls.classId,firstName:'Düello',lastName:'A',gradeLevel:2}),b=await call(ta,'createStudent',{classId:cls.classId,firstName:'Düello',lastName:'B',gradeLevel:2});
 const ca=await client('duel-a'),cb=await client('duel-b');await call(ca,'studentLogin',{code:a.code});await call(cb,'studentLogin',{code:b.code});
 const pa=(await getDocFromServer(ref(ca,`teachers/st/students/${a.studentId}`))).data(),pb=(await getDocFromServer(ref(cb,`teachers/st/students/${b.studentId}`))).data(),path=`teachers/st/classes/${cls.classId}`;
 await heartbeat(ca.db,pa);await heartbeat(cb.db,pb);
 const first=await invite(ca.db,pa,b.studentId,pack.templateId);
 await assertFails(updateDoc(ref(ca,`${path}/duels/${first}`),{status:'active',acceptedAt:serverTimestamp()}));
 await assert.rejects(invite(cb.db,pb,a.studentId,pack.templateId));
 await respond(cb.db,pb,first,false);
 const did=await invite(ca.db,pa,b.studentId,pack.templateId);await respond(cb.db,pb,did,true);
 const forged=crypto.randomUUID(),batch=writeBatch(ca.db);
 batch.set(ref(ca,`${path}/duels/${forged}`),{participants:[a.studentId,b.studentId],from:a.studentId,to:b.studentId,templateId:pack.templateId,status:'pending',createdAt:serverTimestamp(),acceptedAt:null});
 for(const s of [a.studentId,b.studentId])batch.set(ref(ca,`${path}/duelSlots/${s}`),{duelId:forged});
 await assertFails(batch.commit());
 await assertFails(setDoc(ref(ca,`${path}/duels/${forged}`),{participants:[a.studentId,b.studentId],from:a.studentId,to:b.studentId,templateId:pack.templateId,status:'pending',createdAt:serverTimestamp(),acceptedAt:null}));
 await assertFails(updateDoc(ref(ca,`${path}/duels/${did}`),{status:'completed'}));
 await assertFails(getDocFromServer(ref(tb,`${path}/duels/${did}`)));
 const [qa,repeatStart,qb]=await Promise.all([call(ca,'startDuelTest',{duelId:did}),call(ca,'startDuelTest',{duelId:did}),call(cb,'startDuelTest',{duelId:did})]);assert.equal(qa.testSessionId,repeatStart.testSessionId);assert.deepEqual(qa.questions,qb.questions);assert.equal(qa.questions.length,10);
 await assertFails(setDoc(ref(ca,`${path}/duels/${did}/answers/${a.studentId}-0`),{studentId:a.studentId,index:0,isCorrect:true,submittedAt:serverTimestamp()}));
 const ad=adminFirestore(admin),gameRef=ad.doc(`${path}/duels/${did}`);
 // Advance the server fixture to each round without waiting five minutes.
 for(let i=0;i<10;i++){
  await gameRef.update({acceptedAt:new Date(Date.now()-10000-i*30000)});
  const q=qa.questions[i],key=records.find(r=>r.question.questionId===q.questionId).answer.correctOptionId;
  await call(ca,'submitAnswer',{testSessionId:qa.testSessionId,questionId:q.questionId,selectedChoiceId:key});
  await call(cb,'submitAnswer',{testSessionId:qb.testSessionId,questionId:q.questionId,selectedChoiceId:q.choices.find(c=>c.choiceId!==key).choiceId});
  const game={...(await getDocFromServer(ref(ca,`${path}/duels/${did}`))).data(),id:did};
  await publishAnswer(ca.db,pa,game,i);await publishAnswer(cb.db,pb,game,i);
  await assertFails(updateDoc(ref(ca,`${path}/duels/${did}/answers/${a.studentId}-${i}`),{isCorrect:false}));
 }
 const scores=(await getDocs(collection(ca.db,`${path}/duels/${did}/answers`))).docs.map(d=>d.data());assert.equal(scores.length,20);assert(scores.filter(r=>r.studentId===a.studentId).every(r=>r.isCorrect));assert(scores.filter(r=>r.studentId===b.studentId).every(r=>!r.isCorrect));
 const done=await call(ca,'getTestSession',{testSessionId:qa.testSessionId});assert.equal(done.earnedXP,10);await call(ca,'getTestSession',{testSessionId:qa.testSessionId});assert.equal((await getDocFromServer(ref(ca,`teachers/st/students/${a.studentId}/learning/summary`))).data().totalXP,10);
 assert.equal((await call(cb,'getTestSession',{testSessionId:qb.testSessionId})).earnedXP,0);
 await gameRef.update({acceptedAt:new Date(Date.now()-311000)});
 const ended={...(await getDocFromServer(ref(ca,`${path}/duels/${did}`))).data(),id:did};await closeExpired(ca.db,pa,[ended],Date.now());
 assert.equal((await getDocFromServer(ref(cb,`${path}/duels/${did}`))).data().status,'completed');
 assert.equal(duelScore({acceptedAt:{toMillis:()=>0}},[{studentId:'s',isCorrect:true,index:0,submittedAt:{toMillis:()=>15000}},{studentId:'s',isCorrect:false,index:1,submittedAt:{toMillis:()=>40000}}],'s'),1250);
});
test('real student browser navigation, quiz and Arena at phone/desktop sizes without Functions',async()=>{
 const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{env:{...process.env,VITE_SPARK_TEST:'true',VITE_USE_EMULATORS:'true',VITE_TEST_AUTH_PORT:'9199',VITE_TEST_FIRESTORE_PORT:'8180'},windowsHide:true,stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:5174/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch();await mkdir('test-results/spark-browser',{recursive:true});
  for(const [width,height] of [[360,800],[1366,900]]){
   const browserStudent=await call(ta,'createStudent',{classId:cls.classId,firstName:'Tarayıcı',lastName:String(width),gradeLevel:2});
   const page=await browser.newPage({viewport:{width,height}}),errors=[],functions=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/:5001|cloudfunctions.net/.test(r.url()))functions.push(r.url());});
   await page.goto('http://127.0.0.1:5174/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(browserStudent.code);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogrenci');
   await page.getByRole('link',{name:/Soru Çöz/}).first().click();
   await page.locator('.selection-list button').filter({hasText:'Matematik'}).click();await page.locator('.selection-list button').first().click();
   if(await page.getByRole('heading',{name:'Konunu seç'}).isVisible())await page.locator('.selection-list button').filter({hasText:'10 soru'}).first().click();
   await page.locator('.test-pack-list button').filter({hasText:'Test 1'}).click();await page.waitForURL('**/ogrenci/coz/*');
   const choices=page.locator('[data-choice-id]');await choices.first().waitFor();assert.equal(await choices.count(),records[0].question.choices.length);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`test-results/spark-browser/quiz-${width}.png`,fullPage:true});
   await choices.first().click();await page.getByRole('button',{name:'Cevabı kontrol et',exact:true}).click();await page.locator('.answer-feedback').waitFor();
   await page.getByRole('button',{name:'Devam →',exact:true}).click();await page.locator('.quiz-question-navigation').waitFor();
   await page.goto('http://127.0.0.1:5174/ogrenci/arena');await page.locator('.arena-heading').waitFor();await page.locator('.arena-list').waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(functions,[]);
   const rival=await call(ta,'createStudent',{classId:cls.classId,firstName:'Rakip',lastName:String(width),gradeLevel:2});
   const peer=await browser.newPage({viewport:{width,height}}),peerErrors=[];
   peer.on('pageerror',e=>peerErrors.push(e.message));peer.on('console',m=>{if(m.type()==='error')peerErrors.push(m.text());});
   await peer.goto('http://127.0.0.1:5174/ogrenci-giris');await peer.getByLabel('Öğrenci kısa kodu').fill(rival.code);await peer.getByRole('button',{name:'Giriş yap',exact:true}).click();await peer.waitForURL('**/ogrenci');
   await page.getByRole('link',{name:/Düello/}).click();await peer.goto('http://127.0.0.1:5174/ogrenci/duello');
   const row=page.locator('.duel-rivals li').filter({hasText:`Rakip ${width}`});await row.getByRole('button',{name:'Davet et'}).click();
   await peer.getByRole('button',{name:'Kabul et'}).click();
   try{await page.getByText('Soru 1 / 10',{exact:true}).waitFor();await peer.getByText('Soru 1 / 10',{exact:true}).waitFor();}catch(e){
    await page.screenshot({path:`test-results/spark-browser/duel-debug-own-${width}.png`,fullPage:true});await peer.screenshot({path:`test-results/spark-browser/duel-debug-peer-${width}.png`,fullPage:true});
    console.error('Duel browser state',await page.locator('.duel-shell').innerText(),await peer.locator('.duel-shell').innerText(),errors,peerErrors);throw e;
   }
   for(const p of [page,peer]){await p.locator('.answer-choices button').first().click();await p.getByRole('button',{name:'Cevabı gönder',exact:true}).click();await p.getByText('Cevabın kilitlendi.',{exact:false}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await page.screenshot({path:`test-results/spark-browser/duel-${width}.png`,fullPage:true});
   const games=await adminFirestore(admin).collection(`teachers/st/classes/${cls.classId}/duels`).where('from','==',browserStudent.studentId).get();assert.equal(games.size,1);
   await games.docs[0].ref.update({acceptedAt:new Date(Date.now()-311000)});
   for(const p of [page,peer])await p.locator('.duel-result').waitFor();
   assert.deepEqual(errors,[]);assert.deepEqual(peerErrors,[]);assert.deepEqual(functions,[]);await peer.close();await page.close();
  }
 }finally{await browser?.close();vite.kill();}
});

