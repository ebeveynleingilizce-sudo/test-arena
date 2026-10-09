import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,updatePassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDocFromServer,getDocs,collection,deleteDoc,setDoc,updateDoc,writeBatch,serverTimestamp,setLogLevel} from 'firebase/firestore';
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
import {registerTeacherSharingTests} from './teacher-sharing-cases.mjs';
import {registerQuestionBankTests} from './question-bank-cases.mjs';
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
test('behavior summaries are bounded, isolated and cannot authorize XP or answer access',async()=>{
 const snapshot={visibleMs:1200,hiddenMs:500,exitCount:1,questionMs:[1200,...Array(9).fill(0)],questionChanges:[1,...Array(9).fill(0)]};
 const saved=await call(sa,'recordQuizBehavior',{testSessionId:quiz.testSessionId,streamId:'security-test-stream',snapshot});assert.equal(saved.slot,'0');
 const path=`${root()}/quizzes/${quiz.testSessionId}/behavior/0`,current=(await getDocFromServer(ref(sa,path))).data();assert.equal(current.revision,1);
 await assertSucceeds(getDocFromServer(ref(ta,path)));await assertFails(getDocFromServer(ref(tb,path)));await assertFails(getDocFromServer(ref(sb,path)));
 await assertFails(getDocFromServer(doc(env.unauthenticatedContext().firestore(),path)));
 await assertFails(setDoc(ref(sb,path),{...current,revision:2,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(sa,path),{...current,revision:2,updatedAt:serverTimestamp(),totalXP:999}));
 await assertFails(setDoc(ref(sa,path),{...current,revision:2,visibleMs:-1,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(sa,path),{...current,revision:2,questionChanges:[1],updatedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(sa,path),{...current,revision:2,updatedAt:new Date(0)}));
 await assertFails(setDoc(ref(sa,path),{...current,revision:4,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(sa,path),{...current,revision:2,streamId:'replacement',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(ref(sa,path.replace(/\/0$/,'/8')),{...current,revision:1,startedAt:serverTimestamp(),updatedAt:serverTimestamp()}));
 await assertFails(deleteDoc(ref(sa,path)));await assertFails(deleteDoc(ref(ta,path)));
 await call(sa,'recordQuizBehavior',{testSessionId:quiz.testSessionId,streamId:'security-test-stream',slot:'0',snapshot:{...snapshot,visibleMs:1500}});
 const data=(await getDocFromServer(ref(sa,path))).data();assert.equal(data.revision,2);
 await adminFirestore(admin).doc(path.replace(/\/0$/,'/7')).set({...data,startedAt:data.startedAt.toDate(),updatedAt:data.updatedAt.toDate(),revision:120,streamId:'limit-stream'});
 await assert.rejects(call(sa,'recordQuizBehavior',{testSessionId:quiz.testSessionId,streamId:'limit-stream',slot:'7',snapshot}));
 assert.equal((await getDocFromServer(ref(sa,`${root()}/learning/summary`))).data().totalXP,0);
 await assertFails(getDocFromServer(ref(sa,`privateQuizKeys/${pack.templateId}/answers/${records[0].question.questionId}`)));
 const report=await call(ta,'teacherAnalytics',{studentId:student.studentId});const history=report.testHistory.find(t=>t.testSessionId===quiz.testSessionId);assert(history.reported);assert.equal(history.exitCount,2);assert.equal(history.serverDurationMs,null);assert.equal(history.accuracyChange,null);
 const other=await call(tb,'teacherAnalytics',{studentId:student.studentId});assert.equal(other.testHistory.length,0);
});
test('private answers and feedback are denied before a locked submission; no global code listing',async()=>{
 for(const c of [sa,sb])await assertFails(getDocFromServer(ref(c,`privateQuestionAnswers/${records[0].question.questionId}`)));
 for(const c of [ta,tb])await assertSucceeds(getDocFromServer(ref(c,`privateQuestionAnswers/${records[0].question.questionId}`)));
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
test('class deletion protects active/pending pupils, preserves history and isolates teachers',async()=>{
 const empty=await call(ta,'createClass',{className:'Silinecek boş sınıf',defaultGradeLevel:2});
 await call(tb,'deleteClass',{classId:empty.classId});
 assert.equal((await getDocFromServer(ref(ta,`teachers/st/classes/${empty.classId}`))).exists(),true);
 await assertFails(deleteDoc(ref(tb,`teachers/st/classes/${empty.classId}`)));
 await assert.rejects(call(sa,'deleteClass',{classId:empty.classId}));
 await assertFails(deleteDoc(ref(sa,`teachers/st/classes/${empty.classId}`)));
 const pendingRef=adminFirestore(admin).doc(`teachers/st/students/delete-pending`);
 await pendingRef.set({studentId:'delete-pending',teacherUid:'st',classId:empty.classId,status:'pending'});
 await assert.rejects(call(ta,'deleteClass',{classId:empty.classId}),e=>e.code==='class-not-empty');
 assert.equal((await getDocFromServer(ref(ta,`teachers/st/classes/${empty.classId}`))).data().deletionToken,'');
 await pendingRef.delete();
 const studentBefore=(await getDocFromServer(ref(ta,root()))).data();
 await assert.rejects(call(ta,'deleteClass',{classId:cls.classId}),e=>e.code==='class-not-empty');
 assert.deepEqual((await getDocFromServer(ref(ta,root()))).data(),studentBefore);
 const moved=await call(ta,'createClass',{className:'Taşıma testi',defaultGradeLevel:2});
 await call(ta,'updateStudent',{studentId:otherStudent.studentId,classId:moved.classId,gradeLevel:2});
 await assert.rejects(call(ta,'deleteClass',{classId:moved.classId}),e=>e.code==='class-not-empty');
 // New enrollment and transfers are rejected while the class is frozen for deletion.
 await assertFails(updateDoc(ref(ta,`teachers/st/classes/${empty.classId}`),{deletionToken:'test-lock',deletionStartedAt:serverTimestamp()}));
 await adminFirestore(admin).doc(`teachers/st/classes/${empty.classId}`).update({deletionToken:'test-lock',deletionStartedAt:new Date()});
 await assert.rejects(call(ta,'createStudent',{classId:empty.classId,firstName:'Kilit',lastName:'Test',gradeLevel:2}));
 await assert.rejects(call(ta,'updateStudent',{studentId:otherStudent.studentId,classId:empty.classId,gradeLevel:2}));
 await adminFirestore(admin).doc(`teachers/st/classes/${empty.classId}`).update({deletionToken:'',deletionStartedAt:new Date()});
 await call(ta,'updateStudent',{studentId:otherStudent.studentId,classId:cls.classId,gradeLevel:2});
 await call(ta,'deleteClass',{classId:moved.classId});assert.equal((await getDocFromServer(ref(ta,`teachers/st/classes/${moved.classId}`))).exists(),false);
 const ad=adminFirestore(admin);await ad.doc(`teachers/st/students/deleted-class-history`).set({studentId:'deleted-class-history',teacherUid:'st',classId:empty.classId,status:'removed'});await ad.doc('teachers/st/students/deleted-class-history/learning/summary').set({totalXP:7});
 await call(ta,'deleteClass',{classId:empty.classId});await call(ta,'deleteClass',{classId:empty.classId});
 assert.equal((await getDocFromServer(ref(ta,`teachers/st/classes/${empty.classId}`))).exists(),false);
 assert.equal((await ad.doc('teachers/st/students/deleted-class-history/learning/summary').get()).data().totalXP,7);
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
 const baseUrl=process.env.SPARK_BROWSER_URL||'http://127.0.0.1:5174';
 const vite=process.env.SPARK_BROWSER_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{env:{...process.env,VITE_SPARK_TEST:'true',VITE_USE_EMULATORS:'true',VITE_TEST_AUTH_PORT:'9199',VITE_TEST_FIRESTORE_PORT:'8180'},windowsHide:true,stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(baseUrl)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({args:['--no-proxy-server']});await mkdir('test-results/spark-browser',{recursive:true});
  for(const [width,height] of [[360,800],[1366,900]]){
   const browserStudent=await call(ta,'createStudent',{classId:cls.classId,firstName:'Tarayıcı',lastName:String(width),gradeLevel:2});
   const page=await browser.newPage({viewport:{width,height}}),errors=[],functions=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/:5001|cloudfunctions.net/.test(r.url()))functions.push(r.url());});
   await page.goto(baseUrl+'/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(browserStudent.code);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogrenci');
   await page.getByRole('link',{name:/Soru Çöz/}).first().click();
   await page.locator('.selection-list button').filter({hasText:'Matematik'}).click();await page.locator('.selection-list button').first().click();
   if(await page.getByRole('heading',{name:'Konunu seç'}).isVisible())await page.locator('.selection-list button').filter({hasText:'10 soru'}).first().click();
   await page.locator('.test-pack-list button').filter({hasText:'Test 1'}).click();await page.waitForURL('**/ogrenci/coz/*');
   const choices=page.locator('[data-choice-id]');await choices.first().waitFor();assert.equal(await choices.count(),records[0].question.choices.length);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`test-results/spark-browser/quiz-${width}.png`,fullPage:true});
   await choices.first().click();await choices.nth(1).click();
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   await new Promise(r=>setTimeout(r,300));
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
   await choices.first().click();await page.getByRole('button',{name:'Cevabı kontrol et',exact:true}).click();await page.locator('.answer-feedback').waitFor();
   await page.getByRole('button',{name:'Devam →',exact:true}).click();await page.locator('.quiz-question-navigation').waitFor();
   await page.goto(baseUrl+'/ogrenci/arena');await page.locator('.arena-heading').waitFor();await page.locator('.arena-list').waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(functions,[]);
   const observations=adminFirestore(admin).collection(`teachers/st/students/${browserStudent.studentId}/quizzes`);let observation;
   for(let attempt=0;attempt<20;attempt++){const tests=await observations.get();const rows=await tests.docs[0].ref.collection('behavior').get();observation=rows.docs[0]?.data();if(observation?.questionChanges.reduce((a,b)=>a+b,0)===2)break;await new Promise(r=>setTimeout(r,250));}
   assert.equal(observation.exitCount,1);assert(observation.hiddenMs>=200);assert.equal(observation.questionChanges.reduce((a,b)=>a+b,0),2);
   const teacherPage=await browser.newPage({viewport:{width,height}}),teacherErrors=[];teacherPage.on('pageerror',e=>teacherErrors.push(e.message));teacherPage.on('console',m=>{if(m.type()==='error')teacherErrors.push(m.text());});
   await teacherPage.goto(baseUrl+'/ogretmen-giris');await teacherPage.getByLabel('E-posta',{exact:true}).fill('st@fixture.invalid');await teacherPage.getByLabel('Şifre',{exact:true}).fill('teacher-fixture-only');await teacherPage.getByRole('button',{name:'Giriş yap',exact:true}).click();await teacherPage.waitForURL('**/ogretmen');
   await teacherPage.goto(`${baseUrl}/ogretmen/ogrenciler/${browserStudent.studentId}`);await teacherPage.locator('.behavior-history article').waitFor();await teacherPage.getByText('Soru bazında süreler',{exact:true}).first().click();
   await teacherPage.screenshot({path:`test-results/spark-browser/behavior-report-${width}.png`,fullPage:true});
   const teacherOverflow=await teacherPage.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,80)})).slice(-20)}));
   assert(teacherOverflow.scroll<=width,JSON.stringify(teacherOverflow));assert.deepEqual(teacherErrors,[]);await teacherPage.close();
   const rival=await call(ta,'createStudent',{classId:cls.classId,firstName:'Rakip',lastName:String(width),gradeLevel:2});
   const peer=await browser.newPage({viewport:{width,height}}),peerErrors=[];
   peer.on('pageerror',e=>peerErrors.push(e.message));peer.on('console',m=>{if(m.type()==='error')peerErrors.push(m.text());});
   await peer.goto(baseUrl+'/ogrenci-giris');await peer.getByLabel('Öğrenci kısa kodu').fill(rival.code);await peer.getByRole('button',{name:'Giriş yap',exact:true}).click();await peer.waitForURL('**/ogrenci');
   await page.getByRole('link',{name:/Düello/}).click();await peer.goto(baseUrl+'/ogrenci/duello');
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
 }finally{await browser?.close();vite?.kill();}
});


registerTeacherSharingTests(()=>({ta,tb,call,client,ensureTeacher,pack,records,adminAuth:adminAuth(admin),adminDb:adminFirestore(admin)}));
registerQuestionBankTests(()=>({ta,tb,call,client,ensureTeacher,pack,records,adminAuth:adminAuth(admin),adminDb:adminFirestore(admin)}));
