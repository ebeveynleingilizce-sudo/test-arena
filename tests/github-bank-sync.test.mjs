import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {mkdir,writeFile} from 'node:fs/promises';
import {preparedBankFixture} from './prepared-bank-fixture.mjs';
import {bankProjection} from '../shared/question-bank.mjs';
import {authorizeBankSync,syncGithubBank} from '../functions/github-bank-sync.mjs';
import {githubBankSource} from '../functions/github-bank-source.mjs';
const project='demo-test-arena-spark-prototype';
if(process.env.GCLOUD_PROJECT!==project||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Isolated demo emulators required');
let app,db,fixture;
const observations=[];
before(async()=>{app=initializeApp({projectId:project});db=getFirestore(app);fixture=preparedBankFixture('matematik',2,10);});
after(async()=>{await mkdir('artifacts/github-bank-sync',{recursive:true});await writeFile('artifacts/github-bank-sync/tests.json',JSON.stringify(observations,null,2));await db.terminate();await deleteApp(app);});
const invoke=(source,extra={})=>syncGithubBank({db,source,actorUid:'github-admin',...extra});
function fakeSource(bank){
 let commit=0;const sources=new Map();
 return {repository:'fixture/private-bank',reads:0,change(path,value){sources.set(path,{value,sha:createHash('sha1').update(JSON.stringify(value)).digest('hex')});commit++;},remove(path){sources.delete(path);commit++;},async head(){return {commit:commit.toString(16).padStart(40,'0'),tree:'a'.repeat(40)};},async list(){return [...sources].map(([path,v])=>({path,sha:v.sha}));},async read(file){this.reads++;return structuredClone(sources.get(file.path).value);}};
}
function bank(prefix){const value=structuredClone(fixture.bank);value.questions=value.questions.slice(0,10).map((q,i)=>({...q,id:prefix+'-'+i}));value.questionCount=10;return value;}
async function clear(){await fetch(`http://127.0.0.1:8180/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'});}
async function seed(){
 await clear();const tree=fixture.prepared.curricula[0],batch=db.batch();batch.set(db.doc('curricula/2'),tree);
 for(const row of fixture.prepared.records.slice(0,10)){batch.set(db.doc('questions/'+row.question.questionId),row.question);batch.set(db.doc('privateQuestionAnswers/'+row.question.questionId),row.answer);}
 batch.set(db.doc('teachers/preserved/students/pupil'),{studentId:'pupil',classId:'same-class',credentialVersion:4});batch.set(db.doc('teachers/preserved/students/pupil/learning/summary'),{academicXP:99,totalXP:111});await batch.commit();
 const projected=await bankProjection(tree,fixture.prepared.records.slice(0,10));
 for(const t of projected.templates){const b=db.batch();b.set(db.doc('quizTemplates/'+t.id),t.data);for(const a of t.answers)b.set(db.doc(`privateQuizKeys/${t.id}/answers/${a.id}`),a.data);await b.commit();}
 await db.doc('sparkCatalog/2').set(projected.catalog);return projected;
}
test('only current tunc admin is authorized; another admin, student, missing role and disabled/revoked accounts are denied',async()=>{
 await clear();await fetch(`http://127.0.0.1:9199/emulator/v1/projects/${project}/accounts`,{method:'DELETE'});
 const auth=getAuth(app),u=await auth.createUser({uid:'github-admin',email:'tunc@test.com',password:'fixture-only-password'});
 const request={uid:u.uid,token:{firebase:{sign_in_provider:'password'},auth_time:Math.floor(Date.now()/1000)+1}};
 await db.doc('roles/'+u.uid).set({role:'teacher',questionBankAdmin:true});assert.equal(await authorizeBankSync(db,request),'github-admin');
 const other=await auth.createUser({uid:'other-admin',email:'other@test.com',password:'fixture-only-password'});await db.doc('roles/'+other.uid).set({role:'teacher',admin:true});await assert.rejects(authorizeBankSync(db,{...request,uid:other.uid}),/ADMIN_REQUIRED/);
 await assert.rejects(authorizeBankSync(db,null),/ADMIN_REQUIRED/);await assert.rejects(authorizeBankSync(db,{...request,token:{firebase:{sign_in_provider:'anonymous'}}}),/ADMIN_REQUIRED/);
 await db.doc('roles/'+u.uid).set({role:'teacher'});await assert.rejects(authorizeBankSync(db,request),/ADMIN_REQUIRED/);
 await db.doc('roles/'+u.uid).set({role:'teacher',questionBankAdmin:true});await db.doc('studentBindings/'+u.uid).set({studentId:'bound'});await assert.rejects(authorizeBankSync(db,request),/ADMIN_REQUIRED/);await db.doc('studentBindings/'+u.uid).delete();
 await auth.updateUser(u.uid,{disabled:true});await assert.rejects(authorizeBankSync(db,request),/ADMIN_REQUIRED/);await auth.updateUser(u.uid,{disabled:false});
 await assert.rejects(authorizeBankSync(db,{...request,token:{...request.token,auth_time:1}}),/ADMIN_REQUIRED/);
 observations.push({scenario:'authorization',passed:true});
});
test('private GitHub reader pins commit/blob integrity and rejects public/truncated/symlink/error responses without exposing credentials',async()=>{
 const content=Buffer.from('{"grade":2}'),blobSha=createHash('sha1').update('blob '+content.length+'\0').update(content).digest('hex'),calls=[];
 let privateRepo=true,truncated=false,link=false,badBlob=false;
 const source=githubBankSource({repository:'fixture/private-bank',token:'secret-fixture',transport:async(url,options)=>{
  calls.push({url,redirect:options.redirect});let value;
  if(url.endsWith('/private-bank'))value={private:privateRepo,full_name:'fixture/private-bank'};
  else if(url.includes('/commits/'))value={sha:'b'.repeat(40),commit:{tree:{sha:'a'.repeat(40)}}};
  else if(url.includes('/git/trees/'))value={truncated,tree:[{path:'questions/a.json',type:'blob',mode:link?'120000':'100644',sha:blobSha,size:content.length}]};
  else value={encoding:'base64',size:content.length,content:badBlob?Buffer.from('invalid').toString('base64'):content.toString('base64')};
  return new Response(JSON.stringify(value));
 }});
 const head=await source.head(),files=await source.list(head.tree);assert.deepEqual(await source.read(files[0]),{grade:2});assert(calls.every(c=>c.url.startsWith('https://api.github.com/repos/fixture/private-bank')&&c.redirect==='error'));
 badBlob=true;await assert.rejects(source.read(files[0]),/INTEGRITY/);truncated=true;await assert.rejects(source.list(head.tree),/TREE_LIMIT/);truncated=false;link=true;await assert.rejects(source.list(head.tree),/LINK_FORBIDDEN/);privateRepo=false;await assert.rejects(source.head(),/PRIVATE_REPOSITORY_REQUIRED/);
 const failing=githubBankSource({repository:'fixture/private-bank',token:'secret-fixture',transport:async()=>new Response('secret-fixture private question text',{status:403})});await assert.rejects(failing.head(),e=>e.message==='SOURCE_AUTHORIZATION');observations.push({scenario:'github-source',passed:true});
});
test('new files are published once; repeated clicks/removed files preserve catalog, answers, XP and codes',async()=>{
 const original=await seed(),source=fakeSource();source.change('questions/new.json',bank('sync-new'));
 const first=await invoke(source);assert.equal(first.imported,10);assert.equal(first.failed,0);
 const catalog=(await db.doc('sparkCatalog/2').get()).data();assert(catalog.subjects.reduce((n,s)=>n+s.count,0)>=20);
 for(const t of original.templates){assert((await db.doc('quizTemplates/'+t.id).get()).data().active);for(const answer of t.answers)assert.deepEqual((await db.doc(`privateQuizKeys/${t.id}/answers/${answer.id}`).get()).data(),answer.data);}
 const lockBefore=await db.doc('questionBankState/live').get(),writesBefore=(await db.collection('questionBankAudit').get()).size,readsBefore=source.reads;
 const again=await invoke(source);assert(again.upToDate);assert.equal(source.reads,readsBefore);assert.equal((await db.collection('questionBankAudit').get()).size,writesBefore);assert((await db.doc('questionBankState/live').get()).updateTime.isEqual(lockBefore.updateTime));
 source.remove('questions/new.json');const removed=await invoke(source);assert.equal(removed.imported,0);assert((await db.doc('questions/sync-new-0').get()).exists);assert.deepEqual((await db.doc('sparkCatalog/2').get()).data(),catalog);
 assert.deepEqual((await db.doc('teachers/preserved/students/pupil/learning/summary').get()).data(),{academicXP:99,totalXP:111});assert.equal((await db.doc('teachers/preserved/students/pupil').get()).data().credentialVersion,4);
 const templates=await db.collection('quizTemplates').get();for(const d of templates.docs)assert(!JSON.stringify(d.data()).includes('correctOptionId'));
 observations.push({scenario:'first-repeat-remove',first,again,removed});
});
test('conflicting IDs and malformed banks are rejected without overwrites; staged publication recovers after a lost response',async()=>{
 await seed();const source=fakeSource(),value=bank('sync-recovery');source.change('questions/recovery.json',value);
 const previous=(await db.doc('sparkCatalog/2').get()).data();await assert.rejects(invoke(source,{hooks:{beforeSwitch:()=>{throw Error('test-interruption');}}}),/test-interruption/);assert.deepEqual((await db.doc('sparkCatalog/2').get()).data(),previous);
 const recovered=await invoke(source);assert.equal(recovered.imported,0);assert.equal(recovered.unchanged,10);assert.equal(recovered.failed,0);assert.notDeepEqual((await db.doc('sparkCatalog/2').get()).data(),previous);
 value.questions[0].question+=' changed';source.change('questions/recovery.json',value);const conflict=await invoke(source);assert.equal(conflict.conflicts,1);assert(!(await db.doc('questions/sync-recovery-0').get()).data().questionText.endsWith(' changed'));
 source.change('questions/bad.json',{grade:2,questions:[]});const bad=await invoke(source);assert(bad.failed>=2);
 source.remove('questions/recovery.json');source.remove('questions/bad.json');source.change('questions/after.json',bank('sync-after'));await assert.rejects(invoke(source,{hooks:{afterSwitch:()=>{throw Error('response-lost');}}}),/response-lost/);assert((await invoke(source)).upToDate);
 observations.push({scenario:'conflict-and-recovery',recovered,conflict,bad});
});
test('simultaneous clicks serialize; a stolen/expired lease cannot switch the catalog or mark source files complete',async()=>{
 await seed();const source=fakeSource();source.change('questions/race.json',bank('sync-race'));
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),read=source.read.bind(source);source.read=async file=>{entered();await gate;return read(file);};
 const first=invoke(source);await started;await assert.rejects(invoke(source),/SYNC_BUSY/);release();await first;
 source.change('questions/stale.json',bank('sync-stale'));const oldCatalog=(await db.doc('sparkCatalog/2').get()).data();
 await assert.rejects(invoke(source,{hooks:{beforeSwitch:async()=>{await db.doc('questionBankState/live').update({lockId:'replacement'});}}}),/LOCK_LOST/);assert.deepEqual((await db.doc('sparkCatalog/2').get()).data(),oldCatalog);assert.equal((await db.doc('questionBankState/live').get()).data().lockId,'replacement');
 observations.push({scenario:'concurrency-fencing',passed:true});
});
