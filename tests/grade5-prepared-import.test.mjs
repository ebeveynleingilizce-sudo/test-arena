import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareQuestionBank,loadCurriculumBank} from '../scripts/curriculum-bank.mjs';
import {preparedBankFixture} from './prepared-bank-fixture.mjs';
const subjects=['turkce','matematik','fen-bilimleri','sosyal-bilgiler','ingilizce','din-kulturu'];
const banks=subjects.map(s=>preparedBankFixture(s,5,50).bank);
test('six current grade 5 banks map 300 unique questions to canonical navigation',()=>{
 const ids=new Set(),records=[];
 for(const bank of banks){const p=prepareQuestionBank(bank);assert.equal(p.records.length,50);assert.equal(p.unmapped.length,0);
  for(const [i,r] of p.records.entries()){assert(!ids.has(r.question.questionId));ids.add(r.question.questionId);assert.equal(r.question.questionText,bank.questions[i].question);assert.equal(r.answer.correctOptionId,bank.questions[i].correctOptionId);assert.equal('correctOptionId' in r.question,false);assert.equal('explanation' in r.question,false);records.push(r);}
 }
 assert.equal(ids.size,300);
 const tree=loadCurriculumBank(undefined,{grade:5,records}).curricula[0];
 for(const s of tree.subjects){assert.equal(s.units.reduce((n,u)=>n+u.questionIds.length,0),50);assert.equal(s.units[0].questionIds.length,50);}
});
test('empty explanations accepted, invalid answer and cross-grade unit rejected',()=>{
 const bank=structuredClone(banks[0]);bank.questions[0].explanation='';assert.doesNotThrow(()=>prepareQuestionBank(bank));
 bank.questions[0].explanation=null;assert.throws(()=>prepareQuestionBank(bank));
 bank.questions[0].explanation='';bank.questions[0].correctOptionId='unknown';assert.throws(()=>prepareQuestionBank(bank));
 const invalid=structuredClone(banks[0]);invalid.unitId='g2-turkce-tema-1';assert.throws(()=>prepareQuestionBank(invalid));
});
