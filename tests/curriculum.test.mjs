import { createHmac } from 'node:crypto';
import { testPacks } from '../functions/lib/test-packs.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { seedCurriculum } from '../scripts/seed-curriculum.mjs';
import { seedDemo } from '../scripts/seed-demo.mjs';
import { loadCurriculumBank } from '../scripts/curriculum-bank.mjs';
import { teacherClient, client, loginStudent, clearLimiter, projectId } from './helpers.mjs';
import { disposeFixture } from './classroom-fixture.mjs';

const bank = loadCurriculumBank(), clients = [], codes = [];
let owner, other, fixture, classId, admin;
before(async () => {
  await seedCurriculum();await seedDemo();admin=getFirestore(getApps().find(a=>a.name==='curriculum-seed'));
  owner=await teacherClient({fixtures:false});other=await teacherClient({fixtures:false});fixture=await teacherClient();
  classId=(await owner.call('createClass',{className:'DOSTLAR',defaultGradeLevel:2})).classId;
});
beforeEach(clearLimiter);
after(async () => {await Promise.all(clients.map(c=>c.close()));for(const c of [owner,other,fixture])await disposeFixture(c);for(const code of codes)await admin.doc('studentCodeIndex/'+createHmac('sha256','test-arena-local-only-hmac-not-for-production').update(code).digest('hex')).delete();await Promise.all(getApps().map(deleteApp));});
async function pupil(gradeLevel=2,teacher=owner) {
  const cls=teacher===owner?classId:(await teacher.call('createClass',{className:'TEST',defaultGradeLevel:gradeLevel})).classId;
  const s=await teacher.call('createStudent',{classId:cls,firstName:'Gerçek',lastName:'Müfredat',gradeLevel});
  codes.push(s.code);const c=client();clients.push(c);await loginStudent(c,s.code);
  return {...s,c,cls,teacher,path:['teachers',teacher.auth.currentUser.uid,'students',s.studentId]};
}
const record=id=>bank.records.find(r=>r.question.questionId===id);
test('unit-1 visual source imports all 50 unique questions into five canonical 10-question Test 1 packs', () => {
  const math = bank.curricula[0].subjects.find(s=>s.id==='matematik'), unit = math.units[0];
  assert.equal(unit.displayName, '1. ÜNİTE — Nesnelerin Geometrisi');
  assert.equal(unit.topics.length,5);
  const imported=bank.records.filter(r=>r.question.questionId.startsWith('g2-mat-u1-v3-'));
  assert.equal(imported.length,50);
  for(const [i,topic] of unit.topics.entries()) {
    assert.equal(topic.questionIds.length,10);
    const packs=testPacks(topic.questionIds);
    assert.equal(packs.length,1);assert.equal(packs[0].name,'Test 1');assert.equal(packs[0].questionIds.length,10);
    for(const id of topic.questionIds) {
      const r=record(id);assert.equal(r.question.unitId,unit.id);assert.equal(r.question.topicId,topic.id);
      assert.equal(r.answer.outcomeCode,`MAT.2.3.${i+1}`);assert.equal(r.question.choices.length,3);
    }
  }
  assert.ok(imported.some(r=>r.question.choices.some(c=>c.visual?.kind==='container')));
  assert.ok(imported.some(r=>r.question.choices.some(c=>c.visual?.kind==='geometry')));
  assert.ok(imported.some(r=>r.question.choices.every(c=>!c.visual)));
  assert.equal(bank.records.filter(r=>/^g2-mat-000[1-5]$/.test(r.question.questionId)).length,5);
});
const single=(p,r,count=1)=>p.c.call('startTest',{grade:2,subjectId:r.question.subject,unitId:r.question.unitId,topicId:r.question.topic,packId:'pack-1',...(count===1?{}:{questionCount:count})});
const answer=(p,t,q,correct=true)=>p.c.call('submitAnswer',{testSessionId:t.testSessionId,questionId:q.questionId,selectedChoiceId:correct?record(q.questionId).answer.correctOptionId:q.choices.find(c=>c.choiceId!==record(q.questionId).answer.correctOptionId).choiceId});

