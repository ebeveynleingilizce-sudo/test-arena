import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { getApps, deleteApp } from 'firebase-admin/app';
import { seedDemo } from '../scripts/seed-demo.mjs';
import { demoQuestions } from '../scripts/demo-questions.mjs';
import { teacherClient, client, loginStudent, clearLimiter } from './helpers.mjs';

let teacher, other, cls; const clients = [], keys = new Map(demoQuestions.map(e => [e.question.questionId, e.answer]));
const params = { gradeLevel: 6, subject: 'matematik', topic: 'kesirler', questionCount: 10 };
before(async () => { await seedDemo(); teacher = await teacherClient(); other = await teacherClient(); clients.push(teacher, other); cls = await teacher.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 6 }); });
beforeEach(clearLimiter);
after(async () => { await Promise.all(clients.map(c => c.close())); await Promise.all(getApps().map(deleteApp)); });
async function pupil(gradeLevel = 6) { const record = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Quiz', lastName: 'Test', gradeLevel }); const c = client(); clients.push(c); await loginStudent(c, record.code); return { c, ...record, path: ['teachers', teacher.auth.currentUser.uid, 'students', record.studentId] }; }
const start = p => p.c.call('startTest', params);
const answer = (p, t, q, selectedChoiceId = keys.get(q.questionId).correctChoiceId) => p.c.call('submitAnswer', { testSessionId: t.testSessionId, questionId: q.questionId, selectedChoiceId });
const rejected = promise => assert.rejects(promise);

test('demo seed is idempotent: 36 stable questions, no overwrites', async () => { const seeded = await seedDemo(); assert.equal(seeded.questions, 36); assert.equal(seeded.createdDocuments, 0); assert.equal(new Set(demoQuestions.map(e => e.question.questionId)).size, 36); });
test('catalog only exposes grades 5 and 6 to a grade 6 student', async () => { const p = await pupil(), catalog = await p.c.call('quizCatalog', {}); assert.deepEqual(catalog.allowedGrades, [5, 6]); assert.equal(catalog.entries.length, 3); });
test('grade 6 cannot start grade 4 or 7 content', async () => { const p = await pupil(); for (const g of [4, 7]) await rejected(p.c.call('startTest', { ...params, gradeLevel: g })); });
test('grade 2 boundary only allows 2; grade 1 and 3 are rejected', async () => { const p = await pupil(2); assert.deepEqual((await p.c.call('quizCatalog', {})).allowedGrades, [2]); for (const g of [1, 3]) await rejected(p.c.call('startTest', { ...params, gradeLevel: g })); });
test('previous grade and English topics create valid tests', async () => { const p = await pupil(); const previous = await p.c.call('startTest', { ...params, gradeLevel: 5 }); assert.equal(previous.questions.length, 10); const english = await p.c.call('startTest', { ...params, subject: 'ingilizce', topic: 'temel-kelimeler' }); assert.equal(english.questions.length, 10); });
test('invalid topic, count and insufficient pool are rejected', async () => { const p = await pupil(); for (const change of [{ questionCount: 1 }, { questionCount: 20 }, { questionCount: 30 }, { questionCount: 50 }, { topic: 'unknown' }, { subject: 'unknown' }]) await rejected(p.c.call('startTest', { ...params, ...change })); });
test('anonymous and teacher callers cannot start tests or submit answers', async () => { const anonymous = client(); clients.push(anonymous); for (const c of [anonymous, teacher]) { await rejected(c.call('startTest', params)); await rejected(c.call('submitAnswer', { testSessionId: 'x', questionId: 'x', selectedChoiceId: 'a' })); } });
test('public payload and stored test contain no answer key', async () => { const p = await pupil(), t = await start(p); assert.equal(t.questions.length, 10); assert.equal(new Set(t.questions.map(q => q.questionId)).size, 10); const stored = (await getDoc(doc(p.c.db, ...p.path, 'testSessions', t.testSessionId))).data(); for (const payload of [t, stored]) { assert.equal(JSON.stringify(payload).includes('correctChoiceId'), false); assert.equal(JSON.stringify(payload).includes('explanation'), false); } });
test('bank, private keys, global code index cannot be read or changed', async () => { const p = await pupil(), t = await start(p); for (const c of [p.c, teacher, other]) for (const path of [['questions', t.questions[0].questionId], ['privateQuestionAnswers', t.questions[0].questionId], ['privateTestKeys', t.testSessionId], ['studentCodeIndex', 'x']]) { await rejected(getDoc(doc(c.db, ...path))); await rejected(setDoc(doc(c.db, ...path), { correctChoiceId: 'a' })); } });
test('student and teachers cannot directly write XP, awards, performance, history or leaderboard', async () => { const p = await pupil(), t = await start(p); for (const c of [p.c, teacher, other]) for (const path of [['learning', 'summary'], ['awardedQuestions', 'x'], ['performance', 'x'], ['testSessions', t.testSessionId], ['testSessions', t.testSessionId, 'answers', 'x']]) await rejected(setDoc(doc(c.db, ...p.path, ...path), { totalXP: 999 })); await rejected(setDoc(doc(p.c.db, 'leaderboards', 'x'), { totalXP: 999 })); await rejected(updateDoc(doc(p.c.db, ...p.path), { gradeLevel: 7 })); });
test('foreign student and teacher cannot access another student test or summary', async () => { const p = await pupil(), foreign = await pupil(), t = await start(p); await rejected(foreign.c.call('getTestSession', { testSessionId: t.testSessionId })); await rejected(answer(foreign, t, t.questions[0])); for (const c of [foreign.c, other]) { await rejected(getDoc(doc(c.db, ...p.path, 'testSessions', t.testSessionId))); await rejected(getDoc(doc(c.db, ...p.path, 'learning', 'summary'))); } });
test('forged ownership, correct flag and XP fields are rejected', async () => { const p = await pupil(), t = await start(p), q = t.questions[0]; for (const extra of [{ teacherUid: teacher.auth.currentUser.uid }, { studentId: p.studentId }, { earnedXP: 999 }, { isCorrect: true }]) await rejected(p.c.call('submitAnswer', { testSessionId: t.testSessionId, questionId: q.questionId, selectedChoiceId: keys.get(q.questionId).correctChoiceId, ...extra })); });
test('question outside test and invalid choice are rejected without awards', async () => { const p = await pupil(), t = await start(p); await rejected(answer(p, t, { questionId: 'outside' }, 'a')); await rejected(answer(p, t, t.questions[0], 'invalid')); assert.equal((await getDoc(doc(p.c.db, ...p.path, 'learning', 'summary'))).exists(), false); });
test('wrong answer earns zero, reveals explanation, locks first choice', async () => { const p = await pupil(), t = await start(p), q = t.questions[0], wrong = q.choices.find(c => c.choiceId !== keys.get(q.questionId).correctChoiceId).choiceId; const first = await answer(p, t, q, wrong), retry = await answer(p, t, q); assert.equal(first.answer.isCorrect, false); assert.equal(first.answer.earnedXP, 0); assert.ok(first.answer.explanation); assert.deepEqual(retry.answer, first.answer); assert.equal(retry.test.wrongCount, 1); assert.equal(retry.totalXP, 0); });
test('skipped questions stay unanswered and award no XP; later questions can be answered first', async () => {
  const p=await pupil(),t=await start(p),skipped=t.questions[0],later=t.questions[1];
  await rejected(answer(p,t,skipped,''));
  assert.equal((await getDoc(doc(p.c.db,...p.path,'learning','summary'))).exists(),false);
  const result=await answer(p,t,later);
  assert.equal(result.totalXP,1);
  assert.deepEqual(result.test.answeredQuestionIds,[later.questionId]);
  assert.equal((await getDoc(doc(p.c.db,...p.path,'awardedQuestions',skipped.questionId))).exists(),false);
  assert.equal((await getDoc(doc(p.c.db,...p.path,'testSessions',t.testSessionId,'answers',skipped.questionId))).exists(),false);
  const returned=await answer(p,result.test,skipped);
  assert.equal(returned.totalXP,2);
});
test('first correct plus concurrent retries award exactly one XP and one answer', async () => { const p = await pupil(), t = await start(p), q = t.questions[0]; const results = await Promise.all(Array.from({ length: 5 }, () => answer(p, t, q))); assert.ok(results.every(r => r.totalXP === 1 && r.test.correctCount === 1)); assert.equal((await getDocs(collection(p.c.db, ...p.path, 'awardedQuestions'))).size, 1); assert.equal((await getDocs(collection(p.c.db, ...p.path, 'testSessions', t.testSessionId, 'answers'))).size, 1); });
test('same question concurrently in two tests can only award once', async () => { const p = await pupil(), a = await start(p), b = await start(p), q = a.questions.find(q => b.questions.some(x => x.questionId === q.questionId)); const results = await Promise.all([answer(p, a, q), answer(p, b, q)]); assert.equal(results.reduce((n, r) => n + r.answer.earnedXP, 0), 1); assert.equal((await getDoc(doc(p.c.db, ...p.path, 'learning', 'summary'))).data().totalXP, 1); });
test('completion history, accuracy and XP are distinct; fresh questions preferred; repeated learning earns zero', async () => { const p = await pupil(); let t = await start(p); for (const q of t.questions) t = (await answer(p, t, q)).test; assert.equal(t.status, 'completed'); assert.equal(t.correctCount, 10); assert.equal(t.earnedXP, 10); assert.ok(t.completedAt >= t.startedAt); const completed = t; t = await start(p); assert.ok(t.questions.slice(0, 2).every(q => !completed.questions.some(x => x.questionId === q.questionId))); for (const q of t.questions) t = (await answer(p, t, q)).test; assert.equal(t.correctCount, 10); assert.equal(t.earnedXP, 2); t = await start(p); for (const q of t.questions) t = (await answer(p, t, q)).test; assert.equal(t.earnedXP, 0); assert.equal(t.correctCount, 10); assert.equal((await getDoc(doc(p.c.db, ...p.path, 'learning', 'summary'))).data().totalXP, 12); const replay = await answer(p, completed, completed.questions[0]); assert.equal(replay.totalXP, 12); assert.equal(replay.test.earnedXP, 10); });
test('teacher grade edits immediately invalidate now-forbidden running tests', async () => { const p = await pupil(), t = await start(p); await teacher.call('updateStudent', { studentId: p.studentId, classId: cls.classId, gradeLevel: 5 }); await rejected(answer(p, t, t.questions[0])); await rejected(p.c.call('getTestSession', { testSessionId: t.testSessionId })); });
test('code rotation revokes running test and re-login preserves permanent student XP', async () => { const p = await pupil(), t = await start(p); await answer(p, t, t.questions[0]); const next = await teacher.call('rotateStudentCode', { studentId: p.studentId }); await rejected(answer(p, t, t.questions[1])); await loginStudent(p.c, next.code); const resumed = await p.c.call('getTestSession', { testSessionId: t.testSessionId }); assert.equal(resumed.earnedXP, 1); assert.equal((await answer(p, resumed, t.questions[0])).totalXP, 1); });
test('student removal blocks catalog, test resume and answer submission', async () => { const p = await pupil(), t = await start(p); await teacher.call('removeStudent', { studentId: p.studentId }); await rejected(p.c.call('quizCatalog', {})); await rejected(p.c.call('getTestSession', { testSessionId: t.testSessionId })); await rejected(answer(p, t, t.questions[0])); });

test('wrong answer in one test does not prevent first correct award in a later test', async () => {
  const p = await pupil(), first = await start(p), q = first.questions[0];
  await answer(p, first, q, q.choices.find(c => c.choiceId !== keys.get(q.questionId).correctChoiceId).choiceId);
  for (const otherQuestion of first.questions.slice(1)) await answer(p, first, otherQuestion);
  const second = await start(p); assert.ok(second.questions.slice(0, 3).some(x => x.questionId === q.questionId));
  const result = await answer(p, second, q); assert.equal(result.answer.earnedXP, 1); assert.equal(result.totalXP, 10);
});

test('grade change also blocks direct question snapshot and answer reads', async () => {
  const p = await pupil(), t = await start(p); await answer(p, t, t.questions[0]);
  await teacher.call('updateStudent', { studentId: p.studentId, classId: cls.classId, gradeLevel: 5 });
  await rejected(getDoc(doc(p.c.db, ...p.path, 'testSessions', t.testSessionId)));
  await rejected(getDoc(doc(p.c.db, ...p.path, 'testSessions', t.testSessionId, 'answers', t.questions[0].questionId)));
  assert.equal((await getDoc(doc(teacher.db, ...p.path, 'testSessions', t.testSessionId))).exists(), true);
});

test('another student cannot overwrite XP or awards of the owner', async () => {
  const owner = await pupil(), foreign = await pupil();
  await rejected(setDoc(doc(foreign.c.db, ...owner.path, 'learning', 'summary'), { totalXP: 999 }));
  await rejected(setDoc(doc(foreign.c.db, ...owner.path, 'awardedQuestions', 'forged'), { xp: 999 }));
});
