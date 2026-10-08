import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getApps,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';
import {seedCurriculum} from '../scripts/seed-curriculum.mjs';
import {loadCurriculumBank} from '../scripts/curriculum-bank.mjs';
import {teacherClient,client,loginStudent,clearLimiter} from './helpers.mjs';
import {disposeFixture} from './classroom-fixture.mjs';
import {resolveCurriculumContext} from '../functions/lib/question-engine/curriculum.js';
import {BaseTenFixtureProvider,baseTenValidator} from '../functions/lib/question-engine/fixtures/base-ten.js';
import {ValidatorRegistry} from '../functions/lib/question-engine/registry.js';
import {VerifierRegistry,VerificationRouter} from '../functions/lib/question-engine/verification.js';
import {dryRun,validateCandidate,validateCandidateWithRouter} from '../functions/lib/question-engine/pipeline.js';
import {geminiDryRunProfiles} from '../functions/lib/question-engine/providers/gemini-profiles.js';
import {EmulatorQuestionPublisher} from '../functions/lib/question-engine/publication.js';

const canonical=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif.json',import.meta.url)));
const nav=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
const [math,life]=geminiDryRunProfiles;
const mathContext=resolveCurriculumContext(canonical,nav,math.scope),lifeContext=resolveCurriculumContext(canonical,nav,life.scope);
const registry=new ValidatorRegistry().register(baseTenValidator([mathContext]));
const created=new Set(),clients=[];let admin,publisher,teacher,other,cls,samples,initialMathCount,initialLifeCount,lifeQuestionId,lifeAdded=0;
before(async()=>{
  await seedCurriculum();admin=getFirestore(getApps().find(a=>a.name==='curriculum-seed'));publisher=new EmulatorQuestionPublisher();
  const existing=(await admin.collection('questions').where('source','==','ai_verified').get()).docs.map(d=>d.data());
  const inScope=(q,p)=>q.gradeLevel===2&&q.subject===p.scope.subjectId&&q.unitId===p.scope.unitId&&q.topic===p.scope.topicId&&q.status==='published'&&!q.isDemo;
  initialMathCount=existing.filter(q=>inScope(q,math)).length;initialLifeCount=existing.filter(q=>inScope(q,life)).length;
  // Choose unused models; tests must not overwrite/delete a user's local pool.
  samples=Array.from({length:90},(_,i)=>({tens:1+Math.floor(i/10),ones:i%10}))
    .filter(m=>!existing.some(q=>inScope(q,math)&&q.visual?.tens===m.tens&&q.visual?.ones===m.ones)).slice(0,3);
  assert.equal(samples.length,3,'Three unused local fixture models required');
  teacher=await teacherClient({fixtures:false});other=await teacherClient({fixtures:false});
  cls=await teacher.call('createClass',{className:'POOL TEST',defaultGradeLevel:2});
});
beforeEach(clearLimiter);
after(async()=>{
  await Promise.all(clients.map(c=>c.close()));
  for(const c of [teacher,other])if(c)await disposeFixture(c);
  for(const id of created) {
    const q=await admin.doc('questions/'+id).get(),f=q.data()?.provenance.fingerprint;
    if(f)await Promise.all(['content','structural'].map(k=>admin.doc('questionFingerprints/'+k+'_'+f[k]).delete()));
    await Promise.all([admin.doc('questions/'+id).delete(),admin.doc('privateQuestionAnswers/'+id).delete()]);
  }
  if(publisher)await publisher.close();await Promise.all(getApps().map(deleteApp));
});
async function mathResult(tens,ones) {
  const c=(await new BaseTenFixtureProvider([{tens,ones}]).generateQuestions(mathContext,{count:1}))[0];
  return validateCandidate(mathContext,c,math.capability,registry);
}
async function publish(r) {const result=await publisher.publish(r);if(result.newlyPublished)created.add(result.questionId);return result;}
async function pupil() {
  const s=await teacher.call('createStudent',{classId:cls.classId,firstName:'Pool',lastName:'Test',gradeLevel:2});
  const c=client();clients.push(c);await loginStudent(c,s.code);return {...s,c};
}
const params=profile=>({grade:2,subjectId:profile.scope.subjectId,unitId:profile.scope.unitId,topicId:profile.scope.topicId,packId:'pack-1'});
const evidence=()=>({selectedOptionId:'a',justification:'Planlı davranmak görevleri zamanında bitirmeyi sağlar.',hasSingleCorrectAnswer:true,
  curriculumAligned:true,gradeAppropriate:true,factuallySound:true,questionClear:true,visualConsistent:true,confidence:0.97,issues:[]});
