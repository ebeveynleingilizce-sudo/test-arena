import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { firebaseEnvironment } from './firebaseEnvironment';
import { sparkCall } from './spark.mjs';
import { timedReport } from './report-request.mjs';

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
const pendingReads=new Map<string,Promise<unknown>>(),sharedReads=new Set(['quizCatalog','getTestSession','startDuelTest','teacherQuestionBank','teacherBankPermissions','getBankQuestion','teacherAnalytics','teacherTestHistory']);
let readGeneration=0;
export async function call<T>(name: string, data: unknown, options?:{signal?:AbortSignal}): Promise<T> {
  const context={auth,db,app,emulator:environment.emulator,testPorts:environment.ports};
  const work=()=>name==='teacherAnalytics'?timedReport(signal=>sparkCall(name,data,{...context,signal}),undefined,options?.signal):sparkCall(name,data,context);
  // A screen-owned request has its own cancellation lifetime. Completed report
  // caching still applies, but it cannot borrow another screen's abort signal.
  if(name==='teacherAnalytics'&&options?.signal)return await work() as T;
  if(!sharedReads.has(name)){readGeneration++;try{return await work() as T;}finally{readGeneration++;}}
  const key=JSON.stringify([auth.currentUser?.uid,readGeneration,name,data]);if(pendingReads.has(key))return await pendingReads.get(key) as T;
  const promise=work().finally(()=>pendingReads.delete(key));pendingReads.set(key,promise);return await promise as T;
}
