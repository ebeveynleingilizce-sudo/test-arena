import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {migrateTeacherSharing} from './teacher-sharing-migration.mjs';
const require=createRequire(import.meta.url),args=process.argv.slice(2),live=args.includes('--production'),apply=args.includes('--apply');
const projectId=live?JSON.parse(readFileSync('.firebaserc','utf8')).projects.production:process.env.GCLOUD_PROJECT;
if(live&&(projectId!=='test-arena-20261008'||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Canlı proje veya ortam ayarı uyuşmuyor.');
if(!live&&(!projectId?.startsWith('demo-')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||'')))throw Error('Yerel geçiş için ayrı demo emülatörleri gerekli.');
let app,db;
if(live){const cliAuth=require('firebase-tools/lib/auth'),api=require('firebase-tools/lib/api'),account=cliAuth.getProjectDefaultAccount(process.cwd());if(!account?.tokens?.refresh_token)throw Error('Firebase CLI oturumu gerekli.');
 const credential={getAccessToken:async()=>{const v=await cliAuth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);return {access_token:v.access_token,expires_in:v.expires_in||3600};}};
 app=initializeApp({projectId,credential},'teacher-sharing-migration');db=new Firestore({projectId,preferRest:true,credentials:{type:'authorized_user',client_id:api.clientId(),client_secret:api.clientSecret(),refresh_token:account.tokens.refresh_token}});
}else{app=initializeApp({projectId},'teacher-sharing-migration');db=new Firestore({projectId});}
try{const result=await migrateTeacherSharing(db,getAuth(app),{apply,backup:async data=>{mkdirSync('.firebase/teacher-sharing-migration',{recursive:true});writeFileSync(`.firebase/teacher-sharing-migration/${projectId}-${Date.now()}.json`,JSON.stringify(data,null,2));}});console.log(JSON.stringify(result,null,2));}finally{await db.terminate();await deleteApp(app);}
