import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getAuth} from 'firebase-admin/auth';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const syncQuestionBank = onCall({region:'europe-west1',enforceAppCheck:false,maxInstances:1}, async request=>{
 if(process.env.FUNCTIONS_EMULATOR!=='true'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-test-arena')throw new HttpsError('failed-precondition','Bu işlem yalnız local emulator içindir.');
 if(!request.auth||!['password','google.com'].includes(String(request.auth.token.firebase?.sign_in_provider)))throw new HttpsError('permission-denied','Admin yetkisi gerekli.');
 const user=await getAuth().getUser(request.auth.uid);
 if(user.disabled||user.email?.toLowerCase()!=='demo.ogretmen@testarena.local')throw new HttpsError('permission-denied','Admin yetkisi gerekli.');
 if(!request.data||typeof request.data!=='object'||Array.isArray(request.data)||Object.keys(request.data).length)throw new HttpsError('invalid-argument','Bu işlem parametre kabul etmez.');
 try{const engine=await import(pathToFileURL(resolve(__dirname,'../../scripts/import-question-folder.mjs')).href);return await engine.importQuestionFolder({log:()=>{}});}catch(error){if((error as {code?:string}).code==='SYNC_BUSY')throw new HttpsError('aborted','Başka bir güncelleme devam ediyor.');throw new HttpsError('internal','Soru bankası güvenli biçimde güncellenemedi.');}
});
