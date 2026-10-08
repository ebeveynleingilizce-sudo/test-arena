import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { collection, doc, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { client, teacherClient, loginStudent, clearLimiter } from './helpers.mjs';
import { disposeFixture } from './classroom-fixture.mjs';

test('bulk creation: 50 unique credentials, default grade, memberships, zero analytics and idempotent concurrent retry', async () => {
  const t = await teacherClient();
  try {
    const { classId } = await t.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 6 });
    const names = Array.from({length:50}, (_,i) => i < 2 ? 'Mehmet Kayra Aşık' : `Öğrenci ${i}`);
    const input = {classId, names: ['', ...names, '  '], requestId:randomUUID(), gradeLevel:12, teacherUid:'forged'};
    const [a,b] = await Promise.all([t.call('bulkCreateStudents',input), t.call('bulkCreateStudents',input)]);
    assert.deepEqual(a,b); assert.equal(a.results.length,50);
    assert.equal(new Set(a.results.map(r=>r.studentId)).size,50); assert.equal(new Set(a.results.map(r=>r.code)).size,50);
    const path=['teachers',t.auth.currentUser.uid];
    const pupils=await getDocs(collection(t.db,...path,'students'));
    assert.equal(pupils.size,50);
    for(const p of pupils.docs) {
      assert.equal(p.data().classId,classId);assert.equal(p.data().className,'DOSTLAR');assert.equal(p.data().gradeLevel,6);
      assert.equal((await getDoc(doc(t.db,...path,'classes',classId,'classMembers',p.id))).exists(),true);
      assert.equal((await getDoc(doc(t.db,...path,'students',p.id,'analytics','summary'))).data().overall.solved,0);
      assert.equal((await getDoc(doc(t.db,...path,'classes',classId,'leaderboard',p.id))).data().academicXP,0);
    }
    await assert.rejects(t.call('bulkCreateStudents',{...input,names:['Başka İsim']}),/different|liste|sınıf/i);
    await assert.rejects(getDoc(doc(t.db,...path,'bulkImports',input.requestId)));
    await assert.rejects(setDoc(doc(t.db,...path,'students','forged'),{firstName:'Hile'}));
  } finally {await disposeFixture(t);}
});

test('bulk enforces teacher isolation, provider, bounds and explicit per-line failures; safe full names and login', async () => {
  const t=await teacherClient(), other=await teacherClient(), anon=client(), pupil=client();
  try {
    const {classId}=await t.call('createClass',{className:'DOSTLAR',defaultGradeLevel:2});
    const input={classId,names:['Ali Ak'],requestId:randomUUID()};
    await assert.rejects(other.call('bulkCreateStudents',{...input,teacherUid:t.auth.currentUser.uid}));
    await assert.rejects(anon.call('bulkCreateStudents',input));
    for(const names of [[],['',' '],Array(51).fill('Ali Ak'),[123]]) await assert.rejects(t.call('bulkCreateStudents',{...input,names}));
    const response=await t.call('bulkCreateStudents',{...input,names:['  Mehmet   Kayra Aşık ', 'Ali', 'A'.repeat(201), 'Ezgi Gür']});
    assert.equal(response.results.length,4);assert.equal(response.results[0].name,'Mehmet Kayra Aşık');
    assert.ok(response.results[2].error);assert.equal(response.results[2].studentId,undefined);
    assert.equal(response.results.filter(r=>r.code).length,3);
    const report=await t.call('teacherAnalytics',{classId});assert.equal(report.totals.studentCount,3);assert.equal(report.totals.overall.solved,0);
    assert.ok(report.students.some(s=>s.displayName.trim()==='Ali'));
    await clearLimiter();await loginStudent(pupil,response.results[0].code);
    await assert.rejects(pupil.call('bulkCreateStudents',input));
    assert.equal((await getDocs(collection(other.db,'teachers',other.auth.currentUser.uid,'students'))).size,0);
  } finally {await pupil.close();await anon.close();await disposeFixture(t);await disposeFixture(other);}
});
