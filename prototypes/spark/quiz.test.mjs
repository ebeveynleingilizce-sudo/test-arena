import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,Timestamp,disableNetwork,enableNetwork,setLogLevel} from 'firebase/firestore';
import {preparedBankFixture} from '../../tests/prepared-bank-fixture.mjs';
import {arenaPeriod} from '../../functions/lib/arena-store.js';
import {startQuiz,submitQuiz,gradeQuiz,awardQuiz,readArena} from './quiz-client.mjs';
import {loadIdentityQuizRules} from './load-identity-rules.mjs';
const projectId='demo-test-arena-spark-prototype';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Isolated prototype emulators required');
setLogLevel('silent');
let env,db,other,third,teacher,outsider,records,packs,period,nextPeriod;
const base=s=>`teachers/qt/students/${s}`;
const path=(id,s='s1')=>`${base(s)}/quizzes/${id}`;
const ref=(d,p)=>doc(d,p);
const q=(pack,i)=>packs[pack][i].question.questionId;
const key=(pack,i)=>packs[pack][i].answer.correctOptionId;
const wrong=(pack,i)=>packs[pack][i].question.choices.find(c=>c.choiceId!==key(pack,i)).choiceId;
async function seed(p,data){await env.withSecurityRulesDisabled(c=>setDoc(ref(c.firestore(),p),data));}
async function totals(s='s1',w=period.weekKey){
  const total=(await getDoc(ref(teacher,`${base(s)}/learning/summary`))).data();
  const week=(await getDoc(ref(teacher,`${base(s)}/academicWeeks/${w}`))).data();
  const row=(await getDoc(ref(teacher,`teachers/qt/classes/c1/leaderboard/${s}`))).data();
  return {total:total.totalXP,academic:total.academicXP,weekly:week?.academicXP||0,row};
}
async function finish(d,s,id,pack,correct=10,blank=0){
  await startQuiz(d,'qt',s,id,pack);
  for(let i=0;i<10;i++){
    const selected=i<correct?key(pack,i):i>=10-blank?'':wrong(pack,i);
    await submitQuiz(d,'qt',s,id,q(pack,i),selected);
    await gradeQuiz(d,'qt',s,id,q(pack,i));
  }
}
async function collect(d,s,id,pack,w=period.weekKey,displayWeekKey=w){let earned=0;for(let i=0;i<10;i++){
  const result=(await getDoc(ref(d,`${path(id,s)}/results/${q(pack,i)}`))).data();
  if(result.isCorrect)earned+=await awardQuiz(d,'qt',s,id,q(pack,i),w,displayWeekKey);
}return earned;}
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8180,rules:await loadIdentityQuizRules()}});
  await env.clearFirestore();
  // Trusted identity contexts model existing custom-token login. No unsafe new
  // login substitute is introduced and no token service is claimed implemented.
  db=env.authenticatedContext('qs1',{firebase:{sign_in_provider:'custom'}}).firestore();
  other=env.authenticatedContext('qs2',{firebase:{sign_in_provider:'custom'}}).firestore();
  third=env.authenticatedContext('qs3',{firebase:{sign_in_provider:'custom'}}).firestore();
  teacher=env.authenticatedContext('qt',{firebase:{sign_in_provider:'password'}}).firestore();
  outsider=env.authenticatedContext('foreign-teacher',{firebase:{sign_in_provider:'password'}}).firestore();
  for(const t of ['qt','foreign-teacher'])await seed(`roles/${t}`,{role:'teacher'});
  for(const [s,uid]of [['s1','qs1'],['s2','qs2'],['s3','qs3']]){
    await seed(`roles/${uid}`,{role:'student'});
    await seed(`studentBindings/${uid}`,{teacherUid:'qt',studentId:s,version:1});
    await seed(base(s),{studentId:s,teacherUid:'qt',classId:'c1',gradeLevel:2,status:'active',credentialVersion:1});
    await seed(`${base(s)}/learning/summary`,{totalXP:0,academicXP:0,lastAwardQuestionId:''});
    await seed(`teachers/qt/classes/c1/leaderboard/${s}`,{studentId:s,classId:'c1',academicXP:0,weeklyAcademicXP:0,weekKey:'',lastAwardQuestionId:''});
  }
  records=preparedBankFixture('matematik',2,40).prepared.records.slice(0,40);
  packs={A:records.slice(0,10),B:records.slice(10,20),C:records.slice(20,30),D:records.slice(30,40)};
  for(const [pack,list]of Object.entries(packs)){
    await seed(`quizTemplates/${pack}`,{gradeLevel:2,questionIds:list.map(r=>r.question.questionId)});
    for(const r of list){
      await seed(`questions/${r.question.questionId}`,{...r.question,choiceIds:r.question.choices.map(c=>c.choiceId)});
      await seed(`privateQuestionAnswers/${r.question.questionId}`,r.answer);
      await seed(`privateQuizKeys/${pack}/answers/${r.question.questionId}`,r.answer);
    }
  }
  period=arenaPeriod();nextPeriod=arenaPeriod(new Date(period.endsAt+1));
  for(const p of [period,nextPeriod])await seed(`arenaWeeks/${p.weekKey}`,{startsAt:Timestamp.fromMillis(p.startsAt),endsAt:Timestamp.fromMillis(p.endsAt)});
});
after(async()=>{await env?.cleanup();});

