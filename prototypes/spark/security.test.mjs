import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, signInWithEmailAndPassword, updatePassword} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator, doc, collection, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where, setLogLevel} from 'firebase/firestore';
import {initializeApp as adminApp, deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {prepareQuestionBank} from '../../scripts/curriculum-bank.mjs';
import {codeCredentials, loginWithCode, submit, grade, award} from './client.mjs';

const projectId = 'demo-test-arena-spark-prototype';
setLogLevel('silent'); // Expected attack denials are assertions, not app errors.
// Refuse to run against the user's main demo project or a live Firebase service.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180'
 || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9199'
 || process.env.GCLOUD_PROJECT !== projectId) throw Error('Isolated prototype emulators required');
let env, admin, clients = [], ta, tb, sa, sb, raw, records;
const root = (s = 's1', t = 'ta') => `teachers/${t}/students/${s}`;
const ref = (db, path) => doc(db, path);
async function client(name, credentials) {
  const app = initializeApp({projectId, apiKey:'prototype-emulator-only'}, name);
  const auth = getAuth(app), db = getFirestore(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', {disableWarnings:true});
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
  clients.push(app);
  if (credentials) await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
  return {auth, db};
}
async function findBank(dir) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { const found = await findBank(path); if (found) return found; }
    else if (entry.name.startsWith('2-sinif-') && entry.name.endsWith('.json')) {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      if (parsed.grade === 2 && parsed.questions?.length >= 2) return parsed;
    }
  }
}
async function seed(path, data) {
  await env.withSecurityRulesDisabled(context => setDoc(ref(context.firestore(), path), data));
}
async function xp(s = 's1') { return (await getDoc(ref(sa.db, `${root(s)}/learning/summary`))).data().totalXP; }
async function attempt(a, correct = true, question = 'q1') {
  const record = records[question === 'q2' ? 1 : 0];
  const choice = correct ? record.answer.correctOptionId : record.question.choices.find(c => c.choiceId !== record.answer.correctOptionId).choiceId;
  await submit(sa.db, 'ta', 's1', a, question, choice);
  return choice;
}
before(async () => {
  env = await initializeTestEnvironment({projectId, firestore:{host:'127.0.0.1',port:8180,
    rules:await readFile(new URL('./firestore.rules', import.meta.url), 'utf8')}});
  await env.clearFirestore(); // This disposable project only, never demo-test-arena.
  admin = adminApp({projectId}, 'spark-prototype-admin');
  for (const [uid, credentials] of [['ta',{email:'a@prototype.invalid',password:'teacher-test-only'}],
    ['tb',{email:'b@prototype.invalid',password:'teacher-test-only'}],
    ['auth-s1',codeCredentials('K7M4Q9')],['auth-s2',codeCredentials('P8R2V6')]]) {
    await adminAuth(admin).createUser({uid, ...credentials});
    await seed(`roles/${uid}`, {role:uid.startsWith('auth-') ? 'student' : 'teacher'});
  }
  ta = await client('teacher-a', {email:'a@prototype.invalid',password:'teacher-test-only'});
  tb = await client('teacher-b', {email:'b@prototype.invalid',password:'teacher-test-only'});
  sa = await client('student-a'); sb = await client('student-b');
  await loginWithCode(sa.auth, 'K7M4Q9'); await loginWithCode(sb.auth, 'P8R2V6');
  for (const t of ['ta','tb']) await seed(`teachers/${t}/classes/c1`, {className:'DOSTLAR',defaultGradeLevel:2});
  for (const [s, uid] of [['s1','auth-s1'],['s2','auth-s2']]) {
    await seed(root(s), {studentId:s,teacherUid:'ta',classId:'c1',gradeLevel:2,status:'active',credentialVersion:1});
    await seed(`studentBindings/${uid}`, {teacherUid:'ta',studentId:s,version:1});
    await seed(`${root(s)}/learning/summary`, {totalXP:0,lastAwardQuestionId:''});
  }
  raw = await findBank(resolve('data/questions'));
  assert(raw, 'Existing grade 2 bank required; no questions are generated');
  records = prepareQuestionBank(raw).records.slice(0,2);
  for (const [i, record] of records.entries()) {
    await seed(`questions/q${i+1}`, {...record.question, choiceIds:record.question.choices.map(c => c.choiceId)});
    await seed(`privateQuestionAnswers/q${i+1}`, record.answer);
  }
  for (const q of ['q3','q4']) {
    await seed(`questions/${q}`, {...records[0].question,choiceIds:records[0].question.choices.map(c => c.choiceId)});
    await seed(`privateQuestionAnswers/${q}`,records[0].answer);
  }
  await seed('questions/upper-grade', {...records[0].question,gradeLevel:3,choiceIds:['a','b','c']});
  await seed('privateQuestionAnswers/upper-grade', {correctOptionId:'a'});
});
after(async () => {
  await Promise.all(clients.map(deleteApp));
  if (admin) await deleteAdminApp(admin);
  await env?.cleanup();
});

