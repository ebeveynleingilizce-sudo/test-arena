import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {prepareQuestionBank} from '../scripts/curriculum-bank.mjs';
const banks=readdirSync('data/questions').filter(f=>f.startsWith('2-sinif-turkce-')).map(f=>JSON.parse(readFileSync('data/questions/'+f,'utf8')));
test('Turkish skill outcomes bind to themes without navigation topics',()=>{
  assert.equal(banks.length,6);
  for(const bank of banks){
    const p=prepareQuestionBank(bank),subject=p.curricula[0].subjects.find(s=>s.id==='turkce');
    assert.equal(subject.navigationModel,'theme-test');
    assert.equal(subject.units[0].topics.length,0);
    assert.equal(subject.units[0].questionIds.length,10);
    assert.equal(p.records.length,10);assert.equal(p.unmapped.length,0);
    for(const [i,r] of p.records.entries()){
      assert.equal(r.question.topicId,bank.questions[i].topicId);
      assert.equal(r.answer.outcomeCode,bank.questions[i].outcomeCode);
      assert.equal('correctOptionId' in r.question,false);
    }
  }
});
test('Turkish canonical skill, exact outcome membership and explicit theme stay mandatory',()=>{
  for(const mutate of [q=>q.topicId='unknown',q=>q.outcomeCode='T.Y.2.3',q=>q.unitId='unknown']){
    const bank=structuredClone(banks[0]);mutate(bank.questions[0]);assert.throws(()=>prepareQuestionBank(bank));
  }
});
