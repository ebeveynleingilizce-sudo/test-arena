import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { projectId } from './helpers.mjs';

// Cleanup only this test's teacher namespace and associated credentials/sessions.
export async function disposeFixture(client) {
  const uid = client.auth.currentUser.uid;
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  const app = initializeApp({ projectId }, 'classroom-cleanup-' + randomUUID()), db = getFirestore(app);
  try {
    const root = db.doc('teachers/' + uid);
    const pupils = await root.collection('students').get();
    for (const pupil of pupils.docs) {
      const tests = await pupil.ref.collection('testSessions').get();
      for (const test of tests.docs) await db.doc('privateTestKeys/' + test.id).delete();
    }
    const codes = await root.collection('studentCodes').get();
    const sessions = await db.collection('studentSessions').where('teacherUid', '==', uid).get();
    for (const code of codes.docs) await db.doc('studentCodeIndex/' + code.data().codeHash).delete();
    for (const session of sessions.docs) {
      await session.ref.delete();
      await getAuth(app).deleteUser(session.id).catch(e => { if (e.code !== 'auth/user-not-found') throw e; });
    }
    await db.recursiveDelete(root);
    await getAuth(app).deleteUser(uid);
  } finally { await deleteApp(app); await client.close(); }
}
