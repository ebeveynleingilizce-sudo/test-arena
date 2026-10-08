import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCurriculumBank} from '../scripts/curriculum-bank.mjs';
import {normalizeV3Visual} from '../scripts/v3-visuals.mjs';
import {parseVisual,objectAssets,compositionAssets} from '../functions/visuals/contract.mjs';
import {seedCurriculum} from '../scripts/seed-curriculum.mjs';
import {teacherClient,client,loginStudent,clearLimiter} from './helpers.mjs';
import {disposeFixture} from './classroom-fixture.mjs';
import {getApps,deleteApp} from 'firebase-admin/app';
const source=JSON.parse(readFileSync('data/soru-bankasi/2-sinif/matematik-2-sinif-unite-1-50-soru-v3-pdf-mantigi.json'));
const bank=loadCurriculumBank(), records=bank.records.filter(r=>r.question.questionId.startsWith('g2-mat-u1-v3-'));
test('50 authored questions retain exact texts, answers and canonical mappings; five topics of ten',()=>{
 assert.equal(source.questions.length,50);assert.equal(new Set(source.questions.map(q=>q.id)).size,50);assert.equal(records.length,50);
 const unit=bank.curricula[0].subjects.find(s=>s.id==='matematik').units[0];assert.deepEqual(unit.topics.map(t=>t.questionIds.length),[10,10,10,10,10]);
 for(const q of source.questions){const r=records.find(r=>r.question.questionId===q.id.replace('-u1-v2-','-u1-v3-'));assert.equal(r.question.questionText,q.question);assert.equal(r.question.unitId,q.unitId);assert.equal(r.question.topicId,q.topicId);assert.equal(r.answer.outcomeCode,q.outcomeCode);assert.equal(r.answer.correctOptionId,q.correctOptionId);assert.equal(r.answer.explanation,q.explanation);assert.deepEqual(r.question.choices,q.options.map(o=>({choiceId:o.id,text:o.text??'',...(o.visual?{visual:normalizeV3Visual(o.visual)}:{})})));assert.deepEqual(r.question.visual,normalizeV3Visual(q.visual));assert.equal(r.question.visualPlacement,q.visual?'above':undefined);}
 assert.equal(bank.records.length,130);assert.equal(new Set(bank.records.map(r=>r.question.questionId)).size,130);assert.equal(unit.questionIds.some(id=>id.startsWith('g2-mat-u1-v2-')),false);
});
test('all 105 visual occurrences validate; 68 geometry/container occurrences need no conversion',()=>{
 const visuals=source.questions.flatMap(q=>[q.visual,...q.options.map(o=>o.visual)].filter(Boolean));assert.equal(visuals.length,105);assert.equal(visuals.filter(v=>['geometry','container'].includes(v.kind)).length,68);for(const v of visuals)assert.ok(normalizeV3Visual(v));assert.deepEqual(source.visualAssetManifest.objectAssets,objectAssets);assert.deepEqual(source.visualAssetManifest.compositionPresets,compositionAssets);
});
test('new controlled assets fail closed on unknown names, paths, URLs and arbitrary markup/styles',()=>{
 for(const kind of ['object','composition'])for(const asset of ['unknown','https://example.com/a.svg','../can','constructor','__proto__'])assert.throws(()=>parseVisual({kind,asset,alt:'Görsel'}));
 for(const v of [{kind:'object',asset:'can',alt:'Konserve kutusu'},{kind:'marked-solid',asset:'cube-face',alt:'İşaretli yüz'}])for(const key of ['svg','html','url','css','component','correctOptionId'])assert.throws(()=>normalizeV3Visual({...v,[key]:'unsafe'}));
 assert.throws(()=>normalizeV3Visual({kind:'object-row',asset:'cube-face',alt:'Yanlış tür'}));
});
test('local import is idempotent, catalog selects V3 only, server DTO and XP remain safe',async()=>{
 let owner,pupil;try{
  assert.equal((await seedCurriculum()).createdDocuments,0);await clearLimiter();owner=await teacherClient({fixtures:false});pupil=client();
  const cls=await owner.call('createClass',{className:'V3 İÇERİK KONTROL',defaultGradeLevel:2}),student=await owner.call('createStudent',{classId:cls.classId,firstName:'V3',lastName:'Kontrol',gradeLevel:2});await loginStudent(pupil,student.code);
  const catalog=await pupil.call('quizCatalog',{}),math=catalog.curricula[0].subjects.find(s=>s.id==='matematik');assert.equal(math.count,111);assert.deepEqual(math.units[0].topics.map(t=>t.packs.map(p=>[p.name,p.count])),Array(5).fill([['Test 1',10]]));
  const r=records[0],params={grade:2,subjectId:'matematik',unitId:r.question.unitId,topicId:r.question.topicId,packId:'pack-1'};
  let t=await pupil.call('startTest',params);assert.equal(t.questions.length,10);assert.ok(t.questions.every(q=>q.questionId.startsWith('g2-mat-u1-v3-')));assert.equal(JSON.stringify(t).includes('correctOptionId'),false);
  const q=t.questions[0],key=records.find(r=>r.question.questionId===q.questionId).answer.correctOptionId;const send=(session,choice)=>pupil.call('submitAnswer',{testSessionId:session.testSessionId,questionId:q.questionId,selectedChoiceId:choice});
  assert.equal((await send(t,q.choices.find(c=>c.choiceId!==key).choiceId)).answer.earnedXP,0);t=await pupil.call('startTest',params);assert.equal((await send(t,key)).answer.earnedXP,1);t=await pupil.call('startTest',params);assert.equal((await send(t,key)).answer.earnedXP,0);
 }finally{if(pupil)await pupil.close();if(owner)await disposeFixture(owner);await Promise.all(getApps().map(deleteApp));}
});
