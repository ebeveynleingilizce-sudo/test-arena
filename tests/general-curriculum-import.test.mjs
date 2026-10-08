import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareQuestionBank} from '../scripts/curriculum-bank.mjs';
import {resolveCanonicalScope} from '../scripts/canonical-scope.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const final=()=>read('data/questions/5-sinif-ingilizce-school-life-test-1-final.json');
const simple=()=>{const b=final();b.questions=[b.questions[0]];delete b.questions[0].unitId;return b;};

test('unit/theme metadata inherits, arbitrary question ID stays an ID, no invented outcome',()=>{
 const b=simple();b.questions[0].id='example-question-001';delete b.questions[0].explanation;
 const p=prepareQuestionBank(b),r=p.records[0];assert.equal(r.question.questionId,'example-question-001');assert.equal(r.question.unitId,b.unitId);
 assert.equal(r.answer.explanation,'');assert.equal(r.answer.outcomeMappingStatus,'theme-level-only');assert(!('outcomeCode' in r.answer));assert.equal(p.unmapped.length,0);
});
test('invalid cross-grade unit, unknown subject and invalid explicit detail are rejected',()=>{
 for(const change of [b=>b.unitId='g2-ingilizce-school-life',b=>b.subjectId='unknown',b=>b.questions[0].topicId='unknown',b=>b.questions[0].skillId='unknown',b=>b.questions[0].outcomeCode='UNKNOWN',b=>b.questions[0].outcomeId='UNKNOWN',b=>b.questions[0].topicId=b.unitId,b=>b.questions[0].explanation=null,b=>b.questions[0].outcomeCode='',b=>b.questions[0].topicId=null]){const b=simple();change(b);assert.throws(()=>prepareQuestionBank(b));}
});
test('explicit canonical unit outcome is optional but validated when supplied',()=>{
 const b=simple();b.questions[0].outcomeCode='ENG.5.1.R3';assert.equal(prepareQuestionBank(b).records[0].answer.outcomeCode,'ENG.5.1.R3');
 delete b.questions[0].outcomeCode;assert.equal(prepareQuestionBank(b).records.length,1);
 b.questions[0].unitId='g5-wrong';assert.throws(()=>prepareQuestionBank(b),/uyuș|uyuş/);
});
test('all 24 detailed grade-2 and 6 unit-level grade-5 banks validate',()=>{
 const files=readdirSync('data/questions').filter(f=>/^[25]-sinif-.*\.json$/.test(f));assert.equal(files.length,30);
 const totals={};for(const f of files){const b=read('data/questions/'+f),p=prepareQuestionBank(b);totals[b.grade]=(totals[b.grade]||0)+p.records.length;
  for(const [i,r]of p.records.entries()){const q=b.questions[i];assert.equal(r.question.questionText,q.question);assert.equal(r.answer.correctOptionId,q.correctOptionId);assert.equal(r.answer.explanation,q.explanation??'');if(q.outcomeCode)assert.equal(r.answer.outcomeCode,q.outcomeCode);if(q.topicId)assert.equal(r.question.topicId,q.topicId);}
 }assert.deepEqual(totals,{2:240,5:60});
});
test('future grade/subject units + skill_domains + outcome IDs work without importer edits',()=>{
 const workspace=resolve('.firebase'),root=mkdtempSync(join(workspace,'generic-curriculum-'));
 try{mkdirSync(join(root,'mufredat'));mkdirSync(join(root,'soru-bankasi'));writeFileSync(join(root,'soru-bankasi/SCHEMA.json'),readFileSync('data/soru-bankasi/SCHEMA.json'));
  const canonical={grade:7,dataset_id:'fixture-canonical',subjects:[{id:'fixture-subject',name:'Fixture subject',units:[{id:'fixture-unit',name:'Fixture unit',skill_domains:[{id:'fixture-skill',name:'Fixture skill',outcomes:[{id:'fixture-outcome',code:'FIXTURE.7.1'}]}]}]}]};
  const ui={grade:7,sourceDatasetId:canonical.dataset_id,datasetId:'fixture-ui',schemaVersion:2,subjects:[{id:'fixture-subject',name:'Fixture subject',navigationModel:'theme-test',sectionLabel:'ÜNİTE',units:[{id:'fixture-unit',name:'Fixture unit',displayName:'Fixture unit',order:1}]}]};
  writeFileSync(join(root,'mufredat/7-sinif.json'),JSON.stringify(canonical));writeFileSync(join(root,'mufredat/7-sinif-ui-v2.json'),JSON.stringify(ui));
  const b=simple();Object.assign(b,{grade:7,subjectId:'fixture-subject',unitId:'fixture-unit'});assert.equal(prepareQuestionBank(b,root).records.length,1);
  Object.assign(b,{skillId:'fixture-skill',outcomeId:'fixture-outcome'});const r=prepareQuestionBank(b,root).records[0];assert.equal(r.question.skillId,'fixture-skill');assert.equal(r.answer.outcomeCode,'FIXTURE.7.1');assert.equal(r.answer.outcomeId,'fixture-outcome');
  b.outcomeId='unknown';assert.throws(()=>prepareQuestionBank(b,root));
 }finally{if(!resolve(root).startsWith(workspace+sep))throw Error('Unsafe fixture cleanup');rmSync(root,{recursive:true});}
});
test('topic outcome membership cannot be borrowed from a sibling topic',()=>{
 const c=read('data/mufredat/2-sinif.json');const scope={grade:2,subjectId:'matematik',unitId:'g2-matematik-nesnelerin-geometrisi-1',topicId:'g2-matematik-geometrik-cisimler',outcomeCode:'MAT.2.3.2'};
 assert.throws(()=>resolveCanonicalScope(c,scope));delete scope.topicId;assert.equal(resolveCanonicalScope(c,scope).level,'outcome');
});
test('skill-domain-only curriculum and conflicting topic/skill fail closed',()=>{
 const c={grade:8,subjects:[{id:'fixture-subject',skill_domains:[{id:'skill-unit',outcomes:[{code:'F.8.1'}]}]}]};
 assert.equal(resolveCanonicalScope(c,{grade:8,subjectId:'fixture-subject',unitId:'skill-unit',outcomeCode:'F.8.1'}).level,'outcome');
 const g2=read('data/mufredat/2-sinif.json');assert.throws(()=>resolveCanonicalScope(g2,{grade:2,subjectId:'turkce',unitId:'g2-turkce-degerlerimizle-variz',topicId:'g2-turkce-okuma',skillId:'g2-turkce-yazma'}));
});
test('FINAL protected content is unchanged',()=>{
 const proofs=[{"file":"5-sinif-ingilizce-school-life-test-1-final.json","hash":"8b5d88450fface3bed952a91b1ca0b64d175c3cff26798d37804d5f56fe06f65"},{"file":"5-sinif-ingilizce-school-life-test-2-final.json","hash":"351d9cac9a23932006d1f065f160d413a2498f7f7f35e07036be75182199763f"},{"file":"5-sinif-ingilizce-school-life-test-3-final.json","hash":"25284d14c2f74c0f55af8a30fae11da68c4b36fcb46225e559411d5fc48d72fc"},{"file":"5-sinif-ingilizce-school-life-test-4-final.json","hash":"0eda848bea6fe8c211577f756fa34125678b215f3d4cee7a696e747e18cd9c99"},{"file":"5-sinif-ingilizce-school-life-test-5-final.json","hash":"7545a462060557ed5d3d9e0d8517816a9382906223c1cbc2028d189c19c5f95c"},{"file":"5-sinif-ingilizce-school-life-test-6-final.json","hash":"a665c2d18264dfdc3939ffe995f8e1b7434e294952f8856ec9f5f476e1523e68"}];
 const keys=['id','content','question','options','correctOptionId','explanation','difficulty','type'];
 for(const p of proofs){const bank=read('data/questions/'+p.file);const text=JSON.stringify(bank.questions.map(q=>Object.fromEntries(keys.filter(k=>k in q).map(k=>[k,q[k]]))));assert.equal(createHash('sha256').update(text).digest('hex'),p.hash);assert(bank.questions.every(q=>!('topicId' in q)));}
});