test('real Auth teacher login and short-code-only student login succeed without Functions', async () => {
  assert.equal(ta.auth.currentUser.uid, 'ta'); assert.equal(sa.auth.currentUser.uid,'auth-s1');
  assert.equal((await sa.auth.currentUser.getIdTokenResult()).signInProvider,'password');
  await assertSucceeds(getDoc(ref(sa.db, root())));
});
test('invalid short code cannot authenticate or list global code/binding index', async () => {
  const bad = await client('bad-code');
  await assert.rejects(loginWithCode(bad.auth, 'L3N8T4'));
  await assertFails(getDocs(collection(sa.db,'studentBindings')));
  await assertFails(getDocs(collection(sa.db,'studentCodeIndex')));
});
test('teacher A creates own class/profile with grade separate from class name', async () => {
  await assertSucceeds(setDoc(ref(ta.db,'teachers/ta/classes/new'),{className:'DOSTLAR',defaultGradeLevel:6}));
  await assertSucceeds(setDoc(ref(ta.db,root('new')),{studentId:'new',teacherUid:'ta',classId:'new',gradeLevel:5,status:'active',credentialVersion:1}));
  const profile = (await getDoc(ref(ta.db,root('new')))).data(); assert.equal(profile.gradeLevel,5);
  await assertSucceeds(setDoc(ref(ta.db,`${root('new')}/learning/summary`),{totalXP:0,lastAwardQuestionId:''}));
});
test('cross-teacher read/write and profile bound to foreign class are denied', async () => {
  await assertFails(getDoc(ref(tb.db,root())));
  await assertFails(updateDoc(ref(tb.db,'teachers/ta/classes/c1'),{className:'stolen'}));
  await assertFails(setDoc(ref(ta.db,root('foreign')),{studentId:'foreign',teacherUid:'tb',classId:'c1',gradeLevel:2,status:'active',credentialVersion:1}));
  await assertFails(setDoc(ref(ta.db,root('bad-class')),{studentId:'bad-class',teacherUid:'ta',classId:'foreign',gradeLevel:2,status:'active',credentialVersion:1}));
});
test('student cannot promote to teacher/admin or forge identity binding', async () => {
  await assertFails(setDoc(ref(sa.db,'roles/auth-s1'),{role:'teacher'}));
  await assertFails(setDoc(ref(sa.db,'studentBindings/auth-s1'),{teacherUid:'tb',studentId:'any',version:1}));
  await assertFails(setDoc(ref(sa.db,'teachers/auth-s1/classes/forged'),{className:'fake',defaultGradeLevel:2}));
});
test('student cannot read another student or change grade/class/status', async () => {
  await assertFails(getDoc(ref(sa.db,root('s2'))));
  await assertFails(updateDoc(ref(sa.db,root('s2')),{gradeLevel:12}));
  for (const data of [{gradeLevel:12},{classId:'new'},{status:'active',credentialVersion:9}]) await assertFails(updateDoc(ref(sa.db,root()),data));
});
test('existing importer preserves format, splits private answer, public DTO has no answer/explanation', async () => {
  assert.equal(raw.questions[0].correctOptionId,records[0].answer.correctOptionId);
  const data = (await assertSucceeds(getDoc(ref(sa.db,'questions/q1')))).data();
  for (const key of ['correctOptionId','correctChoiceId','explanation']) assert(!Object.hasOwn(data,key));
  for (const who of [sa,ta,tb]) {
    await assertFails(getDoc(ref(who.db,'privateQuestionAnswers/q1')));
    await assertFails(getDocs(collection(who.db,'privateQuestionAnswers')));
    await assertFails(setDoc(ref(who.db,'questions/injected'),records[0].question));
    await assertFails(updateDoc(ref(who.db,'privateQuestionAnswers/q1'),{correctOptionId:'a'}));
  }
});
test('grade access and unauthenticated reads are denied', async () => {
  const guest = await client('guest');
  await assertFails(getDoc(ref(guest.db,'questions/q1')));
  await assertFails(getDoc(ref(sa.db,'questions/upper-grade')));
  await assertFails(submit(sa.db,'ta','s1','upper','upper-grade','a'));
});
test('grade-filtered public question list succeeds; unrestricted list is denied', async () => {
  const bank = await assertSucceeds(getDocs(query(collection(sa.db,'questions'),where('gradeLevel','==',2),where('status','==','published'))));
  assert.equal(bank.size,4);
  await assertFails(getDocs(collection(sa.db,'questions')));
  for (const question of bank.docs) assert(!Object.hasOwn(question.data(),'correctOptionId'));
});
test('pre-answer grading oracle fails for true and false; same-batch attempt+result also fails', async () => {
  for (const isCorrect of [true,false]) await assertFails(setDoc(ref(sa.db,`${root()}/results/uncommitted`),{isCorrect,gradedAt:serverTimestamp()}));
  const batch = writeBatch(sa.db);
  batch.set(ref(sa.db,`${root()}/attempts/uncommitted`),{questionId:'q1',selectedChoiceId:records[0].answer.correctOptionId,submittedAt:serverTimestamp()});
  batch.set(ref(sa.db,`${root()}/results/uncommitted`),{isCorrect:true,gradedAt:serverTimestamp()});
  await assertFails(batch.commit());
  assert.equal((await getDoc(ref(sa.db,`${root()}/attempts/uncommitted`))).exists(),false);
});
test('blank/invalid answer is denied and skipped question awards nothing', async () => {
  await assertFails(submit(sa.db,'ta','s1','blank','q1',''));
  await assertFails(submit(sa.db,'ta','s1','invalid','q1','unknown'));
  await assertFails(award(sa.db,'ta','s1','blank','q1')); assert.equal(await xp(),0);
});
test('wrong committed answer is graded false and cannot award XP', async () => {
  await attempt('correct-ready'); // Kept separate from the genuinely wrong submission.
  await attempt('wrong-real',false);
  await assertFails(setDoc(ref(sa.db,`${root()}/results/wrong-real`),{isCorrect:true,gradedAt:serverTimestamp()}));
  assert.equal(await grade(sa.db,'ta','s1','wrong-real'),false);
  await assertFails(award(sa.db,'ta','s1','wrong-real','q1')); assert.equal(await xp(),0);
});
test('immutable committed answer cannot be changed or deleted after grading', async () => {
  await assertFails(updateDoc(ref(sa.db,`${root()}/attempts/wrong-real`),{selectedChoiceId:records[0].answer.correctOptionId}));
  await assertFails(deleteDoc(ref(sa.db,`${root()}/attempts/wrong-real`)));
  await assertFails(updateDoc(ref(sa.db,`${root()}/results/wrong-real`),{isCorrect:true}));
});
test('correct answer is graded true and first correct gives exactly +1 XP', async () => {
  await assertFails(setDoc(ref(sa.db,`${root()}/results/correct-ready`),{isCorrect:false,gradedAt:serverTimestamp()}));
  assert.equal(await grade(sa.db,'ta','s1','correct-ready'),true);
  assert.equal(await award(sa.db,'ta','s1','correct-ready','q1'),1); assert.equal(await xp(),1);
});
test('direct XP, fake award, partial award and teacher XP edit are denied', async () => {
  for (const amount of [2,1000000,-1]) await assertFails(updateDoc(ref(sa.db,`${root()}/learning/summary`),{totalXP:amount,lastAwardQuestionId:'q2'}));
  await assertFails(updateDoc(ref(ta.db,`${root()}/learning/summary`),{totalXP:100}));
  await assertFails(setDoc(ref(sa.db,`${root()}/awardedQuestions/q2`),{attemptId:'correct-ready',xp:1,awardedAt:serverTimestamp()}));
});
test('repeat correct earns 0; award cannot be rewritten/deleted or reused for other question', async () => {
  await attempt('repeat'); assert.equal(await grade(sa.db,'ta','s1','repeat'),true);
  assert.equal(await award(sa.db,'ta','s1','repeat','q1'),0); assert.equal(await xp(),1);
  await assertFails(deleteDoc(ref(sa.db,`${root()}/awardedQuestions/q1`)));
  await assertFails(updateDoc(ref(sa.db,`${root()}/awardedQuestions/q1`),{xp:5}));
  await assertFails(award(sa.db,'ta','s1','repeat','q2'));
});
test('concurrent correct awards for same question produce a single XP increment', async () => {
  await attempt('concurrent-a',true,'q2'); await attempt('concurrent-b',true,'q2');
  await grade(sa.db,'ta','s1','concurrent-a'); await grade(sa.db,'ta','s1','concurrent-b');
  const earned = await Promise.all([award(sa.db,'ta','s1','concurrent-a','q2'),award(sa.db,'ta','s1','concurrent-b','q2')]);
  assert.equal(earned.reduce((a,b) => a+b),1); assert.equal(await xp(),2);
});
test('other student cannot submit, grade, award or modify victim progress', async () => {
  await assertFails(submit(sb.db,'ta','s1','forged-other','q1',records[0].answer.correctOptionId));
  await assertFails(setDoc(ref(sb.db,`${root()}/results/forged-other`),{isCorrect:true,gradedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref(sb.db,`${root()}/learning/summary`),{totalXP:3,lastAwardQuestionId:'q2'}));
  assert.equal((await getDoc(ref(sb.db,`${root('s2')}/learning/summary`))).data().totalXP,0);
});
test('two award documents cannot share one XP increment; extra XP/answer fields are denied', async () => {
  for (const q of ['q3','q4']) {
    await submit(sa.db,'ta','s1',q,q,records[0].answer.correctOptionId);
    assert.equal(await grade(sa.db,'ta','s1',q),true);
  }
  const batch = writeBatch(sa.db);
  for (const q of ['q3','q4']) batch.set(ref(sa.db,`${root()}/awardedQuestions/${q}`),{attemptId:q,xp:1,awardedAt:serverTimestamp()});
  batch.update(ref(sa.db,`${root()}/learning/summary`),{totalXP:3,lastAwardQuestionId:'q3'});
  await assertFails(batch.commit()); assert.equal(await xp(),2);
  assert.equal((await getDoc(ref(sa.db,`${root()}/awardedQuestions/q3`))).exists(),false);
  await assertFails(setDoc(ref(sa.db,`${root()}/attempts/injected-fields`),{questionId:'q1',selectedChoiceId:'a',isCorrect:true,earnedXP:99,submittedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref(sa.db,`${root()}/learning/summary`),{totalXP:3,lastAwardQuestionId:'q3',extraXP:99}));
});
test('missing private answer fails closed and removal revokes the second student', async () => {
  await seed('questions/no-key',{...records[0].question,choiceIds:records[0].question.choices.map(c=>c.choiceId)});
  await submit(sa.db,'ta','s1','no-key','no-key',records[0].answer.correctOptionId);
  await assert.rejects(grade(sa.db,'ta','s1','no-key'),/Grading denied/);
  await assertFails(award(sa.db,'ta','s1','no-key','no-key'));
  await assertSucceeds(updateDoc(ref(ta.db,root('s2')),{status:'removed',credentialVersion:2}));
  await assertFails(getDoc(ref(sb.db,root('s2'))));
});
test('previous grade access is allowed only after an authorized teacher grade change', async () => {
  await assertSucceeds(updateDoc(ref(ta.db,root()),{gradeLevel:3}));
  await assertSucceeds(getDoc(ref(sa.db,'questions/q1'))); // Previous grade = 2.
  await assertSucceeds(getDoc(ref(sa.db,'questions/upper-grade'))); // Own grade = 3.
  await assertSucceeds(updateDoc(ref(ta.db,root()),{gradeLevel:2}));
  await assertFails(getDoc(ref(sa.db,'questions/upper-grade')));
});
test('known limitation: native password Auth lets student change own password outside Firestore Rules', async () => {
  await updatePassword(sa.auth.currentUser,'prototype-student-changed-password');
  const oldCode = await client('old-code-after-password-change');
  await assert.rejects(loginWithCode(oldCode.auth,'K7M4Q9'));
  const credentials = codeCredentials('K7M4Q9');
  const changed = await client('changed-password',{email:credentials.email,password:'prototype-student-changed-password'});
  assert.equal(changed.auth.currentUser.uid,'auth-s1');
  await assertSucceeds(getDoc(ref(changed.db,root())));
  // This proves data isolation, but DISPROVES teacher-exclusive credential
  // control for the native password alias substitute. Do not call it equivalent.
});
test('credential version revocation blocks existing Auth session immediately in Rules', async () => {
  await assertSucceeds(updateDoc(ref(ta.db,root()),{credentialVersion:2}));
  await assertFails(getDoc(ref(sa.db,root())));
  await assertFails(getDoc(ref(sa.db,'questions/q1')));
  await assertFails(submit(sa.db,'ta','s1','revoked','q1',records[0].answer.correctOptionId));
});