test('source adapter preserves 20 pilot + 50 unit-1 + 60 unit-2 IDs, exact options/texts, four subjects and canonical mappings', () => {
  assert.equal(bank.records.length,130);assert.equal(bank.curricula[0].navigationVersion,3);assert.equal(bank.curricula[0].subjects[0].units.length,8);assert.ok(bank.curricula[0].subjects[0].units.every(u=>u.topics.length===0));assert.equal(new Set(bank.records.map(r=>r.question.questionId)).size,130);
  assert.deepEqual(bank.curricula[0].subjects.map(s=>s.id),['turkce','matematik','hayat-bilgisi','ingilizce']);
  assert.equal(bank.records.filter(r=>r.answer.outcomeMappingStatus==='exact').length,125);
  for(const r of bank.records){assert.equal(r.question.grade,2);assert.equal(r.question.subject,r.question.subjectId);assert.equal(r.question.topic,r.question.topicId);assert.ok(r.question.choices.some(c=>c.choiceId===r.answer.correctOptionId));}
  for(const r of bank.records.filter(r=>r.question.subject==='ingilizce')){assert.equal(r.answer.outcomeMappingStatus,'theme-level-only');assert.equal('outcomeCode' in r.answer,false);assert.ok(r.answer.candidateOutcomeCodes.length);}
});
test('real import is immutable/idempotent: 130 questions and no replacements', async()=>{assert.equal((await seedCurriculum()).createdDocuments,0);for(const r of bank.records){assert.deepEqual((await admin.doc('questions/'+r.question.questionId).get()).data(),r.question);assert.deepEqual((await admin.doc('privateQuestionAnswers/'+r.question.questionId).get()).data(),r.answer);}});
test('normal catalog is JSON-driven full curriculum, no demo categories/answer/outcome data',async()=>{
  const p=await pupil(),catalog=await p.c.call('quizCatalog',{});assert.equal(catalog.fixture,false);assert.deepEqual(catalog.entries,[]);assert.deepEqual(catalog.allowedGrades,[2]);
  const tree=catalog.curricula[0];assert.equal(tree.subjects.length,4);
  for(const s of tree.subjects){assert.equal(s.count,s.id==='turkce'?0:s.id==='matematik'?111:5);assert.deepEqual(s.units.map(u=>[u.id,u.displayName,u.topics.map(t=>[t.id,t.name])]),bank.curricula[0].subjects.find(x=>x.id===s.id).units.map(u=>[u.id,u.displayName,u.topics.map(t=>[t.id,t.name])]));}
  assert.equal(JSON.stringify(catalog).includes('outcomeCode'),false);assert.equal(JSON.stringify(catalog).includes('correctOptionId'),false);assert.equal(JSON.stringify(catalog).includes('demo_'),false);
});
test('normal grade 3 sees grade 2 only as previous content; grade 4/6 cannot see it or demo content',async()=>{
  for(const grade of [3,4,6]){const p=await pupil(grade),c=await p.c.call('quizCatalog',{});assert.deepEqual(c.allowedGrades,[grade-1,grade]);assert.deepEqual(c.curricula.map(c=>c.grade),grade===3?[2]:[]);assert.deepEqual(c.entries,[]);if(grade>3)await assert.rejects(single(p,record('g2-mat-0001')));}
});
test('topic filtering checks grade, subject, unit and topic; small/empty pools never duplicate IDs',async()=>{
  const p=await pupil(),r=record('g2-hb-0001'),t=await single(p,r);assert.deepEqual(t.questions.map(q=>q.questionId),['g2-hb-0001']);assert.equal(t.questionCount,1);
  const good={grade:2,subjectId:r.question.subject,unitId:r.question.unitId,topicId:r.question.topic,packId:'pack-1'};
  for(const change of [{grade:1},{grade:3},{unitId:'g2-matematik-sayilar-ve-nicelikler-2'},{subjectId:'turkce'},{questionCount:2},{questionCount:10},{questionCount:0},{questionCount:51},{questionCount:1.5},{topicId:'g2-matematik-sayi-ve-sekil-oruntuleri'}])await assert.rejects(p.c.call('startTest',{...good,...change}));
  await assert.rejects(p.c.call('startTest',{gradeLevel:6,subject:'matematik',topic:'kesirler',questionCount:10}));
});
test('121 mapped questions reachable by packages; five Turkish questions remain unmapped; analytics stay canonical',async()=>{
  const p=await pupil(),seen=new Set();
  assert.deepEqual(bank.unmapped.map(x=>x.questionId),['g2-tr-0001','g2-tr-0002','g2-tr-0003','g2-tr-0004','g2-tr-0005','g2-mat-0001','g2-mat-0002','g2-mat-0003','g2-mat-0004']);
  for(const s of bank.curricula[0].subjects) for(const u of s.units) for(const topic of u.topics) {
    if (!topic.questionIds.length) continue;
    let t=await p.c.call('startTest',{grade:2,subjectId:s.id,unitId:u.id,topicId:topic.id,packId:'pack-1'});
    assert.equal(t.packName,'Test 1');assert.equal(t.topic,topic.id);assert.equal(t.unitId,u.id);assert.equal(t.unitName,u.displayName);
    assert.equal(JSON.stringify(t).includes('correctChoiceId'),false);assert.equal(JSON.stringify(t).includes('outcomeCode'),false);
    for(const q of t.questions){assert.equal(q.subjectId,s.id);assert.equal(q.unitId,u.id);assert.equal(q.topicId,topic.id);seen.add(q.questionId);
      const a=await answer(p,t,q);assert.equal(a.answer.earnedXP,1);
      const stored=(await getDoc(doc(p.c.db,...p.path,'testSessions',t.testSessionId,'answers',q.questionId))).data();
      assert.equal(stored.grade,2);assert.equal(stored.subjectId,s.id);assert.equal(stored.unitId,record(q.questionId).question.unitId);assert.equal(stored.topicId,record(q.questionId).question.topic);
      assert.equal(stored.questionId,q.questionId);assert.equal(stored.topicId.startsWith('pack-'),false);
      if(s.id==='ingilizce'){assert.equal('outcomeCode' in stored,false);}else assert.equal(stored.outcomeCode,record(q.questionId).answer.outcomeCode);
      t=a.test;
    }
  }
  assert.equal(seen.size,121);const report=await owner.call('teacherAnalytics',{studentId:p.studentId});assert.deepEqual(report.totals.overall,{solved:121,correct:121,wrong:0});assert.equal(report.totals.academicXP,121);
  for(const kind of ['subject','unit','topic'])assert.equal(report.dimensions.filter(d=>d.kind===kind).reduce((n,d)=>n+d.overall.solved,0),121);
  assert.equal(report.dimensions.some(d=>d.topic?.startsWith('pack-')||d.topic==='mixed'),false);
  await admin.doc(p.path.join('/')+'/analytics/summary').delete();const rebuilt=await owner.call('teacherAnalytics',{studentId:p.studentId});assert.deepEqual(rebuilt.dimensions.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),report.dimensions.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
});

