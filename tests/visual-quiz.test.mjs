import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {doc,getDoc,getDocs,collection} from 'firebase/firestore';
import {parseVisual,parsePresentation,geometryShapes} from '../functions/visuals/contract.mjs';
import {loadCurriculumBank} from '../scripts/curriculum-bank.mjs';
import {teacherClient,client,loginStudent,clearLimiter} from './helpers.mjs';
import {disposeFixture} from './classroom-fixture.mjs';
import {examples,visualFixture} from './visual-fixture.mjs';

let fixture,owner,foreign,normal,classId;const pupils=[];
before(async()=>{fixture=await visualFixture();owner=await teacherClient();foreign=await teacherClient();normal=await teacherClient({fixtures:false});classId=(await owner.call('createClass',{className:'GÖRSEL TEST',defaultGradeLevel:2})).classId;});
beforeEach(clearLimiter);
after(async()=>{await Promise.all(pupils.map(p=>p.c.close()));for(const c of [owner,foreign,normal])await disposeFixture(c);await fixture.close();});
async function pupil(){const s=await owner.call('createStudent',{classId,firstName:'Görsel',lastName:'Test',gradeLevel:2});const c=client();await loginStudent(c,s.code);const p={...s,c,path:['teachers',owner.auth.currentUser.uid,'students',s.studentId]};pupils.push(p);return p;}
const start=p=>p.c.call('startTest',fixture.params);
const key=id=>fixture.records.find(r=>r.question.questionId===id).answer.correctChoiceId;
const answer=(p,t,q,choice=key(q.questionId))=>p.c.call('submitAnswer',{testSessionId:t.testSessionId,questionId:q.questionId,selectedChoiceId:choice});

