import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareQuestionBank} from '../scripts/curriculum-bank.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const names=readdirSync('data/questions').filter(f=>/^5-sinif-.*\.json$/.test(f));
const banks=names.map(f=>read('data/questions/'+f));
test('36 grade 5 banks preserve content and contain 360 unique safely split questions',()=>{
 assert.equal(names.length,36);const ids=new Set(),counts={};
 for(const [i,bank] of banks.entries()){
  const p=prepareQuestionBank(bank);
  assert.equal(p.records.length,10);
  for(const [j,q] of bank.questions.entries()){

   assert(!ids.has(q.id));ids.add(q.id);assert.equal(q.topicId,undefined);
   assert.equal('correctOptionId' in p.records[j].question,false);assert.equal('explanation' in p.records[j].question,false);
   assert.equal(p.records[j].answer.explanation,q.explanation);
  }
  counts[bank.subjectId]=(counts[bank.subjectId]||0)+p.records.length;
 }
 const content=banks.map(b=>b.questions.map(q=>Object.fromEntries(['id','question','content','options','correctOptionId','explanation'].map(k=>[k,q[k]]))));
 assert.equal(createHash('sha256').update(JSON.stringify(content)).digest('hex'),'8955f9f1b04b3a849eb83514c08e5a026fa120401d9f4a7beb326b9f0d2266fb');
 assert.equal(ids.size,360);assert.equal(Object.keys(counts).length,6);assert(Object.values(counts).every(n=>n===60));
});
test('empty explanations accepted, non-string explanations and invalid answer rejected',()=>{
 const bank=structuredClone(banks[0]);bank.questions[0].explanation='';assert.doesNotThrow(()=>prepareQuestionBank(bank));
 bank.questions[0].explanation=null;assert.throws(()=>prepareQuestionBank(bank));
 bank.questions[0].explanation='';bank.questions[0].correctOptionId='unknown';assert.throws(()=>prepareQuestionBank(bank));
});
test('English is explicitly theme-level and grade 2 four subjects remain 60 each',()=>{
 for(const bank of banks.filter(b=>b.subjectId==='ingilizce')) for(const q of bank.questions){assert.equal(q.outcomeCode,null);assert.equal(q.outcomeMappingStatus,'theme-level-only');}
 const counts={};for(const file of readdirSync('data/questions').filter(f=>/^2-sinif-.*\.json$/.test(f))){const bank=read('data/questions/'+file);const p=prepareQuestionBank(bank);counts[bank.subjectId]=(counts[bank.subjectId]||0)+p.records.length;}
 assert.equal(Object.keys(counts).length,4);assert(Object.values(counts).every(n=>n===60));
});