test('v2 refuses mixed tests, old Turkish skill topics, empty themes and forged packages',async()=>{
  const p=await pupil();await assert.rejects(single(p,bank.records[0]));
  await assert.rejects(p.c.call('startTest',{grade:2,subjectId:'matematik',mode:'mixed',questionCount:5}));
  await assert.rejects(p.c.call('startTest',{grade:2,subjectId:'turkce',unitId:'g2-turkce-degerlerimizle-variz',packId:'pack-1'}));
  const r=record('g2-mat-0001');await assert.rejects(p.c.call('startTest',{grade:2,subjectId:'matematik',unitId:r.question.unitId,topicId:r.question.topic,packId:'pack-2'}));
});

test('correctOptionId, first wrong/next correct, concurrent retries and permanent XP dedupe remain server-authoritative',async()=>{
  const p=await pupil(),r=record('g2-en-0004');let t=await single(p,r),q=t.questions[0];const wrong=await answer(p,t,q,false);assert.equal(wrong.answer.earnedXP,0);assert.equal(wrong.answer.isCorrect,false);assert.equal((await answer(p,t,q)).answer.isCorrect,false);
  t=await single(p,r);q=t.questions[0];const retries=await Promise.all(Array.from({length:4},()=>answer(p,t,q)));assert.ok(retries.every(a=>a.answer.earnedXP===1));assert.equal(retries[0].totalXP,1);
  t=await single(p,r);const repeated=await answer(p,t,t.questions[0]);assert.equal(repeated.answer.isCorrect,true);assert.equal(repeated.answer.earnedXP,0);assert.equal(repeated.totalXP,1);
  const report=await owner.call('teacherAnalytics',{studentId:p.studentId}),s=report.students.find(s=>s.studentId===p.studentId);assert.deepEqual(s.overall,{solved:3,correct:2,wrong:1});assert.equal(s.academicXP,1);assert.equal((await getDocs(collection(p.c.db,...p.path,'awardedQuestions'))).size,1);
});
test('isolation, private keys, XP writes and fixture opt-in remain protected; rotation/removal invalidate real tests',async()=>{
  const p=await pupil(),foreign=await pupil(),t=await single(p,record('g2-mat-u1-v3-001')),q=t.questions[0];
  await assert.rejects(foreign.c.call('getTestSession',{testSessionId:t.testSessionId}));await assert.rejects(other.call('teacherAnalytics',{classId}));await assert.rejects(getDoc(doc(other.db,...p.path,'testSessions',t.testSessionId)));
  for(const c of [p.c,owner,other])for(const path of [['privateQuestionAnswers',q.questionId],['curricula','2'],['privateTestKeys',t.testSessionId]]){await assert.rejects(getDoc(doc(c.db,...path)));await assert.rejects(setDoc(doc(c.db,...path),{forged:true}));}
  for(const c of [p.c,owner]){await assert.rejects(setDoc(doc(c.db,'teachers',owner.auth.currentUser.uid),{testFixtureBank:true}));await assert.rejects(setDoc(doc(c.db,...p.path,'learning','summary'),{academicXP:999}));}
  await answer(p,t,q);const rotated=await owner.call('rotateStudentCode',{studentId:p.studentId});codes.push(rotated.code);await assert.rejects(p.c.call('getTestSession',{testSessionId:t.testSessionId}));await loginStudent(p.c,rotated.code);assert.equal((await p.c.call('getTestSession',{testSessionId:t.testSessionId})).earnedXP,1);
  await owner.call('removeStudent',{studentId:p.studentId});await assert.rejects(p.c.call('quizCatalog',{}));await assert.rejects(answer(p,t,q));
});
test('emulator-only regression fixture bank is separate from real content and cannot mix existing demo XP',async()=>{
  const p=await pupil(6,fixture),catalog=await p.c.call('quizCatalog',{});assert.equal(catalog.fixture,true);assert.equal(catalog.entries.length,3);assert.deepEqual(catalog.curricula,[]);
  const t=await p.c.call('startTest',{gradeLevel:6,subject:'matematik',topic:'kesirler',questionCount:10});assert.ok(t.questions.every(q=>q.questionId.startsWith('demo_')));await assert.rejects(single(p,record('g2-mat-0001')));
  await admin.doc('teachers/'+fixture.auth.currentUser.uid).update({testFixtureBank:false});await fixture.call('updateStudent',{studentId:p.studentId,classId:p.cls,gradeLevel:2});
  await assert.rejects(p.c.call('getTestSession',{testSessionId:t.testSessionId}));await assert.rejects(single(p,record('g2-mat-0001')),/demo geçmişine/);
});

test('package partition covers a larger scope once, with stable names, no duplicated IDs and no fabricated topics',()=>{
  const ids=Array.from({length:23},(_,i)=>'scope-question-'+String(i+1).padStart(2,'0'));
  const packs=testPacks([...ids].reverse());assert.deepEqual(packs.map(p=>[p.name,p.questionIds.length]),[['Test 1',10],['Test 2',10],['Test 3',3]]);
  assert.deepEqual(packs.flatMap(p=>p.questionIds),ids);assert.deepEqual(testPacks([...ids,ids[0]]),packs);assert.deepEqual(testPacks([]),[]);
  assert.ok(packs.every(p=>!('topicId' in p)&&!('outcomeCode' in p)));
});
