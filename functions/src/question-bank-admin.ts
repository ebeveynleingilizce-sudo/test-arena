import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getAuth} from 'firebase-admin/auth';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {defineSecret,defineString} from 'firebase-functions/params';
import {getFirestore} from 'firebase-admin/firestore';
import {authorizeBankSync,syncGithubBank} from '../github-bank-sync.mjs';
import {githubBankSource} from '../github-bank-source.mjs';
const githubToken=defineSecret('QUESTION_BANK_GITHUB_TOKEN');
const githubRepository=defineString('QUESTION_BANK_GITHUB_REPOSITORY',{default:'ebeveynleingilizce-sudo/test-arena-question-bank'});
const local=process.env.FUNCTIONS_EMULATOR==='true';
export const syncQuestionBank = onCall({region:'europe-west1',enforceAppCheck:false,maxInstances:1,concurrency:1,timeoutSeconds:540,memory:'1GiB',secrets:local?[]:[githubToken]}, async request=>{
 if(!request.data||typeof request.data!=='object'||Array.isArray(request.data)||Object.keys(request.data).length)throw new HttpsError('invalid-argument','Bu işlem parametre kabul etmez.');
 if(!local){
  try{
   const db=getFirestore(),actorUid=await authorizeBankSync(db,request.auth);
   return await syncGithubBank({db,actorUid,source:githubBankSource({repository:githubRepository.value(),token:githubToken.value()}),hooks:{beforeSwitch:()=>authorizeBankSync(db,request.auth)}});
  }catch(error){
   const code=(error as Error).message;
   if(code==='ADMIN_REQUIRED')throw new HttpsError('permission-denied','Güncelleme yalnızca tunc@test.com admin hesabına açıktır.');
   if(code==='SYNC_BUSY')throw new HttpsError('aborted','Başka bir güncelleme sürüyor. Biraz sonra yeniden dene.');
   if(['SOURCE_CONFIGURATION','SOURCE_AUTHORIZATION','SOURCE_NOT_FOUND','PRIVATE_REPOSITORY_REQUIRED'].includes(code))throw new HttpsError('failed-precondition','Özel GitHub soru deposu bağlantısı yapılandırılmalı.');
   throw new HttpsError('internal','Güncelleme tamamlanamadı. Mevcut testler korundu; yeniden deneyebilirsin.');
  }
 }
 if(process.env.FUNCTIONS_EMULATOR!=='true'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-test-arena')throw new HttpsError('failed-precondition','Bu işlem yalnız local emulator içindir.');
 if(!request.auth||!['password','google.com'].includes(String(request.auth.token.firebase?.sign_in_provider)))throw new HttpsError('permission-denied','Admin yetkisi gerekli.');
 const user=await getAuth().getUser(request.auth.uid);
 if(user.email?.toLowerCase()==='tunc@test.com'){try{await authorizeBankSync(getFirestore(),request.auth);}catch{throw new HttpsError('permission-denied','Admin yetkisi gerekli.');}}
 else if(user.disabled||user.email?.toLowerCase()!=='demo.ogretmen@testarena.local')throw new HttpsError('permission-denied','Admin yetkisi gerekli.');
 if(!request.data||typeof request.data!=='object'||Array.isArray(request.data)||Object.keys(request.data).length)throw new HttpsError('invalid-argument','Bu işlem parametre kabul etmez.');
 try{const engine=await import(pathToFileURL(resolve(__dirname,'../../scripts/import-question-folder.mjs')).href);return await engine.importQuestionFolder({log:()=>{}});}catch(error){if((error as {code?:string}).code==='SYNC_BUSY')throw new HttpsError('aborted','Başka bir güncelleme devam ediyor.');throw new HttpsError('internal','Soru bankası güvenli biçimde güncellenemedi.');}
});
