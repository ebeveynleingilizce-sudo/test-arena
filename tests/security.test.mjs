import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { client, teacherClient, loginStudent, clearLimiter, projectId } from './helpers.mjs';

let env, a, b, cls, student, code, clients = [];
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  a = await teacherClient(); b = await teacherClient(); clients.push(a, b);
  cls = await a.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 6 });
  const created = await a.call('createStudent', { classId: cls.classId, firstName: 'Ali', lastName: 'Yılmaz', gradeLevel: 6 });
  student = created.studentId; code = created.code;
});
beforeEach(clearLimiter);
after(async () => { await Promise.all(clients.map(c => c.close())); await env?.cleanup(); });
const studentPath = () => ['teachers', a.auth.currentUser.uid, 'students', student];
const classPath = () => ['teachers', a.auth.currentUser.uid, 'classes', cls.classId];
async function pupil() { const c = client(); clients.push(c); await loginStudent(c, code); return c; }

test('teacher A reads its class with independent className/defaultGradeLevel', async () => {
  const data = (await assertSucceeds(getDoc(doc(a.db, ...classPath())))).data();
  assert.equal(data.className, 'DOSTLAR'); assert.equal(data.defaultGradeLevel, 6);
});
test('teacher B cannot read or overwrite teacher A class, students or codes', async () => {
  await assertFails(getDoc(doc(b.db, ...classPath())));
  await assertFails(setDoc(doc(b.db, ...classPath()), { className: 'stolen' }));
  await assertFails(getDoc(doc(b.db, ...studentPath())));
  await assertFails(getDocs(collection(b.db, 'teachers', a.auth.currentUser.uid, 'studentCodes')));
  await assert.rejects(b.call('rotateStudentCode', { studentId: student }));
});
test('teacher creates a class and student; codes are unique under concurrent creation', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => a.call('createStudent', { classId: cls.classId, firstName: 'Test' + i, lastName: 'Öğrenci', gradeLevel: 5 })));
  assert.equal(new Set(results.map(r => r.code)).size, 5);
  for (const r of results) assert.match(r.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  assert.equal((await getDoc(doc(a.db, ...studentPath()))).data().gradeLevel, 6);
  const members = await getDocs(collection(a.db, ...classPath(), 'classMembers'));
  assert.ok(members.docs.some(d => d.id === student));
});
test('clean student signs in using only the six-character code and reads only its own record', async () => {
  const c = await pupil();
  assert.equal(c.auth.currentUser.providerData.length, 0);
  const token = await c.auth.currentUser.getIdTokenResult(); assert.equal(token.signInProvider, 'custom');
  const profile = (await assertSucceeds(getDoc(doc(c.db, ...studentPath())))).data();
  assert.equal(profile.firstName, 'Ali'); assert.equal(profile.className, 'DOSTLAR');
});
test('incorrect code cannot create a student session', async () => {
  const c = client(); clients.push(c);
  await assert.rejects(c.call('studentLogin', { code: '111111' }), /Kod geçersiz/);
  assert.equal(c.auth.currentUser, null);
});
test('global code index is unavailable to teacher, student and unauthenticated clients', async () => {
  const c = await pupil(), guest = client(); clients.push(guest);
  for (const who of [a, c, guest]) await assertFails(getDocs(collection(who.db, 'studentCodeIndex')));
});
test('student cannot access other teachers or list classmates/private credentials', async () => {
  const c = await pupil();
  const bClass = await b.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 8 });
  await assertFails(getDoc(doc(c.db, 'teachers', b.auth.currentUser.uid, 'classes', bClass.classId)));
  await assertFails(getDocs(collection(c.db, 'teachers', a.auth.currentUser.uid, 'students')));
  await assertFails(getDocs(collection(c.db, 'teachers', a.auth.currentUser.uid, 'studentCodes')));
  await assert.rejects(c.call('createClass', { className: 'forged', defaultGradeLevel: 6 }));
});
test('student cannot alter gradeLevel, credentials, or its session', async () => {
  const c = await pupil();
  await assertFails(updateDoc(doc(c.db, ...studentPath()), { gradeLevel: 12 }));
  await assertFails(updateDoc(doc(c.db, ...studentPath()), { credentialVersion: 9 }));
  await assertFails(updateDoc(doc(c.db, 'studentSessions', c.auth.currentUser.uid), { credentialVersion: 9 }));
});
test('teacher changes grade and class without changing permanent studentId', async () => {
  const destination = await a.call('createClass', { className: 'SALı GRUBU', defaultGradeLevel: 7 });
  await a.call('updateStudent', { studentId: student, classId: destination.classId, gradeLevel: 7 });
  const data = (await getDoc(doc(a.db, ...studentPath()))).data();
  assert.equal(data.studentId, student); assert.equal(data.gradeLevel, 7); assert.equal(data.classId, destination.classId);
  assert.equal((await getDoc(doc(a.db, ...classPath(), 'classMembers', student))).exists(), false);
  await a.call('updateStudent', { studentId: student, classId: cls.classId, gradeLevel: 6 });
});
test('rotating code rejects old code and revokes the existing authenticated session', async () => {
  const c = await pupil(), old = code;
  ({ code } = await a.call('rotateStudentCode', { studentId: student }));
  assert.notEqual(code, old);
  await assertFails(getDoc(doc(c.db, ...studentPath())));
  const fresh = client(); clients.push(fresh);
  await assert.rejects(fresh.call('studentLogin', { code: old }));
  await loginStudent(fresh, code);
  await assertSucceeds(getDoc(doc(fresh.db, ...studentPath())));
});
test('removing student revokes session and code and removes membership', async () => {
  const c = await pupil();
  await a.call('removeStudent', { studentId: student });
  await assertFails(getDoc(doc(c.db, ...studentPath())));
  await assert.rejects(c.call('studentLogin', { code }));
  assert.equal((await getDoc(doc(a.db, ...classPath(), 'classMembers', student))).exists(), false);
  assert.equal((await getDoc(doc(a.db, ...studentPath()))).data().status, 'removed');
});
test('server login limiter blocks repeated attempts regardless of supplied device identifiers', async () => {
  const c = client(); clients.push(c);
  for (let i = 0; i < 20; i++) await assert.rejects(c.call('studentLogin', { code: '111111', deviceId: 'different-' + i }), /Kod geçersiz/);
  await assert.rejects(c.call('studentLogin', { code: '111111' }), /Çok fazla deneme/);
});
test('teacher cannot forge a private record or use an invalid grade or another owner class', async () => {
  await assertFails(setDoc(doc(a.db, 'teachers', a.auth.currentUser.uid, 'students', 'forged'), { gradeLevel: 6 }));
  await assert.rejects(a.call('createClass', { className: 'invalid', defaultGradeLevel: 13 }));
  const other = await b.call('createClass', { className: 'other', defaultGradeLevel: 6 });
  await assert.rejects(a.call('createStudent', { classId: other.classId, firstName: 'A', lastName: 'B', gradeLevel: 6 }));
});
