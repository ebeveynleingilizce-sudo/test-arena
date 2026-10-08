import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareQuestionBank,loadCurriculumBank} from '../scripts/curriculum-bank.mjs';
import {testPacks} from '../functions/lib/test-packs.js';
import {readFileSync} from 'node:fs';

test('grade 2 English unit-level banks expose theme packs without requiring topic selection',()=>{
  const bank={grade:2,subjectId:'ingilizce',unitId:'g2-ingilizce-school-life',questions:Array.from({length:50},(_,i)=>({
    id:`navigation-test-${String(i+1).padStart(3,'0')}`,type:'multiple-choice',difficulty:'easy',question:'Hello!',
    options:[{id:'a',text:'Hello!'},{id:'b',text:'Goodbye!'},{id:'c',text:'Good night!'}],correctOptionId:'a'
  }))};
  const prepared=prepareQuestionBank(bank);
  const subject=prepared.curricula[0].subjects.find(s=>s.id==='ingilizce');
  const unit=subject.units.find(u=>u.id===bank.unitId);
  assert.equal(subject.navigationModel,'theme-test');
  assert.equal(unit.questionIds.length,50);
  const packs=testPacks(unit.questionIds);
  assert.equal(packs.length,5);
  assert(packs.every(p=>p.questionIds.length===10));
  assert.equal(prepared.unmapped.length,0);
  assert(prepared.records.every(r=>!('correctOptionId' in r.question)));
  assert.equal(prepared.curricula[0].subjects.find(s=>s.id==='matematik').navigationModel,'unit-topic-test');
});

for (const grade of [2,3,5]) {
  test(`grade ${grade} English exposes unit packs including questions from different topics`,()=>{
    const empty=loadCurriculumBank(undefined,{grade,records:[]}).curricula[0];
    const english=empty.subjects.find(s=>s.id==='ingilizce');
    const unit=english.units[0];
    const records=Array.from({length:15},(_,i)=>({question:{questionId:`g${grade}-pack-${i}`,grade,subjectId:'ingilizce',unitId:unit.id,
      ...(unit.topics.length?{topicId:unit.topics[i%unit.topics.length].id}:{})},answer:{}}));
    const tree=loadCurriculumBank(undefined,{grade,records}).curricula[0];
    const result=tree.subjects.find(s=>s.id==='ingilizce');
    assert.equal(result.navigationModel,'theme-test');
    assert.equal(result.units[0].questionIds.length,15);
    assert.deepEqual(testPacks(result.units[0].questionIds).map(p=>p.questionIds.length),[10,5]);
    assert.equal(result.units[0].topics.length,unit.topics.length);
    assert.deepEqual(tree.subjects.filter(s=>s.id!=='ingilizce').map(s=>[s.id,s.navigationModel]),
      empty.subjects.filter(s=>s.id!=='ingilizce').map(s=>[s.id,s.navigationModel]));
  });
}

test('grade 4 English navigation configuration also uses unit packs',()=>{
  const ui=JSON.parse(readFileSync('data/mufredat/4-sinif-ui-v2.json','utf8'));
  const english=ui.subjects.find(s=>s.id==='ingilizce');
  assert.equal(english.navigationModel,'theme-test');
  assert(english.units.length>0);
  assert(english.units.every(u=>u.id && u.displayName && (!u.topics || Array.isArray(u.topics))));
});