test('10 real imported questions create answer-free immutable quiz template/session',async()=>{
  const tpl=(await getDoc(ref(db,'quizTemplates/A'))).data();assert.equal(tpl.questionIds.length,10);assert.equal(new Set(tpl.questionIds).size,10);
  for(const id of tpl.questionIds){const publicData=(await getDoc(ref(db,`questions/${id}`))).data();for(const f of ['correctOptionId','correctChoiceId','explanation'])assert(!(f in publicData));}
  const session=await startQuiz(db,'qt','s1','main','A');assert.equal(session.status,'active');assert.equal(session.resolved,0);
  await assertFails(updateDoc(ref(db,path('main')),{templateId:'B'}));
});
test('private answers/template keys unreadable; result probes fail before committed answer',async()=>{
  for(const d of [db,other,teacher,outsider])for(const p of [`privateQuestionAnswers/${q('A',0)}`,`privateQuizKeys/A/answers/${q('A',0)}`])await assertFails(getDoc(ref(d,p)));
  await assertFails(getDocs(collection(db,'privateQuestionAnswers')));
  await assertFails(setDoc(ref(db,`${path('main')}/results/${q('A',0)}`),{isCorrect:true,skipped:false,gradedAt:serverTimestamp()}));
});
test('cannot forge completion, result counters, template IDs or question outside template',async()=>{
  await assertFails(updateDoc(ref(db,path('main')),{resolved:10,correct:10,status:'completed',completedAt:serverTimestamp()}));
  await assertFails(submitQuiz(db,'qt','s1','main',q('B',0),key('B',0)));
  await assertFails(setDoc(ref(db,'quizTemplates/fake'),{gradeLevel:2,questionIds:Array(10).fill(q('A',0))}));
});
test('forged correct result/skip flags and same-batch pre-answer grading are denied',async()=>{
  await startQuiz(db,'qt','s1','forged','A');
  await submitQuiz(db,'qt','s1','forged',q('A',0),wrong('A',0));
  for(const [isCorrect,skipped]of [[true,false],[false,true]]){
    const batch=writeBatch(db);
    batch.set(ref(db,`${path('forged')}/results/${q('A',0)}`),{isCorrect,skipped,gradedAt:serverTimestamp()});
    batch.update(ref(db,path('forged')),{resolved:1,correct:Number(isCorrect),wrong:Number(!isCorrect&&!skipped),blank:Number(skipped),lastQuestionId:q('A',0),status:'active',completedAt:null});
    await assertFails(batch.commit());
  }
  const batch=writeBatch(db);
  batch.set(ref(db,`${path('forged')}/submissions/${q('A',1)}`),{selectedChoiceId:key('A',1),submittedAt:serverTimestamp()});
  batch.set(ref(db,`${path('forged')}/results/${q('A',1)}`),{isCorrect:true,skipped:false,gradedAt:serverTimestamp()});
  batch.update(ref(db,path('forged')),{resolved:1,correct:1,wrong:0,blank:0,lastQuestionId:q('A',1),status:'active',completedAt:null});
  await assertFails(batch.commit());assert.equal((await getDoc(ref(db,path('forged')))).data().resolved,0);
});
test('correct/incorrect/blank grading and no award before tenth resolved question',async()=>{
  for(let i=0;i<9;i++){
    await submitQuiz(db,'qt','s1','main',q('A',i),i<6?key('A',i):wrong('A',i));
    const result=await gradeQuiz(db,'qt','s1','main',q('A',i));assert.equal(result.isCorrect,i<6);
  }
  assert.equal((await getDoc(ref(db,path('main')))).data().resolved,9);
  await assert.rejects(awardQuiz(db,'qt','s1','main',q('A',0),period.weekKey),/Award denied/);
  assert.equal((await totals()).total,0);
  await submitQuiz(db,'qt','s1','main',q('A',9),'');await gradeQuiz(db,'qt','s1','main',q('A',9));
  const data=(await getDoc(ref(db,path('main')))).data();assert.deepEqual([data.resolved,data.correct,data.wrong,data.blank,data.status],[10,6,3,1,'completed']);
});
test('wrong/blank awards rejected; completed quiz awards 6 with consistent total/week/Arena',async()=>{
  for(const i of [6,9])await assert.rejects(awardQuiz(db,'qt','s1','main',q('A',i),period.weekKey),/Award denied/);
  assert.equal(await collect(db,'s1','main','A'),6);
  const t=await totals();assert.deepEqual([t.total,t.academic,t.weekly,t.row.academicXP,t.row.weeklyAcademicXP],[6,6,6,6,6]);
});
test('synchronous tampering/partial writes and forged outcomes all fail closed',async()=>{
  await assertFails(updateDoc(ref(db,`${base('s1')}/learning/summary`),{totalXP:999,academicXP:999}));
  await assertFails(updateDoc(ref(db,`${base('s1')}/academicWeeks/${period.weekKey}`),{academicXP:999}));
  await assertFails(updateDoc(ref(db,'teachers/qt/classes/c1/leaderboard/s1'),{weeklyAcademicXP:999}));
  await assertFails(updateDoc(ref(db,`${path('main')}/results/${q('A',6)}`),{isCorrect:true}));
  await assertFails(deleteDoc(ref(db,`${base('s1')}/awardedQuestions/${q('A',0)}`)));
  await assertFails(setDoc(ref(db,`${base('s1')}/awardedQuestions/${q('A',6)}`),{testSessionId:'main',weekKey:period.weekKey,xp:1,awardedAt:serverTimestamp()}));
});
test('retake rewards only four newly correct questions; repeated completed quiz awards zero',async()=>{
  await finish(db,'s1','retake','A');assert.equal(await collect(db,'s1','retake','A'),4);
  assert.equal(await collect(db,'s1','retake','A'),0);assert.equal((await totals()).total,10);
});
test('other student completes 8-correct quiz and overall/weekly ranking is accurate',async()=>{
  await finish(other,'s2','student-two','A',8);assert.equal(await collect(other,'s2','student-two','A'),8);
  const arena=await readArena(db,'qt','c1',period.weekKey);
  assert.deepEqual(arena.overall.map(r=>[r.studentId,r.academicXP,r.rank]),[['s1',10,1],['s2',8,2],['s3',0,3]]);
  assert.deepEqual(arena.weekly.map(r=>[r.studentId,r.weeklyAcademicXP,r.rank]),[['s1',10,1],['s2',8,2],['s3',0,3]]);
});
test('cross-student/cross-teacher session, XP, Arena and key mutation denied',async()=>{
  for(const d of [other,outsider]){
    await assertFails(getDoc(ref(d,path('main'))));
    await assertFails(updateDoc(ref(d,`${base('s1')}/learning/summary`),{totalXP:50,academicXP:50}));
    await assertFails(submitQuiz(d,'qt','s1','retake',q('A',0),key('A',0)));
    await assertFails(updateDoc(ref(d,'teachers/qt/classes/c1/leaderboard/s1'),{academicXP:50}));
  }
  await assertFails(getDocs(collection(db,'teachers/foreign-teacher/classes/c1/leaderboard')));
  await assertFails(updateDoc(ref(teacher,`${base('s1')}/learning/summary`),{totalXP:50,academicXP:50}));
});
test('concurrent result commits, same-question awards and different-question awards remain consistent',async()=>{
  await startQuiz(db,'qt','s1','concurrent','B');
  for(let i=0;i<10;i++)await submitQuiz(db,'qt','s1','concurrent',q('B',i),key('B',i));
  await Promise.all([gradeQuiz(db,'qt','s1','concurrent',q('B',0)),gradeQuiz(db,'qt','s1','concurrent',q('B',1))]);
  for(let i=2;i<10;i++)await gradeQuiz(db,'qt','s1','concurrent',q('B',i));
  assert.equal((await getDoc(ref(db,path('concurrent')))).data().correct,10);
  const same=await Promise.all([awardQuiz(db,'qt','s1','concurrent',q('B',0),period.weekKey),awardQuiz(db,'qt','s1','concurrent',q('B',0),period.weekKey)]);assert.equal(same.reduce((a,b)=>a+b),1);
  const different=await Promise.all([awardQuiz(db,'qt','s1','concurrent',q('B',1),period.weekKey),awardQuiz(db,'qt','s1','concurrent',q('B',2),period.weekKey)]);assert.equal(different.reduce((a,b)=>a+b),2);
  assert.equal(await collect(db,'s1','concurrent','B'),7);assert.equal((await totals()).total,20);assert.equal((await totals()).weekly,20);
});
test('offline final submission cannot grant XP; reconnect resumes quiz safely',async()=>{
  await startQuiz(third,'qt','s3','offline','A');
  for(let i=0;i<9;i++){await submitQuiz(third,'qt','s3','offline',q('A',i),key('A',i));await gradeQuiz(third,'qt','s3','offline',q('A',i));}
  await disableNetwork(third);
  let confirmed=false;const pending=submitQuiz(third,'qt','s3','offline',q('A',9),key('A',9)).then(()=>{confirmed=true;});
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(confirmed,false);
  await assert.rejects(awardQuiz(third,'qt','s3','offline',q('A',0),period.weekKey));
  assert.equal((await totals('s3')).total,0);
  await enableNetwork(third);await pending;await gradeQuiz(third,'qt','s3','offline',q('A',9));
  assert.equal(await collect(third,'s3','offline','A'),10);assert.equal((await totals('s3')).weekly,10);
});
test('lost client acknowledgement and interruption after some awards resume without duplicate XP',async()=>{
  await finish(other,'s2','ack-lost','B',1);
  await assert.rejects((async()=>{await awardQuiz(other,'qt','s2','ack-lost',q('B',0),period.weekKey);throw Error('Injected acknowledgement loss after commit');})(),/acknowledgement loss/);
  assert.equal(await awardQuiz(other,'qt','s2','ack-lost',q('B',0),period.weekKey),0);
  assert.equal((await totals('s2')).total,9);
  // s1 already owns part/all of the interrupted completed quiz; retry cannot
  // alter the immutable per-question receipts or inflate the summaries.
  assert.equal(await collect(db,'s1','concurrent','B'),0);
});
test('completed old-week quizzes can remain unclaimed but cannot inflate next-week credit',async()=>{
  await finish(db,'s1','late-old','D',3);
  await finish(other,'s2','delayed','C');
  assert.equal((await totals()).total,20);assert.equal((await totals('s2')).total,9);
});
test('client cannot use future week or rewrite trusted calendar',async()=>{
  await finish(db,'s1','next-week','C');
  await assert.rejects(awardQuiz(db,'qt','s1','next-week',q('C',0),nextPeriod.weekKey),/Award denied/);
  await assertFails(updateDoc(ref(db,`arenaWeeks/${nextPeriod.weekKey}`),{startsAt:Timestamp.fromMillis(0)}));
  assert.equal((await totals()).total,20);
});
test('simulated week boundary preserves prior bucket, deduplication and resets displayed weekly ranks',async()=>{
  // Only trusted fixture dates change; server request.time is never client-set.
  const boundary=(await getDoc(ref(db,path('next-week')))).data().startedAt.toMillis()-1;
  await seed(`arenaWeeks/${period.weekKey}`,{startsAt:Timestamp.fromMillis(period.startsAt),endsAt:Timestamp.fromMillis(boundary)});
  await seed(`arenaWeeks/${nextPeriod.weekKey}`,{startsAt:Timestamp.fromMillis(boundary),endsAt:Timestamp.fromMillis(nextPeriod.endsAt)});
  await assert.rejects(awardQuiz(db,'qt','s1','next-week',q('C',0),period.weekKey),/Award denied/);
  assert.equal(await collect(db,'s1','retake','A',nextPeriod.weekKey),0);
  assert.equal(await collect(db,'s1','next-week','C',nextPeriod.weekKey),10);
  // Completed before the boundary: cannot relabel credit to this week.
  await assert.rejects(awardQuiz(other,'qt','s2','delayed',q('C',0),nextPeriod.weekKey),/Award denied/);
  assert.equal(await collect(other,'s2','delayed','C',period.weekKey,nextPeriod.weekKey),10);
  // A late historical award must not erase s1's current-week projection.
  assert.equal(await collect(db,'s1','late-old','D',period.weekKey,nextPeriod.weekKey),3);
  const previous=await totals(),current=await totals('s1',nextPeriod.weekKey);
  assert.equal(previous.weekly,23);assert.deepEqual([current.total,current.academic,current.weekly,current.row.academicXP,current.row.weeklyAcademicXP],[33,33,10,33,10]);
  const arena=await readArena(db,'qt','c1',nextPeriod.weekKey);
  assert.deepEqual(arena.weekly.map(r=>[r.studentId,r.weeklyAcademicXP,r.rank]),[['s1',10,1],['s2',0,2],['s3',0,2]]);
  assert.deepEqual(arena.overall.map(r=>[r.studentId,r.academicXP,r.rank]),[['s1',33,1],['s2',19,2],['s3',10,3]]);
});
test('award ledger sum equals all total/weekly/Arena values after all scenarios',async()=>{
  for(const s of ['s1','s2','s3']){
    const awards=await getDocs(collection(teacher,`${base(s)}/awardedQuestions`));const t=await totals(s,nextPeriod.weekKey);
    assert.equal(awards.docs.reduce((n,d)=>n+d.data().xp,0),t.total);
    assert.equal(awards.docs.filter(d=>d.data().weekKey===nextPeriod.weekKey).reduce((n,d)=>n+d.data().xp,0),t.weekly);
    assert.equal(t.row.academicXP,t.total);
    assert.equal(t.row.weekKey===nextPeriod.weekKey?t.row.weeklyAcademicXP:0,t.weekly);
  }
});
