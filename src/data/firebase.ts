import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

// Deliberately no live configuration or production fallback in Milestone 1.
if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  throw new Error('Bu sürüm yalnızca yerel Firebase Emulator ile çalışır.');
}
export const app = initializeApp({ projectId: 'demo-test-arena', apiKey: 'demo-emulator-key', authDomain: 'demo-test-arena.firebaseapp.com' });
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectFunctionsEmulator(functions, '127.0.0.1', 5001);
export const persistenceReady = setPersistence(auth, browserLocalPersistence);
export async function call<T>(name: string, data: unknown): Promise<T> {
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
