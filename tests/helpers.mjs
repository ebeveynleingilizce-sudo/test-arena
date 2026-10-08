import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { randomUUID } from 'node:crypto';
export const projectId = 'demo-test-arena';
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Only demo project allowed.');
export function client() {
  const app = initializeApp({ projectId, apiKey: 'demo-emulator-key' }, randomUUID());
  const auth = getAuth(app), db = getFirestore(app), functions = getFunctions(app, 'europe-west1');
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return { app, auth, db, call: async (name, data) => (await httpsCallable(functions, name)(data)).data, close: () => deleteApp(app) };
}
export async function teacherClient({ fixtures = true } = {}) {
  const c = client();
  await createUserWithEmailAndPassword(c.auth, `teacher-${randomUUID()}@example.invalid`, 'test-only-password');
  if (fixtures) await enableFixtureTeacher(c.auth.currentUser.uid);
  return c;
}
// Private emulator-only flag is written via the Admin REST endpoint, never by UI/API inputs.
export async function enableFixtureTeacher(uid) {
  if (uid.includes('@')) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    const {initializeApp,deleteApp} = await import('firebase-admin/app'), {getAuth} = await import('firebase-admin/auth');
    const app = initializeApp({projectId}, 'fixture-auth-' + randomUUID());
    try {uid = (await getAuth(app).getUserByEmail(uid)).uid;} finally {await deleteApp(app);}
  }
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/teachers/${uid}?updateMask.fieldPaths=testFixtureBank`, {method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:{testFixtureBank:{booleanValue:true}}})});
  if (!response.ok) throw new Error('Local fixture gate failed');
}
export async function loginStudent(c, code) {
  const { token } = await c.call('studentLogin', { code });
  await signInWithCustomToken(c.auth, token);
}
export async function clearLimiter() {
  // Admin REST endpoint exists only on the local emulator.
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/loginLimits?pageSize=1000`, { headers: { Authorization: 'Bearer owner' } });
  if (!response.ok) throw new Error('Firestore emulator unavailable');
  const body = await response.json();
  for (const doc of body.documents || []) await fetch('http://127.0.0.1:8080/v1/' + doc.name, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}
