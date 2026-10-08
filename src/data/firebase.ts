import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { firebaseEnvironment } from './firebaseEnvironment';
import { sparkCall } from './spark.mjs';

const environment = firebaseEnvironment(import.meta.env, location.hostname);
export const app = initializeApp(environment.config);
if (!environment.emulator && environment.siteKey) initializeAppCheck(app, {provider:new ReCaptchaEnterpriseProvider(environment.siteKey),isTokenAutoRefreshEnabled:true});
export const auth = getAuth(app);
export const db = getFirestore(app);
if (environment.emulator) {
  connectAuthEmulator(auth, `http://127.0.0.1:${environment.ports.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', environment.ports.firestore);
}
export const persistenceReady = setPersistence(auth, browserLocalPersistence);
export async function call<T>(name: string, data: unknown): Promise<T> {
  return await sparkCall(name, data, {auth, db, app, emulator:environment.emulator,testPorts:environment.ports}) as T;
}
