import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),projectId=JSON.parse(readFileSync('.firebaserc','utf8')).projects.production;
if(!process.argv.includes('--production')||projectId!=='test-arena-20261008'||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Doğrulanmış canlı ortam gerekli.');
const cliAuth=require('firebase-tools/lib/auth'),api=require('firebase-tools/lib/api'),account=cliAuth.getProjectDefaultAccount(process.cwd());
if(!account?.tokens?.refresh_token)throw Error('Firebase CLI oturumu gerekli.');
const credential={getAccessToken:async()=>{const t=await cliAuth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);return {access_token:t.access_token,expires_in:t.expires_in||3600};}};
const app=initializeApp({projectId,credential},'bank-admin-grant'),db=new Firestore({projectId,preferRest:true,credentials:{type:'authorized_user',client_id:api.clientId(),client_secret:api.clientSecret(),refresh_token:account.tokens.refresh_token}});
try{
 const user=await getAuth(app).getUserByEmail('tunc@test.com'),roleRef=db.doc(`roles/${user.uid}`),role=(await roleRef.get()).data();
 if(user.disabled||role?.role!=='teacher'||(await db.doc(`studentBindings/${user.uid}`).get()).exists)throw Error('Etkin öğretmen hesabı doğrulanamadı.');
 const apply=process.argv.includes('--apply');
 const bank=[];for(const name of ['curricula','questions','privateQuestionAnswers','quizTemplates']){const docs=await db.collection(name).get();bank.push({collection:name,count:docs.size,sha256:createHash('sha256').update(JSON.stringify(docs.docs.sort((a,b)=>a.id.localeCompare(b.id)).map(d=>[d.id,d.data()]))).digest('hex')});}
 if(apply){mkdirSync('.firebase/bank-admin-backups',{recursive:true});writeFileSync(`.firebase/bank-admin-backups/${Date.now()}.json`,JSON.stringify({projectId,uid:user.uid,role,customClaims:user.customClaims||{}},null,2));await roleRef.set({questionBankAdmin:true},{merge:true});}
 console.log(JSON.stringify({projectId,email:user.email,uid:user.uid,applied:apply,questionBankAdmin:(await roleRef.get()).data().questionBankAdmin===true,existingRolePreserved:(await roleRef.get()).data().role===role.role,customClaimsPreserved:JSON.stringify((await getAuth(app).getUser(user.uid)).customClaims||{})===JSON.stringify(user.customClaims||{}),bank}));
}finally{await db.terminate();await deleteApp(app);}
