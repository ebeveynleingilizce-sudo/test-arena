import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { activeStudent } from './quiz.js';
import { arenaPeriod, arenaRow, readProgress, publicArenaRow } from './arena-store.js';

export const prepareArena = onCall({ region: 'europe-west1', minInstances: 0, maxInstances: 3,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async request => {
  if (!request.data || Object.keys(request.data).length) throw new HttpsError('invalid-argument', 'Arena kimliği oturumdan belirlenir.');
  return getFirestore().runTransaction(async tx => {
    const identity = await activeStudent(request, tx);
    const classRef = getFirestore().doc(`teachers/${identity.teacherUid}/classes/${identity.classId}`);
    const cls = await tx.get(classRef);
    if (!cls.exists) throw new HttpsError('not-found', 'Sınıf bulunamadı.');
    const now = new Date();
    // Only pre-M3 classes need a one-time read-model rebuild. Normal entry reads
    // identity + class metadata; never scans question/test history per render.
    if (cls.data()!.arenaVersion !== 1) {
      const members = await tx.get(getFirestore().collection(`teachers/${identity.teacherUid}/students`)
        .where('classId', '==', identity.classId).where('status', '==', 'active'));
      const summaries = members.empty ? [] : await tx.getAll(...members.docs.map(s => s.ref.collection('learning').doc('summary')));
      const progress: Awaited<ReturnType<typeof readProgress>>[] = [];
      for (let i = 0; i < members.size; i++) progress.push(await readProgress(tx, members.docs[i].ref, summaries[i].data() || {}, now));
      // All reads precede all writes. A concurrent answer, move or removal
      // conflicts with the canonical documents and is revalidated by Firestore.
      members.docs.forEach((s, i) => {
        const p = progress[i];
        tx.set(s.ref.collection('learning').doc('summary'), { academicXP: p.academicXP }, { merge: true });
        tx.set(p.weekRef, { weekKey: p.period.weekKey, academicXP: p.weeklyAcademicXP });
        tx.set(arenaRow(identity.teacherUid, identity.classId, s.id), publicArenaRow(s.data(), p.academicXP, p.weeklyAcademicXP, p.period.weekKey));
      });
      tx.update(classRef, { arenaVersion: 1 });
    }
    return { ...arenaPeriod(now), serverNow: now.getTime(), classId: identity.classId, className: cls.data()!.className };
  });
});