function lifeCandidate() {
  return {candidateId:'fixture-life-pool',scope:{...lifeContext},type:'multiple-choice',difficulty:'easy',
    question:'Ödevini ve oyun saatini planlayan bir öğrenci hangi yararı görür?',
    options:[{id:'a',text:'Görevlerini zamanında bitirir'},{id:'b',text:'Ödevlerini daha çok unutur'},{id:'c',text:'İşlerine sürekli gecikir'}],
    correctOptionId:'a',explanation:'Plan yapmak zamanı düzenli kullanmaya yardımcı olur.',family:life.family,model:{}};
}
function lifeRouter(e=evidence()) {
  return new VerificationRouter(new ValidatorRegistry(),new VerifierRegistry().register({capability:life.capability,
    verifier:{id:'mock-independent-verifier',verify:async()=>e},contexts:[lifeContext],families:[life.family],gradePolicy:life.gradePolicy,visualKinds:[]}));
}

test('ACCEPT publishes existing question/private answer format and minimal server provenance',async()=>{
  const published=await publish(await mathResult(samples[0].tens,samples[0].ones)),q=(await admin.doc('questions/'+published.questionId).get()).data();
  assert.equal(published.newlyPublished,true);assert.match(published.questionId,/^qe_ai_[a-f0-9]{64}$/);
  assert.equal(q.source,'ai_verified');assert.equal(q.status,'published');assert.equal(q.isDemo,false);
  assert.equal(q.provenance.verificationMethod,'deterministic');assert.equal(q.provenance.curriculumVersion,canonical.schema_version);
  for(const field of ['correctOptionId','explanation','prompt','justification','candidateId','model'])assert.equal(field in q,false);
  const a=(await admin.doc('privateQuestionAnswers/'+published.questionId).get()).data();
  assert.equal(a.correctOptionId,'a');assert.equal(a.outcomeCode,'MAT.2.1.2');assert.equal(a.outcomeMappingStatus,'exact');
});

test('REJECT, copied/fake ACCEPT and candidate verified flag never create records',async()=>{
  const before=(await admin.collection('questions').where('source','==','ai_verified').get()).size;
  const r=await mathResult(2,8);await assert.rejects(()=>publisher.publish(structuredClone(r)),/RECEIPT/);
  await assert.rejects(()=>publisher.publish({decision:'ACCEPT',dryRun:true,fingerprints:r.fingerprints,solvedOptionId:'a'}),/RECEIPT/);
  const c=(await new BaseTenFixtureProvider().generateQuestions(mathContext,{count:1}))[0];c.verified=true;
  await assert.rejects(()=>publisher.publish(validateCandidate(mathContext,c,math.capability,registry)),/RECEIPT/);
  for(const change of [e=>e.confidence=0.1,e=>e.selectedOptionId='b',e=>e.curriculumAligned=false,e=>e.factuallySound=false]) {
    const e=evidence();change(e);const rejected=await validateCandidateWithRouter(lifeContext,lifeCandidate(),life.capability,lifeRouter(e));
    assert.equal(rejected.decision,'REJECT');await assert.rejects(()=>publisher.publish(rejected),/RECEIPT/);
  }
  const failure=await validateCandidateWithRouter(lifeContext,lifeCandidate(),life.capability,
    new VerificationRouter(new ValidatorRegistry(),new VerifierRegistry()));
  await assert.rejects(()=>publisher.publish(failure),/RECEIPT/);
  const providerFailure=(await dryRun(mathContext,{id:'mock-error',generateQuestions:async()=>{throw new Error('PROVIDER_ERROR');}},
    {count:1},math.capability,registry))[0];
  await assert.rejects(()=>publisher.publish(providerFailure),/RECEIPT/);
  const brokenVerifier=new VerifierRegistry().register({capability:life.capability,contexts:[lifeContext],families:[life.family],
    gradePolicy:life.gradePolicy,visualKinds:[],verifier:{id:'mock-timeout',verify:async()=>{throw new Error('TIMEOUT');}}});
  const verifierFailure=await validateCandidateWithRouter(lifeContext,lifeCandidate(),life.capability,
    new VerificationRouter(new ValidatorRegistry(),brokenVerifier));
  await assert.rejects(()=>publisher.publish(verifierFailure),/RECEIPT/);
  delete c.verified;c.visual.kind='unsupported';
  for(const raw of [c,{}])await assert.rejects(()=>publisher.publish(validateCandidate(mathContext,raw,math.capability,registry)),/RECEIPT/);
  assert.equal((await admin.collection('questions').where('source','==','ai_verified').get()).size,before);
});

