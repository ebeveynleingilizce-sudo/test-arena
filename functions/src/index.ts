import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { arenaPeriod, arenaRow, readProgress, publicArenaRow } from './arena-store.js';
import { emptySummary } from './analytics-store.js';
const emulator = process.env.FUNCTIONS_EMULATOR === 'true';
// Never fall back to live services when a local emulator is missing.
if (emulator && (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST
  || !(process.env.GCLOUD_PROJECT || '').startsWith('demo-'))) throw new Error('Demo emulators required.');
initializeApp();
const db = getFirestore();
const codeSecret = defineSecret('STUDENT_CODE_HMAC');
const options = { region: 'europe-west1', maxInstances: 3, minInstances: 0,
  enforceAppCheck: !emulator, secrets: emulator ? [] : [codeSecret] };
const secret = () => emulator ? 'test-arena-local-only-hmac-not-for-production' : codeSecret.value();
const hash = (value: string) => createHmac('sha256', secret()).update(value).digest('hex');
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpsError('invalid-argument', 'Alanları kontrol et.');
  return value.trim();
}
function grade(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 2 || Number(value) > 12) throw new HttpsError('invalid-argument', 'Kademe 2–12 arasında olmalı.');
  return Number(value);
}
function id(value: unknown) {
  const result = text(value, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new HttpsError('invalid-argument', 'Geçersiz kimlik.');
  return result;
}
function teacher(request: CallableRequest) {
  const provider = request.auth?.token.firebase?.sign_in_provider;
  if (!request.auth || !['password', 'google.com'].includes(String(provider))) throw new HttpsError('permission-denied', 'Öğretmen girişi gerekli.');
  return request.auth.uid;
}
const account = (uid: string) => db.collection('teachers').doc(uid);
export const createClass = onCall(options, async request => {
  const uid = teacher(request), className = text(request.data?.className, 60), defaultGradeLevel = grade(request.data?.defaultGradeLevel);
  const cls = account(uid).collection('classes').doc();
  await cls.set({ classId: cls.id, teacherUid: uid, className, defaultGradeLevel, arenaVersion: 1, createdAt: FieldValue.serverTimestamp() });
  return { classId: cls.id };
});
async function createStudentRecord(uid: string, classId: string, firstName: string, lastName: string, gradeLevel: number, studentId?: string) {
  const root = account(uid), cls = root.collection('classes').doc(classId), student = studentId ? root.collection('students').doc(studentId) : root.collection('students').doc();
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = newCode(), codeHash = hash(code), index = db.collection('studentCodeIndex').doc(codeHash);
    const created = await db.runTransaction(async tx => {
      const [classSnap, codeSnap] = await tx.getAll(cls, index);
      if (!classSnap.exists) throw new HttpsError('not-found', 'Sınıf bulunamadı.');
      if (studentId) {
        const [existing, credential] = await tx.getAll(student, root.collection('studentCodes').doc(student.id));
        if (existing.exists) {
          if (existing.data()!.status !== 'active' || !credential.exists) throw new HttpsError('failed-precondition', 'Öğrenci daha önce oluşturuldu ve sonradan kaldırıldı.');
          return { studentId: student.id, code: credential.data()!.code };
        }
      }
      if (codeSnap.exists) return false;
      const studentData = { studentId: student.id, teacherUid: uid, classId, className: classSnap.data()!.className,
        firstName, lastName, gradeLevel, status: 'active', credentialVersion: 1, createdAt: FieldValue.serverTimestamp() };
      tx.create(student, studentData);
      tx.create(student.collection('analytics').doc('summary'), emptySummary());
      tx.create(index, { teacherUid: uid, studentId: student.id, credentialVersion: 1 });
      tx.create(root.collection('studentCodes').doc(student.id), { code, codeHash });
      tx.create(cls.collection('classMembers').doc(student.id), { studentId: student.id });
      tx.create(arenaRow(uid, classId, student.id), publicArenaRow(studentData, 0, 0, arenaPeriod().weekKey));
      return { studentId: student.id, code };
    });
    if (created) return created;
  }
  throw new HttpsError('resource-exhausted', 'Kod oluşturulamadı; yeniden dene.');
}

