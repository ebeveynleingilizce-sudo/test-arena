import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {isDeepStrictEqual} from 'node:util';
import {initializeApp,getApps,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';import {getAuth} from 'firebase-admin/auth';
import {client,teacherClient,loginStudent} from './helpers.mjs';import {prepareQuestionBank} from '../scripts/curriculum-bank.mjs';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.GCLOUD_PROJECT='demo-test-arena';
test('grade-2 DTOs unchanged, grade-5 all six packs open, public answer separation and XP 0/1/0',async()=>{
 const app=initializeApp({projectId:'demo-test-arena'},'generic-quiz-check'),db=getFirestore(app),auth=getAuth(app),sessions=[];let teacher,pupil,uid;
 try{
  const pool=await db.collection('questions').get(),answers=await db.collection('privateQuestionAnswers').get();assert.equal(pool.size,300);assert.equal(answers.size,300);
  const publicMap=new Map(pool.docs.map(d=>[d.id,d.data()])),privateMap=new Map(answers.docs.map(d=>[d.id,d.data()]));
  const files=readdirSync('data/questions').filter(f=>/^[25]-sinif-/.test(f));const keys=new Map();
  for(const f of files){const prepared=prepareQuestionBank(JSON.parse(readFileSync('data/questions/'+f,'utf8')));for(const r of prepared.records){assert(isDeepStrictEqual(publicMap.get(r.question.questionId),r.question),'Unchanged public DTO '+r.question.questionId);assert(isDeepStrictEqual(privateMap.get(r.question.questionId),r.answer),'Unchanged private DTO '+r.question.questionId);keys.set(r.question.questionId,r.answer.correctOptionId);}}
  teacher=await teacherClient({fixtures:false});uid=teacher.auth.currentUser.uid;
  const cls=await teacher.call('createClass',{className:'Disposable canonical import check',defaultGradeLevel:5});
  const student=await teacher.call('createStudent',{classId:cls.classId,firstName:'Import',lastName:'Check',gradeLevel:5});pupil=client();await loginStudent(pupil,student.code);
  const catalog=await pupil.call('quizCatalog',{}),subject=catalog.curricula.find(c=>c.grade===5).subjects.find(s=>s.id==='ingilizce'),unit=subject.units.find(u=>u.id==='g5-ingilizce-school-life');
  assert.equal(subject.count,60);assert.equal(subject.navigationModel,'theme-test');assert.equal(unit.packs.length,6);assert(unit.packs.every(p=>p.count===10));
  let first;
  for(const pack of unit.packs){const params={grade:5,subjectId:'ingilizce',unitId:unit.id,packId:pack.id},quiz=await pupil.call('startTest',params);sessions.push(quiz.testSessionId);assert.equal(quiz.questions.length,10);assert(quiz.questions.every(q=>q.questionId.startsWith('g5-eng-school-life-final-')));for(const q of quiz.questions){assert(!('correctOptionId' in q));assert(!('explanation' in q));}first||={params,quiz};}
  const [wrong,right]=first.quiz.questions;
  const r0=await pupil.call('submitAnswer',{testSessionId:first.quiz.testSessionId,questionId:wrong.questionId,selectedChoiceId:wrong.choices.find(c=>c.choiceId!==keys.get(wrong.questionId)).choiceId});assert.equal(r0.answer.earnedXP,0);assert.equal(r0.answer.isCorrect,false);assert(r0.test.questions.find(q=>!r0.test.answeredQuestionIds.includes(q.questionId)));
  const r1=await pupil.call('submitAnswer',{testSessionId:first.quiz.testSessionId,questionId:right.questionId,selectedChoiceId:keys.get(right.questionId)});assert.equal(r1.answer.earnedXP,1);assert.equal(r1.answer.isCorrect,true);
  const again=await pupil.call('startTest',first.params);sessions.push(again.testSessionId);const r2=await pupil.call('submitAnswer',{testSessionId:again.testSessionId,questionId:right.questionId,selectedChoiceId:keys.get(right.questionId)});assert.equal(r2.answer.earnedXP,0);
 }finally{
  for(const id of sessions)await db.doc('privateTestKeys/'+id).delete();
  if(uid){for(const col of ['studentSessions','studentCodeIndex']){for(const d of(await db.collection(col).where('teacherUid','==',uid).get()).docs){if(col==='studentSessions')await auth.deleteUser(d.id).catch(()=>{});await d.ref.delete();}}await db.recursiveDelete(db.doc('teachers/'+uid));await auth.deleteUser(uid);}
  await teacher?.close();await pupil?.close();await Promise.all(getApps().filter(a=>a.name==='generic-quiz-check').map(deleteApp));
 }
});