test('visual schema supports all nine geometries and four presentation combinations, preserving text-only DTOs',()=>{
  for(const shape of geometryShapes)assert.deepEqual(parseVisual({kind:'geometry',shape,alt:'Görünen biçimin açıklaması'}),{kind:'geometry',shape,alt:'Görünen biçimin açıklaması'});
  const plain={questionText:'Soru',choices:[{choiceId:'a',text:'Bir'},{choiceId:'b',text:'İki'}]};assert.deepEqual(parsePresentation(plain.questionText,plain.choices),plain);
  for(const q of examples.questions){const p=parsePresentation(q.question,q.options.map(o=>({choiceId:o.id,text:o.text,visual:o.visual})),q.visual);assert.equal(p.choices.length,4);}
  assert.ok(examples.questions.some(q=>q.visual&&q.options.some(o=>o.visual)));assert.ok(examples.questions.some(q=>!q.visual&&q.options.every(o=>o.visual)));assert.ok(examples.questions.some(q=>q.visual&&q.options.every(o=>!o.visual)));
});
test('schema rejects unsafe/unknown visuals, missing alt, duplicate IDs, empty choices and malformed text',()=>{
  const good={kind:'geometry',shape:'cube',alt:'Kare yüzlü cisim'};
  for(const v of [null,[],{}, {...good,kind:'image'}, {...good,shape:'clock'}, {...good,alt:''},{...good,alt:'x'.repeat(301)},{...good,svg:'<script/>'},{...good,url:'javascript:x'},{...good,correct:true}])assert.throws(()=>parseVisual(v));
  for(const choices of [[{choiceId:'a',text:''},{choiceId:'b',text:'B'}],[{choiceId:'a',text:'A'},{choiceId:'a',text:'B'}],[{choiceId:'a',text:null},{choiceId:'b',text:'B'}]])assert.throws(()=>parsePresentation('Soru',choices));
  assert.throws(()=>parsePresentation('',[{choiceId:'a',text:'A'},{choiceId:'b',text:'B'}]));
});
test('bank import carries valid optional visuals and rejects malformed ones; active bank stays 20 pilots, math five',()=>{
  const root=resolve('artifacts/visual-quiz'),temp=mkdtempSync(join(root,'schema-'));
  try{cpSync('data',temp,{recursive:true});const path=join(temp,'soru-bankasi/2-sinif/matematik.json');const source=JSON.parse(readFileSync(path));source.questions[0].visual={kind:'geometry',shape:'cube',alt:'Kare yüzlü cisim'};source.questions[0].options[0].visual={kind:'geometry',shape:'circle',alt:'Yuvarlak kapalı çizgi'};source.questions[0].options[0].text='';writeFileSync(path,JSON.stringify(source));
    const imported=loadCurriculumBank(temp).records.find(r=>r.question.questionId===source.questions[0].id);assert.equal(imported.question.visual.shape,'cube');assert.equal(imported.question.choices[0].visual.shape,'circle');assert.equal(imported.question.choices[0].text,'');
    source.questions[0].visual.shape='raw-svg';writeFileSync(path,JSON.stringify(source));assert.throws(()=>loadCurriculumBank(temp));
  }finally{if(!resolve(temp).startsWith(root+requireSeparator()))throw new Error('Unsafe fixture cleanup');rmSync(temp,{recursive:true,force:true});}
  const b=loadCurriculumBank();assert.equal(b.records.length,20);assert.equal(b.records.filter(r=>r.question.subject==='matematik').length,5);assert.ok(b.records.every(r=>!r.question.visual&&!r.question.choices.some(c=>c.visual)));
});
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
test('server start/resume DTO preserves visuals after shuffle while stripping correctness and explanation metadata',async()=>{
  const p=await pupil(),r=fixture.records[0];await fixture.db.doc('questions/'+r.question.questionId).update({correctOptionId:'secret',explanation:'secret',choices:r.question.choices.map(c=>({...c,isCorrect:true,correctChoiceId:'secret'}))});
  try{const t=await start(p);for(const q of t.questions){const source=fixture.records.find(r=>r.question.questionId===q.questionId).question;assert.deepEqual(q.visual,source.visual);for(const c of q.choices)assert.deepEqual(c,source.choices.find(s=>s.choiceId===c.choiceId));}const encoded=JSON.stringify(t);for(const marker of ['secret','correctChoiceId','correctOptionId','explanation','isCorrect'])assert.equal(encoded.includes(marker),false);assert.deepEqual((await p.c.call('getTestSession',{testSessionId:t.testSessionId})).questions,t.questions);
    // DTO whitelist is also applied when reading a frozen snapshot.
    const ref=fixture.db.doc(p.path.join('/')+'/testSessions/'+t.testSessionId);await ref.update({questions:t.questions.map(q=>({...q,correctOptionId:'secret',choices:q.choices.map(c=>({...c,isCorrect:true}))}))});assert.equal(JSON.stringify(await p.c.call('getTestSession',{testSessionId:t.testSessionId})).includes('secret'),false);
  }finally{await fixture.db.doc('questions/'+r.question.questionId).set(r.question);}
});
test('visual answers keep wrong=0, first correct=1, retries immutable, repeated questions=0 and analytics truthful',async()=>{
  const p=await pupil();let t=await start(p);const q=t.questions.find(q=>q.choices.some(c=>c.visual));const wrong=await answer(p,t,q,q.choices.find(c=>c.choiceId!==key(q.questionId)).choiceId);assert.equal(wrong.answer.earnedXP,0);assert.equal((await answer(p,t,q)).answer.isCorrect,false);
  t=wrong.test;for(const next of t.questions.filter(n=>n.questionId!==q.questionId))t=(await answer(p,t,next)).test;assert.equal(t.earnedXP,9);
  t=await start(p);const repeated=t.questions.find(n=>n.questionId===q.questionId);const tries=await Promise.all(Array.from({length:4},()=>answer(p,t,repeated)));assert.ok(tries.every(r=>r.answer.earnedXP===1&&r.totalXP===10));
  t=await start(p);const last=await answer(p,t,t.questions.find(n=>n.questionId===q.questionId));assert.equal(last.answer.earnedXP,0);assert.equal(last.totalXP,10);
  const report=await owner.call('teacherAnalytics',{studentId:p.studentId});assert.deepEqual(report.totals.overall,{solved:12,correct:11,wrong:1});assert.equal(report.totals.academicXP,10);assert.equal((await getDocs(collection(p.c.db,...p.path,'awardedQuestions'))).size,10);
});
test('malformed visual fails closed before creating a test; normal students cannot see isolated fixtures',async()=>{
  const p=await pupil(),r=fixture.records[0],ref=fixture.db.doc('questions/'+r.question.questionId);await ref.update({visual:{kind:'geometry',shape:'cube',alt:'Cisim',correctOptionId:'b'}});
  try{await assert.rejects(start(p));assert.equal((await fixture.db.collection(p.path.join('/')+'/testSessions').get()).size,0);}finally{await ref.set(r.question);}
  const cls=await normal.call('createClass',{className:'NORMAL',defaultGradeLevel:2}),s=await normal.call('createStudent',{classId:cls.classId,firstName:'Normal',lastName:'Test',gradeLevel:2});const c=client();try{await loginStudent(c,s.code);const cat=await c.call('quizCatalog',{});assert.equal(JSON.stringify(cat).includes('Görsel Motor Testi'),false);assert.equal(cat.curricula[0].subjects.find(s=>s.id==='matematik').count,5);await assert.rejects(c.call('startTest',fixture.params));}finally{await c.close();}
});
test('visual rendering does not authorize foreign reads, forged answers or visual-based answer submissions',async()=>{
  const p=await pupil(),other=await pupil(),t=await start(p);await assert.rejects(other.c.call('getTestSession',{testSessionId:t.testSessionId}));await assert.rejects(getDoc(doc(foreign.db,...p.path,'testSessions',t.testSessionId)));
  await assert.rejects(p.c.call('submitAnswer',{testSessionId:t.testSessionId,questionId:t.questions[0].questionId,shape:'sphere'}));await assert.rejects(p.c.call('submitAnswer',{testSessionId:t.testSessionId,questionId:t.questions[0].questionId,selectedChoiceId:'not-a-choice'}));
});