export const createStudent = onCall(options, async request => {
  const uid = teacher(request), classId = id(request.data?.classId);
  const firstName = text(request.data?.firstName, 40), lastName = text(request.data?.lastName, 40), gradeLevel = grade(request.data?.gradeLevel);
  return createStudentRecord(uid, classId, firstName, lastName, gradeLevel);
});

// Private manifest binds retries to one teacher, class and list. Deterministic
// per-line IDs prevent double enrollment when a response is lost.
export const bulkCreateStudents = onCall({ ...options, timeoutSeconds: 120 }, async request => {
  const uid = teacher(request), classId = id(request.data?.classId), requestId = text(request.data?.requestId, 36);
  if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Geçersiz işlem kimliği.');
  if (!Array.isArray(request.data?.names) || request.data.names.some((n: unknown) => typeof n !== 'string')) throw new HttpsError('invalid-argument', 'Her satıra bir öğrenci adı yaz.');
  const names: string[] = request.data.names.map((n: string) => n.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!names.length || names.length > 50) throw new HttpsError('invalid-argument', 'Bir işlemde 1–50 öğrenci eklenebilir.');
  const root = account(uid), manifest = root.collection('bulkImports').doc(requestId), cls = root.collection('classes').doc(classId);
  const gradeLevel = await db.runTransaction(async tx => {
    const [c, job] = await tx.getAll(cls, manifest);
    if (!c.exists) throw new HttpsError('not-found', 'Sınıf bulunamadı.');
    if (job.exists) {
      if (job.data()!.classId !== classId || JSON.stringify(job.data()!.names) !== JSON.stringify(names)) throw new HttpsError('failed-precondition', 'Bu işlem farklı bir liste veya sınıf için kullanılamaz.');
      return grade(job.data()!.gradeLevel);
    }
    const value = grade(c.data()!.defaultGradeLevel);
    tx.create(manifest, { classId, names, gradeLevel: value, createdAt: FieldValue.serverTimestamp() });
    return value;
  });
  const results = [];
  for (const [line, name] of names.entries()) {
    try {
      if (name.length > 80) throw new HttpsError('invalid-argument', 'Tam ad 80 karakteri aşamaz.');
      const words = name.split(' '), lastName = words.length > 1 ? words.pop()! : '', firstName = text(words.join(' '), 40);
      if (lastName) text(lastName, 40);
      const result = await createStudentRecord(uid, classId, firstName, lastName, gradeLevel, 'bulk_' + requestId + '_' + line);
      results.push({ name, ...result });
    } catch (e) {
      results.push({ name, error: e instanceof HttpsError ? e.message : 'Öğrenci eklenemedi. Aynı işlemi yeniden deneyebilirsin.' });
    }
  }
  return { results };
});

