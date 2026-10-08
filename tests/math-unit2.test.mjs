import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCurriculumBank} from '../scripts/curriculum-bank.mjs';
import {parseVisual} from '../functions/visuals/contract.mjs';
import {scatteredPositions} from '../src/ui/math/scattered.mjs';
import {seedCurriculum} from '../scripts/seed-curriculum.mjs';
import {teacherClient,client,loginStudent,clearLimiter} from './helpers.mjs';
import {disposeFixture} from './classroom-fixture.mjs';
import {getApps,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
const source=JSON.parse(readFileSync('data/soru-bankasi/2-sinif/matematik-2-sinif-unite-2-60-soru-v1.json'));
const bank=loadCurriculumBank(),records=bank.records.filter(r=>r.question.questionId.startsWith('g2-mat-u2-v1-'));
const q=n=>source.questions.find(q=>q.id.endsWith('-'+n));
test('60 questions validate, with six exact topic/outcome groups and no duplicate IDs',()=>{
 assert.equal(source.questions.length,60);assert.equal(records.length,60);assert.equal(new Set(bank.records.map(r=>r.question.questionId)).size,130);
 const unit=bank.curricula[0].subjects.find(s=>s.id==='matematik').units[1];assert.equal(unit.displayName,'2. ÜNİTE — Sayılar ve Nicelikler');assert.deepEqual(unit.topics.map(t=>t.questionIds.length),[10,10,10,10,10,10]);
 for(const [i,t] of unit.topics.entries())for(const id of t.questionIds)assert.equal(records.find(r=>r.question.questionId===id).answer.outcomeCode,`MAT.2.1.${i+1}`);
 for(const q of source.questions){const r=records.find(r=>r.question.questionId===q.id);assert.equal(r.question.questionText,q.question);assert.equal(r.answer.explanation,q.explanation);assert.equal(r.answer.correctOptionId,q.correctOptionId);assert.equal(r.answer.outcomeCode,q.outcomeCode);assert.equal(r.question.unitId,q.unitId);assert.equal(r.question.topicId,q.topicId);assert.deepEqual(r.question.choices,q.options.map(o=>({choiceId:o.id,text:o.text})));if(q.visual)assert.deepEqual(r.question.visual,parseVisual(q.visual));}
 assert.equal(source.questions.filter(q=>q.visual).length,24);
});
test('existing renderers retain labels, models, sequences, comparisons and real jumps',()=>{
 assert.deepEqual(q('010').visual.items.map(i=>i.value),['A: 54','B: 45','C: 40']);assert.deepEqual(q('036').visual.rows.map(r=>r.label),['A','B','C']);assert.equal(q('043').visual.mode,'shapes');assert.deepEqual(q('043').visual.items,['circle','square','circle','square',null]);assert.equal(q('057').visual.preset,'compare');assert.deepEqual(q('057').visual.items.map(v=>v.count),[12,28]);for(const n of ['051','052','055','059'])assert.equal(q(n).visual.layout,'scattered');assert.equal(q('059').visual.objectType,'dot');assert.equal(q('039').visual.jumps,3);
});
test('scattered positions are deterministic, contained and non-overlapping at bounded counts',()=>{
 for(const n of [1,18,21,32,41,100]){const model=scatteredPositions(n);assert.deepEqual(model,scatteredPositions(n));assert.equal(model.points.length,n);for(const p of model.points){assert.ok(p.x>=0&&p.y>=0&&p.x+model.size<=model.width&&p.y+model.size<=model.height);for(const other of model.points)if(p!==other)assert.ok((p.x-other.x)**2+(p.y-other.y)**2>=35**2);}}
 for(const n of [0,101,1.5])assert.throws(()=>scatteredPositions(n));
});
test('new parameters remain bounded; no raw markup, coordinates, URLs or arbitrary styles',()=>{
 assert.ok(parseVisual(q('006').visual));assert.ok(parseVisual(q('059').visual));for(const jumps of [0,4,11,1.5])assert.throws(()=>parseVisual({...q('039').visual,jumps}));assert.throws(()=>parseVisual({...q('006').visual,max:31}));for(const v of [q('059').visual,q('039').visual])for(const key of ['css','svg','url','x','y','component','correctOptionId'])assert.throws(()=>parseVisual({...v,[key]:'unsafe'}));
});
test('emulator stores all 60 safely; six 10-question packs contain only new unit-2 IDs',async()=>{
 let owner,pupil;try{
  assert.equal((await seedCurriculum()).createdDocuments,0);const admin=getFirestore(getApps().find(a=>a.name==='curriculum-seed'));
  for(const r of records){assert.deepEqual((await admin.doc('questions/'+r.question.questionId).get()).data(),r.question);assert.deepEqual((await admin.doc('privateQuestionAnswers/'+r.question.questionId).get()).data(),r.answer);}
  await clearLimiter();owner=await teacherClient({fixtures:false});pupil=client();const cls=await owner.call('createClass',{className:'2. ÜNİTE KONTROL',defaultGradeLevel:2}),student=await owner.call('createStudent',{classId:cls.classId,firstName:'Ünite',lastName:'Kontrol',gradeLevel:2});await loginStudent(pupil,student.code);
  const catalog=await pupil.call('quizCatalog',{}),unit=catalog.curricula[0].subjects.find(s=>s.id==='matematik').units[1];assert.equal(unit.count,60);
  for(const topic of unit.topics){assert.deepEqual(topic.packs.map(p=>[p.name,p.count]),[['Test 1',10]]);const t=await pupil.call('startTest',{grade:2,subjectId:'matematik',unitId:unit.id,topicId:topic.id,packId:'pack-1'});assert.equal(t.questions.length,10);assert.ok(t.questions.every(q=>q.questionId.startsWith('g2-mat-u2-v1-')&&q.topicId===topic.id));assert.equal(JSON.stringify(t).includes('correctOptionId'),false);}
 }finally{if(pupil)await pupil.close();if(owner)await disposeFixture(owner);await Promise.all(getApps().map(deleteApp));}
});