test('repeat publication is idempotent with no document update; regeneration finds same fingerprints',async()=>{
  const r=await mathResult(samples[1].tens,samples[1].ones),first=await publish(r),ref=admin.doc('questions/'+first.questionId);
  const before=await ref.get();const second=await publish(r),third=await publish(await mathResult(samples[1].tens,samples[1].ones));
  assert.equal(second.questionId,first.questionId);assert.equal(third.questionId,first.questionId);
  assert.equal(second.newlyPublished,false);assert.equal(third.duplicate,true);
  assert.ok((await ref.get()).updateTime.isEqual(before.updateTime));
});

test('concurrent publication creates one question, one key and exactly two fingerprint entries',async()=>{
  const r=await mathResult(samples[2].tens,samples[2].ones),results=await Promise.all(Array.from({length:5},()=>publish(r)));
  assert.equal(results.filter(r=>r.newlyPublished).length,1);assert.equal(new Set(results.map(r=>r.questionId)).size,1);
  const id=results[0].questionId;
  assert.equal((await admin.collection('questionFingerprints').where('questionId','==',id).get()).size,2);
  assert.equal((await admin.doc('privateQuestionAnswers/'+id).get()).exists,true);
});

test('independent-AI ACCEPT publishes without verifier justification; structural duplicate skipped',async()=>{
  const c=lifeCandidate(),r=await validateCandidateWithRouter(lifeContext,c,life.capability,lifeRouter());
  const first=await publish(r),q=(await admin.doc('questions/'+first.questionId).get()).data();
  lifeAdded=Number(first.newlyPublished);lifeQuestionId=first.questionId;
  assert.equal(q.provenance.verificationMethod,'independent_ai');assert.equal(JSON.stringify(q).includes('justification'),false);
  c.question='Gününü planlayan öğrencinin elde ettiği yarar hangisidir?';
  const other=await validateCandidateWithRouter(lifeContext,c,life.capability,lifeRouter());
  const second=await publish(other);assert.equal(second.duplicate,true);assert.equal(second.questionId,first.questionId);
});

test('curated import stays unchanged and idempotent; AI persists without navigation migration',async()=>{
  const treeBefore=(await admin.doc('curricula/2').get()).data(),result=await seedCurriculum();
  assert.equal(result.createdDocuments,0);assert.equal(result.updatedNavigationDocuments,0);
  assert.deepEqual((await admin.doc('curricula/2').get()).data(),treeBefore);
  const bank=loadCurriculumBank(),refs=bank.records.flatMap(r=>[admin.doc('questions/'+r.question.questionId),admin.doc('privateQuestionAnswers/'+r.question.questionId)]);
  const records=await admin.getAll(...refs);
  bank.records.forEach((r,i)=>{assert.deepEqual(records[2*i].data(),r.question);assert.deepEqual(records[2*i+1].data(),r.answer);});
  assert.ok((await admin.collection('questions').where('source','==','ai_verified').get()).size>=4);
});

