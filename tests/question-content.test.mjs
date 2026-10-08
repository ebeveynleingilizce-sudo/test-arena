import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparedBankFixture} from './prepared-bank-fixture.mjs';
import {prepareQuestionBank} from '../scripts/curriculum-bank.mjs';
import {parsePresentation} from '../functions/visuals/contract.mjs';

const choices=[{choiceId:'a',text:'A'},{choiceId:'b',text:'B'},{choiceId:'c',text:'C'}];
test('optional content preserves multiline plain text and old presentation',()=>{
  const content='👧 Ada: Hello!\n👦 Efe: ______\n<script>plain text</script>';
  assert.equal(parsePresentation('Question?',choices,undefined,undefined,content).content,content);
  assert.deepEqual(parsePresentation('Question?',choices),{questionText:'Question?',choices});
  for(const invalid of [null,42,{},'', '   ','x'.repeat(10001)])
    assert.throws(()=>parsePresentation('Question?',choices,undefined,undefined,invalid),/içeriği/);
});
test('prepared importer sends content only to public data and preserves private answers',()=>{
  for(const subject of ['ingilizce','matematik']){
    const bank=structuredClone(preparedBankFixture(subject).bank);
    bank.questions=[bank.questions[0]];bank.questionCount=1;
    delete bank.questions[0].content; // Legacy variant in memory, not a bank edit.
    const old=prepareQuestionBank(bank).records[0];
    assert.equal('content' in old.question,false);
    bank.questions[0].content='First line\nSecond line';
    const current=prepareQuestionBank(bank).records[0];
    assert.equal(current.question.content,bank.questions[0].content);
    assert.deepEqual(current.answer,old.answer);
    assert.equal('correctOptionId' in current.question,false);
    assert.equal('explanation' in current.question,false);
    assert.deepEqual({...current.question,content:undefined},{...old.question,content:undefined});
  }
});