export const updateStudent = onCall(options, async request => {
  const uid = teacher(request), sid = id(request.data?.studentId), targetClassId = id(request.data?.classId), gradeLevel = grade(request.data?.gradeLevel);
  const root = account(uid), student = root.collection('students').doc(sid), target = root.collection('classes').doc(targetClassId);
  await db.runTransaction(async tx => {
    const [studentSnap, targetSnap] = await tx.getAll(student, target);
    if (!studentSnap.exists || studentSnap.data()!.status !== 'active' || !targetSnap.exists) throw new HttpsError('not-found', 'Öğrenci veya sınıf bulunamadı.');
    const oldClassId = studentSnap.data()!.classId;
    const summaryRef = student.collection('learning').doc('summary');
    const summary = await tx.get(summaryRef);
    const progress = await readProgress(tx, student, summary.data() || {}, new Date());
    if (oldClassId !== targetClassId) {
      tx.delete(root.collection('classes').doc(oldClassId).collection('classMembers').doc(sid));
      tx.set(target.collection('classMembers').doc(sid), { studentId: sid });
      tx.delete(arenaRow(uid, oldClassId, sid));
    }
    tx.update(student, { classId: targetClassId, className: targetSnap.data()!.className, gradeLevel });
    tx.set(summaryRef, { academicXP: progress.academicXP }, { merge: true });
    tx.set(progress.weekRef, { weekKey: progress.period.weekKey, academicXP: progress.weeklyAcademicXP });
    tx.set(arenaRow(uid, targetClassId, sid), publicArenaRow({ ...studentSnap.data(), classId: targetClassId },
      progress.academicXP, progress.weeklyAcademicXP, progress.period.weekKey));
  });
  return { ok: true };
});
export const rotateStudentCode = onCall(options, async request => {
  const uid = teacher(request), sid = id(request.data?.studentId), root = account(uid);
  const student = root.collection('students').doc(sid), credential = root.collection('studentCodes').doc(sid);
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = newCode(), codeHash = hash(code), index = db.collection('studentCodeIndex').doc(codeHash);
    const changed = await db.runTransaction(async tx => {
      const [s, c, candidate] = await tx.getAll(student, credential, index);
      if (!s.exists || s.data()!.status !== 'active' || !c.exists) throw new HttpsError('not-found', 'Öğrenci bulunamadı.');
      if (candidate.exists) return false;
      const credentialVersion = s.data()!.credentialVersion + 1;
      // Tombstones prevent an old code ever being reassigned to another student.
      tx.set(db.collection('studentCodeIndex').doc(c.data()!.codeHash), { revoked: true });
      tx.create(index, { teacherUid: uid, studentId: sid, credentialVersion });
      tx.update(student, { credentialVersion });
      tx.set(credential, { code, codeHash });
      return true;
    });
    if (changed) return { code };
  }
  throw new HttpsError('resource-exhausted', 'Kod yenilenemedi.');
});
export const removeStudent = onCall(options, async request => {
  const uid = teacher(request), sid = id(request.data?.studentId), root = account(uid);
  const student = root.collection('students').doc(sid), credential = root.collection('studentCodes').doc(sid);
  await db.runTransaction(async tx => {
    const [s, c] = await tx.getAll(student, credential);
    if (!s.exists) throw new HttpsError('not-found', 'Öğrenci bulunamadı.');
    if (s.data()!.status === 'removed') return;
    if (c.exists) tx.set(db.collection('studentCodeIndex').doc(c.data()!.codeHash), { revoked: true });
    tx.update(student, { status: 'removed', credentialVersion: s.data()!.credentialVersion + 1 });
    tx.delete(credential);
    tx.delete(root.collection('classes').doc(s.data()!.classId).collection('classMembers').doc(sid));
    tx.delete(arenaRow(uid, s.data()!.classId, sid));
  });
  return { ok: true };
});
export const studentLogin = onCall(options, async request => {
  // Shared persistent limiter: counts successes and failures and cannot be reset
  // by changing a browser-provided device ID. rawRequest.ip comes from the host.
  const limit = db.collection('loginLimits').doc(hash('ip:' + (request.rawRequest.ip || 'unknown')));
  const allowed = await db.runTransaction(async tx => {
    const snap = await tx.get(limit), now = Date.now(), data = snap.data();
    const fresh = !data || now - data.windowStart >= 60_000;
    const count = fresh ? 0 : data.count;
    if (count >= 20) return false;
    tx.set(limit, { windowStart: fresh ? now : data!.windowStart, count: count + 1 });
    return true;
  });
  if (!allowed) throw new HttpsError('resource-exhausted', 'Çok fazla deneme. Bir dakika sonra yeniden dene.');
  const code = typeof request.data?.code === 'string' ? request.data.code.trim().toUpperCase() : '';
  const invalid = () => new HttpsError('unauthenticated', 'Kod geçersiz veya yenilenmiş. Öğretmeninden güncel kodu iste.');
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(code)) throw invalid();
  const index = db.collection('studentCodeIndex').doc(hash(code)), sessionUid = 'student_' + randomUUID();
  await db.runTransaction(async tx => {
    const c = await tx.get(index);
    if (!c.exists || c.data()!.revoked) throw invalid();
    const { teacherUid, studentId, credentialVersion } = c.data()!;
    const s = await tx.get(account(teacherUid).collection('students').doc(studentId));
    if (!s.exists || s.data()!.status !== 'active' || s.data()!.credentialVersion !== credentialVersion) throw invalid();
    tx.create(db.collection('studentSessions').doc(sessionUid), { teacherUid, studentId, credentialVersion, createdAt: FieldValue.serverTimestamp() });
  });
  // Rotating/removing between this transaction and token minting is safe:
  // Rules recheck the canonical version on every private data request.
  return { token: await getAuth().createCustomToken(sessionUid, { role: 'student' }) };
});
export { quizCatalog, startTest, getTestSession, submitAnswer } from './quiz.js';
export { prepareArena } from './arena.js';
export { teacherAnalytics } from './analytics.js';

export { syncQuestionBank } from './question-bank-admin.js';