test('normal catalog/test builder merges curated + verified questions, keeps scopes and partial packs',async()=>{
  const p=await pupil(),catalog=await p.c.call('quizCatalog',{}),mathTree=catalog.curricula[0].subjects.find(s=>s.id==='matematik');
  const mathUnit=mathTree.units.find(u=>u.id===math.scope.unitId),mathTopic=mathUnit.topics.find(t=>t.id===math.scope.topicId);
  const mathCount=10+initialMathCount+3;
  assert.equal(mathTopic.count,mathCount);assert.deepEqual(mathTopic.packs.map(p=>p.count),Array.from({length:Math.ceil(mathCount/10)},(_,i)=>Math.min(10,mathCount-i*10)));
  const lifeTree=catalog.curricula[0].subjects.find(s=>s.id==='hayat-bilgisi'),lifeTopic=lifeTree.units.find(u=>u.id===life.scope.unitId).topics.find(t=>t.id===life.scope.topicId);
  const lifeCount=Math.min(10,1+initialLifeCount+lifeAdded);
  assert.equal(lifeTopic.count,1+initialLifeCount+lifeAdded);assert.equal(lifeTopic.packs[0].count,lifeCount);
  const t=await p.c.call('startTest',params(life));assert.equal(t.questionCount,lifeCount);assert.equal(new Set(t.questions.map(q=>q.questionId)).size,lifeCount);
  for(const q of t.questions){assert.equal(q.subject,'hayat-bilgisi');assert.equal(q.unitId,life.scope.unitId);assert.equal(q.topic,life.scope.topicId);}
  const mathPack=await p.c.call('startTest',params(math));assert.equal(mathPack.questionCount,10);
  assert.ok(mathPack.questions.every(q=>q.questionId.startsWith('g2-mat-u2-v1-')));
  for(const payload of [catalog,t,mathPack])for(const field of ['correctOptionId','correctChoiceId','explanation','provenance','fingerprint','outcomeCode'])
    assert.equal(JSON.stringify(payload).includes(field),false);
});

test('AI question uses unchanged submitAnswer: wrong=0, first correct=1, retry/re-solve=0',async()=>{
  const pool=await admin.collection('questions').where('subject','==',life.scope.subjectId).where('status','==','published').where('isDemo','==',false).get();
  const ids=pool.docs.filter(d=>d.data().unitId===life.scope.unitId&&d.data().topic===life.scope.topicId).map(d=>d.id).sort();
  const selection={...params(life),packId:'pack-'+(1+Math.floor(ids.indexOf(lifeQuestionId)/10))};
  const p=await pupil(),first=await p.c.call('startTest',selection),q=first.questions.find(q=>q.questionId===lifeQuestionId);
  const submit=(t,choice)=>p.c.call('submitAnswer',{testSessionId:t.testSessionId,questionId:q.questionId,selectedChoiceId:choice});
  assert.equal((await submit(first,'b')).answer.earnedXP,0);
  const second=await p.c.call('startTest',selection),correct=await submit(second,'a');
  assert.equal(correct.answer.isCorrect,true);assert.equal(correct.answer.earnedXP,1);
  assert.equal((await submit(second,'a')).totalXP,1);
  const third=await p.c.call('startTest',selection),again=await submit(third,'a');
  assert.equal(again.answer.earnedXP,0);assert.equal(again.totalXP,1);
});

test('student/teacher/guest cannot create pool, alter provenance, read/write answer keys or fingerprints',async()=>{
  const p=await pupil(),guest=client();clients.push(guest);
  const id=[...created][0];
  for(const c of [p.c,teacher,other,guest]) {
    for(const path of [['questions',id],['privateQuestionAnswers',id],['questionFingerprints','content_test']]) {
      await assert.rejects(getDoc(doc(c.db,...path)));await assert.rejects(setDoc(doc(c.db,...path),{verified:true,source:'ai_verified',correctOptionId:'a'}));
    }
    await assert.rejects(updateDoc(doc(c.db,'questions',id),{provenance:{verified:true}}));
  }
});
